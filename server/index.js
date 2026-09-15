'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { attachWebSocketServer } = require('./ws-server');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/* ═══════ 랭킹 ═══════
 * 판이 끝나면 클라이언트가 성적표의 총점을 이름과 함께 올리고, 상위 20위를 받아 간다.
 * DB 없이 JSON 파일 하나(data/rankings.json)에 쌓는다 — 이 서버는 외부 의존성이 하나도 없고,
 * 랭킹 하나 때문에 그 원칙을 깰 만큼 데이터가 크지 않다. 파일에는 넉넉히 100건까지만 남기고
 * 내려 줄 때 20위까지 자른다. 점수는 클라이언트가 계산해 보내므로 조작이 가능하다는 점은
 * 감수한다 — 서버가 판을 굴리지 않는 구조라 검증할 원장이 없다.
 * 파일 경로는 RANK_FILE 로 바꿀 수 있다 (영구 디스크를 붙일 때). */
const RANK_FILE = process.env.RANK_FILE || path.join(__dirname, '..', 'data', 'rankings.json');
const RANK_TOP = 20;          // 내려 주는 순위
const RANK_KEEP = 100;        // 파일에 남기는 순위
const RANK_NAME_MAX = 12;
const RANK_MODES = new Set(['solo', 'duel', 'team', 'ffa']);
const RANK_GRADES = new Set(['S', 'A', 'B', 'C', 'D']);

/** @type {{name:string,score:number,grade:string,mode:string,wave:number,cleared:boolean,at:string}[]} */
let rankings = [];
try {
  const raw = JSON.parse(fs.readFileSync(RANK_FILE, 'utf8'));
  if (Array.isArray(raw)) rankings = raw.filter((r) => r && typeof r.score === 'number');
} catch (_) { /* 처음이거나 파일이 깨졌다 — 빈 표에서 시작한다 */ }
sortRankings();

/** 점수 높은 순, 같으면 먼저 올린 순 */
function sortRankings() {
  rankings.sort((a, b) => b.score - a.score || String(a.at).localeCompare(String(b.at)));
  if (rankings.length > RANK_KEEP) rankings.length = RANK_KEEP;
}

/* 저장은 파일 통째로 다시 쓴다. 두 판이 동시에 끝나도 쓰기가 겹치지 않도록 한 줄로 세운다.
 * 임시 파일에 쓰고 이름을 바꾸므로 쓰다 죽어도 반쪽짜리 파일은 남지 않는다. */
let rankSaving = Promise.resolve();
function saveRankings() {
  const body = JSON.stringify(rankings, null, 1);
  rankSaving = rankSaving.then(async () => {
    await fs.promises.mkdir(path.dirname(RANK_FILE), { recursive: true });
    await fs.promises.writeFile(RANK_FILE + '.tmp', body);
    await fs.promises.rename(RANK_FILE + '.tmp', RANK_FILE);
  }).catch((e) => console.error('[patent-siege] 랭킹 저장 실패:', e.message));
  return rankSaving;
}

const topRankings = () => rankings.slice(0, RANK_TOP).map((r, i) => Object.assign({ rank: i + 1 }, r));

/** 요청 본문(JSON)을 읽는다. 랭킹 한 건은 몇백 바이트라 그 이상은 받지 않는다 */
function readJson(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    // 한글 한 글자가 청크 경계에 걸릴 수 있어 문자열로 이어 붙이지 않고 다 받은 뒤 한 번에 푼다
    req.on('data', (c) => { chunks.push(c); size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (_) { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

/** 클라이언트가 보낸 한 건을 검사해 표에 넣는다. 잘못된 것은 이유를 돌려준다 */
async function handleRankPost(req, res) {
  let body;
  try { body = await readJson(req); } catch (e) { sendJson(res, 400, { error: e.message }); return; }
  const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, RANK_NAME_MAX);
  const score = Math.round(Number(body.score));
  if (!name) { sendJson(res, 400, { error: '이름이 비어 있습니다' }); return; }
  if (!Number.isFinite(score) || score < 0 || score > 1e6) { sendJson(res, 400, { error: '점수가 이상합니다' }); return; }
  const entry = {
    name, score,
    grade: RANK_GRADES.has(body.grade) ? body.grade : 'D',
    mode: RANK_MODES.has(body.mode) ? body.mode : 'solo',
    wave: Math.max(0, Math.min(10, Math.round(Number(body.wave)) || 0)),
    cleared: !!body.cleared,
    at: new Date().toISOString(),
  };
  rankings.push(entry);
  sortRankings();
  const rank = rankings.indexOf(entry) + 1;      // 0 이면 100위 밖으로 밀려나 남지 않았다
  await saveRankings();
  sendJson(res, 200, { rank, top: RANK_TOP, list: topRankings() });
}

const httpServer = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);

  // Render 의 헬스체크용. 정적 파일을 거치지 않고 바로 응답한다.
  if (p === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) }));
    return;
  }

  if (p === '/api/rankings') {
    if (req.method === 'GET') { sendJson(res, 200, { top: RANK_TOP, list: topRankings() }); return; }
    if (req.method === 'POST') { handleRankPost(req, res); return; }
    res.writeHead(405); res.end('method not allowed'); return;
  }

  if (p === '/') p = '/index.html';
  const full = path.join(PUBLIC_DIR, p);
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.stat(full, (statErr, st) => {
    if (statErr || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    // 캐시 헤더를 아예 안 붙이면 브라우저가 제 나름의 기준으로 style.css 를 붙잡아 둔다.
    // 그러면 CSS 를 고쳐도 예전 화면이 그대로 보여서 디버깅이 엉뚱한 데로 샌다.
    // no-cache 는 "쓰기 전에 반드시 물어봐라" 라는 뜻이라, 안 바뀌었으면 304 로 끝나
    // 매번 내려받지 않으면서도 항상 최신 파일을 보게 된다.
    const tag = `W/"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
    if (req.headers['if-none-match'] === tag) {
      res.writeHead(304, { 'Cache-Control': 'no-cache', 'ETag': tag });
      res.end();
      return;
    }
    fs.readFile(full, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(full);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'ETag': tag,
      });
      res.end(data);
    });
  });
});

/**
 * roomCode -> {
 *   mode,                       // 'duel' 1:1 · 'team' 2:2 더블업 · 'ffa' 1:1:1:1 대난투
 *   size,                       // 방 인원 (MODE_SIZE)
 *   conns: [conn|null × size],  // 슬롯 순서 = p1..p4. 팀 모드는 슬롯 0·1 이 한 팀, 2·3 이 한 팀
 *   started,                    // 다 모여 판이 열렸는가 (그 뒤로 나간 자리는 비워 두고 채우지 않는다)
 *   gone:  [bool × size],       // 판이 열린 뒤 나간 슬롯 — 준비 판정에서 늘 「준비됨」으로 친다
 *   seed,                       // 모든 클라이언트가 공유하는 판 시드 (웨이브 구성이 같아진다)
 *   prepWave,                   // 지금 준비를 맞추고 있는 웨이브 번호
 *   prep:  [bool × size],       // 각자 준비 단계에 들어섰는가
 *   ready: [bool × size],       // 각자 개시 버튼을 눌렀는가
 *   prepTimer,                  // 준비시간 마감 타이머
 * }
 */
const rooms = new Map();

/** 모드별 인원. 클라이언트(core/data.js 의 MODES)와 같은 표다. */
const MODE_SIZE = { duel: 2, team: 4, ffa: 4 };

/** 모두 준비 단계에 들어선 뒤 주어지는 최대 준비시간(초). 클라이언트의 BAL.prepSecs 와 맞춘다. */
const PREP_SECS = 15;

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 글자(0/O, 1/I) 제외
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[(Math.random() * chars.length) | 0]).join('');
  } while (rooms.has(code));
  return code;
}

function send(conn, obj) { try { conn.send(JSON.stringify(obj)); } catch (_) {} }
function broadcast(room, obj, except) { for (const c of room.conns) if (c && c !== except) send(c, obj); }
/** 슬롯마다 참/거짓 하나씩 */
const flags = (n, v) => Array.from({ length: n }, () => v);
/** 아직 붙어 있는 인원 */
const present = (room) => room.conns.filter(Boolean).length;
/** 그 슬롯이 「준비 판정에서 셈에 들어가는가」 — 나간 자리는 늘 준비된 것으로 친다 */
const counts = (room, i) => !!room.conns[i] && !room.gone[i];

function clearPrepTimer(room) {
  if (room.prepTimer) { clearTimeout(room.prepTimer); room.prepTimer = null; }
}

/**
 * 웨이브 개시 신호. 모두가 정확히 같은 순간에 웨이브를 시작한다.
 * 다들 준비를 눌렀거나, 준비시간이 다 되면 여기로 온다.
 */
function goWave(room) {
  if (!room.prepWave) return;
  clearPrepTimer(room);
  const wave = room.prepWave;
  room.prepWave = 0;
  room.prep = flags(room.size, false);
  room.ready = flags(room.size, false);
  broadcast(room, { t: 'waveGo', wave });
}

/** 남아 있는 모두가 준비 단계에 들어섰는가 / 준비를 눌렀는가 */
const allPrep = (room) => room.conns.every((c, i) => !counts(room, i) || room.prep[i]);
const allReady = (room) => room.conns.every((c, i) => !counts(room, i) || room.ready[i]);

/** 모두 준비 단계에 들어섰고 모두 준비를 눌렀으면 곧바로 개시한다 */
function maybeGo(room) {
  if (allPrep(room) && allReady(room)) goWave(room);
}

/**
 * 준비 상황을 모두에게 그대로 내려 준다.
 * "상대가 준비했다"를 개별 알림으로 보내면, 한 쪽이 웨이브를 훨씬 늦게 끝냈을 때
 * 이미 지나간 알림을 못 받아 상태가 어긋난다. 항상 전체 상태를 보내면 그럴 일이 없다.
 * 나간 자리는 준비된 것으로 채워 보낸다 — 클라이언트가 그 자리를 기다리지 않도록.
 */
function pushPrepState(room) {
  const prep = room.prep.map((v, i) => v || !counts(room, i));
  const ready = room.ready.map((v, i) => v || !counts(room, i));
  broadcast(room, { t: 'prepState', wave: room.prepWave, prep, ready, gone: room.gone });
}

/** 방 인원 현황 — 대기 화면이 「2/4 모였습니다」를 그리는 데 쓴다 */
function pushRoomState(room, code) {
  broadcast(room, { t: 'roomState', code, mode: room.mode, size: room.size, count: present(room),
                    slots: room.conns.map((c) => !!c) });
}

function leaveRoom(conn) {
  if (!conn._room) return;
  const room = rooms.get(conn._room);
  const code = conn._room;
  conn._room = null;
  if (!room) return;
  const me = room.conns.indexOf(conn);
  if (me < 0) return;
  room.conns[me] = null;
  if (!present(room)) { clearPrepTimer(room); rooms.delete(code); return; }

  if (!room.started) {
    // 아직 모이는 중 — 자리를 비워 두면 다음 사람이 그 자리에 들어온다
    pushRoomState(room, code);
    return;
  }
  /* 판이 열린 뒤 나갔다. 1:1 이면 남은 쪽의 판은 상대 없이 이어질 수 없으니 그대로 끝낸다(oppLeft).
   * 넷이 붙는 판에서는 나간 자리만 비우고 계속 간다 — 그 사람 몫의 대전 명세는 클라이언트가
   * 쥐 침입단으로 대신 세운다. 준비 판정에서는 늘 준비된 것으로 친다. */
  room.gone[me] = true;
  broadcast(room, { t: 'oppLeft', from: me });
  if (room.size === 2) { clearPrepTimer(room); rooms.delete(code); for (const c of room.conns) if (c) c._room = null; return; }
  // 남은 사람들이 나간 사람을 기다리고 있었을 수 있다 — 준비 판정을 다시 본다
  if (room.prepWave) {
    pushPrepState(room);
    if (allPrep(room) && !room.prepTimer) {
      room.prepTimer = setTimeout(() => goWave(room), PREP_SECS * 1000);
      broadcast(room, { t: 'prepSync', wave: room.prepWave, secs: PREP_SECS });
    }
    maybeGo(room);
  }
}

// 방(room) 안에서 다른 사람에게 그대로 중계하는 메시지 타입 → 받을 때의 타입.
// 보내는 사람의 슬롯 번호(from)를 붙여 넘기고, msg.to 가 있으면 그 슬롯 하나에게만 보낸다
// (방해 공작은 표적이 하나다). 없으면 방의 나머지 전부에게 간다.
//   state       내 판의 스냅샷 — 상대 청사 미니맵용
//   sabotage    방해 공작 (to: 표적 슬롯)
//   duel        대전 시작 전 서로에게 보내는 「내 냥타워 명세」. 오토배틀러라 이것 하나면
//               모든 화면이 같은 싸움을 굴린다 — 전투 중에는 오갈 것이 없다
//   duelResult  판정하는 슬롯(가장 앞 슬롯)이 내린 결과. 시뮬레이션은 결정적이지만 브라우저마다
//               부동소수점 끝자리가 다를 수 있어 승패는 한쪽 계산을 정본으로 삼는다 — 서버는
//               여기서도 판정하지 않고 그대로 넘기기만 한다
const RELAY = {
  state: 'oppState', sabotage: 'oppSabotage',
  duel: 'oppDuel', duelResult: 'oppDuelResult',
  won: 'oppWon', lost: 'oppLost',
};

attachWebSocketServer(httpServer, (conn) => {
  conn._room = null;

  conn.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }

    if (msg.t === 'create') {
      const mode = MODE_SIZE[msg.mode] ? msg.mode : 'duel';
      const size = MODE_SIZE[mode];
      const code = makeCode();
      const room = {
        mode, size,
        conns: flags(size, null), started: false, gone: flags(size, false),
        seed: (Math.random() * 1e9) | 0,
        prepWave: 0, prep: flags(size, false), ready: flags(size, false), prepTimer: null,
      };
      room.conns[0] = conn;
      rooms.set(code, room);
      conn._room = code;
      send(conn, { t: 'created', code, mode, size });
      pushRoomState(room, code);
      return;
    }

    if (msg.t === 'join') {
      const code = String(msg.code || '').toUpperCase();
      const room = rooms.get(code);
      const slot = room ? room.conns.indexOf(null) : -1;
      if (!room || room.started || slot < 0) {
        send(conn, { t: 'joinError', reason: !room ? '존재하지 않는 방입니다'
                                          : room.started ? '이미 시작된 판입니다' : '방이 가득 찼습니다' });
        return;
      }
      room.conns[slot] = conn;
      conn._room = code;
      pushRoomState(room, code);
      if (present(room) < room.size) return;     // 아직 더 와야 한다
      // 다 모였다. 같은 시드를 내려 준다 — 모두의 웨이브 구성이 완전히 같아진다
      room.started = true;
      room.conns.forEach((c, i) => send(c, { t: 'start', youAre: 'p' + (i + 1), slot: i,
                                             seed: room.seed, mode: room.mode, size: room.size }));
      return;
    }

    if (!conn._room) return;
    const room = rooms.get(conn._room);
    if (!room) return;
    const me = room.conns.indexOf(conn);
    if (me < 0) return;

    // 판을 끝낸 사람은 더 기다릴 것이 없다 — 준비 판정에서 빼고, 1:1 이면 타이머도 정리한다
    if (msg.t === 'won' || msg.t === 'lost') {
      room.gone[me] = true;
      if (room.size === 2) { clearPrepTimer(room); room.prepWave = 0; }
      else if (room.prepWave) { pushPrepState(room); maybeGo(room); }
    }

    /* ── 웨이브 동시 개시 ──
     * 「준비 완료」를 눌러도 남들이 누르기 전에는 시작되지 않는다.
     * 준비시간 15초는 모두가 준비 단계에 들어선 뒤에야 흐르기 시작하므로,
     * 웨이브를 먼저 끝냈다고 해서 혼자 앞서 나갈 수 없다. */
    if (msg.t === 'prep') {
      const wave = Number(msg.wave) || 0;
      if (!wave) return;
      if (room.prepWave !== wave) {          // 새 라운드 — 이전 상태를 버리고 다시 맞춘다
        clearPrepTimer(room);
        room.prepWave = wave;
        room.prep = flags(room.size, false);
        room.ready = flags(room.size, false);
      }
      room.prep[me] = true;
      pushPrepState(room);
      if (allPrep(room) && !room.prepTimer) {
        room.prepTimer = setTimeout(() => goWave(room), PREP_SECS * 1000);
        broadcast(room, { t: 'prepSync', wave, secs: PREP_SECS });
      }
      maybeGo(room);
      return;
    }

    if (msg.t === 'ready') {
      if (!room.prepWave || Number(msg.wave) !== room.prepWave) return;
      room.ready[me] = !!msg.ready;
      pushPrepState(room);
      maybeGo(room);
      return;
    }

    const relayType = RELAY[msg.t];
    if (!relayType) return;
    const out = Object.assign({}, msg, { t: relayType, from: me });
    if (msg.to != null) {
      const target = room.conns[Number(msg.to)];
      if (target && target !== conn) send(target, out);
    } else {
      broadcast(room, out, conn);
    }
  });

  conn.on('close', () => leaveRoom(conn));
});

// 컨테이너 밖에서도 닿아야 하므로 0.0.0.0 에 바인딩한다.
// localhost 로만 열면 Render 가 포트를 감지하지 못해 배포가 실패한다.
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[patent-siege] listening on 0.0.0.0:${PORT}`);
});

// 배포를 갈아끼울 때 붙어 있는 사람에게 끊긴 이유를 알리고 정리한다
function shutdown(sig) {
  console.log(`[patent-siege] ${sig} 수신 — 종료합니다`);
  for (const [code, room] of rooms) {
    for (const conn of room.conns) if (conn) send(conn, { t: 'serverDown' });
    rooms.delete(code);
  }
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();   // 남은 연결이 늘어져도 5초 뒤엔 내려간다
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
