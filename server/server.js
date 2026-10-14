// PREHISTORIC game server: serves the built game (dist/) and relays co-op
// traffic. Rooms have a 4-letter code; the host runs the simulation, the
// server only routes messages (host -> everyone / one client, client -> host)
// and WebRTC signalling for proximity voice chat.
//
//   npm run serve        build + start on http://localhost:8080
//   PORT=9000 npm start  start on another port
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', process.env.DIST || 'dist');
const PORT = +(process.env.PORT || 8080);
const MAX_PLAYERS = 8;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.wasm': 'application/wasm' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/ping') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(ROOT, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(500); res.end('Build the game first: npm run build'); return; }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
  fs.createReadStream(file).pipe(res);
});

// ---------------------------------------------------------------- rooms
const rooms = new Map(); // code -> { host, peers: Map(id -> ws) }
let nextId = 1;
const code4 = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c; do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c)); return c; };
const send = (ws, m) => { if (ws && ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 * 1024 });
wss.on('connection', (ws) => {
  ws.id = 'p' + nextId++;
  ws.room = null;
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (buf) => {
    let m;
    try { m = JSON.parse(buf.toString()); } catch { return; }
    const R = ws.room ? rooms.get(ws.room) : null;
    switch (m.t) {
      case 'host': {
        const code = code4();
        rooms.set(code, { host: ws, peers: new Map([[ws.id, ws]]), created: Date.now() });
        ws.room = code; ws.isHost = true; ws.name = String(m.d?.name ?? 'Host').slice(0, 24);
        send(ws, { t: 'hosted', d: { code, id: ws.id } });
        console.log(`[room ${code}] hosted by ${ws.name}`);
        return;
      }
      case 'join': {
        const code = String(m.d?.code ?? '').toUpperCase();
        const room = rooms.get(code);
        if (!room) { send(ws, { t: 'joinError', d: { reason: 'No room with that code.' } }); return; }
        if (room.peers.size >= MAX_PLAYERS) { send(ws, { t: 'joinError', d: { reason: 'Room is full.' } }); return; }
        ws.room = code; ws.name = String(m.d?.name ?? 'Explorer').slice(0, 24);
        room.peers.set(ws.id, ws);
        send(ws, { t: 'joined', d: { code, id: ws.id, host: room.host.id } });
        send(room.host, { t: 'peerJoin', from: ws.id, d: { name: ws.name, outfit: m.d?.outfit } });
        console.log(`[room ${code}] ${ws.name} joined (${room.peers.size})`);
        return;
      }
      default: {
        if (!R) return;
        // routing: explicit target, host broadcast, or client -> host
        const out = JSON.stringify({ t: m.t, d: m.d, from: ws.id });
        if (m.to) { const tgt = R.peers.get(m.to); send(tgt, out); return; }
        if (ws.isHost || m.all) { for (const [id, p] of R.peers) if (p !== ws && id !== m.except) send(p, out); return; }
        send(R.host, out);
      }
    }
  });
  ws.on('close', () => {
    const R = ws.room ? rooms.get(ws.room) : null;
    if (!R) return;
    R.peers.delete(ws.id);
    if (ws.isHost) {
      for (const p of R.peers.values()) { send(p, { t: 'hostLeft' }); p.room = null; }
      rooms.delete(ws.room);
      console.log(`[room ${ws.room}] closed`);
    } else send(R.host, { t: 'peerLeave', from: ws.id });
  });
});
// drop dead sockets
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 15000);

server.listen(PORT, () => {
  console.log(`\n  PREHISTORIC is running!\n  Open http://localhost:${PORT} and share your LAN address with friends.\n  Host a room from the title screen, friends join with the 4-letter code.\n`);
});
