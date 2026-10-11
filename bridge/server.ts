import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { parseEvent, PetScheduler } from '../src/index';

const host = process.env.PET_HOST || '127.0.0.1';
const port = Number(process.env.PET_PORT || 17789);
const token = process.env.PET_TOKEN || '';
const allowed = new Set([
  'http://127.0.0.1:5173', 'http://localhost:5173',
  'http://127.0.0.1:4173', 'http://localhost:4173',
  'http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost',
  ...(process.env.PET_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PET_PORT');
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !token) {
  throw new Error('PET_TOKEN is required when listening outside loopback');
}
const scheduler = new PetScheduler();
const sockets = new WebSocketServer({ noServer: true, maxPayload: 16_384, perMessageDeflate: false });
const counters = { accepted: 0, rejected: 0 };
const rates = new Map<string, { start: number; count: number }>();
const seen = new Map<string, number>();

function originAllowed(req: IncomingMessage) {
  return !req.headers.origin || allowed.has(req.headers.origin);
}
function authenticated(req: IncomingMessage, url: URL) {
  if (!token) return true;
  const supplied = req.headers.authorization?.replace(/^Bearer /, '') || url.searchParams.get('token') || '';
  const a = Buffer.from(supplied); const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
function limited(req: IncomingMessage) {
  const key = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = rates.get(key);
  if (!entry || now - entry.start > 1000) { entry = { start: now, count: 0 }; rates.set(key, entry); }
  if (rates.size > 256) rates.delete(rates.keys().next().value!);
  return ++entry.count > 100;
}
function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function publish(input: unknown) {
  const event = parseEvent(input);
  const now = Date.now();
  for (const [id, time] of seen) if (now - time > 300_000) seen.delete(id);
  if (seen.has(event.id)) return { accepted: true, duplicate: true, id: event.id };
  // Let scheduler validation/capacity checks complete before marking the event accepted.
  scheduler.dispatch(event);
  seen.set(event.id, now);
  if (seen.size > 512) seen.delete(seen.keys().next().value!);
  counters.accepted++;
  // A snapshot is authoritative: task leases are generated once by the bridge,
  // never renewed independently by each client receiving the same start/update.
  const data = JSON.stringify({ type: 'snapshot', snapshot: scheduler.snapshot(), event });
  for (const client of sockets.clients) {
    if (client.readyState === WebSocket.OPEN) {
      if (client.bufferedAmount > 262_144) client.close(1013, 'Slow consumer');
      else client.send(data);
    }
  }
  return { accepted: true, duplicate: false, id: event.id };
}

const server = createServer(async (req, res) => {
  let url: URL;
  try { url = new URL(req.url || '/', 'http://localhost'); }
  catch { send(res, 400, { error: 'Invalid request target' }); return; }
  if (!originAllowed(req)) { send(res, 403, { error: 'Origin is not allowed; configure PET_ORIGINS' }); return; }
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    }); res.end(); return;
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    send(res, 200, { service: 'agent-pet-bridge', version: 1, clients: sockets.clients.size, ...counters }); return;
  }
  if (!authenticated(req, url)) { send(res, 401, { error: 'Invalid token' }); return; }
  if (limited(req)) { send(res, 429, { error: 'Rate limit: 100 requests/second' }); return; }
  if (req.method === 'GET' && url.pathname === '/snapshot') { send(res, 200, scheduler.snapshot()); return; }
  if (req.method !== 'POST' || url.pathname !== '/events') { send(res, 404, { error: 'Unknown endpoint' }); return; }
  if (!req.headers['content-type']?.startsWith('application/json')) { send(res, 415, { error: 'Use application/json' }); return; }
  try {
    let size = 0; const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16_384) { send(res, 413, { error: 'Event exceeds 16 KiB' }); return; }
      chunks.push(chunk);
    }
    send(res, 202, publish(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
  } catch (error) {
    counters.rejected++;
    send(res, 400, { error: error instanceof Error ? error.message : 'Invalid event' });
  }
});

server.on('upgrade', (req, socket, head) => {
  let url: URL;
  try { url = new URL(req.url || '/', 'http://localhost'); }
  catch { socket.destroy(); return; }
  if (url.pathname !== '/ws' || !originAllowed(req) || !authenticated(req, url)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
  }
  if (sockets.clients.size >= 64) { socket.destroy(); return; }
  sockets.handleUpgrade(req, socket, head, (client) => sockets.emit('connection', client, req));
});
sockets.on('connection', (client, req) => {
  client.on('error', () => client.close());
  client.send(JSON.stringify({ type: 'snapshot', snapshot: scheduler.snapshot() }));
  let alive = true;
  client.on('pong', () => { alive = true; });
  const heartbeat = setInterval(() => {
    if (!alive) { client.terminate(); return; }
    alive = false; client.ping();
  }, 30_000);
  client.on('close', () => clearInterval(heartbeat));
  client.on('message', (raw) => {
    try {
      if (limited(req)) throw new Error('Rate limit');
      client.send(JSON.stringify({ type: 'ack', ...publish(JSON.parse(raw.toString())) }));
    } catch (error) {
      counters.rejected++;
      client.send(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Invalid event' }));
    }
  });
});
server.requestTimeout = 10_000;
server.headersTimeout = 10_000;
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; scheduler.dispose(); });
server.listen(port, host, () => console.log(`Agent pet bridge: http://${host}:${port} (${token ? 'token enabled' : 'loopback mode'})`));
function close() {
  scheduler.dispose();
  for (const client of sockets.clients) client.terminate();
  sockets.close(); server.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
