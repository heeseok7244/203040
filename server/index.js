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

const httpServer = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);

  // Render 의 헬스체크용. 정적 파일을 거치지 않고 바로 응답한다.
  if (p === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) }));
    return;
  }

  if (p === '/') p = '/index.html';
  const full = path.join(PUBLIC_DIR, p);
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

/**
 * roomCode -> {
 *   conns: [conn1, conn2|null],
 *   seed,                       // 두 클라이언트가 공유하는 판 시드 (웨이브 구성·증강 후보가 같아진다)
 *   prepWave,                   // 지금 준비를 맞추고 있는 웨이브 번호
 *   prep:  [bool, bool],        // 각자 준비 단계에 들어섰는가
 *   ready: [bool, bool],        // 각자 개시 버튼을 눌렀는가
 *   prepTimer,                  // 준비시간 마감 타이머
 * }
 */
const rooms = new Map();

/** 양쪽 모두 준비 단계에 들어선 뒤 주어지는 최대 준비시간(초). 클라이언트의 BAL.prepSecs 와 맞춘다. */
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
function otherOf(room, conn) { return room.conns[0] === conn ? room.conns[1] : room.conns[0]; }
function broadcast(room, obj) { for (const c of room.conns) if (c) send(c, obj); }

function clearPrepTimer(room) {
  if (room.prepTimer) { clearTimeout(room.prepTimer); room.prepTimer = null; }
}

/**
 * 웨이브 개시 신호. 양쪽이 정확히 같은 순간에 웨이브를 시작한다.
 * 둘 다 준비를 눌렀거나, 준비시간이 다 되면 여기로 온다.
 */
function goWave(room) {
  if (!room.prepWave) return;
  clearPrepTimer(room);
  const wave = room.prepWave;
  room.prepWave = 0;
  room.prep = [false, false];
  room.ready = [false, false];
  broadcast(room, { t: 'waveGo', wave });
}

/** 둘 다 준비 단계에 들어섰고 둘 다 준비를 눌렀으면 곧바로 개시한다 */
function maybeGo(room) {
  if (room.prep[0] && room.prep[1] && room.ready[0] && room.ready[1]) goWave(room);
}

/**
 * 준비 상황을 양쪽에 그대로 내려 준다.
 * "상대가 준비했다"를 개별 알림으로 보내면, 한 쪽이 웨이브를 훨씬 늦게 끝냈을 때
 * 이미 지나간 알림을 못 받아 상태가 어긋난다. 항상 전체 상태를 보내면 그럴 일이 없다.
 */
function pushPrepState(room) {
  broadcast(room, { t: 'prepState', wave: room.prepWave, prep: room.prep, ready: room.ready });
}

function leaveRoom(conn) {
  if (!conn._room) return;
  const room = rooms.get(conn._room);
  if (!room) return;
  clearPrepTimer(room);
  const other = otherOf(room, conn);
  if (other) { send(other, { t: 'oppLeft' }); other._room = null; }
  rooms.delete(conn._room);
  conn._room = null;
}

// 방(room) 안에서 상대에게 그대로 중계하는 메시지 타입 → 상대가 받을 때의 타입
const RELAY = { state: 'oppState', passive: 'oppPassive', won: 'oppWon', lost: 'oppLost' };

attachWebSocketServer(httpServer, (conn) => {
  conn._room = null;

  conn.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }

    if (msg.t === 'create') {
      const code = makeCode();
      rooms.set(code, {
        conns: [conn, null],
        seed: (Math.random() * 1e9) | 0,
        prepWave: 0, prep: [false, false], ready: [false, false], prepTimer: null,
      });
      conn._room = code;
      send(conn, { t: 'created', code });
      return;
    }

    if (msg.t === 'join') {
      const code = String(msg.code || '').toUpperCase();
      const room = rooms.get(code);
      if (!room || room.conns[1]) {
        send(conn, { t: 'joinError', reason: room ? '방이 가득 찼습니다' : '존재하지 않는 방입니다' });
        return;
      }
      room.conns[1] = conn;
      conn._room = code;
      // 같은 시드를 내려 준다 — 양쪽의 웨이브 구성과 증강 후보가 완전히 같아진다
      send(room.conns[0], { t: 'start', youAre: 'p1', seed: room.seed });
      send(room.conns[1], { t: 'start', youAre: 'p2', seed: room.seed });
      return;
    }

    if (!conn._room) return;
    const room = rooms.get(conn._room);
    if (!room) return;
    const other = otherOf(room, conn);
    const me = room.conns.indexOf(conn);
    if (me < 0) return;

    // 판이 끝나면 남아 있는 준비시간 타이머가 뒤늦게 개시 신호를 쏘지 않도록 정리한다
    if (msg.t === 'won' || msg.t === 'lost') { clearPrepTimer(room); room.prepWave = 0; }

    /* ── 웨이브 동시 개시 ──
     * 「준비 완료」를 눌러도 상대가 누르기 전에는 시작되지 않는다.
     * 준비시간 15초는 양쪽이 다 준비 단계에 들어선 뒤에야 흐르기 시작하므로,
     * 웨이브를 먼저 끝냈다고 해서 혼자 앞서 나갈 수 없다. */
    if (msg.t === 'prep') {
      const wave = Number(msg.wave) || 0;
      if (!wave) return;
      if (room.prepWave !== wave) {          // 새 라운드 — 이전 상태를 버리고 다시 맞춘다
        clearPrepTimer(room);
        room.prepWave = wave;
        room.prep = [false, false];
        room.ready = [false, false];
      }
      room.prep[me] = true;
      pushPrepState(room);
      if (room.prep[0] && room.prep[1] && !room.prepTimer) {
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

    if (!other) return;
    const relayType = RELAY[msg.t];
    if (relayType) send(other, Object.assign({}, msg, { t: relayType }));
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
    for (const conn of room.conns) if (conn) send(conn, { t: 'oppLeft' });
    rooms.delete(code);
  }
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();   // 남은 연결이 늘어져도 5초 뒤엔 내려간다
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
