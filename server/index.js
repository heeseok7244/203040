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

/** roomCode -> { conns: [conn1, conn2|null] } */
const rooms = new Map();

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

function leaveRoom(conn) {
  if (!conn._room) return;
  const room = rooms.get(conn._room);
  if (!room) return;
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
      rooms.set(code, { conns: [conn, null] });
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
      send(room.conns[0], { t: 'start', youAre: 'p1' });
      send(room.conns[1], { t: 'start', youAre: 'p2' });
      return;
    }

    if (!conn._room) return;
    const room = rooms.get(conn._room);
    if (!room) return;
    const other = otherOf(room, conn);
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
