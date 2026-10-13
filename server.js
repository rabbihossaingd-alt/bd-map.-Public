// BD Map server: serves the app and keeps everyone's ratings, reported fares, accounts and messages in one place.
// No dependencies — needs Node.js 22.5 or newer (uses the built-in SQLite).
//
//   node server.js            start on port 8765
//   PORT=3000 node server.js  another port (hosting services set PORT themselves)
//
//   DATA_DIR=/data node server.js   keep the database somewhere else (a host's persistent disk)
//
//   ADMIN_EMAILS=you@example.com    who may open /admin.html (comma separated)
//   SMTP_HOST, SMTP_USER, SMTP_PASS mail account that sends the sign-in codes (see "Mail" below),
//   or BREVO_API_KEY + MAIL_FROM   where the host blocks SMTP
//
// Ratings live in db/ratings.db (or DATA_DIR). Back that file up; deleting it deletes every rating.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

const ROOT = __dirname;

// Settings can also live in a file named .env beside this one (KEY=value per line; see .env.example). It is
// never served and never committed. Values already set in the environment win.
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* no .env file: the environment alone decides */ }
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
// A fare someone actually paid between two local bus stops. The pair is stored in a fixed order so that
// A->B and B->A count as the same trip; one row per device, which can correct its own report.
db.exec(`CREATE TABLE IF NOT EXISTS fare_reports (
  a       TEXT NOT NULL,
  b       TEXT NOT NULL,
  device  TEXT NOT NULL,
  fare    INTEGER NOT NULL CHECK (fare BETWEEN 5 AND 2000),
  updated INTEGER NOT NULL,
  PRIMARY KEY (a, b, device)
)`);
const fq = {
  all:    db.prepare('SELECT a, b, fare FROM fare_reports ORDER BY a, b, fare'),
  upsert: db.prepare(`INSERT INTO fare_reports (a, b, device, fare, updated) VALUES (?, ?, ?, ?, ?)
                      ON CONFLICT (a, b, device) DO UPDATE SET fare = excluded.fare, updated = excluded.updated`)
};

const q = {
  all:    db.prepare('SELECT key, ROUND(AVG(stars), 2) AS avg, COUNT(*) AS n FROM ratings GROUP BY key'),
  one:    db.prepare('SELECT ROUND(AVG(stars), 2) AS avg, COUNT(*) AS n FROM ratings WHERE key = ?'),
  upsert: db.prepare(`INSERT INTO ratings (key, device, stars, updated) VALUES (?, ?, ?, ?)
                      ON CONFLICT (key, device) DO UPDATE SET stars = excluded.stars, updated = excluded.updated`),
  remove: db.prepare('DELETE FROM ratings WHERE key = ? AND device = ?')
};

// ---- Mail ----
// Sign-in codes and support replies go out by e-mail through any SMTP account (Gmail with an app password,
// Brevo, Zoho ...). Set SMTP_HOST, SMTP_USER and SMTP_PASS; SMTP_PORT defaults to 465 (TLS) and MAIL_FROM to
// SMTP_USER. Without them nothing can be sent: on this computer the code is printed here and shown in the
// form so the app can still be tried, anywhere else signing in is refused.
const MAIL = { host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 465, user: process.env.SMTP_USER,
               pass: process.env.SMTP_PASS, from: process.env.MAIL_FROM || process.env.SMTP_USER, tls: process.env.SMTP_SECURE !== '0' };
if (MAIL.pass && /gmail|google/i.test(MAIL.host || '')) MAIL.pass = MAIL.pass.replace(/\s+/g, '');   // Google shows its app passwords in four groups
// Some hosts (Render's free plan among them) block the SMTP ports. There a mail service's web API is used
// instead: set BREVO_API_KEY (and MAIL_FROM, an address verified as a sender in Brevo) or RESEND_API_KEY.
const BREVO = process.env.BREVO_API_KEY, RESEND = process.env.RESEND_API_KEY;
const mailReady = !!((MAIL.host && MAIL.user && MAIL.pass) || ((BREVO || RESEND) && MAIL.from));

async function sendByApi(to, subject, text) {
  const res = BREVO
    ? await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': BREVO, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: { name: 'BD Map', email: MAIL.from }, to: [{ email: to }], subject, textContent: text }) })
    : await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `BD Map <${MAIL.from}>`, to: [to], subject, text }) });
  if (!res.ok) throw new Error(`mail service said ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

function sendMail(to, subject, text) {
  if (BREVO || RESEND) return sendByApi(to, subject, text);
  return new Promise((resolve, reject) => {
    const socket = MAIL.tls ? require('node:tls').connect(MAIL.port, MAIL.host, { servername: MAIL.host }) : require('node:net').connect(MAIL.port, MAIL.host);
    const b64 = v => Buffer.from(v, 'utf8').toString('base64');
    const message = [
      `From: =?UTF-8?B?${b64('BD Map')}?= <${MAIL.from}>`, `To: <${to}>`, `Subject: =?UTF-8?B?${b64(subject)}?=`,
      `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@bdmap>`, 'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text).replace(/(.{76})/g, '$1\r\n'), '.'
    ].join('\r\n');
    // Each step: the reply code the server must give, then the line to send next.
    const steps = [[220, `EHLO bdmap`], [250, 'AUTH LOGIN'], [334, b64(MAIL.user)], [334, b64(MAIL.pass)], [235, `MAIL FROM:<${MAIL.from}>`],
                   [250, `RCPT TO:<${to}>`], [250, 'DATA'], [354, message], [250, 'QUIT']];
    let buffer = '', step = 0;
    const fail = why => { socket.destroy(); reject(new Error(why)); };
    socket.setTimeout(15_000, () => fail('mail server did not answer'));
    socket.on('error', e => reject(Object.assign(new Error(e.message || e.code || 'could not reach the mail server'), { code: e.code })));
    socket.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split('\r\n');
      if (lines.length < 2 || !/^\d{3} /.test(lines[lines.length - 2])) return;      // the reply is not complete yet
      const code = Number(lines[lines.length - 2].slice(0, 3));
      buffer = '';
      if (step >= steps.length) return;
      const [want, next] = steps[step++];
      if (code !== want) return fail(`mail server said ${code} at step ${step}`);
      socket.write(next + '\r\n');
      if (step === steps.length) { socket.end(); resolve(); }
    });
  });
}

// ---- Accounts ----
// An account is an e-mail address proved by a six-digit code sent to it; there are no passwords. Each has a
// name, a short bio and an optional picture (stored in the database, at most ~200 KB). `role` is user, staff
// or admin: the addresses in ADMIN_EMAILS (comma separated) become admin when they sign in, and an admin can
// make others staff from the admin panel. A session is a random token in an HttpOnly cookie; only its
// SHA-256 is stored.
const hasEmail = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('users') WHERE name = 'email'").get().n;
const hasUsers = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'users'").get().n;
if (hasUsers && !hasEmail) {
  // The first version signed people in by phone number and password. Those accounts cannot be carried over
  // (there is no address to send a code to), so they and what hangs off them are dropped.
  for (const t of ['users', 'sessions', 'friends', 'messages', 'reports']) db.exec(`DROP TABLE IF EXISTS ${t}`);
}
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id      INTEGER PRIMARY KEY,
  email   TEXT NOT NULL UNIQUE,
  name    TEXT NOT NULL,
  bio     TEXT NOT NULL DEFAULT '',
  pic     BLOB,
  pic_v   INTEGER NOT NULL DEFAULT 0,
  role    TEXT NOT NULL DEFAULT 'user',
  banned  INTEGER NOT NULL DEFAULT 0,
  data    TEXT NOT NULL DEFAULT '{}',
  created INTEGER NOT NULL,
  seen    INTEGER NOT NULL DEFAULT 0
)`);
db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  token   TEXT PRIMARY KEY,
  user    INTEGER NOT NULL,
  expires INTEGER NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS codes (
  email   TEXT PRIMARY KEY,
  hash    TEXT NOT NULL,
  expires INTEGER NOT NULL,
  tries   INTEGER NOT NULL DEFAULT 0,
  sent    INTEGER NOT NULL
)`);
if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('users') WHERE name = 'points'").get().n) db.exec('ALTER TABLE users ADD COLUMN points INTEGER NOT NULL DEFAULT 0');
const USER_COLS = 'id, email, name, bio, pic_v, role, banned, data, created, seen, points';
const aq = {
  byEmail:    db.prepare(`SELECT ${USER_COLS} FROM users WHERE email = ?`),
  byId:       db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`),
  add:        db.prepare('INSERT INTO users (email, name, role, created, seen) VALUES (?, ?, ?, ?, ?)'),
  setData:    db.prepare('UPDATE users SET data = ? WHERE id = ?'),
  setProfile: db.prepare('UPDATE users SET name = ?, bio = ? WHERE id = ?'),
  setPic:     db.prepare('UPDATE users SET pic = ?, pic_v = pic_v + 1 WHERE id = ?'),
  pic:        db.prepare('SELECT pic FROM users WHERE id = ?'),
  setRole:    db.prepare('UPDATE users SET role = ? WHERE id = ?'),
  setBanned:  db.prepare('UPDATE users SET banned = ? WHERE id = ?'),
  setSeen:    db.prepare('UPDATE users SET seen = ? WHERE id = ?'),
  remove:     db.prepare('DELETE FROM users WHERE id = ?'),
  session:    db.prepare(`SELECT ${USER_COLS.split(', ').map(c => 'u.' + c).join(', ')} FROM sessions s JOIN users u ON u.id = s.user WHERE s.token = ? AND s.expires > ?`),
  addSession: db.prepare('INSERT INTO sessions (token, user, expires) VALUES (?, ?, ?)'),
  endSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  endAll:     db.prepare('DELETE FROM sessions WHERE user = ?'),
  expire:     db.prepare('DELETE FROM sessions WHERE expires <= ?'),
  code:       db.prepare('SELECT * FROM codes WHERE email = ?'),
  setCode:    db.prepare(`INSERT INTO codes (email, hash, expires, tries, sent) VALUES (?, ?, ?, 0, ?)
                          ON CONFLICT (email) DO UPDATE SET hash = excluded.hash, expires = excluded.expires, tries = 0, sent = excluded.sent`),
  badTry:     db.prepare('UPDATE codes SET tries = tries + 1 WHERE email = ?'),
  dropCode:   db.prepare('DELETE FROM codes WHERE email = ?'),
  oldCodes:   db.prepare('DELETE FROM codes WHERE expires <= ?'),
  // What a device rated or reported before its owner logged in becomes the account's.
  adoptRatings: db.prepare('UPDATE OR IGNORE ratings SET device = ? WHERE device = ?'),
  dropRatings:  db.prepare('DELETE FROM ratings WHERE device = ?'),
  adoptFares:   db.prepare('UPDATE OR IGNORE fare_reports SET device = ? WHERE device = ?'),
  dropFares:    db.prepare('DELETE FROM fare_reports WHERE device = ?')
};
aq.expire.run(Date.now());

// The owner's address is the admin unless ADMIN_EMAILS says otherwise.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'rabbihossaingd@gmail.com').toLowerCase().split(',').map(e => e.trim()).filter(Boolean);
const SESSION_DAYS = 90, COOKIE = 'bdmap_sid';
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const okDevice = d => typeof d === 'string' && /^[\w-]{8,64}$/.test(d);
const sessionToken = req => (new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})').exec(req.headers.cookie || '') || [])[1];
// Only a browser on this same computer, not something reaching the server through a host's proxy.
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !req.headers['x-forwarded-for'];
function userOf(req) {
  const token = sessionToken(req);
  const user = token ? aq.session.get(sha(token), Date.now()) : null;
  if (!user || user.banned) return null;
  if (user.role !== 'admin' && ADMIN_EMAILS.includes(user.email)) { aq.setRole.run('admin', user.id); user.role = 'admin'; }
  const now = Date.now();
  if (now - user.seen > 5 * 60_000) aq.setSeen.run(now, user.id);       // "last active", to the nearest five minutes
  return user;
}
// Ratings and fare reports are counted once per person: the account when logged in, else the device.
const voterOf = (req, device) => { const u = userOf(req); return u ? 'u' + u.id : device; };

function cookie(req, value, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}
function startSession(req, res, user, device) {
  const token = crypto.randomBytes(32).toString('hex');
  aq.addSession.run(sha(token), user.id, Date.now() + SESSION_DAYS * 864e5);
  res.setHeader('Set-Cookie', cookie(req, token, SESSION_DAYS * 86400));
  if (okDevice(device)) {
    const voter = 'u' + user.id;
    aq.adoptRatings.run(voter, device); aq.dropRatings.run(device);
    aq.adoptFares.run(voter, device);   aq.dropFares.run(device);
  }
}
const publicUser = u => ({ user: { id: u.id, name: u.name, email: u.email, bio: u.bio, pic: u.pic_v, role: u.role, points: u.points }, data: JSON.parse(u.data || '{}') });

function cleanEmail(e) {
  if (typeof e !== 'string') return null;
  const s = e.trim().toLowerCase();
  return s.length <= 120 && /^[^\s@<>"]{1,64}@[^\s@<>"]+\.[a-z]{2,}$/.test(s) ? s : null;
}
const cleanName = n => typeof n === 'string' ? n.trim().replace(/\s+/g, ' ').slice(0, 40) : '';

// Guessing and flooding: at most 8 tries per key in 15 minutes.
const tries = new Map();
function allowTry(key) {
  const now = Date.now(), recent = (tries.get(key) || []).filter(t => now - t < 15 * 60_000);
  if (recent.length >= 8) { tries.set(key, recent); return false; }
  recent.push(now);
  tries.set(key, recent);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of tries) if (!times.some(t => now - t < 15 * 60_000)) tries.delete(key);
  aq.expire.run(now);
  aq.oldCodes.run(now);
}, 10 * 60_000).unref();

// Everything an account owns goes with it.
function deleteUser(id) {
  aq.endAll.run(id);
  for (const sql of ['DELETE FROM friends WHERE a = ?1 OR b = ?1', 'DELETE FROM messages WHERE a = ?1 OR b = ?1', 'DELETE FROM reports WHERE reporter = ?1 OR about = ?1',
                     'DELETE FROM ticket_msgs WHERE ticket IN (SELECT id FROM tickets WHERE user = ?1)', 'DELETE FROM tickets WHERE user = ?1', 'DELETE FROM contributions WHERE user = ?1', 'DELETE FROM post_likes WHERE user = ?1', 'DELETE FROM post_saves WHERE user = ?1', 'DELETE FROM post_comments WHERE user = ?1',
                     'DELETE FROM chat_ok WHERE a = ?1 OR b = ?1']) db.prepare(sql).run(id);
  for (const st of db.prepare('SELECT * FROM stories WHERE user = ?').all(id)) deleteStory(st);
  for (const p of db.prepare('SELECT * FROM posts WHERE user = ?').all(id)) deletePost(p);
  aq.dropRatings.run('u' + id);
  aq.dropFares.run('u' + id);
  aq.remove.run(id);
  for (const res of streams.get(id) || []) res.end();
}

//   GET  /api/auth/me                    -> { user: { id, name, email, bio, pic, role } | null, data }
//   POST /api/auth/code    {email}       sends a six-digit code, good for 10 minutes
//   POST /api/auth/verify  {email, code, device} -> signs in; creates the account the first time ({ isNew: true })
//   POST /api/auth/profile {name, bio}   POST /api/auth/avatar {image: data URL | null}
//   POST /api/auth/data    {data}        the synced blob, at most 8 KB
//   POST /api/auth/logout                POST /api/auth/delete
// Errors are short codes the app turns into a sentence: email, wait, mail, wrong, expired, slow, name, image, banned, login.
async function authApi(req, res, action) {
  const me = userOf(req);
  if (action === 'me' && req.method === 'GET') return json(res, 200, me ? publicUser(me) : { user: null });
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  // Only this app's own JSON requests: a form on another site cannot send this content type.
  if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 400, { error: 'bad request' });
  let body;
  try { body = JSON.parse(await readBody(req, 400_000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }
  const ip = req.socket.remoteAddress, now = Date.now();

  if (action === 'code') {
    const email = cleanEmail(body.email);
    if (!email) return json(res, 400, { error: 'email' });
    const old = aq.code.get(email);
    if (old && now - old.sent < 60_000) return json(res, 429, { error: 'wait' });
    if (!allowTry(ip + '|code') || !allowTry(email + '|code')) return json(res, 429, { error: 'slow' });
    if (!mailReady && !isLocal(req)) return json(res, 503, { error: 'mail' });
    const code = String(crypto.randomInt(100000, 1000000));
    aq.setCode.run(email, sha(code + email), now + 10 * 60_000, now);
    if (!mailReady) {
      console.log(`[no mail set up] sign-in code for ${email}: ${code}`);
      return json(res, 200, { sent: true, devCode: code });
    }
    try {
      await sendMail(email, `${code} — BD Map কোড`, `আপনার BD Map কোড: ${code}\n\nকোডটি ১০ মিনিট পর্যন্ত চলবে। আপনি না চেয়ে থাকলে এই ই-মেইলটি উপেক্ষা করুন।\n\nYour BD Map code is ${code}. It is valid for 10 minutes. If you did not ask for it, ignore this e-mail.`);
    } catch (e) {
      console.error('mail failed:', e.code || '', e.message || String(e));
      aq.dropCode.run(email);
      return json(res, 502, { error: 'mail' });
    }
    return json(res, 200, { sent: true });
  }
  if (action === 'verify') {
    const email = cleanEmail(body.email), row = email && aq.code.get(email);
    if (!row || typeof body.code !== 'string') return json(res, 401, { error: 'wrong' });
    if (row.expires <= now) { aq.dropCode.run(email); return json(res, 401, { error: 'expired' }); }
    if (row.tries >= 5) return json(res, 429, { error: 'slow' });
    const given = Buffer.from(sha(body.code.replace(/\D/g, '') + email)), kept = Buffer.from(row.hash);
    if (!crypto.timingSafeEqual(given, kept)) { aq.badTry.run(email); return json(res, 401, { error: 'wrong' }); }
    aq.dropCode.run(email);
    let user = aq.byEmail.get(email), isNew = false;
    const admin = ADMIN_EMAILS.includes(email);
    if (!user) {
      isNew = true;
      const { lastInsertRowid } = aq.add.run(email, cleanName(email.split('@')[0].replace(/[._+-]+/g, ' ')) || 'BD Map', admin ? 'admin' : 'user', now, now);
      user = aq.byId.get(lastInsertRowid);
    } else if (admin && user.role !== 'admin') { aq.setRole.run('admin', user.id); user.role = 'admin'; }
    if (user.banned) return json(res, 403, { error: 'banned' });
    startSession(req, res, user, body.device);
    return json(res, 200, { ...publicUser(user), isNew });
  }
  if (action === 'logout') {
    const token = sessionToken(req);
    if (token) aq.endSession.run(sha(token));
    res.setHeader('Set-Cookie', cookie(req, '', 0));
    return json(res, 200, { user: null });
  }
  if (!me) return json(res, 401, { error: 'login' });
  if (action === 'profile') {
    const name = cleanName(body.name), bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 160) : '';
    if (name.length < 2) return json(res, 400, { error: 'name' });
    aq.setProfile.run(name, bio, me.id);
    tellFriends(me.id, 'friends', {});
    return json(res, 200, publicUser(aq.byId.get(me.id)));
  }
  if (action === 'avatar') {
    let pic = null;
    if (body.image != null) {
      const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(typeof body.image === 'string' ? body.image : '');
      pic = m && Buffer.from(m[2], 'base64');
      if (!pic || pic.length < 100 || pic.length > 220_000) return json(res, 400, { error: 'image' });
    }
    aq.setPic.run(pic, me.id);
    tellFriends(me.id, 'friends', {});
    return json(res, 200, publicUser(aq.byId.get(me.id)));
  }
  if (action === 'data') {
    const text = JSON.stringify(body.data);
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data) || text.length > 8000) return json(res, 400, { error: 'bad request' });
    aq.setData.run(text, me.id);
    return json(res, 200, { ok: true });
  }
  if (action === 'delete') {
    deleteUser(me.id);
    res.setHeader('Set-Cookie', cookie(req, '', 0));
    return json(res, 200, { user: null });
  }
  json(res, 404, { error: 'not found' });
}

// Profile pictures: /api/avatar/<user id>. The picture's version is in the address the app asks for, so a
// copy can be kept for a long time.
function avatarApi(req, res, id) {
  const row = /^\d+$/.test(id) ? aq.pic.get(Number(id)) : null;
  if (!row || !row.pic) { res.writeHead(404).end(); return; }
  const pic = Buffer.from(row.pic);
  const type = pic[0] === 0xff ? 'image/jpeg' : pic[0] === 0x89 ? 'image/png' : 'image/webp';
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': pic.length, 'Cache-Control': 'public, max-age=31536000, immutable' });
  res.end(pic);
}

// ---- Messenger ----
// Two people can message and call each other once they are friends: one asks (by e-mail address), the other
// accepts. Seen the other way round this is following: 'pending' means the actor follows the other person,
// 'friends' means they follow each other. A pair is always stored with the smaller user id first. `state` is pending / friends / blocked and
// `actor` is who asked or who blocked. Messages are kept as plain text; `body` is JSON for a shared place or
// a call record. Nothing here is end-to-end encrypted.
db.exec(`CREATE TABLE IF NOT EXISTS friends (
  a       INTEGER NOT NULL,
  b       INTEGER NOT NULL,
  state   TEXT NOT NULL,
  actor   INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (a, b)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS messages (
  id     INTEGER PRIMARY KEY,
  a      INTEGER NOT NULL,
  b      INTEGER NOT NULL,
  sender INTEGER NOT NULL,
  kind   TEXT NOT NULL,
  body   TEXT NOT NULL,
  sent   INTEGER NOT NULL,
  seen   INTEGER NOT NULL DEFAULT 0
)`);
db.exec('CREATE INDEX IF NOT EXISTS messages_pair ON messages (a, b, id)');
db.exec(`CREATE TABLE IF NOT EXISTS reports (
  id       INTEGER PRIMARY KEY,
  reporter INTEGER NOT NULL,
  about    INTEGER NOT NULL,
  reason   TEXT NOT NULL,
  made     INTEGER NOT NULL,
  status   TEXT NOT NULL DEFAULT 'open'
)`);
const cq = {
  link:    db.prepare('SELECT * FROM friends WHERE a = ? AND b = ?'),
  setLink: db.prepare(`INSERT INTO friends (a, b, state, actor, updated) VALUES (?, ?, ?, ?, ?)
                       ON CONFLICT (a, b) DO UPDATE SET state = excluded.state, actor = excluded.actor, updated = excluded.updated`),
  drop:    db.prepare('DELETE FROM friends WHERE a = ? AND b = ?'),
  links:   db.prepare(`SELECT f.state, f.actor, f.updated, u.id, u.name, u.bio, u.pic_v AS pic FROM friends f
                       JOIN users u ON u.id = CASE WHEN f.a = ?1 THEN f.b ELSE f.a END WHERE f.a = ?1 OR f.b = ?1`),
  last:    db.prepare('SELECT id, sender, kind, body, sent, seen FROM messages WHERE a = ? AND b = ? ORDER BY id DESC LIMIT 1'),
  unread:  db.prepare('SELECT COUNT(*) AS n FROM messages WHERE a = ? AND b = ? AND sender <> ? AND seen = 0'),
  history: db.prepare('SELECT id, sender, kind, body, sent, seen FROM messages WHERE a = ? AND b = ? AND id < ? ORDER BY id DESC LIMIT 60'),
  add:     db.prepare('INSERT INTO messages (a, b, sender, kind, body, sent) VALUES (?, ?, ?, ?, ?, ?)'),
  seen:    db.prepare('UPDATE messages SET seen = 1 WHERE a = ? AND b = ? AND sender = ? AND seen = 0'),
  report:  db.prepare('INSERT INTO reports (reporter, about, reason, made) VALUES (?, ?, ?, ?)')
};
// Two people who do not follow each other can still talk: the first message arrives as a request, and the
// conversation opens fully (unlimited messages, calls) once the other person accepts it.
db.exec('CREATE TABLE IF NOT EXISTS chat_ok (a INTEGER NOT NULL, b INTEGER NOT NULL, PRIMARY KEY (a, b))');
const pair = (x, y) => x < y ? [x, y] : [y, x];
const chatOpen = (x, y) => areFriends(x, y) || !!db.prepare('SELECT 1 FROM chat_ok WHERE a = ? AND b = ?').get(...pair(x, y));
const REQUEST_LIMIT = 5;                               // messages allowed before a request is accepted
const linkOf = (x, y) => cq.link.get(...pair(x, y));
const areFriends = (x, y) => (linkOf(x, y) || {}).state === 'friends';
const shown = m => ({ id: m.id, sender: m.sender, kind: m.kind, body: m.kind === 'text' ? m.body : JSON.parse(m.body), sent: m.sent, seen: m.seen });

// Live delivery: every open app holds one event stream; a user can have several (phone and computer).
const streams = new Map();   // user id -> Set of responses
function push(userId, event, data) {
  for (const res of streams.get(userId) || []) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
const isOnline = id => (streams.get(id) || { size: 0 }).size > 0;
function tellFriends(userId, event, data) {
  for (const l of cq.links.all(userId)) if (l.state === 'friends') push(l.id, event, data);
}
setInterval(() => { for (const set of streams.values()) for (const res of set) res.write(': keep-alive\n\n'); }, 25_000).unref();

// At most 90 messages a minute from one account.
const sends = new Map();
function allowSend(id) {
  const now = Date.now(), recent = (sends.get(id) || []).filter(t => now - t < 60_000);
  if (recent.length >= 90) return false;
  recent.push(now);
  sends.set(id, recent);
  return true;
}

// The STUN server lets two browsers find a direct path. Behind strict mobile networks a TURN relay is also
// needed: set TURN_URL, TURN_USER and TURN_PASS to use one.
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
if (process.env.TURN_URL) ICE.push({ urls: process.env.TURN_URL, username: process.env.TURN_USER || '', credential: process.env.TURN_PASS || '' });

//   GET  /api/chat/stream            server-sent events: message, read, typing, presence, friends, signal
//   GET  /api/chat/list              -> { friends, incoming, outgoing, blocked }
//   GET  /api/chat/find?email=       -> { user: { id, name, bio, pic, state } }
//   GET  /api/chat/messages?with=id[&before=id]
//   GET  /api/chat/ice               -> { iceServers }
//   POST /api/chat/friend | unfriend | block | unblock {id}      POST /api/chat/report {id, reason}
//   POST /api/chat/send {to, kind, body}   kind: text | place | call | photo | video | file
//   POST /api/chat/upload (file as the body, X-Name header)     POST /api/chat/accept | decline {id}
//   POST /api/chat/read {with}       POST /api/chat/typing {to}       POST /api/chat/signal {to, data}
async function chatApi(req, res, action, query) {
  const me = userOf(req);
  if (!me) return json(res, 401, { error: 'login' });

  if (req.method === 'GET') {
    if (action === 'stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      if (!streams.has(me.id)) streams.set(me.id, new Set());
      const set = streams.get(me.id);
      set.add(res);
      if (set.size === 1) tellFriends(me.id, 'presence', { id: me.id, online: true });
      req.on('close', () => {
        set.delete(res);
        if (!set.size) { streams.delete(me.id); tellFriends(me.id, 'presence', { id: me.id, online: false }); }
      });
      return;
    }
    if (action === 'list') {
      // friends: every conversation I am part of (`ok` false while my request waits to be accepted);
      // requests: people who wrote to me first and whom I have not accepted; incoming / outgoing: follows.
      const out = { friends: [], requests: [], incoming: [], outgoing: [], blocked: [] }, seen = new Set(), blocked = new Set();
      const talk = (who, since, mutual) => {
        if (seen.has(who.id)) return;
        seen.add(who.id);
        const [a, b] = pair(me.id, who.id), last = cq.last.get(a, b), ok = mutual || chatOpen(me.id, who.id);
        const row = { ...who, online: ok && isOnline(who.id), since, last: last ? shown(last) : null, unread: cq.unread.get(a, b, me.id).n, ok, mutual };
        if (ok || count('SELECT COUNT(*) AS n FROM messages WHERE a = ? AND b = ? AND sender = ?', a, b, me.id)) out.friends.push(row);
        else if (last) out.requests.push(row);
      };
      for (const l of cq.links.all(me.id)) {
        const who = { id: l.id, name: l.name, bio: l.bio, pic: l.pic };
        if (l.state === 'friends') talk(who, l.updated, true);
        else if (l.state === 'pending') (l.actor === me.id ? out.outgoing : out.incoming).push(who);
        else { blocked.add(l.id); if (l.actor === me.id) out.blocked.push(who); }
      }
      for (const { other } of db.prepare('SELECT DISTINCT CASE WHEN a = ?1 THEN b ELSE a END AS other FROM messages WHERE a = ?1 OR b = ?1').all(me.id)) {
        const u = aq.byId.get(other);
        if (u && !u.banned && !blocked.has(other)) talk({ id: u.id, name: u.name, bio: u.bio, pic: u.pic_v }, 0, false);
      }
      return json(res, 200, out);
    }
    if (action === 'find') {
      if (!allowWrite(req.socket.remoteAddress)) return json(res, 429, { error: 'slow' });
      const email = cleanEmail(query.get('email') || '');
      if (!email) return json(res, 400, { error: 'email' });
      const user = aq.byEmail.get(email);
      if (user && user.id === me.id) return json(res, 400, { error: 'self' });
      const link = user && linkOf(me.id, user.id);
      if (!user || (link && link.state === 'blocked')) return json(res, 404, { error: 'none' });
      const state = !link ? 'none' : link.state === 'friends' ? 'friends' : link.actor === me.id ? 'sent' : 'received';
      return json(res, 200, { user: { id: user.id, name: user.name, bio: user.bio, pic: user.pic_v, state } });
    }
    if (action === 'messages') {
      const other = Number(query.get('with')), before = Number(query.get('before')) || Number.MAX_SAFE_INTEGER;
      if (!Number.isInteger(other) || (linkOf(me.id, other) || {}).state === 'blocked') return json(res, 403, { error: 'friends' });
      return json(res, 200, { messages: cq.history.all(...pair(me.id, other), before).reverse().map(shown), ok: chatOpen(me.id, other) });
    }
    if (action === 'ice') return json(res, 200, { iceServers: ICE });
    return json(res, 404, { error: 'not found' });
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  // A photo, video or any other file for a conversation: the file itself is the body, its name is in X-Name.
  if (action === 'upload') {
    const limit = 25e6, given = decodeURIComponent(String(req.headers['x-name'] || 'file')).slice(0, 80);
    if (Number(req.headers['content-length']) > limit) { req.resume(); return json(res, 413, { error: 'big' }); }
    if (count('SELECT COUNT(*) AS n FROM uploads WHERE user = ? AND created > ?', me.id, Date.now() - 864e5) >= 80) { req.resume(); return json(res, 429, { error: 'slow' }); }
    const type = MEDIA_TYPES[(req.headers['content-type'] || '').split(';')[0].trim()];
    const ext = type ? type[0] : '.' + ((/\.([A-Za-z0-9]{1,5})$/.exec(given) || [, 'bin'])[1]).toLowerCase();
    const kind = type ? type[1] : 'file', name = crypto.randomBytes(12).toString('hex') + ext, file = path.join(MEDIA_DIR, name);
    const out = fs.createWriteStream(file);
    let size = 0, failed = false;
    const fail = (status, error) => { if (failed) return; failed = true; out.destroy(); fs.unlink(file, () => {}); req.resume(); json(res, status, { error }); };
    req.on('data', chunk => { size += chunk.length; if (size > limit) fail(413, 'big'); else if (!failed) out.write(chunk); });
    req.on('error', () => fail(400, 'bad request'));
    req.on('end', () => {
      if (failed) return;
      out.end(() => {
        if (!size) return fail(400, 'bad request');
        db.prepare('INSERT INTO uploads (name, user, kind, created) VALUES (?, ?, ?, ?)').run(name, me.id, kind, Date.now());
        json(res, 200, { media: name, kind, name: given, size });
      });
    });
    return;
  }
  if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 400, { error: 'bad request' });
  let body;
  try { body = JSON.parse(await readBody(req, 40_000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }
  const other = Number(body.id ?? body.to ?? body.with);
  if (!Number.isInteger(other) || other === me.id || !aq.byId.get(other)) return json(res, 400, { error: 'bad request' });
  const [a, b] = pair(me.id, other), link = cq.link.get(a, b), now = Date.now();
  const refresh = () => { push(me.id, 'friends', {}); push(other, 'friends', {}); };

  if (action === 'friend') {
    if (link && link.state === 'blocked') return json(res, 403, { error: 'blocked' });
    if (!link) { if (!allowWrite(req.socket.remoteAddress)) return json(res, 429, { error: 'slow' }); cq.setLink.run(a, b, 'pending', me.id, now); }
    else if (link.state === 'pending' && link.actor !== me.id) cq.setLink.run(a, b, 'friends', me.id, now);
    refresh();
    return json(res, 200, { ok: true });
  }
  if (action === 'unfollow') {                       // stop following; if they follow me, that stays
    if (link && link.state === 'friends') cq.setLink.run(a, b, 'pending', other, now);
    else if (link && link.state === 'pending' && link.actor === me.id) cq.drop.run(a, b);
    refresh();
    return json(res, 200, { ok: true });
  }
  if (action === 'unfriend') {                       // cut the tie both ways (also: remove a follower)
    if (link && link.state !== 'blocked') { cq.drop.run(a, b); refresh(); }
    return json(res, 200, { ok: true });
  }
  if (action === 'block') {
    if (!link || link.state !== 'blocked') { cq.setLink.run(a, b, 'blocked', me.id, now); refresh(); }
    return json(res, 200, { ok: true });
  }
  if (action === 'unblock') {
    if (link && link.state === 'blocked' && link.actor === me.id) { cq.drop.run(a, b); refresh(); }
    return json(res, 200, { ok: true });
  }
  if (action === 'report') {
    cq.report.run(me.id, other, cleanText(body.reason, 300) || 'no reason given', now);
    return json(res, 200, { ok: true });
  }

  if (link && link.state === 'blocked') return json(res, 403, { error: 'friends' });
  const open = chatOpen(me.id, other);
  if (action === 'accept') {                         // accept a message request
    if (count('SELECT COUNT(*) AS n FROM messages WHERE a = ? AND b = ? AND sender = ?', a, b, other)) db.prepare('INSERT OR IGNORE INTO chat_ok (a, b) VALUES (?, ?)').run(a, b);
    refresh();
    return json(res, 200, { ok: true });
  }
  if (action === 'decline') {                        // turn a request down: the messages go
    if (!open) { db.prepare('DELETE FROM messages WHERE a = ? AND b = ?').run(a, b); refresh(); }
    return json(res, 200, { ok: true });
  }
  if (action === 'read' || action === 'typing') {
    if (action === 'read' && cq.seen.run(a, b, other).changes && open) push(other, 'read', { by: me.id });
    if (action === 'typing' && open) push(other, 'typing', { from: me.id });
    return json(res, 200, { ok: true });
  }
  // Calls need an open conversation. A message does not: until it is accepted it is a request, and limited.
  if (action !== 'send' && !open) return json(res, 403, { error: 'friends' });
  if (action === 'send') {
    if (!allowSend(me.id)) return json(res, 429, { error: 'slow' });
    if (!open && count('SELECT COUNT(*) AS n FROM messages WHERE a = ? AND b = ? AND sender = ?', a, b, me.id) >= REQUEST_LIMIT) return json(res, 403, { error: 'request' });
    if (!open && body.kind !== 'text') return json(res, 403, { error: 'request' });
    const kind = body.kind, v = body.body;
    let text;
    if (kind === 'text') {
      text = typeof v === 'string' ? v.trim() : '';
      if (!text || text.length > 2000) return json(res, 400, { error: 'bad request' });
    } else if (kind === 'place') {
      const ok = v && typeof v.label === 'string' && v.label.trim() && Number.isFinite(v.lat) && Number.isFinite(v.lon) && Math.abs(v.lat) <= 90 && Math.abs(v.lon) <= 180;
      if (!ok) return json(res, 400, { error: 'bad request' });
      text = JSON.stringify({ lat: +v.lat.toFixed(6), lon: +v.lon.toFixed(6), label: v.label.trim().slice(0, 120) });
    } else if (kind === 'call') {
      const ok = v && ['missed', 'declined', 'ended'].includes(v.result) && Number.isInteger(v.secs) && v.secs >= 0 && v.secs < 86400;
      if (!ok) return json(res, 400, { error: 'bad request' });
      text = JSON.stringify({ video: !!v.video, result: v.result, secs: v.secs });
    } else if (kind === 'photo' || kind === 'video' || kind === 'file') {
      const up = db.prepare('SELECT * FROM uploads WHERE name = ? AND user = ? AND used = 0').get(String(v && v.media), me.id);
      if (!up || up.kind !== kind) return json(res, 400, { error: 'bad request' });
      db.prepare('UPDATE uploads SET used = 1 WHERE name = ?').run(up.name);
      text = JSON.stringify({ src: 'media/' + up.name, name: cleanText(v.name, 80) || 'file', size: Number(v.size) || 0 });
    } else return json(res, 400, { error: 'bad request' });
    const { lastInsertRowid } = cq.add.run(a, b, me.id, kind, text, now);
    const message = { ...shown({ id: Number(lastInsertRowid), sender: me.id, kind, body: text, sent: now, seen: 0 }), to: other };
    push(other, 'message', message);
    push(me.id, 'message', message);                 // the sender's other devices
    return json(res, 200, { message });
  }
  if (action === 'signal') {                         // call set-up, passed straight to the other person
    if (!body.data || typeof body.data !== 'object') return json(res, 400, { error: 'bad request' });
    push(other, 'signal', { from: me.id, data: body.data });
    return json(res, 200, { online: isOnline(other) });
  }
  json(res, 404, { error: 'not found' });
}

// ---- Support ----
// A person writes to support from the app; staff answer from the admin panel. One ticket is one conversation.
// status: open (waiting for staff), answered (waiting for the person), closed.
db.exec(`CREATE TABLE IF NOT EXISTS tickets (
  id       INTEGER PRIMARY KEY,
  user     INTEGER NOT NULL,
  category TEXT NOT NULL,
  subject  TEXT NOT NULL,
  status   TEXT NOT NULL DEFAULT 'open',
  created  INTEGER NOT NULL,
  updated  INTEGER NOT NULL,
  unread   INTEGER NOT NULL DEFAULT 0
)`);
db.exec(`CREATE TABLE IF NOT EXISTS ticket_msgs (
  id     INTEGER PRIMARY KEY,
  ticket INTEGER NOT NULL,
  sender INTEGER NOT NULL,
  staff  INTEGER NOT NULL DEFAULT 0,
  body   TEXT NOT NULL,
  sent   INTEGER NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS audit (
  id     INTEGER PRIMARY KEY,
  actor  INTEGER NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  at     INTEGER NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('reports') WHERE name = 'status'").get().n) db.exec("ALTER TABLE reports ADD COLUMN status TEXT NOT NULL DEFAULT 'open'");
const TICKET_KINDS = ['account', 'fare', 'route', 'chat', 'person', 'other'];
const sq = {
  mine:     db.prepare('SELECT id, category, subject, status, created, updated, unread FROM tickets WHERE user = ? ORDER BY updated DESC LIMIT 50'),
  one:      db.prepare('SELECT * FROM tickets WHERE id = ?'),
  msgs:     db.prepare('SELECT m.id, m.staff, m.body, m.sent, u.name FROM ticket_msgs m LEFT JOIN users u ON u.id = m.sender WHERE m.ticket = ? ORDER BY m.id'),
  add:      db.prepare('INSERT INTO tickets (user, category, subject, created, updated) VALUES (?, ?, ?, ?, ?)'),
  addMsg:   db.prepare('INSERT INTO ticket_msgs (ticket, sender, staff, body, sent) VALUES (?, ?, ?, ?, ?)'),
  touch:    db.prepare('UPDATE tickets SET status = ?, updated = ?, unread = ? WHERE id = ?'),
  read:     db.prepare('UPDATE tickets SET unread = 0 WHERE id = ?'),
  today:    db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE user = ? AND created > ?'),
  setting:  db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSet:   db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'),
  audit:    db.prepare('INSERT INTO audit (actor, action, target, detail, at) VALUES (?, ?, ?, ?, ?)')
};
const cleanText = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';

//   GET  /api/support/list            -> { tickets }
//   GET  /api/support/thread?id=      -> { ticket, messages }
//   POST /api/support/new   {category, subject, body}
//   POST /api/support/reply {id, body}        POST /api/support/close {id}
async function supportApi(req, res, action, query) {
  const me = userOf(req);
  if (!me) return json(res, 401, { error: 'login' });
  const now = Date.now();
  if (req.method === 'GET') {
    if (action === 'list') return json(res, 200, { tickets: sq.mine.all(me.id) });
    if (action === 'thread') {
      const t = sq.one.get(Number(query.get('id')));
      if (!t || t.user !== me.id) return json(res, 404, { error: 'not found' });
      sq.read.run(t.id);
      return json(res, 200, { ticket: { id: t.id, category: t.category, subject: t.subject, status: t.status, created: t.created }, messages: sq.msgs.all(t.id) });
    }
    return json(res, 404, { error: 'not found' });
  }
  if (req.method !== 'POST' || !(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 400, { error: 'bad request' });
  let body;
  try { body = JSON.parse(await readBody(req, 12_000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }
  const text = cleanText(body.body, 3000);
  if (action === 'new') {
    const subject = cleanText(body.subject, 120);
    if (!TICKET_KINDS.includes(body.category) || subject.length < 3 || text.length < 5) return json(res, 400, { error: 'short' });
    if (sq.today.get(me.id, now - 864e5).n >= 5) return json(res, 429, { error: 'slow' });
    const id = Number(sq.add.run(me.id, body.category, subject, now, now).lastInsertRowid);
    sq.addMsg.run(id, me.id, 0, text, now);
    return json(res, 200, { id });
  }
  const t = sq.one.get(Number(body.id));
  if (!t || t.user !== me.id) return json(res, 404, { error: 'not found' });
  if (action === 'reply') {
    if (text.length < 1) return json(res, 400, { error: 'short' });
    if (!allowSend(me.id)) return json(res, 429, { error: 'slow' });
    sq.addMsg.run(t.id, me.id, 0, text, now);
    sq.touch.run('open', now, 0, t.id);
    return json(res, 200, { ok: true });
  }
  if (action === 'close') { sq.touch.run('closed', now, 0, t.id); return json(res, 200, { ok: true }); }
  json(res, 404, { error: 'not found' });
}

// ---- Explore: photos and videos of places people have been ----
// A post is one photo or one video with a caption and, optionally, the place it shows. Everyone can see every
// post; people can like and comment. The files live on disk under DATA_DIR/media (not in the database) and are
// served from /media/<name>. A photo is shrunk in the browser before it is sent; a video is sent as it is and
// may be up to 50 MB. An upload not turned into a post within an hour is removed.
const MEDIA_DIR = path.join(DATA_DIR, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const MEDIA_TYPES = { 'image/jpeg': ['.jpg', 'photo', 4e6], 'image/png': ['.png', 'photo', 4e6], 'image/webp': ['.webp', 'photo', 4e6],
                      'video/mp4': ['.mp4', 'video', 50e6], 'video/webm': ['.webm', 'video', 50e6], 'video/quicktime': ['.mov', 'video', 50e6] };
db.exec(`CREATE TABLE IF NOT EXISTS uploads (name TEXT PRIMARY KEY, user INTEGER NOT NULL, kind TEXT NOT NULL, created INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)`);
db.exec(`CREATE TABLE IF NOT EXISTS posts (
  id      INTEGER PRIMARY KEY,
  user    INTEGER NOT NULL,
  kind    TEXT NOT NULL,
  file    TEXT NOT NULL,
  poster  TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  place   TEXT NOT NULL DEFAULT '',
  lat     REAL, lon REAL,
  created INTEGER NOT NULL
)`);
db.exec('CREATE INDEX IF NOT EXISTS posts_user ON posts (user, id)');
db.exec(`CREATE TABLE IF NOT EXISTS post_likes (post INTEGER NOT NULL, user INTEGER NOT NULL, PRIMARY KEY (post, user))`);
db.exec(`CREATE TABLE IF NOT EXISTS post_saves (post INTEGER NOT NULL, user INTEGER NOT NULL, made INTEGER NOT NULL, PRIMARY KEY (post, user))`);
// A story is a photo or video that shows for 24 hours and is then deleted, file and all.
db.exec(`CREATE TABLE IF NOT EXISTS stories (id INTEGER PRIMARY KEY, user INTEGER NOT NULL, kind TEXT NOT NULL, file TEXT NOT NULL, poster TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL)`);
function deleteStory(st) { unlinkMedia(st.file); unlinkMedia(st.poster); db.prepare('DELETE FROM stories WHERE id = ?').run(st.id); }
db.exec(`CREATE TABLE IF NOT EXISTS post_comments (id INTEGER PRIMARY KEY, post INTEGER NOT NULL, user INTEGER NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL)`);
const unlinkMedia = name => { if (name) fs.unlink(path.join(MEDIA_DIR, path.basename(name)), () => {}); };
function deletePost(p) {
  unlinkMedia(p.file); unlinkMedia(p.poster);
  for (const sql of ['DELETE FROM post_likes WHERE post = ?', 'DELETE FROM post_saves WHERE post = ?', 'DELETE FROM post_comments WHERE post = ?', 'DELETE FROM posts WHERE id = ?']) db.prepare(sql).run(p.id);
}
setInterval(() => {
  for (const st of db.prepare('SELECT * FROM stories WHERE created < ?').all(Date.now() - 864e5)) deleteStory(st);
  for (const u of db.prepare('SELECT name FROM uploads WHERE used = 0 AND created < ?').all(Date.now() - 36e5)) { unlinkMedia(u.name); db.prepare('DELETE FROM uploads WHERE name = ?').run(u.name); }
}, 15 * 60_000).unref();

const POST_SELECT = `SELECT p.*, u.name, u.pic_v, (SELECT COUNT(*) FROM post_likes l WHERE l.post = p.id) AS likes,
  (SELECT COUNT(*) FROM post_comments c WHERE c.post = p.id) AS comments, EXISTS (SELECT 1 FROM post_likes l WHERE l.post = p.id AND l.user = ?1) AS liked,
  EXISTS (SELECT 1 FROM post_saves s WHERE s.post = p.id AND s.user = ?1) AS saved
  FROM posts p JOIN users u ON u.id = p.user WHERE u.banned = 0`;
const shownPost = p => ({ id: p.id, kind: p.kind, src: p.file ? 'media/' + p.file : '', poster: p.poster ? 'media/' + p.poster : '', caption: p.caption, saved: !!p.saved,
  place: p.place ? { label: p.place, lat: p.lat, lon: p.lon } : null, created: p.created, likes: p.likes, comments: p.comments, liked: !!p.liked,
  user: { id: p.user, name: p.name, pic: p.pic_v } });

//   POST /api/explore/media   (the file itself as the body, Content-Type image/* or video/*) -> { media }
//   POST /api/explore/post    {media, poster?: data URL, caption, place?: {label, lat, lon}}  -> { post }
//   GET  /api/explore/feed?before=&user=&kind=video&q=   -> { posts }          GET /api/explore/post?id= -> { post, comments }
//   POST /api/explore/like {id}   /save {id}   /comment {id, body}   /delete {id}   /report {id, reason}
//   GET  /api/explore/stories    POST /api/explore/story {media, poster?}    POST /api/explore/story-delete {id}
async function exploreApi(req, res, action, query) {
  const me = userOf(req), meId = me ? me.id : 0, now = Date.now();
  if (req.method === 'GET') {
    if (action === 'feed') {
      const before = Number(query.get('before')) || Number.MAX_SAFE_INTEGER, user = Number(query.get('user')) || 0;
      const kind = query.get('kind') === 'video' ? 'video' : '', q = (query.get('q') || '').trim().toLowerCase().replace(/[%_]/g, '');
      const rows = db.prepare(`${POST_SELECT} AND p.id < ?2 AND (?3 = 0 OR p.user = ?3) AND (?4 = '' OR p.kind = ?4)
                               AND (?5 = '' OR lower(p.caption) LIKE ?5 OR lower(p.place) LIKE ?5)
                               AND (?6 = 0 OR EXISTS (SELECT 1 FROM post_saves s WHERE s.post = p.id AND s.user = ?1)) ORDER BY p.id DESC LIMIT 30`)
        .all(meId, before, user, kind, q ? '%' + q + '%' : '', query.get('saved') && meId ? 1 : 0);
      return json(res, 200, { posts: rows.map(shownPost) });
    }
    if (action === 'stories') {
      // Everyone's stories from the last 24 hours, grouped by person: mine first, then the newest.
      const rows = db.prepare(`SELECT s.*, u.name, u.pic_v FROM stories s JOIN users u ON u.id = s.user WHERE u.banned = 0 AND s.created > ? ORDER BY s.id`).all(now - 864e5);
      const by = new Map();
      for (const r of rows) {
        if (!by.has(r.user)) by.set(r.user, { user: { id: r.user, name: r.name, pic: r.pic_v }, items: [] });
        by.get(r.user).items.push({ id: r.id, kind: r.kind, src: 'media/' + r.file, poster: r.poster ? 'media/' + r.poster : '', created: r.created });
      }
      const list = [...by.values()].sort((x, y) => (y.user.id === meId) - (x.user.id === meId) || y.items.at(-1).created - x.items.at(-1).created);
      return json(res, 200, { stories: list });
    }
    if (action === 'post') {
      const p = db.prepare(`${POST_SELECT} AND p.id = ?2`).get(meId, Number(query.get('id')));
      if (!p) return json(res, 404, { error: 'not found' });
      const comments = db.prepare('SELECT c.id, c.body, c.created, u.id AS uid, u.name, u.pic_v FROM post_comments c JOIN users u ON u.id = c.user WHERE c.post = ? ORDER BY c.id DESC LIMIT 60').all(p.id);
      return json(res, 200, { post: shownPost(p), comments: comments.reverse().map(c => ({ id: c.id, body: c.body, created: c.created, user: { id: c.uid, name: c.name, pic: c.pic_v } })) });
    }
    return json(res, 404, { error: 'not found' });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  if (!me) { req.resume(); return json(res, 401, { error: 'login' }); }

  if (action === 'media') {
    const type = MEDIA_TYPES[(req.headers['content-type'] || '').split(';')[0].trim()];
    if (!type) { req.resume(); return json(res, 400, { error: 'type' }); }
    const [ext, kind, limit] = type;
    if (Number(req.headers['content-length']) > limit) { req.resume(); return json(res, 413, { error: 'big' }); }
    if (count('SELECT COUNT(*) AS n FROM uploads WHERE user = ? AND created > ?', me.id, now - 864e5) >= 40) { req.resume(); return json(res, 429, { error: 'slow' }); }
    const name = crypto.randomBytes(12).toString('hex') + ext, file = path.join(MEDIA_DIR, name);
    const out = fs.createWriteStream(file);
    let size = 0, failed = false;
    const fail = (status, error) => { if (failed) return; failed = true; out.destroy(); fs.unlink(file, () => {}); req.resume(); json(res, status, { error }); };
    req.on('data', chunk => { size += chunk.length; if (size > limit) fail(413, 'big'); else if (!failed) out.write(chunk); });
    req.on('error', () => fail(400, 'bad request'));
    req.on('end', () => {
      if (failed) return;
      out.end(() => {
        if (size < 200) return fail(400, 'bad request');
        db.prepare('INSERT INTO uploads (name, user, kind, created) VALUES (?, ?, ?, ?)').run(name, me.id, kind, now);
        json(res, 200, { media: name });
      });
    });
    return;
  }
  if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 400, { error: 'bad request' });
  let body;
  try { body = JSON.parse(await readBody(req, 600_000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }

  if (action === 'post' && !body.media) {              // words only
    const text = cleanText(body.caption, 1000);
    if (text.length < 2) return json(res, 400, { error: 'short' });
    if (count('SELECT COUNT(*) AS n FROM posts WHERE user = ? AND created > ?', me.id, now - 864e5) >= 40) return json(res, 429, { error: 'slow' });
    const id = Number(db.prepare("INSERT INTO posts (user, kind, file, caption, created) VALUES (?, 'text', '', ?, ?)").run(me.id, text, now).lastInsertRowid);
    return json(res, 200, { post: shownPost(db.prepare(`${POST_SELECT} AND p.id = ?2`).get(me.id, id)) });
  }
  if (action === 'post' || action === 'story') {
    const up = db.prepare('SELECT * FROM uploads WHERE name = ? AND user = ? AND used = 0').get(String(body.media), me.id);
    if (!up || up.kind === 'file') return json(res, 400, { error: 'media' });
    let poster = '';
    if (up.kind === 'video' && typeof body.poster === 'string') {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body.poster), buf = m && Buffer.from(m[1], 'base64');
      if (buf && buf.length > 200 && buf.length < 400_000) { poster = crypto.randomBytes(12).toString('hex') + '.jpg'; fs.writeFileSync(path.join(MEDIA_DIR, poster), buf); }
    }
    if (action === 'story') {
      db.prepare('INSERT INTO stories (user, kind, file, poster, created) VALUES (?, ?, ?, ?, ?)').run(me.id, up.kind, up.name, poster, now);
      db.prepare('UPDATE uploads SET used = 1 WHERE name = ?').run(up.name);
      return json(res, 200, { ok: true });
    }
    const place = body.place && inBangladesh(body.place) ? body.place : null;
    const { lastInsertRowid } = db.prepare('INSERT INTO posts (user, kind, file, poster, caption, place, lat, lon, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(me.id, up.kind, up.name, poster, cleanText(body.caption, 500), place ? cleanText(place.label, 80) : '', place ? place.lat : null, place ? place.lon : null, now);
    db.prepare('UPDATE uploads SET used = 1 WHERE name = ?').run(up.name);
    return json(res, 200, { post: shownPost(db.prepare(`${POST_SELECT} AND p.id = ?2`).get(me.id, Number(lastInsertRowid))) });
  }
  if (action === 'story-delete') {
    const st = db.prepare('SELECT * FROM stories WHERE id = ?').get(Number(body.id));
    if (st && (st.user === me.id || me.role !== 'user')) deleteStory(st);
    return json(res, 200, { ok: true });
  }
  const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(body.id));
  if (!p) return json(res, 404, { error: 'not found' });
  if (action === 'save') {
    const saved = !db.prepare('DELETE FROM post_saves WHERE post = ? AND user = ?').run(p.id, me.id).changes;
    if (saved) db.prepare('INSERT INTO post_saves (post, user, made) VALUES (?, ?, ?)').run(p.id, me.id, now);
    return json(res, 200, { saved });
  }
  if (action === 'like') {
    const liked = !db.prepare('DELETE FROM post_likes WHERE post = ? AND user = ?').run(p.id, me.id).changes;
    if (liked) db.prepare('INSERT INTO post_likes (post, user) VALUES (?, ?)').run(p.id, me.id);
    return json(res, 200, { liked, likes: count('SELECT COUNT(*) AS n FROM post_likes WHERE post = ?', p.id) });
  }
  if (action === 'comment') {
    const text = cleanText(body.body, 500);
    if (!text) return json(res, 400, { error: 'bad request' });
    if (!allowSend(me.id)) return json(res, 429, { error: 'slow' });
    const id = Number(db.prepare('INSERT INTO post_comments (post, user, body, created) VALUES (?, ?, ?, ?)').run(p.id, me.id, text, now).lastInsertRowid);
    return json(res, 200, { comment: { id, body: text, created: now, user: { id: me.id, name: me.name, pic: me.pic_v } } });
  }
  if (action === 'delete') {
    if (p.user !== me.id && me.role === 'user') return json(res, 403, { error: 'forbidden' });
    deletePost(p);
    if (p.user !== me.id) sq.audit.run(me.id, 'post removed', 'post ' + p.id, cleanText(p.caption, 80), now);
    return json(res, 200, { ok: true });
  }
  if (action === 'report') {
    if (p.user === me.id) return json(res, 400, { error: 'self' });
    cq.report.run(me.id, p.user, `[পোস্ট #${p.id}] ` + (cleanText(body.reason, 250) || 'no reason given'), now);
    return json(res, 200, { ok: true });
  }
  json(res, 404, { error: 'not found' });
}

// Photos and videos, with byte ranges so a phone can seek in a video and start it before it has all arrived.
function serveMedia(req, res, name) {
  const file = path.join(MEDIA_DIR, path.basename(name));
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile() || !/^[a-f0-9]{24}\.\w+$/.test(path.basename(name))) { res.writeHead(404).end(); return; }
    const type = Object.entries(MEDIA_TYPES).find(([, v]) => v[0] === path.extname(file));
    const head = { 'Content-Type': type ? type[0] : 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' };
    if (!type) head['Content-Disposition'] = 'attachment';
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2])), end = m[1] && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return; }
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') res.end(); else fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...head, 'Content-Length': stat.size });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  });
}

// ---- People: search by name, public profiles, followers ----
// relation, from the viewer's side: self, none, following (I follow them), follower (they follow me), mutual.
function relationOf(meId, otherId) {
  if (!meId) return 'none';
  if (meId === otherId) return 'self';
  const l = linkOf(meId, otherId);
  if (!l) return 'none';
  if (l.state === 'blocked') return 'blocked';
  return l.state === 'friends' ? 'mutual' : l.actor === meId ? 'following' : 'follower';
}
const followers = id => count("SELECT COUNT(*) AS n FROM friends WHERE (a = ?1 OR b = ?1) AND (state = 'friends' OR (state = 'pending' AND actor <> ?1))", id);
const following = id => count("SELECT COUNT(*) AS n FROM friends WHERE (a = ?1 OR b = ?1) AND (state = 'friends' OR (state = 'pending' AND actor = ?1))", id);
const card = (u, meId) => ({ id: u.id, name: u.name, bio: u.bio, pic: u.pic_v ?? u.pic, points: u.points, relation: relationOf(meId, u.id) });

//   GET /api/people/search?q=          -> { people: [{ id, name, bio, pic, points, relation }] }   (login needed)
//   GET /api/people/profile?id=        -> { user, followers, following, rank, fares: [...] }
//   GET /api/people/list?id=&kind=followers|following -> { people }
function peopleApi(req, res, action, query) {
  const me = userOf(req), meId = me ? me.id : 0;
  if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
  if (action === 'search') {
    if (!me) return json(res, 401, { error: 'login' });
    const q = (query.get('q') || '').trim().toLowerCase().replace(/[%_]/g, '');
    if (q.length < 2) return json(res, 200, { people: [] });
    // Names that begin with what was typed first, then names that contain it; the better known first.
    const rows = db.prepare(`SELECT ${USER_COLS} FROM users WHERE banned = 0 AND id <> ?1 AND lower(name) LIKE ?2
                             ORDER BY (lower(name) LIKE ?3) DESC, points DESC, id LIMIT 30`).all(meId, '%' + q + '%', q + '%');
    return json(res, 200, { people: rows.map(u => card(u, meId)).filter(p => p.relation !== 'blocked').slice(0, 20) });
  }
  const u = aq.byId.get(Number(query.get('id')));
  if (!u || u.banned || relationOf(meId, u.id) === 'blocked') return json(res, 404, { error: 'not found' });
  if (action === 'profile') {
    const fares = db.prepare('SELECT flabel, tlabel, mode, fare, created FROM contributions WHERE user = ? ORDER BY id DESC LIMIT 30').all(u.id);
    return json(res, 200, { user: { ...card(u, meId), joined: u.created }, followers: followers(u.id), following: following(u.id), posts: count('SELECT COUNT(*) AS n FROM posts WHERE user = ?', u.id),
      rank: u.points ? count('SELECT COUNT(*) AS n FROM users WHERE banned = 0 AND (points > ?1 OR (points = ?1 AND id < ?2))', u.points, u.id) + 1 : 0,
      fares: fares.map(f => ({ from: f.flabel, to: f.tlabel, mode: f.mode, fare: f.fare, created: f.created })) });
  }
  if (action === 'list') {
    const mine = query.get('kind') === 'following' ? 'f.actor = ?1' : 'f.actor <> ?1';
    const rows = db.prepare(`SELECT ${USER_COLS.split(', ').map(c => 'x.' + c).join(', ')} FROM friends f JOIN users x ON x.id = CASE WHEN f.a = ?1 THEN f.b ELSE f.a END
                             WHERE (f.a = ?1 OR f.b = ?1) AND x.banned = 0 AND (f.state = 'friends' OR (f.state = 'pending' AND ${mine})) ORDER BY f.updated DESC LIMIT 200`).all(u.id);
    return json(res, 200, { people: rows.map(x => card(x, meId)) });
  }
  json(res, 404, { error: 'not found' });
}

// ---- Community: fares people know, and points for sharing them ----
// Anyone logged in can say what a trip costs: from one place to another, by which kind of transport. Each new
// fare earns points; the leaderboard ranks people by points. Reports for the same trip (both ends within
// 700 m) are combined by their middle value and shown to whoever searches that trip. Points have no cash
// value: they are kept so that discounts can be offered if rides or tickets are ever sold through the app.
const POINTS_PER_FARE = 10, FARE_MODES = ['bus', 'cng', 'rickshaw', 'leguna', 'bike', 'car', 'train', 'launch', 'other'];
db.exec(`CREATE TABLE IF NOT EXISTS contributions (
  id      INTEGER PRIMARY KEY,
  user    INTEGER NOT NULL,
  flabel  TEXT NOT NULL, flat REAL NOT NULL, flon REAL NOT NULL,
  tlabel  TEXT NOT NULL, tlat REAL NOT NULL, tlon REAL NOT NULL,
  mode    TEXT NOT NULL,
  fare    INTEGER NOT NULL,
  created INTEGER NOT NULL
)`);
const kmBetween = (lat1, lon1, lat2, lon2) => {
  const r = Math.PI / 180, a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};
const inBangladesh = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat > 20.3 && p.lat < 26.8 && p.lon > 87.9 && p.lon < 92.8 && cleanText(p.label, 80).length >= 2;
// Contributions whose two ends are within `km` of the given two points, in either direction.
function sameTrip(from, to, km = 0.7) {
  return db.prepare('SELECT * FROM contributions').all().filter(c =>
    (kmBetween(c.flat, c.flon, from.lat, from.lon) <= km && kmBetween(c.tlat, c.tlon, to.lat, to.lon) <= km) ||
    (kmBetween(c.flat, c.flon, to.lat, to.lon) <= km && kmBetween(c.tlat, c.tlon, from.lat, from.lon) <= km));
}
const leader = u => ({ id: u.id, name: u.name, pic: u.pic_v, points: u.points });

//   GET  /api/community/top?n=50      -> { top: [{ id, name, pic, points }], me: { points, rank } | null, total }
//   GET  /api/community/recent        -> { recent: [{ name, from, to, mode, fare, created }] }
//   GET  /api/community/near?flat=&flon=&tlat=&tlon=  -> { fares: [{ mode, fare, n }] }
//   POST /api/community/fare {from: {label, lat, lon}, to: {...}, mode, fare}  -> { points, earned }
async function communityApi(req, res, action, query) {
  const me = userOf(req);
  if (req.method === 'GET') {
    if (action === 'top') {
      const n = Math.min(50, Math.max(3, Number(query.get('n')) || 3));
      const top = db.prepare(`SELECT ${USER_COLS} FROM users WHERE points > 0 AND banned = 0 ORDER BY points DESC, id LIMIT ?`).all(n).map(leader);
      const mine = me && { points: me.points, rank: me.points ? count('SELECT COUNT(*) AS n FROM users WHERE banned = 0 AND (points > ?1 OR (points = ?1 AND id < ?2))', me.points, me.id) + 1 : 0 };
      return json(res, 200, { top, me: mine, total: count('SELECT COUNT(*) AS n FROM users WHERE points > 0 AND banned = 0'), fares: count('SELECT COUNT(*) AS n FROM contributions') });
    }
    if (action === 'recent') {
      const rows = db.prepare(`SELECT c.flabel, c.tlabel, c.mode, c.fare, c.created, u.name, u.id, u.pic_v FROM contributions c JOIN users u ON u.id = c.user ORDER BY c.id DESC LIMIT 12`).all();
      return json(res, 200, { recent: rows.map(r => ({ from: r.flabel, to: r.tlabel, mode: r.mode, fare: r.fare, created: r.created, user: { id: r.id, name: r.name, pic: r.pic_v } })) });
    }
    if (action === 'near') {
      const from = { lat: Number(query.get('flat')), lon: Number(query.get('flon')) }, to = { lat: Number(query.get('tlat')), lon: Number(query.get('tlon')) };
      if (![from.lat, from.lon, to.lat, to.lon].every(Number.isFinite)) return json(res, 400, { error: 'bad request' });
      const by = {};
      for (const c of sameTrip(from, to)) (by[c.mode] = by[c.mode] || []).push(c.fare);
      const fares = Object.entries(by).map(([mode, list]) => { list.sort((a, b) => a - b); return { mode, fare: list[Math.floor((list.length - 1) / 2)], n: list.length }; });
      return json(res, 200, { fares });
    }
    return json(res, 404, { error: 'not found' });
  }
  if (!me) return json(res, 401, { error: 'login' });
  if (req.method !== 'POST' || !(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 400, { error: 'bad request' });
  let body;
  try { body = JSON.parse(await readBody(req, 4000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }
  if (action === 'fare') {
    const { from, to, mode, fare } = body, now = Date.now();
    if (!inBangladesh(from) || !inBangladesh(to)) return json(res, 400, { error: 'place' });
    if (!FARE_MODES.includes(mode) || !Number.isInteger(fare) || fare < 5 || fare > 20000) return json(res, 400, { error: 'fare' });
    const km = kmBetween(from.lat, from.lon, to.lat, to.lon);
    if (km < 0.2) return json(res, 400, { error: 'same' });
    // A fare far outside anything plausible for the distance is almost always a typing mistake.
    if (fare / km > 400 || (km > 3 && fare / km < 0.4)) return json(res, 400, { error: 'odd' });
    const mine = sameTrip(from, to, 0.3).find(c => c.user === me.id && c.mode === mode);
    if (mine) {                                        // correcting an earlier report: no new points
      db.prepare('UPDATE contributions SET fare = ?, created = ? WHERE id = ?').run(fare, now, mine.id);
      return json(res, 200, { points: me.points, earned: 0 });
    }
    if (count('SELECT COUNT(*) AS n FROM contributions WHERE user = ? AND created > ?', me.id, now - 864e5) >= 15) return json(res, 429, { error: 'slow' });
    db.prepare('INSERT INTO contributions (user, flabel, flat, flon, tlabel, tlat, tlon, mode, fare, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(me.id, cleanText(from.label, 80), from.lat, from.lon, cleanText(to.label, 80), to.lat, to.lon, mode, fare, now);
    db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(POINTS_PER_FARE, me.id);
    return json(res, 200, { points: me.points + POINTS_PER_FARE, earned: POINTS_PER_FARE });
  }
  json(res, 404, { error: 'not found' });
}

// ---- Admin ----
// For accounts whose role is staff or admin. Staff answer tickets and handle reports; only an admin changes
// roles, deletes accounts, edits the notice or removes fare reports. Private messages are never shown here:
// the panel only counts them. Every change is written to the audit log.
const DAY = 864e5, TZ = 6 * 36e5;                       // days are counted in Bangladesh time
const dayOf = ts => Math.floor((ts + TZ) / DAY);
function series(table, column, days) {
  const from = (dayOf(Date.now()) - days + 1) * DAY - TZ;
  const rows = db.prepare(`SELECT CAST((${column} + ${TZ}) / ${DAY} AS INTEGER) AS d, COUNT(*) AS n FROM ${table} WHERE ${column} >= ? GROUP BY d`).all(from);
  const by = Object.fromEntries(rows.map(r => [r.d, r.n])), today = dayOf(Date.now());
  return Array.from({ length: days }, (_, i) => by[today - days + 1 + i] || 0);
}
const count = (sql, ...args) => db.prepare(sql).get(...args).n;
const briefUser = u => u && ({ id: u.id, name: u.name, email: u.email, pic: u.pic_v, role: u.role, banned: u.banned, created: u.created, seen: u.seen, online: isOnline(u.id) });

async function adminApi(req, res, action, query) {
  const me = userOf(req);
  if (!me || (me.role !== 'admin' && me.role !== 'staff')) return json(res, 403, { error: 'forbidden' });
  const admin = me.role === 'admin', now = Date.now();
  const log = (what, target, detail = '') => sq.audit.run(me.id, what, String(target), detail, now);

  if (req.method === 'GET') {
    if (action === 'me') return json(res, 200, { user: publicUser(me).user });
    if (action === 'overview') {
      const dayStart = dayOf(now) * DAY - TZ;
      return json(res, 200, {
        users: count('SELECT COUNT(*) AS n FROM users'), usersToday: count('SELECT COUNT(*) AS n FROM users WHERE created >= ?', dayStart),
        activeToday: count('SELECT COUNT(*) AS n FROM users WHERE seen >= ?', dayStart), active7: count('SELECT COUNT(*) AS n FROM users WHERE seen >= ?', now - 7 * DAY),
        online: streams.size, banned: count('SELECT COUNT(*) AS n FROM users WHERE banned = 1'),
        messages: count('SELECT COUNT(*) AS n FROM messages'), messagesToday: count('SELECT COUNT(*) AS n FROM messages WHERE sent >= ?', dayStart),
        friendships: count("SELECT COUNT(*) AS n FROM friends WHERE state = 'friends'"),
        ticketsOpen: count("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'"), tickets: count('SELECT COUNT(*) AS n FROM tickets'),
        reportsOpen: count("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
        ratings: count('SELECT COUNT(*) AS n FROM ratings'), fares: count('SELECT COUNT(*) AS n FROM fare_reports') + count('SELECT COUNT(*) AS n FROM contributions'),
        posts: count('SELECT COUNT(*) AS n FROM posts'), postsToday: count('SELECT COUNT(*) AS n FROM posts WHERE created >= ?', dayStart),
        signups: series('users', 'created', 14), chats: series('messages', 'sent', 14), support: series('tickets', 'created', 14),
        latestUsers: db.prepare(`SELECT ${USER_COLS} FROM users ORDER BY id DESC LIMIT 6`).all().map(briefUser),
        latestTickets: db.prepare("SELECT t.id, t.subject, t.status, t.updated, u.name FROM tickets t JOIN users u ON u.id = t.user ORDER BY t.updated DESC LIMIT 6").all()
      });
    }
    if (action === 'users') {
      const q = '%' + (query.get('q') || '').trim().toLowerCase().replace(/[%_]/g, '') + '%', filter = query.get('filter') || 'all';
      const where = filter === 'banned' ? 'AND banned = 1' : filter === 'team' ? "AND role <> 'user'" : filter === 'new' ? `AND created >= ${now - 7 * DAY}` : '';
      const page = Math.max(0, Number(query.get('page')) || 0);
      const total = count(`SELECT COUNT(*) AS n FROM users WHERE (lower(name) LIKE ?1 OR email LIKE ?1) ${where}`, q);
      const rows = db.prepare(`SELECT ${USER_COLS} FROM users WHERE (lower(name) LIKE ?1 OR email LIKE ?1) ${where} ORDER BY id DESC LIMIT 25 OFFSET ?2`).all(q, page * 25);
      return json(res, 200, { total, page, users: rows.map(briefUser) });
    }
    if (action === 'user') {
      const u = aq.byId.get(Number(query.get('id')));
      if (!u) return json(res, 404, { error: 'not found' });
      return json(res, 200, { user: { ...briefUser(u), bio: u.bio }, stats: {
        friends: count("SELECT COUNT(*) AS n FROM friends WHERE (a = ?1 OR b = ?1) AND state = 'friends'", u.id),
        messages: count('SELECT COUNT(*) AS n FROM messages WHERE sender = ?', u.id),
        tickets: count('SELECT COUNT(*) AS n FROM tickets WHERE user = ?', u.id),
        reportsAbout: count('SELECT COUNT(*) AS n FROM reports WHERE about = ?', u.id), reportsBy: count('SELECT COUNT(*) AS n FROM reports WHERE reporter = ?', u.id),
        ratings: count('SELECT COUNT(*) AS n FROM ratings WHERE device = ?', 'u' + u.id), fares: count('SELECT COUNT(*) AS n FROM fare_reports WHERE device = ?', 'u' + u.id),
        sessions: count('SELECT COUNT(*) AS n FROM sessions WHERE user = ? AND expires > ?', u.id, now) } });
    }
    if (action === 'tickets') {
      const status = query.get('status') || 'open';
      const rows = db.prepare(`SELECT t.id, t.category, t.subject, t.status, t.created, t.updated, u.id AS uid, u.name, u.email, u.pic_v AS pic,
                               (SELECT COUNT(*) FROM ticket_msgs m WHERE m.ticket = t.id) AS n FROM tickets t JOIN users u ON u.id = t.user
                               WHERE ?1 = 'all' OR t.status = ?1 ORDER BY t.updated DESC LIMIT 100`).all(status);
      return json(res, 200, { tickets: rows });
    }
    if (action === 'ticket') {
      const t = sq.one.get(Number(query.get('id')));
      if (!t) return json(res, 404, { error: 'not found' });
      return json(res, 200, { ticket: t, user: briefUser(aq.byId.get(t.user)), messages: sq.msgs.all(t.id) });
    }
    if (action === 'reports') {
      const status = query.get('status') || 'open';
      const rows = db.prepare(`SELECT r.id, r.reason, r.made, r.status, a.id AS aid, a.name AS aname, a.email AS aemail, a.pic_v AS apic, a.banned AS abanned,
                               b.id AS bid, b.name AS bname, b.email AS bemail, (SELECT COUNT(*) FROM reports x WHERE x.about = r.about) AS total
                               FROM reports r JOIN users a ON a.id = r.about JOIN users b ON b.id = r.reporter WHERE ?1 = 'all' OR r.status = ?1 ORDER BY r.id DESC LIMIT 100`).all(status);
      return json(res, 200, { reports: rows });
    }
    if (action === 'fares') return json(res, 200, { fares: db.prepare('SELECT a, b, device, fare, updated FROM fare_reports ORDER BY updated DESC LIMIT 200').all(),
      contributions: db.prepare('SELECT c.id, c.flabel, c.tlabel, c.mode, c.fare, c.created, u.name, u.email FROM contributions c JOIN users u ON u.id = c.user ORDER BY c.id DESC LIMIT 200').all() });
    if (action === 'posts') {
      const rows = db.prepare(`${POST_SELECT} AND p.id < ?2 ORDER BY p.id DESC LIMIT 60`).all(0, Number(query.get('before')) || Number.MAX_SAFE_INTEGER);
      return json(res, 200, { posts: rows.map(p => ({ ...shownPost(p), email: aq.byId.get(p.user).email })) });
    }
    if (action === 'audit') return json(res, 200, { audit: db.prepare('SELECT x.id, x.action, x.target, x.detail, x.at, u.name FROM audit x LEFT JOIN users u ON u.id = x.actor ORDER BY x.id DESC LIMIT 150').all() });
    if (action === 'system') {
      let size = 0;
      try { size = fs.statSync(path.join(DATA_DIR, 'ratings.db')).size; } catch { /* not created yet */ }
      return json(res, 200, { mail: mailReady, mailFrom: MAIL.from || '', turn: ICE.length > 1, admins: ADMIN_EMAILS, dbBytes: size, dataDir: process.env.DATA_DIR ? 'DATA_DIR' : 'app folder',
                              uptime: Math.round(process.uptime()), node: process.version, notice: (sq.setting.get('notice') || {}).value || '' });
    }
    return json(res, 404, { error: 'not found' });
  }

  if (req.method !== 'POST' || !(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 400, { error: 'bad request' });
  let body;
  try { body = JSON.parse(await readBody(req, 12_000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }

  if (action === 'user') {
    const u = aq.byId.get(Number(body.id));
    if (!u) return json(res, 404, { error: 'not found' });
    if (u.id === me.id) return json(res, 400, { error: 'self' });
    if (u.role === 'admin' && !admin) return json(res, 403, { error: 'forbidden' });
    if (body.do === 'ban' || body.do === 'unban') {
      aq.setBanned.run(body.do === 'ban' ? 1 : 0, u.id);
      if (body.do === 'ban') { aq.endAll.run(u.id); for (const s of streams.get(u.id) || []) s.end(); }
      log(body.do, u.email, cleanText(body.note, 200));
    } else if (body.do === 'signout') { aq.endAll.run(u.id); log('signout', u.email); }
    else if (!admin) return json(res, 403, { error: 'forbidden' });
    else if (body.do === 'role' && ['user', 'staff', 'admin'].includes(body.role)) { aq.setRole.run(body.role, u.id); log('role', u.email, body.role); }
    else if (body.do === 'delete') { deleteUser(u.id); log('delete', u.email); }
    else return json(res, 400, { error: 'bad request' });
    return json(res, 200, { ok: true });
  }
  if (action === 'ticket') {
    const t = sq.one.get(Number(body.id));
    if (!t) return json(res, 404, { error: 'not found' });
    const text = cleanText(body.body, 3000);
    if (text) {
      sq.addMsg.run(t.id, me.id, 1, text, now);
      sq.touch.run(body.close ? 'closed' : 'answered', now, 1, t.id);
      push(t.user, 'support', { id: t.id });
      const owner = aq.byId.get(t.user);
      if (mailReady && owner) sendMail(owner.email, `BD Map সাপোর্ট: ${t.subject}`, `${text}\n\n— BD Map সাপোর্ট\nউত্তর দিতে অ্যাপের "সাহায্য ও সাপোর্ট" পাতায় যান।`).catch(e => console.error('mail failed:', e.message));
      log('reply', 'ticket ' + t.id);
    } else if (['open', 'answered', 'closed'].includes(body.status)) { sq.touch.run(body.status, now, t.unread, t.id); log('ticket ' + body.status, 'ticket ' + t.id); }
    else return json(res, 400, { error: 'bad request' });
    return json(res, 200, { ok: true });
  }
  if (action === 'post') {                            // take a post down
    const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(body.id));
    if (!p) return json(res, 404, { error: 'not found' });
    deletePost(p);
    log('post removed', 'post ' + p.id, cleanText(p.caption, 80));
    return json(res, 200, { ok: true });
  }
  if (action === 'report') {
    const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(body.id));
    if (!r) return json(res, 404, { error: 'not found' });
    if (body.do === 'ban') {
      const u = aq.byId.get(r.about);
      if (u && u.role === 'user') { aq.setBanned.run(1, u.id); aq.endAll.run(u.id); for (const s of streams.get(u.id) || []) s.end(); log('ban', u.email, 'report ' + r.id); }
      db.prepare("UPDATE reports SET status = 'done' WHERE about = ?").run(r.about);
    } else { db.prepare("UPDATE reports SET status = 'done' WHERE id = ?").run(r.id); log('report dismissed', 'report ' + r.id); }
    return json(res, 200, { ok: true });
  }
  if (!admin) return json(res, 403, { error: 'forbidden' });
  if (action === 'fare') {
    db.prepare('DELETE FROM fare_reports WHERE a = ? AND b = ? AND device = ?').run(String(body.a), String(body.b), String(body.device));
    log('fare removed', `${body.a}>${body.b}`);
    return json(res, 200, { ok: true });
  }
  if (action === 'contribution') {                    // a wrong or made-up fare: remove it and take the points back
    const c = db.prepare('SELECT * FROM contributions WHERE id = ?').get(Number(body.id));
    if (!c) return json(res, 404, { error: 'not found' });
    db.prepare('DELETE FROM contributions WHERE id = ?').run(c.id);
    db.prepare('UPDATE users SET points = MAX(0, points - ?) WHERE id = ?').run(POINTS_PER_FARE, c.user);
    log('fare removed', `${c.flabel} > ${c.tlabel}`, `${c.mode} ${c.fare}`);
    return json(res, 200, { ok: true });
  }
  if (action === 'notice') {
    sq.setSet.run('notice', cleanText(body.text, 240));
    log('notice', 'app', cleanText(body.text, 240));
    return json(res, 200, { ok: true });
  }
  json(res, 404, { error: 'not found' });
}

// ---- Small guards: keep one client from flooding the tables ----
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

  const voter = voterOf(req, device);
  if (stars === 0) q.remove.run(key, voter);
  else q.upsert.run(key, voter, stars, Date.now());
  const row = q.one.get(key);
  json(res, 200, { avg: row.avg, n: row.n });
}

//   GET  /api/fares                          -> { "<stopA>><stopB>": [middle fare, reports], ... }
//   POST /api/fares {from, to, fare, device} -> { ok: true }
async function faresApi(req, res) {
  if (req.method === 'GET') {
    const groups = {};
    for (const r of fq.all.all()) (groups[r.a + '>' + r.b] = groups[r.a + '>' + r.b] || []).push(r.fare);
    const out = {};
    for (const [key, list] of Object.entries(groups)) out[key] = [list[Math.floor((list.length - 1) / 2)], list.length];   // median: one odd report cannot move it
    return json(res, 200, out);
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  if (!allowWrite(req.socket.remoteAddress)) return json(res, 429, { error: 'too many reports, try again in a minute' });
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad request' }); }
  const { from, to, fare, device } = body || {};
  const okStop = s => typeof s === 'string' && /^[a-z0-9]{2,30}$/.test(s);
  if (!okStop(from) || !okStop(to) || from === to || !Number.isInteger(fare) || fare < 5 || fare > 2000 ||
      typeof device !== 'string' || !/^[\w-]{8,64}$/.test(device)) return json(res, 400, { error: 'bad request' });
  const [a, b] = [from, to].sort();
  const voter = voterOf(req, device);
  const isNew = !db.prepare('SELECT 1 FROM fare_reports WHERE a = ? AND b = ? AND device = ?').get(a, b, voter);
  fq.upsert.run(a, b, voter, fare, Date.now());
  if (isNew && voter !== device) db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(POINTS_PER_FARE, Number(voter.slice(1)));
  json(res, 200, { ok: true });
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
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  if (pathname === '/api/ratings') return api(req, res).catch(() => json(res, 500, { error: 'server error' }));
  if (pathname === '/api/fares') return faresApi(req, res).catch(() => json(res, 500, { error: 'server error' }));
  if (pathname.startsWith('/api/chat/')) return chatApi(req, res, pathname.slice(10), searchParams).catch(() => { if (!res.headersSent) json(res, 500, { error: 'server error' }); });
  if (pathname.startsWith('/api/avatar/')) return avatarApi(req, res, pathname.slice(12));
  if (pathname.startsWith('/media/')) return serveMedia(req, res, pathname.slice(7));
  if (pathname.startsWith('/api/explore/')) return exploreApi(req, res, pathname.slice(13), searchParams).catch(e => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server error' }); });
  if (pathname.startsWith('/api/people/')) { try { return peopleApi(req, res, pathname.slice(12), searchParams); } catch (e) { console.error(e); return json(res, 500, { error: 'server error' }); } }
  if (pathname.startsWith('/api/community/')) return communityApi(req, res, pathname.slice(15), searchParams).catch(e => { console.error(e); json(res, 500, { error: 'server error' }); });
  if (pathname.startsWith('/api/support/')) return supportApi(req, res, pathname.slice(13), searchParams).catch(() => json(res, 500, { error: 'server error' }));
  if (pathname.startsWith('/api/admin/')) return adminApi(req, res, pathname.slice(11), searchParams).catch(e => { console.error(e); json(res, 500, { error: 'server error' }); });
  if (pathname === '/api/notice') return json(res, 200, { text: (sq.setting.get('notice') || {}).value || '' });
  if (pathname.startsWith('/api/auth/')) return authApi(req, res, pathname.slice(10)).catch(() => json(res, 500, { error: 'server error' }));
  if (pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  serveFile(req, res, pathname);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`BD Map is running.\n  On this computer:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  On the same Wi-Fi: http://${a.address}:${PORT}`);
  }
});
