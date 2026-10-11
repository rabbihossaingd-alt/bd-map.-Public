// BD Map server: serves the app and keeps everyone's ratings in one place.
// No dependencies — needs Node.js 22.5 or newer (uses the built-in SQLite).
//
//   node server.js            start on port 8765
//   PORT=3000 node server.js  another port (hosting services set PORT themselves)
//
//   DATA_DIR=/data node server.js   keep the ratings database somewhere else (a host's persistent disk)
//
// Ratings live in db/ratings.db (or DATA_DIR). Back that file up; deleting it deletes every rating.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8765;

// ---- Database: one row per (thing rated, device). A device can change or remove its own rating. ----
// On a hosting service, point DATA_DIR at its persistent disk so ratings survive restarts and redeploys.
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'db');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'ratings.db'));
db.exec(`CREATE TABLE IF NOT EXISTS ratings (
  key     TEXT NOT NULL,
  device  TEXT NOT NULL,
  stars   INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  updated INTEGER NOT NULL,
  PRIMARY KEY (key, device)
)`);
const q = {
  all:    db.prepare('SELECT key, ROUND(AVG(stars), 2) AS avg, COUNT(*) AS n FROM ratings GROUP BY key'),
  one:    db.prepare('SELECT ROUND(AVG(stars), 2) AS avg, COUNT(*) AS n FROM ratings WHERE key = ?'),
  upsert: db.prepare(`INSERT INTO ratings (key, device, stars, updated) VALUES (?, ?, ?, ?)
                      ON CONFLICT (key, device) DO UPDATE SET stars = excluded.stars, updated = excluded.updated`),
  remove: db.prepare('DELETE FROM ratings WHERE key = ? AND device = ?')
};

// ---- Small guards: there are no accounts, so keep one client from flooding the table ----
const WINDOW_MS = 60_000, MAX_WRITES = 30;
const writes = new Map();   // ip -> timestamps of recent writes
function allowWrite(ip) {
  const now = Date.now();
  const recent = (writes.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_WRITES) { writes.set(ip, recent); return false; }
  recent.push(now);
  writes.set(ip, recent);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of writes) if (!times.some(t => now - t < WINDOW_MS)) writes.delete(ip);
}, WINDOW_MS).unref();

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 2048) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---- API ----
//   GET  /api/ratings                      -> { "<key>": [average, count], ... }
//   POST /api/ratings {key, stars, device} -> { avg, n }      stars 1-5; 0 removes this device's rating
async function api(req, res) {
  if (req.method === 'GET') {
    const out = {};
    for (const r of q.all.all()) out[r.key] = [r.avg, r.n];
    return json(res, 200, out);
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  if (!allowWrite(req.socket.remoteAddress)) return json(res, 429, { error: 'too many ratings, try again in a minute' });

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad request' }); }
  const { key, stars, device } = body || {};
  const okKey = typeof key === 'string' && key.length >= 3 && key.length <= 200;
  const okDevice = typeof device === 'string' && /^[\w-]{8,64}$/.test(device);
  if (!okKey || !okDevice || !Number.isInteger(stars) || stars < 0 || stars > 5) return json(res, 400, { error: 'bad request' });

  if (stars === 0) q.remove.run(key, device);
  else q.upsert.run(key, device, stars, Date.now());
  const row = q.one.get(key);
  json(res, 200, { avg: row.avg, n: row.n });
}

// ---- Static files (the app itself) ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
                '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const PRIVATE = ['db', 'tools', 'node_modules'];   // never served

function serveFile(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400).end(); return; }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  const parts = path.relative(ROOT, file).split(path.sep);
  // Stay inside the app folder, and keep the database, build tools, server code and dotfiles private.
  const blocked = parts[0] === '..' || path.isAbsolute(parts[0]) || PRIVATE.includes(parts[0]) ||
                  parts.some(p => p.startsWith('.')) || parts[0] === 'server.js' || parts[0] === 'package.json';
  if (blocked) { res.writeHead(404).end('Not found'); return; }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
    // no-cache: the browser keeps a copy but checks it is current, so app updates show up on refresh.
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
                         'Content-Length': stat.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/api/ratings') return api(req, res).catch(() => json(res, 500, { error: 'server error' }));
  if (pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  serveFile(req, res, pathname);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`BD Map is running.\n  On this computer:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  On the same Wi-Fi: http://${a.address}:${PORT}`);
  }
});
