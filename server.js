// Manzeela server: serves the app and keeps everyone's ratings, reported fares, accounts and messages in one place.
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
// ---- Keeping the data on a host whose disk is wiped (Render's free plan): R2 holds a copy ----
// With R2_* and R2_BACKUP=1 set, a fresh disk is filled from the last copy before the database opens; afterwards the database is
// copied up two minutes after any change and once more when the host stops the server (it sends SIGTERM before a
// deploy), and every uploaded file goes up too (see the media sync further down). Without R2_*, nothing changes.
const r2 = require('./lib/r2.cjs');
// on only where asked (R2_BACKUP=1, set on the host): a developer's computer with R2 keys must not send its test data up
const backupOn = r2.ready() && process.env.R2_BACKUP === '1';
const DB_FILE = path.join(DATA_DIR, 'ratings.db');
// The bucket also serves the map files to everyone (r2.dev, or its own domain), so a copy under a plain name could be
// downloaded by anyone who guessed it. The copies sit under a name made from the server's own R2 secret instead: public
// links cannot list a bucket, so without the secret the name cannot be found. (Rotating the R2 key changes the name:
// copy state-<old>/ to the new one first.) Tests give their own R2_PREFIX.
const R2_PREFIX = (process.env.R2_PREFIX || 'state-' + require('node:crypto').createHash('sha256').update('bdmap backup ' + (process.env.R2_SECRET_ACCESS_KEY || '')).digest('hex').slice(0, 32) + '/').replace(/^\/+/, '');
const R2_OLD = process.env.R2_OLD_PREFIX || (process.env.R2_PREFIX ? '' : 'state/');   // where the live copies used to be (public): read from once, then emptied
let dbRestored = false;
if (backupOn && !fs.existsSync(DB_FILE)) {
  const fetchDb = key => require('node:child_process').execFileSync(process.execPath, [path.join(ROOT, 'lib', 'r2.cjs'), 'get', key, DB_FILE], { encoding: 'utf8', timeout: 120_000 }).trim();
  try {
    let said = fetchDb(R2_PREFIX + 'ratings.db');
    if (!said.startsWith('restored') && R2_OLD) said = fetchDb(R2_OLD + 'ratings.db');   // the first start after the move
    console.log(said.replace(R2_PREFIX, '(backup)/'));
    dbRestored = said.startsWith('restored ' + R2_PREFIX);    // from the old place it still has to go up to the new one
  }
  catch (e) { console.error('Could not restore the database from R2:', e.message); }
}
const db = new DatabaseSync(DB_FILE);
// Write-ahead logging: readers never wait for a writer, and a write costs one disk flush at checkpoints instead of every time.
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 4000');
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

const MAILS = require('./lib/mail.cjs');               // what each mail says and looks like
async function sendByApi(to, subject, text, html) {
  const res = BREVO
    ? await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': BREVO, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: { name: MAILS.BRAND, email: MAIL.from }, to: [{ email: to }], subject, textContent: text, ...(html ? { htmlContent: html } : {}) }) })
    : await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${MAILS.BRAND} <${MAIL.from}>`, to: [to], subject, text, ...(html ? { html } : {}) }) });
  if (!res.ok) throw new Error(`mail service said ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// plain text alone, or plain text and HTML side by side (the mail app shows the one it can)
const mimeBody = (text, html, b64) => {
  const part = (type, body) => [`Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', b64(body).replace(/(.{76})/g, '$1\r\n')];
  if (!html) return part('text/plain', text);
  const edge = 'mz-' + crypto.randomBytes(8).toString('hex');
  return [`Content-Type: multipart/alternative; boundary="${edge}"`, '', `--${edge}`, ...part('text/plain', text), `--${edge}`, ...part('text/html', html), `--${edge}--`];
};
// m: a mail from lib/mail.cjs — { subject, text, html }
function sendMail(to, m) {
  const { subject, text, html } = m;
  if (BREVO || RESEND) return sendByApi(to, subject, text, html);
  return new Promise((resolve, reject) => {
    const socket = MAIL.tls ? require('node:tls').connect(MAIL.port, MAIL.host, { servername: MAIL.host }) : require('node:net').connect(MAIL.port, MAIL.host);
    const b64 = v => Buffer.from(v, 'utf8').toString('base64');
    const message = [
      `From: =?UTF-8?B?${b64(MAILS.BRAND)}?= <${MAIL.from}>`, `To: <${to}>`, `Subject: =?UTF-8?B?${b64(subject)}?=`,
      `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@${MAIL.from.split('@')[1] || 'manzeela.com'}>`, 'MIME-Version: 1.0',
      ...mimeBody(text, html, b64), '.'
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
for (const [col, def] of [['agent', "TEXT NOT NULL DEFAULT ''"], ['made', 'INTEGER NOT NULL DEFAULT 0'], ['last', 'INTEGER NOT NULL DEFAULT 0'], ['ip', "TEXT NOT NULL DEFAULT ''"]])
  if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('sessions') WHERE name = ?").get(col).n) db.exec(`ALTER TABLE sessions ADD COLUMN ${col} ${def}`);
db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS codes (
  email   TEXT PRIMARY KEY,
  hash    TEXT NOT NULL,
  expires INTEGER NOT NULL,
  tries   INTEGER NOT NULL DEFAULT 0,
  sent    INTEGER NOT NULL
)`);
if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('users') WHERE name = 'points'").get().n) db.exec('ALTER TABLE users ADD COLUMN points INTEGER NOT NULL DEFAULT 0');
for (const [col, def] of [['verified', 'INTEGER NOT NULL DEFAULT 0'], ['prefs', "TEXT NOT NULL DEFAULT '{}'"], ['username', "TEXT NOT NULL DEFAULT ''"],
                          ['totp', "TEXT NOT NULL DEFAULT ''"], ['totp_on', 'INTEGER NOT NULL DEFAULT 0'], ['backup', "TEXT NOT NULL DEFAULT '[]'"]])
  if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('users') WHERE name = ?").get(col).n) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users (username) WHERE username <> ''");
const USER_COLS = 'id, email, name, bio, pic_v, role, banned, data, created, seen, points, verified, prefs, username, totp_on';
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
  addSession: db.prepare('INSERT INTO sessions (token, user, expires, agent, made, last, ip) VALUES (?, ?, ?, ?, ?, ?, ?)'),
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
  if (now - user.seen > 5 * 60_000) { aq.setSeen.run(now, user.id); db.prepare('UPDATE sessions SET last = ? WHERE token = ?').run(now, sha(token)); }   // "last active", to the nearest five minutes
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
  aq.addSession.run(sha(token), user.id, Date.now() + SESSION_DAYS * 864e5, deviceName(req.headers['user-agent']), Date.now(), Date.now(), clientIp(req));
  res.setHeader('Set-Cookie', cookie(req, token, SESSION_DAYS * 86400));
  if (okDevice(device)) {
    const voter = 'u' + user.id;
    aq.adoptRatings.run(voter, device); aq.dropRatings.run(device);
    aq.adoptFares.run(voter, device);   aq.dropFares.run(device);
  }
}
// Privacy choices: `active` shows when you are online (and lets you see others'); `dm` is who may send you a
// message request: 'all', or only 'following' (people you follow).
const prefsOf = u => ({ active: true, dm: 'all', ...JSON.parse((u && u.prefs) || '{}') });
const publicUser = u => ({ user: { id: u.id, name: u.name, username: u.username || '', email: u.email, bio: u.bio, pic: u.pic_v, role: u.role, points: u.points, verified: !!u.verified,
  twofa: !!u.totp_on, prefs: prefsOf(u) }, data: JSON.parse(u.data || '{}') });

// "Chrome · Windows", "Safari · iPhone": enough to recognise one's own devices in the login activity list.
function deviceName(ua = '') {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(' · ') || 'Browser';
}
// The visitor's own address. Behind Render (which sits behind Cloudflare) the connection comes from the proxy, so
// counting by it would lump every visitor together: Cloudflare's own header first (a visitor cannot set it), then the
// forwarded-for list, then the connection itself.
const clientIp = req => String(req.headers['cf-connecting-ip'] || req.headers['true-client-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();

// ---- usernames: a-z, 0-9, dot and underscore, 3 to 30 long, unique ----
const RESERVED = ['admin', 'bdmap', 'bd_map', 'support', 'help', 'official', 'root', 'staff', 'moderator'];
function usernameProblem(u, selfId = 0) {
  if (!/^[a-z0-9._]{3,30}$/.test(u)) return 'format';
  if (/^\.|\.$|\.\./.test(u)) return 'format';
  if (RESERVED.includes(u)) return 'taken';
  const other = db.prepare('SELECT id FROM users WHERE username = ?').get(u);
  return other && other.id !== selfId ? 'taken' : '';
}
function freshUsername(seed) {
  let base = String(seed || '').toLowerCase().replace(/[^a-z0-9._]/g, '').replace(/^\.+|\.+$/g, '').replace(/\.{2,}/g, '.').slice(0, 22);
  if (base.length < 3) base = (base + 'traveler').slice(0, 8);
  if (!usernameProblem(base)) return base;
  for (let i = 0; i < 50; i++) { const u = `${base}${crypto.randomInt(10, 9999)}`; if (!usernameProblem(u)) return u; }
  return 'user' + crypto.randomBytes(4).toString('hex');
}
for (const u of db.prepare("SELECT id, email FROM users WHERE username = ''").all()) db.prepare('UPDATE users SET username = ? WHERE id = ?').run(freshUsername(u.email.split('@')[0]), u.id);

// ---- two-step verification: a time-based code from an authenticator app (RFC 6238), or a one-time backup code ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32encode = buf => { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; };
const b32decode = s => { let bits = ''; for (const ch of s.toUpperCase()) { const v = B32.indexOf(ch); if (v >= 0) bits += v.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
function totpAt(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest(), o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
const usedSteps = new Map();   // user id -> the last time step a code was accepted for, so a code works once
function totpOk(userId, secret, code) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6 || !secret) return false;
  const now = Math.floor(Date.now() / 30000);
  for (const d of [0, -1, 1]) {
    const step = now + d;
    if (crypto.timingSafeEqual(Buffer.from(totpAt(secret, step)), Buffer.from(c)) && (usedSteps.get(userId) || 0) < step) { usedSteps.set(userId, step); return true; }
  }
  return false;
}
function backupOk(userId, code) {
  const c = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (c.length !== 10) return false;
  const row = db.prepare('SELECT backup FROM users WHERE id = ?').get(userId), list = JSON.parse((row && row.backup) || '[]'), h = sha('backup:' + c);
  if (!list.includes(h)) return false;
  db.prepare('UPDATE users SET backup = ? WHERE id = ?').run(JSON.stringify(list.filter(x => x !== h)), userId);
  return true;
}
const secondStep = new Map();  // ticket -> { user, device, expires }: a correct e-mail code waiting for the second step
setInterval(() => { const now = Date.now(); for (const [k, v] of secondStep) if (v.expires < now) secondStep.delete(k); }, 60_000).unref();
// Switches the owner can flip from the admin panel.
const flagOn = (key, def = true) => { const v = (db.prepare('SELECT value FROM settings WHERE key = ?').get('flag_' + key) || {}).value; return v == null ? def : v === '1'; };

function cleanEmail(e) {
  if (typeof e !== 'string') return null;
  const s = e.trim().toLowerCase();
  return s.length <= 120 && /^[^\s@<>"]{1,64}@[^\s@<>"]+\.[a-z]{2,}$/.test(s) ? s : null;
}
const cleanName = n => typeof n === 'string' ? n.trim().replace(/\s+/g, ' ').slice(0, 40) : '';

// Guessing and flooding: at most 8 tries per key in 15 minutes.
const tries = new Map();
// Sign-in codes per day: an address gets 20, a network 40 — enough for anyone, and no one can spend the mail service's
// daily allowance (Brevo's free 300) by asking for codes in a loop.
const dailyCodes = new Map();
function allowDaily(key, limit) {
  const now = Date.now(), recent = (dailyCodes.get(key) || []).filter(t => now - t < 864e5);
  if (recent.length >= limit) { dailyCodes.set(key, recent); return false; }
  recent.push(now); dailyCodes.set(key, recent);
  return true;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of dailyCodes) if (!v.some(t => now - t < 864e5)) dailyCodes.delete(k); }, 3600e3).unref();
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
  for (const g of db.prepare('SELECT grp FROM group_members WHERE user = ?').all(id)) leaveGroup(g.grp, id);
  // the files behind it all: photos, videos and files in their chats (both ways), their sounds, place photos, hidden gems, unused uploads
  const jsonOf = t => { try { return JSON.parse(t); } catch { return null; } };
  for (const m of db.prepare("SELECT body FROM messages WHERE (a = ?1 OR b = ?1 OR sender = ?1) AND kind IN ('photo', 'video', 'file', 'audio')").all(id)) { const b = jsonOf(m.body); if (b) { unlinkMedia(b.src); unlinkMedia(b.poster); } }
  for (const x of db.prepare('SELECT file FROM sounds WHERE user = ?').all(id)) unlinkMedia(x.file);
  for (const x of db.prepare('SELECT file FROM place_photos WHERE user = ?').all(id)) unlinkMedia(x.file);
  for (const x of db.prepare('SELECT files FROM gems WHERE user = ?').all(id)) for (const f of jsonOf(x.files) || []) unlinkMedia(f);
  for (const x of db.prepare('SELECT name FROM uploads WHERE user = ? AND used = 0').all(id)) unlinkMedia(x.name);
  for (const sql of ['DELETE FROM friends WHERE a = ?1 OR b = ?1', 'DELETE FROM messages WHERE a = ?1 OR b = ?1 OR sender = ?1', 'DELETE FROM notes WHERE user = ?1', 'DELETE FROM chat_prefs WHERE user = ?1', 'DELETE FROM earnings WHERE user = ?1', 'DELETE FROM payouts WHERE user = ?1', 'DELETE FROM notifications WHERE user = ?1 OR actor = ?1', 'DELETE FROM reports WHERE reporter = ?1 OR about = ?1',
                     'DELETE FROM ticket_msgs WHERE ticket IN (SELECT id FROM tickets WHERE user = ?1)', 'DELETE FROM tickets WHERE user = ?1', 'DELETE FROM contributions WHERE user = ?1', 'DELETE FROM post_likes WHERE user = ?1', 'DELETE FROM post_saves WHERE user = ?1', 'DELETE FROM post_comments WHERE user = ?1',
                     'DELETE FROM chat_ok WHERE a = ?1 OR b = ?1']) db.prepare(sql).run(id);
  for (const st of db.prepare('SELECT * FROM stories WHERE user = ?').all(id)) deleteStory(st);
  for (const sql of ['DELETE FROM sounds WHERE user = ?', 'DELETE FROM place_photos WHERE user = ?', 'DELETE FROM place_reviews WHERE user = ?', 'DELETE FROM place_wants WHERE user = ?', 'DELETE FROM gems WHERE user = ?', 'DELETE FROM uploads WHERE user = ?']) db.prepare(sql).run(id);
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
  if (action === 'username' && req.method === 'GET') {       // is this username free?
    const u = String(new URL(req.url, 'http://x').searchParams.get('u') || '').toLowerCase();
    const problem = usernameProblem(u, me ? me.id : 0);
    return json(res, 200, { ok: !problem, problem });
  }
  if (action === 'sessions' && req.method === 'GET') {       // login activity: where this account is signed in
    if (!me) return json(res, 401, { error: 'login' });
    const mine = sha(sessionToken(req) || '');
    const rows = db.prepare('SELECT token, agent, made, last, ip FROM sessions WHERE user = ? AND expires > ? ORDER BY last DESC').all(me.id, Date.now());
    return json(res, 200, { sessions: rows.map(s => ({ id: s.token.slice(0, 16), agent: s.agent || 'Browser', made: s.made, last: s.last, here: s.token === mine })), twofa: !!me.totp_on,
      backupLeft: JSON.parse(db.prepare('SELECT backup FROM users WHERE id = ?').get(me.id).backup || '[]').length });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  // Only this app's own JSON requests: a form on another site cannot send this content type.
  if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 400, { error: 'bad request' });
  let body;
  try { body = JSON.parse(await readBody(req, 400_000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }
  const ip = clientIp(req), now = Date.now();

  if (action === 'code') {
    const email = cleanEmail(body.email);
    if (!email) return json(res, 400, { error: 'email' });
    // "Log in" needs an existing account, "Create account" a new address — so a typo is caught before a code is sent.
    const exists = !!aq.byEmail.get(email);
    if (body.mode === 'login' && !exists) return json(res, 404, { error: 'noaccount' });
    if (body.mode === 'signup' && exists) return json(res, 409, { error: 'exists' });
    if (!exists && !flagOn('signups') && !ADMIN_EMAILS.includes(email)) return json(res, 403, { error: 'closed' });
    const old = aq.code.get(email);
    if (old && now - old.sent < 60_000) return json(res, 429, { error: 'wait' });
    if (!allowTry(ip + '|code') || !allowTry(email + '|code')) return json(res, 429, { error: 'slow' });
    if (!allowDaily('ip|' + ip, 40) || !allowDaily('mail|' + email, 20)) return json(res, 429, { error: 'slow' });
    if (!mailReady && !isLocal(req)) return json(res, 503, { error: 'mail' });
    const code = String(crypto.randomInt(100000, 1000000));
    aq.setCode.run(email, sha(code + email), now + 10 * 60_000, now);
    if (!mailReady) {
      console.log(`[no mail set up] sign-in code for ${email}: ${code}`);
      return json(res, 200, { sent: true, devCode: code });
    }
    try {
      await sendMail(email, MAILS.codeMail(code));
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
      const { lastInsertRowid } = aq.add.run(email, cleanName(email.split('@')[0].replace(/[._+-]+/g, ' ')) || 'Manzeela', admin ? 'admin' : 'user', now, now);
      user = aq.byId.get(lastInsertRowid);
    } else if (admin && user.role !== 'admin') { aq.setRole.run('admin', user.id); user.role = 'admin'; }
    if (user.banned) return json(res, 403, { error: 'banned' });
    if (isNew) {
      const name = cleanName(body.name), username = String(body.username || '').toLowerCase();
      if (name.length >= 2) aq.setProfile.run(name, '', user.id);
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username && !usernameProblem(username) ? username : freshUsername(email.split('@')[0]), user.id);
      user = aq.byId.get(user.id);
    }
    if (user.totp_on) {                              // the second step: a code from the authenticator app
      const ticket = crypto.randomBytes(24).toString('hex');
      secondStep.set(ticket, { user: user.id, device: body.device, expires: now + 5 * 60_000 });
      return json(res, 200, { need2fa: true, ticket });
    }
    startSession(req, res, user, body.device);
    return json(res, 200, { ...publicUser(user), isNew });
  }
  if (action === 'verify2fa') {
    const t = secondStep.get(String(body.ticket || ''));
    if (!t || t.expires < now) return json(res, 401, { error: 'expired' });
    if (!allowTry('2fa|' + t.user)) return json(res, 429, { error: 'slow' });
    const u = aq.byId.get(t.user), full = db.prepare('SELECT totp FROM users WHERE id = ?').get(t.user);
    if (!u || u.banned) return json(res, 403, { error: 'banned' });
    if (!totpOk(u.id, full.totp, body.code) && !backupOk(u.id, body.code)) return json(res, 401, { error: 'wrong' });
    secondStep.delete(String(body.ticket));
    startSession(req, res, u, t.device);
    return json(res, 200, publicUser(aq.byId.get(u.id)));
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
    if (typeof body.username === 'string' && body.username.toLowerCase() !== me.username) {
      const u = body.username.toLowerCase(), problem = usernameProblem(u, me.id);
      if (problem) return json(res, 400, { error: problem === 'taken' ? 'utaken' : 'uformat' });
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(u, me.id);
    }
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
  if (action === 'session-end' || action === 'sessions-end') {   // sign one device out, or every other one
    const mine = sha(sessionToken(req) || '');
    if (action === 'session-end') db.prepare("DELETE FROM sessions WHERE user = ? AND substr(token, 1, 16) = ? AND token <> ?").run(me.id, String(body.id || ''), mine);
    else db.prepare('DELETE FROM sessions WHERE user = ? AND token <> ?').run(me.id, mine);
    return json(res, 200, { ok: true });
  }
  if (action === '2fa-setup') {                       // a new secret, shown once as a QR code and as text
    if (me.totp_on) return json(res, 400, { error: 'on' });
    const secret = b32encode(crypto.randomBytes(20));
    db.prepare('UPDATE users SET totp = ? WHERE id = ?').run(secret, me.id);
    const label = encodeURIComponent('Manzeela:' + me.email);
    return json(res, 200, { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=BD%20Map&algorithm=SHA1&digits=6&period=30` });
  }
  if (action === '2fa-enable') {
    const row = db.prepare('SELECT totp FROM users WHERE id = ?').get(me.id);
    if (!totpOk(me.id, row.totp, body.code)) return json(res, 401, { error: 'wrong' });
    const codes = Array.from({ length: 8 }, () => crypto.randomBytes(8).toString('base64').toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(10, '7').slice(0, 10));
    db.prepare('UPDATE users SET totp_on = 1, backup = ? WHERE id = ?').run(JSON.stringify(codes.map(c => sha('backup:' + c))), me.id);
    // Every other device must pass the second step from now on.
    db.prepare('DELETE FROM sessions WHERE user = ? AND token <> ?').run(me.id, sha(sessionToken(req) || ''));
    return json(res, 200, { codes: codes.map(c => c.slice(0, 5) + '-' + c.slice(5)) });
  }
  if (action === '2fa-disable') {
    const row = db.prepare('SELECT totp FROM users WHERE id = ?').get(me.id);
    if (!totpOk(me.id, row.totp, body.code) && !backupOk(me.id, body.code)) return json(res, 401, { error: 'wrong' });
    db.prepare("UPDATE users SET totp_on = 0, totp = '', backup = '[]' WHERE id = ?").run(me.id);
    return json(res, 200, publicUser(aq.byId.get(me.id)));
  }
  if (action === 'prefs') {
    const p = prefsOf(me);
    if (typeof body.active === 'boolean') p.active = body.active;
    if (['all', 'following'].includes(body.dm)) p.dm = body.dm;
    db.prepare('UPDATE users SET prefs = ? WHERE id = ?').run(JSON.stringify({ active: p.active, dm: p.dm }), me.id);
    tellFriends(me.id, 'presence', { id: me.id, online: p.active && isOnline(me.id) });
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
// grp: the group a message belongs to (0 for a conversation between two people, whose a and b are then 0);
// reply: the message it answers; reacts: {user id: emoji}; gone: unsent by its sender (kept as a marker only).
for (const [col, def] of [['grp', 'INTEGER NOT NULL DEFAULT 0'], ['reply', 'INTEGER NOT NULL DEFAULT 0'], ['reacts', "TEXT NOT NULL DEFAULT '{}'"], ['gone', 'INTEGER NOT NULL DEFAULT 0'], ['edited', 'INTEGER NOT NULL DEFAULT 0'], ['got', 'INTEGER NOT NULL DEFAULT 0']])
  if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('messages') WHERE name = ?").get(col).n) db.exec(`ALTER TABLE messages ADD COLUMN ${col} ${def}`);
db.exec('CREATE INDEX IF NOT EXISTS messages_grp ON messages (grp, id)');
const MSG_COLS = 'id, sender, kind, body, sent, seen, grp, reply, reacts, gone, edited, got';
const EDIT_MINUTES = 15;                                // a text can be changed this long after it was sent
const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];
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
  links:   db.prepare(`SELECT f.state, f.actor, f.updated, u.id, u.name, u.username, u.bio, u.pic_v AS pic, u.verified, u.prefs FROM friends f
                       JOIN users u ON u.id = CASE WHEN f.a = ?1 THEN f.b ELSE f.a END WHERE f.a = ?1 OR f.b = ?1`),
  last:    db.prepare(`SELECT ${MSG_COLS} FROM messages WHERE a = ? AND b = ? ORDER BY id DESC LIMIT 1`),
  unread:  db.prepare('SELECT COUNT(*) AS n FROM messages WHERE a = ? AND b = ? AND sender <> ? AND seen = 0 AND gone = 0'),
  history: db.prepare(`SELECT ${MSG_COLS} FROM messages WHERE a = ? AND b = ? AND id < ? ORDER BY id DESC LIMIT 60`),
  add:     db.prepare('INSERT INTO messages (a, b, sender, kind, body, sent, grp, reply) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
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
// What a reply shows of the message it answers: a line of its text, or what kind of thing it was.
function quoteOf(id) {
  const r = id ? db.prepare('SELECT id, sender, kind, body, gone FROM messages WHERE id = ?').get(id) : null;
  if (!r) return null;
  return { id: r.id, sender: r.sender, kind: r.gone ? 'gone' : r.kind, text: r.gone ? '' : r.kind === 'text' ? r.body.slice(0, 140) : r.kind === 'file' ? JSON.parse(r.body).name : '' };
}
function shown(m) {
  const out = { id: m.id, sender: m.sender, kind: m.gone ? 'gone' : m.kind, body: m.gone ? '' : m.kind === 'text' ? m.body : JSON.parse(m.body), sent: m.sent, seen: m.seen, got: m.got ? 1 : 0 };
  if (m.grp) out.group = m.grp;
  if (!m.gone && m.edited) out.edited = m.edited;
  if (!m.gone && m.reply) out.reply = quoteOf(m.reply);
  const reacts = JSON.parse(m.reacts || '{}');
  if (!m.gone && Object.keys(reacts).length) out.reacts = reacts;
  return out;
}

// ---- group conversations ----
// Up to 32 people. Whoever makes a group is its admin (when the admin leaves, the longest member takes over).
// Any member can add people they are connected with (either follows the other) and rename the group; only an
// admin removes someone. Changes appear in the conversation as a line in the middle ("sys" messages).
db.exec(`CREATE TABLE IF NOT EXISTS chat_groups (id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '', owner INTEGER NOT NULL, created INTEGER NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS group_members (grp INTEGER NOT NULL, user INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'member', joined INTEGER NOT NULL, last_read INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (grp, user))`);
db.exec('CREATE INDEX IF NOT EXISTS group_members_user ON group_members (user)');
// One person's setting for one conversation (muted); a conversation's colours, shared by everyone in it; notes.
db.exec(`CREATE TABLE IF NOT EXISTS chat_prefs (user INTEGER NOT NULL, thread TEXT NOT NULL, muted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user, thread))`);
db.exec(`CREATE TABLE IF NOT EXISTS chat_theme (thread TEXT PRIMARY KEY, theme TEXT NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS notes (user INTEGER PRIMARY KEY, body TEXT NOT NULL, created INTEGER NOT NULL)`);
const GROUP_MAX = 32, NOTE_HOURS = 24, THEMES = ['default', 'green', 'ocean', 'sunset', 'berry', 'forest', 'grape', 'mono'];
const gq = {
  group:   db.prepare('SELECT * FROM chat_groups WHERE id = ?'),
  member:  db.prepare('SELECT * FROM group_members WHERE grp = ? AND user = ?'),
  members: db.prepare('SELECT m.user AS id, m.role, m.last_read, u.name, u.bio, u.pic_v AS pic, u.verified FROM group_members m JOIN users u ON u.id = m.user WHERE m.grp = ? ORDER BY m.joined, m.user'),
  mine:    db.prepare('SELECT g.*, m.last_read FROM group_members m JOIN chat_groups g ON g.id = m.grp WHERE m.user = ?'),
  join:    db.prepare('INSERT OR IGNORE INTO group_members (grp, user, role, joined) VALUES (?, ?, ?, ?)'),
  last:    db.prepare(`SELECT ${MSG_COLS} FROM messages WHERE grp = ? ORDER BY id DESC LIMIT 1`),
  unread:  db.prepare("SELECT COUNT(*) AS n FROM messages WHERE grp = ? AND id > ? AND sender <> ? AND gone = 0 AND kind <> 'sys'"),
  history: db.prepare(`SELECT ${MSG_COLS} FROM messages WHERE grp = ? AND id < ? ORDER BY id DESC LIMIT 60`)
};
const groupKey = id => 'g' + id, pairKey = (x, y) => 'p' + pair(x, y).join('-');
const themeOf = key => (db.prepare('SELECT theme FROM chat_theme WHERE thread = ?').get(key) || {}).theme || 'default';
const mutedOf = (user, key) => !!(db.prepare('SELECT muted FROM chat_prefs WHERE user = ? AND thread = ?').get(user, key) || {}).muted;
const memberCard = m => ({ id: m.id, name: m.name, bio: m.bio, pic: m.pic, role: m.role, verified: !!m.verified });
function tellGroup(gid, event, data, except = 0) { for (const m of gq.members.all(gid)) if (m.id !== except) push(m.id, event, data); }
// A line in the middle of a conversation: "X added Y", "the theme changed", ...
function sysLine(a, b, gid, sender, what) {
  const now = Date.now(), body = JSON.stringify(what);
  const id = Number(cq.add.run(a, b, sender, 'sys', body, now, gid, 0).lastInsertRowid);
  const message = shown({ id, sender, kind: 'sys', body, sent: now, seen: 0, grp: gid, reply: 0, reacts: '{}', gone: 0 });
  if (gid) tellGroup(gid, 'message', message);
  else { const to = a === sender ? b : a; push(to, 'message', { ...message, to }); push(sender, 'message', { ...message, to }); }
}
function leaveGroup(gid, uid) {
  leaveGroupCall(gid, uid);
  db.prepare('DELETE FROM group_members WHERE grp = ? AND user = ?').run(gid, uid);
  db.prepare('DELETE FROM chat_prefs WHERE user = ? AND thread = ?').run(uid, groupKey(gid));
  const left = gq.members.all(gid);
  if (!left.length) {
    for (const sql of ['DELETE FROM messages WHERE grp = ?', 'DELETE FROM chat_groups WHERE id = ?']) db.prepare(sql).run(gid);
    db.prepare('DELETE FROM chat_theme WHERE thread = ?').run(groupKey(gid));
  } else if (!left.some(m => m.role === 'admin')) db.prepare("UPDATE group_members SET role = 'admin' WHERE grp = ? AND user = ?").run(gid, left[0].id);
}
// Group calls: who is in each group's call right now. Calls are peer-to-peer between every two people in it
// (a mesh), so they are kept small; the server only passes the set-up messages along.
const GROUP_CALL_MAX = 8;
const groupCalls = new Map();   // group id -> { video, by, started, people: Set of user ids }
const callOf = gid => { const c = groupCalls.get(gid); return c ? { video: c.video, by: c.by, started: c.started, people: [...c.people] } : null; };
function leaveGroupCall(gid, uid) {
  const c = groupCalls.get(gid);
  if (!c || !c.people.delete(uid)) return;
  if (!c.people.size) {
    groupCalls.delete(gid);
    if (gq.group.get(gid)) sysLine(0, 0, gid, c.by, { t: 'call', video: c.video, secs: Math.round((Date.now() - c.started) / 1000) });
  }
  if (gq.group.get(gid)) tellGroup(gid, 'gcall', { group: gid, call: callOf(gid) });
}
// Who may put whom in a group: two people with a follow between them either way, and no block.
const connected = (x, y) => { const l = linkOf(x, y); return !!l && l.state !== 'blocked'; };
// The `where` that picks one conversation's messages, if this person is in it.
function threadWhere(meId, query) {
  const gid = Number(query.get('group'));
  if (gid) return gq.member.get(gid, meId) ? { sql: 'grp = ?', args: [gid] } : null;
  const other = Number(query.get('with'));
  if (!Number.isInteger(other) || other === meId || (linkOf(meId, other) || {}).state === 'blocked') return null;
  return { sql: 'a = ? AND b = ?', args: pair(meId, other) };
}
// The stored form of a new message, or null when it is not acceptable.
function messageText(me, kind, v) {
  if (kind === 'text') {
    const text = typeof v === 'string' ? v.trim() : '';
    return text && text.length <= 2000 ? text : null;
  }
  if (kind === 'place') {
    const ok = v && typeof v.label === 'string' && v.label.trim() && Number.isFinite(v.lat) && Number.isFinite(v.lon) && Math.abs(v.lat) <= 90 && Math.abs(v.lon) <= 180;
    return ok ? JSON.stringify({ lat: +v.lat.toFixed(6), lon: +v.lon.toFixed(6), label: v.label.trim().slice(0, 120) }) : null;
  }
  if (kind === 'call') {
    const ok = v && ['missed', 'declined', 'ended'].includes(v.result) && Number.isInteger(v.secs) && v.secs >= 0 && v.secs < 86400;
    return ok ? JSON.stringify({ video: !!v.video, result: v.result, secs: v.secs }) : null;
  }
  if (kind === 'photo' || kind === 'video' || kind === 'file' || kind === 'audio') {
    const up = db.prepare('SELECT * FROM uploads WHERE name = ? AND user = ? AND used = 0').get(String(v && v.media), me.id);
    if (!up || up.kind !== kind) return null;
    db.prepare('UPDATE uploads SET used = 1 WHERE name = ?').run(up.name);
    const out = { src: 'media/' + up.name, name: cleanText(v.name, 80) || 'file', size: Number(v.size) || 0 };
    if (kind === 'audio') out.secs = Math.max(1, Math.min(600, Math.round(Number(v.secs) || 1)));
    return JSON.stringify(out);
  }
  return null;
}
// Messages waiting for this person count as delivered once their app is open; each sender is told.
function deliverTo(userId) {
  const senders = db.prepare('SELECT DISTINCT sender FROM messages WHERE (a = ?1 OR b = ?1) AND grp = 0 AND sender <> ?1 AND got = 0').all(userId);
  if (!senders.length) return;
  db.prepare('UPDATE messages SET got = ?2 WHERE (a = ?1 OR b = ?1) AND grp = 0 AND sender <> ?1 AND got = 0').run(userId, Date.now());
  for (const s of senders) push(s.sender, 'delivered', { by: userId });
}
// ---- notifications (the heart in Explore): likes, comments, new followers, follow-backs ----
db.exec(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, user INTEGER NOT NULL, actor INTEGER NOT NULL, kind TEXT NOT NULL, post INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0)`);
db.exec('CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user, id)');
function notify(user, actor, kind, post = 0, body = '') {
  if (!user || user === actor) return;
  // One like, one follow per person and post: liking again replaces the old line instead of adding another.
  if (kind !== 'comment') db.prepare('DELETE FROM notifications WHERE user = ? AND actor = ? AND kind = ? AND post = ?').run(user, actor, kind, post);
  db.prepare('INSERT INTO notifications (user, actor, kind, post, body, created) VALUES (?, ?, ?, ?, ?, ?)').run(user, actor, kind, post, body, Date.now());
  push(user, 'notify', {});
}
const unnotify = (user, actor, kind, post = 0) => db.prepare('DELETE FROM notifications WHERE user = ? AND actor = ? AND kind = ? AND post = ?').run(user, actor, kind, post);

// People who should hear about a change to someone: friends, and those who follow them.
function tellFollowers(userId, event, data) {
  for (const l of cq.links.all(userId)) if (l.state === 'friends' || (l.state === 'pending' && l.actor !== userId)) push(l.id, event, data);
}

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
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
// TURN_URL may list several relays separated by commas (turn: and turns:, UDP and TCP), sharing TURN_USER / TURN_PASS.
// A metered.ca relay given as one address also gets its other ways in (TCP on 80, 443, and TLS on 443), because
// mobile networks often block one of them — a call that cannot reach the relay one way still can another.
function turnUrls(list) {
  const out = new Set(list);
  for (const u of list) {
    const m = /^turns?:([^:?]+\.metered\.ca)(?::\d+)?/.exec(u);
    if (m) for (const v of [`turn:${m[1]}:80`, `turn:${m[1]}:80?transport=tcp`, `turn:${m[1]}:443`, `turns:${m[1]}:443?transport=tcp`]) out.add(v);
  }
  return [...out];
}
if (process.env.TURN_URL) ICE.push({ urls: turnUrls(process.env.TURN_URL.split(',').map(s => s.trim()).filter(Boolean)), username: (process.env.TURN_USER || '').trim(), credential: (process.env.TURN_PASS || '').trim() });
// Or a metered.ca account: METERED_APP (the part before .metered.live) and METERED_KEY; its relays are fetched and kept for an hour.
let meteredIce = { at: 0, list: [] };
async function iceServers() {
  if (!process.env.METERED_APP || !process.env.METERED_KEY) return ICE;
  if (Date.now() - meteredIce.at < 36e5 && meteredIce.list.length) return [...ICE, ...meteredIce.list];
  try {
    const r = await fetch(`https://${process.env.METERED_APP}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(process.env.METERED_KEY)}`, { signal: AbortSignal.timeout(5000) });
    const list = await r.json();
    if (Array.isArray(list) && list.length) meteredIce = { at: Date.now(), list };
  } catch (e) { console.error('turn credentials failed:', e.message); }
  return [...ICE, ...meteredIce.list];
}
const relayTests = [];
const hasTurn = () => !!process.env.TURN_URL || !!(process.env.METERED_APP && process.env.METERED_KEY);

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
      if (set.size === 1 && prefsOf(me).active) tellFriends(me.id, 'presence', { id: me.id, online: true });
      deliverTo(me.id);
      req.on('close', () => {
        set.delete(res);
        if (!set.size) {
          streams.delete(me.id);
          if (prefsOf(me).active) tellFriends(me.id, 'presence', { id: me.id, online: false });
          for (const gid of [...groupCalls.keys()]) leaveGroupCall(gid, me.id);   // the app was closed mid-call
        }
      });
      return;
    }
    if (action === 'list') {
      // friends: every conversation I am part of (`ok` false while my request waits to be accepted);
      // requests: people who wrote to me first and whom I have not accepted; incoming / outgoing: follows.
      const out = { friends: [], requests: [], incoming: [], outgoing: [], blocked: [] }, seen = new Set(), blocked = new Set();
      const meActive = prefsOf(me).active;
      const talk = (who, since, mutual) => {
        if (seen.has(who.id)) return;
        seen.add(who.id);
        const [a, b] = pair(me.id, who.id), last = cq.last.get(a, b), ok = mutual || chatOpen(me.id, who.id);
        // Online is shown only between two people who both share their activity.
        const active = meActive && prefsOf(who).active;
        delete who.prefs;
        const row = { ...who, verified: !!who.verified, online: ok && active && isOnline(who.id), since, last: last ? shown(last) : null, unread: cq.unread.get(a, b, me.id).n, ok, mutual,
                      muted: mutedOf(me.id, 'u' + who.id), theme: themeOf(pairKey(me.id, who.id)) };
        if (ok || count('SELECT COUNT(*) AS n FROM messages WHERE a = ? AND b = ? AND sender = ?', a, b, me.id)) out.friends.push(row);
        else if (last) out.requests.push(row);
      };
      for (const l of cq.links.all(me.id)) {
        const who = { id: l.id, name: l.name, username: l.username || '', bio: l.bio, pic: l.pic, verified: l.verified, prefs: l.prefs };
        if (l.state === 'friends') talk(who, l.updated, true);
        else if (l.state === 'pending') (l.actor === me.id ? out.outgoing : out.incoming).push(who);
        else { blocked.add(l.id); if (l.actor === me.id) out.blocked.push(who); }
      }
      for (const { other } of db.prepare('SELECT DISTINCT CASE WHEN a = ?1 THEN b ELSE a END AS other FROM messages WHERE a = ?1 OR b = ?1').all(me.id)) {
        const u = aq.byId.get(other);
        if (u && !u.banned && !blocked.has(other)) talk({ id: u.id, name: u.name, username: u.username || '', bio: u.bio, pic: u.pic_v, verified: u.verified, prefs: u.prefs }, 0, false);
      }
      for (const list of [out.incoming, out.outgoing, out.blocked]) for (const p of list) { p.verified = !!p.verified; delete p.prefs; }
      out.groups = gq.mine.all(me.id).map(g => {
        const last = gq.last.get(g.id), key = groupKey(g.id);
        return { id: g.id, name: g.name, created: g.created, members: gq.members.all(g.id).map(memberCard), last: last ? shown(last) : null,
                 unread: gq.unread.get(g.id, g.last_read, me.id).n, muted: mutedOf(me.id, key), theme: themeOf(key), call: callOf(g.id) };
      });
      // Notes from the last day: mine, and those of people I follow.
      out.notes = db.prepare(`SELECT n.body, n.created, u.id, u.name, u.pic_v AS pic FROM notes n JOIN users u ON u.id = n.user
                              WHERE n.created > ?2 AND u.banned = 0 AND (n.user = ?1 OR EXISTS (SELECT 1 FROM friends f WHERE f.a = MIN(?1, n.user) AND f.b = MAX(?1, n.user)
                              AND (f.state = 'friends' OR (f.state = 'pending' AND f.actor = ?1)))) ORDER BY (n.user = ?1) DESC, n.created DESC LIMIT 30`)
        .all(me.id, Date.now() - NOTE_HOURS * 36e5).map(n => ({ user: { id: n.id, name: n.name, pic: n.pic }, body: n.body, created: n.created }));
      out.prefs = prefsOf(me);
      deliverTo(me.id);
      return json(res, 200, out);
    }
    if (action === 'find') {
      if (!allowWrite(clientIp(req))) return json(res, 429, { error: 'slow' });
      const email = cleanEmail(query.get('email') || '');
      if (!email) return json(res, 400, { error: 'email' });
      const user = aq.byEmail.get(email);
      if (user && user.id === me.id) return json(res, 400, { error: 'self' });
      const link = user && linkOf(me.id, user.id);
      if (!user || (link && link.state === 'blocked')) return json(res, 404, { error: 'none' });
      const state = !link ? 'none' : link.state === 'friends' ? 'friends' : link.actor === me.id ? 'sent' : 'received';
      return json(res, 200, { user: { id: user.id, name: user.name, bio: user.bio, pic: user.pic_v, state } });
    }
    if (action === 'messages' && query.get('group')) {
      const gid = Number(query.get('group')), before = Number(query.get('before')) || Number.MAX_SAFE_INTEGER;
      if (!gq.member.get(gid, me.id)) return json(res, 403, { error: 'group' });
      const members = gq.members.all(gid);
      return json(res, 200, { messages: gq.history.all(gid, before).reverse().map(shown), ok: true, reads: Object.fromEntries(members.map(m => [m.id, m.last_read])) });
    }
    if (action === 'media' || action === 'search') {         // a conversation's photos, videos and files; or its words
      const where = threadWhere(me.id, query);
      if (!where) return json(res, 403, { error: 'friends' });
      if (action === 'media') {
        const rows = db.prepare(`SELECT ${MSG_COLS} FROM messages WHERE ${where.sql} AND gone = 0 AND kind IN ('photo', 'video', 'file') ORDER BY id DESC LIMIT 90`).all(...where.args);
        return json(res, 200, { items: rows.map(shown) });
      }
      const q = (query.get('q') || '').trim().toLowerCase().replace(/[%_]/g, '');
      if (q.length < 2) return json(res, 200, { items: [] });
      const rows = db.prepare(`SELECT ${MSG_COLS} FROM messages WHERE ${where.sql} AND gone = 0 AND kind = 'text' AND lower(body) LIKE ? ORDER BY id DESC LIMIT 40`).all(...where.args, '%' + q + '%');
      return json(res, 200, { items: rows.map(shown) });
    }
    if (action === 'messages') {
      const other = Number(query.get('with')), before = Number(query.get('before')) || Number.MAX_SAFE_INTEGER;
      if (!Number.isInteger(other) || (linkOf(me.id, other) || {}).state === 'blocked') return json(res, 403, { error: 'friends' });
      return json(res, 200, { messages: cq.history.all(...pair(me.id, other), before).reverse().map(shown), ok: chatOpen(me.id, other) });
    }
    if (action === 'ice') return json(res, 200, { iceServers: await iceServers(), relay: hasTurn() });
    if (action === 'relaytest') {                  // the app checked, quietly, that it can reach the relay
      relayTests.unshift({ at: Date.now(), ok: query.get('ok') === '1', kinds: String(query.get('k') || '').slice(0, 60), ms: Number(query.get('ms')) || 0 });
      relayTests.length = Math.min(relayTests.length, 20);
      return json(res, 200, { ok: true });
    }
    if (action === 'calldiag') {                    // a call that failed tells what each side could find (shows in the server log)
      console.log('call diag', me.id, String(query.get('d') || '').slice(0, 300));
      return json(res, 200, { ok: true });
    }
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
  if (action === 'note') {                           // a short line over your picture in the inbox, for a day
    const text = cleanText(body.body, 60);
    if (!text) db.prepare('DELETE FROM notes WHERE user = ?').run(me.id);
    else db.prepare('INSERT INTO notes (user, body, created) VALUES (?, ?, ?) ON CONFLICT (user) DO UPDATE SET body = excluded.body, created = excluded.created').run(me.id, text, Date.now());
    tellFollowers(me.id, 'friends', {});
    push(me.id, 'friends', {});
    return json(res, 200, { ok: true });
  }
  if (action === 'mute') {
    const key = String(body.thread || '');
    if (!/^[ug]\d+$/.test(key)) return json(res, 400, { error: 'bad request' });
    db.prepare('INSERT INTO chat_prefs (user, thread, muted) VALUES (?, ?, ?) ON CONFLICT (user, thread) DO UPDATE SET muted = excluded.muted').run(me.id, key, body.on ? 1 : 0);
    return json(res, 200, { ok: true });
  }
  if (action === 'react' || action === 'unsend' || action === 'edit') {
    const m = db.prepare(`SELECT ${MSG_COLS}, a, b FROM messages WHERE id = ?`).get(Number(body.msg));
    const inIt = m && !m.gone && (m.grp ? !!gq.member.get(m.grp, me.id) : (m.a === me.id || m.b === me.id));
    if (!inIt || m.kind === 'sys' || m.kind === 'call') return json(res, 404, { error: 'not found' });
    if (!m.grp && (linkOf(m.a, m.b) || {}).state === 'blocked') return json(res, 403, { error: 'friends' });
    if (action === 'edit') {
      const text = typeof body.body === 'string' ? body.body.trim() : '';
      if (m.sender !== me.id || m.kind !== 'text') return json(res, 403, { error: 'forbidden' });
      if (Date.now() - m.sent > EDIT_MINUTES * 60_000) return json(res, 403, { error: 'late' });
      if (!text || text.length > 2000) return json(res, 400, { error: 'bad request' });
      db.prepare('UPDATE messages SET body = ?, edited = ? WHERE id = ?').run(text, Date.now(), m.id);
    } else if (action === 'unsend') {
      if (m.sender !== me.id) return json(res, 403, { error: 'forbidden' });
      if (['photo', 'video', 'file', 'audio'].includes(m.kind)) unlinkMedia(JSON.parse(m.body).src);
      db.prepare("UPDATE messages SET gone = 1, body = '', reacts = '{}' WHERE id = ?").run(m.id);
    } else {
      const emoji = typeof body.emoji === 'string' ? body.emoji : '';
      if (emoji && !REACTIONS.includes(emoji)) return json(res, 400, { error: 'bad request' });
      const r = JSON.parse(m.reacts || '{}');
      if (!emoji || r[me.id] === emoji) delete r[me.id]; else r[me.id] = emoji;
      db.prepare('UPDATE messages SET reacts = ? WHERE id = ?').run(JSON.stringify(r), m.id);
    }
    const update = shown(db.prepare(`SELECT ${MSG_COLS} FROM messages WHERE id = ?`).get(m.id));
    if (m.grp) tellGroup(m.grp, 'update', update);
    else { update.to = m.a === m.sender ? m.b : m.a; push(m.a, 'update', update); push(m.b, 'update', update); }
    return json(res, 200, { message: update });
  }
  if (action === 'theme') {                          // the conversation's colours, for everyone in it
    if (!THEMES.includes(body.theme)) return json(res, 400, { error: 'bad request' });
    const gid = Number(body.group) || 0, other = Number(body.with) || 0;
    if (gid ? !gq.member.get(gid, me.id) : (!aq.byId.get(other) || other === me.id || !chatOpen(me.id, other))) return json(res, 403, { error: 'friends' });
    const key = gid ? groupKey(gid) : pairKey(me.id, other);
    db.prepare('INSERT INTO chat_theme (thread, theme) VALUES (?, ?) ON CONFLICT (thread) DO UPDATE SET theme = excluded.theme').run(key, body.theme);
    const [a, b] = gid ? [0, 0] : pair(me.id, other);
    sysLine(a, b, gid, me.id, { t: 'theme', theme: body.theme });
    if (gid) tellGroup(gid, 'friends', {}); else { push(me.id, 'friends', {}); push(other, 'friends', {}); }
    return json(res, 200, { ok: true });
  }
  if (action.startsWith('group-')) return groupAction(res, me, action, body);

  const other = Number(body.id ?? body.to ?? body.with);
  if (!Number.isInteger(other) || other === me.id || !aq.byId.get(other)) return json(res, 400, { error: 'bad request' });
  const [a, b] = pair(me.id, other), link = cq.link.get(a, b), now = Date.now();
  const refresh = () => { push(me.id, 'friends', {}); push(other, 'friends', {}); };

  if (action === 'friend') {
    if (link && link.state === 'blocked') return json(res, 403, { error: 'blocked' });
    if (!link) { if (!allowWrite(clientIp(req))) return json(res, 429, { error: 'slow' }); cq.setLink.run(a, b, 'pending', me.id, now); notify(other, me.id, 'follow'); }
    else if (link.state === 'pending' && link.actor !== me.id) { cq.setLink.run(a, b, 'friends', me.id, now); notify(other, me.id, 'followback'); }
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
    // Someone who takes requests only from people they follow.
    if (!open && prefsOf(aq.byId.get(other)).dm === 'following' && !(link && link.state === 'pending' && link.actor === other)) return json(res, 403, { error: 'closed' });
    const kind = body.kind, text = messageText(me, kind, body.body);
    if (text == null) return json(res, 400, { error: 'bad request' });
    const reply = Number(body.reply) || 0;
    if (reply && !db.prepare('SELECT 1 FROM messages WHERE id = ? AND a = ? AND b = ?').get(reply, a, b)) return json(res, 400, { error: 'bad request' });
    const { lastInsertRowid } = cq.add.run(a, b, me.id, kind, text, now, 0, reply);
    const got = isOnline(other) ? now : 0;            // their app is open: it arrives this moment
    if (got) db.prepare('UPDATE messages SET got = ? WHERE id = ?').run(got, Number(lastInsertRowid));
    const message = { ...shown({ id: Number(lastInsertRowid), sender: me.id, kind, body: text, sent: now, seen: 0, grp: 0, reply, reacts: '{}', gone: 0, got }), to: other };
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

//   POST /api/chat/group-new {ids, name}   group-add {group, ids}   group-remove {group, id}   group-leave {group}
//   POST /api/chat/group-name {group, name}   group-send {group, kind, body, reply}   group-read {group}   group-typing {group}
function groupAction(res, me, action, body) {
  const now = Date.now();
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number))].filter(id => Number.isInteger(id) && id !== me.id) : [];
  const people = ids.filter(id => { const u = aq.byId.get(id); return u && !u.banned && connected(me.id, id); });
  const brief = id => { const u = aq.byId.get(id); return { id, name: u ? u.name : '' }; };
  if (action === 'group-new') {
    if (people.length < 2) return json(res, 400, { error: 'few' });
    if (people.length + 1 > GROUP_MAX) return json(res, 400, { error: 'big' });
    if (count('SELECT COUNT(*) AS n FROM chat_groups WHERE owner = ? AND created > ?', me.id, now - 864e5) >= 10) return json(res, 429, { error: 'slow' });
    const name = cleanText(body.name, 50);
    const gid = Number(db.prepare('INSERT INTO chat_groups (name, owner, created) VALUES (?, ?, ?)').run(name, me.id, now).lastInsertRowid);
    gq.join.run(gid, me.id, 'admin', now);
    for (const id of people) gq.join.run(gid, id, 'member', now);
    sysLine(0, 0, gid, me.id, { t: 'create', name });
    tellGroup(gid, 'friends', {});
    return json(res, 200, { group: gid });
  }
  const gid = Number(body.group), mem = gq.member.get(gid, me.id);
  if (!mem) return json(res, 403, { error: 'group' });
  if (action === 'group-send') {
    if (!allowSend(me.id)) return json(res, 429, { error: 'slow' });
    if (body.kind === 'call') return json(res, 400, { error: 'bad request' });
    const text = messageText(me, body.kind, body.body);
    if (text == null) return json(res, 400, { error: 'bad request' });
    const reply = Number(body.reply) || 0;
    if (reply && !db.prepare('SELECT 1 FROM messages WHERE id = ? AND grp = ?').get(reply, gid)) return json(res, 400, { error: 'bad request' });
    const id = Number(cq.add.run(0, 0, me.id, body.kind, text, now, gid, reply).lastInsertRowid);
    db.prepare('UPDATE group_members SET last_read = ? WHERE grp = ? AND user = ?').run(id, gid, me.id);
    const message = shown({ id, sender: me.id, kind: body.kind, body: text, sent: now, seen: 0, grp: gid, reply, reacts: '{}', gone: 0 });
    tellGroup(gid, 'message', message);
    return json(res, 200, { message });
  }
  if (action === 'group-read') {
    const last = gq.last.get(gid);
    if (last && last.id > mem.last_read) {
      db.prepare('UPDATE group_members SET last_read = ? WHERE grp = ? AND user = ?').run(last.id, gid, me.id);
      tellGroup(gid, 'gread', { group: gid, by: me.id, id: last.id }, me.id);
    }
    return json(res, 200, { ok: true });
  }
  if (action === 'group-typing') { tellGroup(gid, 'typing', { from: me.id, group: gid }, me.id); return json(res, 200, { ok: true }); }
  if (action === 'group-call') {                     // start the group's call, or join the one going on
    let c = groupCalls.get(gid);
    const ring = !c;
    if (!c) { c = { video: !!body.video, by: me.id, started: now, people: new Set() }; groupCalls.set(gid, c); }
    if (!c.people.has(me.id) && c.people.size >= GROUP_CALL_MAX) return json(res, 409, { error: 'full' });
    const already = [...c.people].filter(id => id !== me.id);
    c.people.add(me.id);
    tellGroup(gid, 'gcall', { group: gid, call: callOf(gid), ring, by: me.id });
    return json(res, 200, { call: callOf(gid), peers: already });
  }
  if (action === 'group-call-leave') { leaveGroupCall(gid, me.id); return json(res, 200, { ok: true }); }
  if (action === 'group-signal') {                   // call set-up between two people in the same group call
    const c = groupCalls.get(gid), to = Number(body.to);
    if (!c || !c.people.has(me.id) || !c.people.has(to) || !body.data || typeof body.data !== 'object') return json(res, 400, { error: 'bad request' });
    push(to, 'gsignal', { group: gid, from: me.id, data: body.data });
    return json(res, 200, { ok: true });
  }
  if (action === 'group-add') {
    const have = new Set(gq.members.all(gid).map(m => m.id)), add = people.filter(id => !have.has(id));
    if (!add.length) return json(res, 400, { error: 'few' });
    if (have.size + add.length > GROUP_MAX) return json(res, 400, { error: 'big' });
    for (const id of add) gq.join.run(gid, id, 'member', now);
    sysLine(0, 0, gid, me.id, { t: 'add', who: add.map(brief) });
    tellGroup(gid, 'friends', {});
    return json(res, 200, { ok: true });
  }
  if (action === 'group-remove') {
    const id = Number(body.id);
    if (mem.role !== 'admin') return json(res, 403, { error: 'forbidden' });
    if (id === me.id || !gq.member.get(gid, id)) return json(res, 400, { error: 'bad request' });
    sysLine(0, 0, gid, me.id, { t: 'remove', who: [brief(id)] });
    leaveGroup(gid, id);
    push(id, 'friends', {});
    tellGroup(gid, 'friends', {});
    return json(res, 200, { ok: true });
  }
  if (action === 'group-leave') {
    sysLine(0, 0, gid, me.id, { t: 'leave' });
    leaveGroup(gid, me.id);
    push(me.id, 'friends', {});
    tellGroup(gid, 'friends', {});
    return json(res, 200, { ok: true });
  }
  if (action === 'group-name') {
    const name = cleanText(body.name, 50);
    db.prepare('UPDATE chat_groups SET name = ? WHERE id = ?').run(name, gid);
    sysLine(0, 0, gid, me.id, { t: 'rename', name });
    tellGroup(gid, 'friends', {});
    return json(res, 200, { ok: true });
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
const TICKET_KINDS = ['account', 'fare', 'route', 'chat', 'person', 'other', 'verify'];
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
// may be up to 3 GB (streamed to disk as it arrives, never held in memory). An upload not turned into a post within an hour is removed.
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const PARTIAL_DIR = path.join(DATA_DIR, 'partial');   // uploads arriving in pieces (see 'chunk')
fs.rmSync(PARTIAL_DIR, { recursive: true, force: true });   // pieces from before a restart cannot be finished
const partials = new Map();                        // `${user}-${id}` -> { file, total, ext, kind, made, busy }
setInterval(() => { for (const [k, p] of partials) if (!p.busy && Date.now() - p.made > 6 * 3600e3) { fs.rmSync(p.file, { force: true }); partials.delete(k); } }, 30 * 60_000).unref();
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const MEDIA_TYPES = { 'image/jpeg': ['.jpg', 'photo', 4e6], 'image/png': ['.png', 'photo', 4e6], 'image/webp': ['.webp', 'photo', 4e6],
                      'video/mp4': ['.mp4', 'video', 3e9], 'video/webm': ['.webm', 'video', 3e9], 'video/quicktime': ['.mov', 'video', 3e9], 'video/x-m4v': ['.mp4', 'video', 3e9],
                      // voice messages, recorded in the browser (Chrome and Firefox make webm or ogg, Safari makes mp4)
                      'audio/webm': ['.weba', 'audio', 10e6], 'audio/ogg': ['.ogg', 'audio', 10e6], 'audio/mp4': ['.m4a', 'audio', 10e6], 'audio/mpeg': ['.mp3', 'audio', 10e6] };
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
if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('post_likes') WHERE name = 'made'").get().n) db.exec('ALTER TABLE post_likes ADD COLUMN made INTEGER NOT NULL DEFAULT 0');
if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('posts') WHERE name = 'views'").get().n) db.exec('ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0');
// A post's look and sound: fx is a filter name; music is 'gen:<track>' (one of the app's own tracks) or 'post:<id>'
// (another video's original sound), starting mstart seconds in; orig says whether the video's own sound is kept.
for (const [col, def] of [['fx', "TEXT NOT NULL DEFAULT ''"], ['music', "TEXT NOT NULL DEFAULT ''"], ['mstart', 'REAL NOT NULL DEFAULT 0'], ['orig', 'INTEGER NOT NULL DEFAULT 1']])
  if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('posts') WHERE name = ?").get(col).n) db.exec(`ALTER TABLE posts ADD COLUMN ${col} ${def}`);
// w and h: the picture's or video's own size, so the feed can give it its shape before it loads. layers: the words,
// emoji and stickers put on a video (a photo has them drawn in), as JSON — see cleanLayers.
// audience: 'all', 'friends' (people who follow each other) or 'me'; at: when it shows (later than created
// when scheduled); tags: the people in it (JSON ids); nocomm: comments off; hidelikes: only the owner sees the
// count; aname: what its original sound is called.
for (const [col, def] of [['audience', "TEXT NOT NULL DEFAULT 'all'"], ['at', 'INTEGER NOT NULL DEFAULT 0'], ['tags', "TEXT NOT NULL DEFAULT ''"],
                          ['nocomm', 'INTEGER NOT NULL DEFAULT 0'], ['hidelikes', 'INTEGER NOT NULL DEFAULT 0'], ['aname', "TEXT NOT NULL DEFAULT ''"], ['more', "TEXT NOT NULL DEFAULT ''"]])
  if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('posts') WHERE name = ?").get(col).n) db.exec(`ALTER TABLE posts ADD COLUMN ${col} ${def}`);
const LAYER_FONTS = ['classic', 'modern', 'neon', 'type', 'strong'];
function cleanLayers(v) {
  if (!Array.isArray(v)) return '';
  const n = (x, lo, hi, d) => { x = Number(x); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x * 1000) / 1000)) : d; };
  const out = [];
  for (const l of v.slice(0, 30)) {
    if (!l || !['text', 'emoji', 'tag'].includes(l.t)) continue;
    const text = cleanText(String(l.s || ''), l.t === 'text' ? 300 : 60);
    if (!text) continue;
    const one = { t: l.t, s: text, x: n(l.x, 0, 1, .5), y: n(l.y, 0, 1, .5), sc: n(l.sc, .2, 8, 1), r: n(l.r, -7, 7, 0) };
    if (l.t !== 'emoji') {
      one.c = /^#[0-9a-f]{6}$/i.test(l.c) ? l.c.toLowerCase() : '#ffffff';
      one.bg = [0, 1, 2].includes(l.bg) ? l.bg : 0;
    }
    if (l.t === 'text') { one.f = LAYER_FONTS.includes(l.f) ? l.f : 'classic'; one.a = ['l', 'c', 'r'].includes(l.a) ? l.a : 'c'; }
    if (l.t === 'tag') one.k = ['place', 'time', 'mention', 'hash', 'bd'].includes(l.k) ? l.k : 'hash';
    out.push(one);
  }
  return out.length ? JSON.stringify(out) : '';
}
const sizeOf = v => Math.max(0, Math.min(20000, Math.round(Number(v) || 0)));
const layersOf = s => { try { return s ? JSON.parse(s) : []; } catch { return []; } };
const moreOf = s => layersOf(s).map(x => (typeof x === 'string' ? { f: x, k: 'photo' } : x));
const shownMore = s => moreOf(s).map(x => ({ src: 'media/' + x.f, kind: x.k, poster: x.p ? 'media/' + x.p : '', layers: x.l ? layersOf(x.l) : [], w: x.w || 0, h: x.h || 0 }));
const tagsOf = s => {
  const ids = layersOf(s);
  return ids.length ? db.prepare(`SELECT id, name, username FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids).map(u => ({ id: u.id, name: u.name, username: u.username || '' })) : [];
};
const FX = ['', 'bright', 'warm', 'cool', 'mono', 'vintage', 'drama', 'soft', 'sunset', 'green', 'fade'];
const GEN_TRACKS = ['dhaka-nights', 'sunrise', 'river-lofi', 'baul-road', 'monsoon', 'festival', 'tea-garden', 'city-run'];
// Sounds people upload for their reels (they confirm the rights), and tracks from Jamendo's Creative Commons
// catalogue, kept here once someone uses them so the post still knows its title and where to play it from.
db.exec(`CREATE TABLE IF NOT EXISTS sounds (id INTEGER PRIMARY KEY, user INTEGER NOT NULL, file TEXT NOT NULL, title TEXT NOT NULL, secs INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS ext_tracks (id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', audio TEXT NOT NULL, secs INTEGER NOT NULL DEFAULT 0, licence TEXT NOT NULL DEFAULT '')`);
// What a post may say about its sound: a known track, an uploaded sound, a Jamendo track, or another video's own sound.
function cleanMusic(m) {
  const s = String(m || '');
  if (s.startsWith('gen:') && GEN_TRACKS.includes(s.slice(4))) return s;
  if (/^post:\d+$/.test(s) && db.prepare("SELECT 1 FROM posts WHERE id = ? AND kind = 'video'").get(Number(s.slice(5)))) return s;
  if (/^snd:\d+$/.test(s) && db.prepare('SELECT 1 FROM sounds WHERE id = ?').get(Number(s.slice(4)))) return s;
  if (/^jam:\d+$/.test(s) && db.prepare('SELECT 1 FROM ext_tracks WHERE id = ?').get(s)) return s;
  return '';
}
const usesOf = id => count('SELECT COUNT(*) AS n FROM posts WHERE music = ?', id);
// Jamendo (jamendo.com): free music under Creative Commons licences, searchable. Needs JAMENDO_ID (a free
// client id from devportal.jamendo.com). Results are kept in ext_tracks so posts can refer to them.
async function jamendo(params) {
  if (!process.env.JAMENDO_ID) return [];
  const q = new URLSearchParams({ client_id: process.env.JAMENDO_ID, format: 'json', limit: '30', audioformat: 'mp32', imagesize: '200', include: 'licenses', ...params });
  try {
    const r = await fetch('https://api.jamendo.com/v3.0/tracks/?' + q, { signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    return (d.results || []).filter(t => t.audio && t.audiodownload_allowed !== false).map(t => {
      const row = { id: 'jam:' + t.id, title: String(t.name || '').slice(0, 120), artist: String(t.artist_name || '').slice(0, 80), image: t.image || t.album_image || '', audio: t.audio, secs: Number(t.duration) || 0, licence: t.license_ccurl || '' };
      db.prepare('INSERT INTO ext_tracks (id, title, artist, image, audio, secs, licence) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET audio = excluded.audio, image = excluded.image')
        .run(row.id, row.title, row.artist, row.image, row.audio, row.secs, row.licence);
      return { ...row, uses: usesOf(row.id) };
    });
  } catch (e) { console.error('jamendo failed:', e.message); return []; }
}
db.exec(`CREATE TABLE IF NOT EXISTS post_saves (post INTEGER NOT NULL, user INTEGER NOT NULL, made INTEGER NOT NULL, PRIMARY KEY (post, user))`);
// A story is a photo or video that shows for 24 hours and is then deleted, file and all.
db.exec(`CREATE TABLE IF NOT EXISTS stories (id INTEGER PRIMARY KEY, user INTEGER NOT NULL, kind TEXT NOT NULL, file TEXT NOT NULL, poster TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL)`);
// (w, h and layers of posts and stories: see cleanLayers)
for (const t of ['posts', 'stories'])
  for (const [col, def] of [['w', 'INTEGER NOT NULL DEFAULT 0'], ['h', 'INTEGER NOT NULL DEFAULT 0'], ['layers', "TEXT NOT NULL DEFAULT ''"]])
    if (!db.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('${t}') WHERE name = ?`).get(col).n) db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`);
function deleteStory(st) { unlinkMedia(st.file); unlinkMedia(st.poster); db.prepare('DELETE FROM stories WHERE id = ?').run(st.id); }
db.exec(`CREATE TABLE IF NOT EXISTS post_comments (id INTEGER PRIMARY KEY, post INTEGER NOT NULL, user INTEGER NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL)`);
// a deleted file goes from the disk and from the copy on R2 (else the copy would bring it back: see mediaBack)
const unlinkMedia = name => {
  if (!name) return;
  const base = path.basename(String(name));
  fs.unlink(path.join(MEDIA_DIR, base), () => {});
  if (backupOn) {
    r2.del(R2_PREFIX + 'media/' + base).catch(e => console.error('R2 delete failed:', base, e.message));
    try { db.prepare('DELETE FROM r2_files WHERE name = ?').run(base); } catch { /* table not made yet */ }
  }
};
function deletePost(p) {
  unlinkMedia(p.file); unlinkMedia(p.poster);
  for (const x of moreOf(p.more)) { unlinkMedia(x.f); unlinkMedia(x.p); }
  for (const sql of ['DELETE FROM post_likes WHERE post = ?', 'DELETE FROM post_saves WHERE post = ?', 'DELETE FROM post_comments WHERE post = ?', 'DELETE FROM notifications WHERE post = ?', 'DELETE FROM posts WHERE id = ?']) db.prepare(sql).run(p.id);
}
setInterval(() => {
  for (const st of db.prepare('SELECT * FROM stories WHERE created < ?').all(Date.now() - 864e5)) deleteStory(st);
  for (const u of db.prepare('SELECT name FROM uploads WHERE used = 0 AND created < ?').all(Date.now() - 36e5)) { unlinkMedia(u.name); db.prepare('DELETE FROM uploads WHERE name = ?').run(u.name); }
}, 15 * 60_000).unref();

const POST_SELECT = `SELECT p.*, u.name, u.pic_v, u.verified, (SELECT COUNT(*) FROM post_likes l WHERE l.post = p.id) AS likes,
  (SELECT COUNT(*) FROM post_comments c WHERE c.post = p.id) AS comments, EXISTS (SELECT 1 FROM post_likes l WHERE l.post = p.id AND l.user = ?1) AS liked,
  EXISTS (SELECT 1 FROM post_saves s WHERE s.post = p.id AND s.user = ?1) AS saved
  FROM posts p JOIN users u ON u.id = p.user WHERE u.banned = 0
  AND (p.user = ?1 OR ?1 = -1 OR (p.at <= CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) + 1000 AND (p.audience = 'all'
    OR (p.audience = 'friends' AND EXISTS (SELECT 1 FROM friends f WHERE f.state = 'friends' AND f.a = min(p.user, ?1) AND f.b = max(p.user, ?1))))))`;
const forViewer = (p, meId) => (p.hidelikes && p.user.id !== meId ? { ...p, likes: null } : p);
const shownPost = p => ({ id: p.id, kind: p.kind, src: p.file ? 'media/' + p.file : '', poster: p.poster ? 'media/' + p.poster : '', caption: p.caption, saved: !!p.saved,
  place: p.place ? { label: p.place, lat: p.lat, lon: p.lon } : null, created: p.created, likes: p.likes, comments: p.comments, liked: !!p.liked,
  w: p.w || 0, h: p.h || 0, layers: layersOf(p.layers), views: p.views || 0, audience: p.audience || 'all', at: p.at || p.created,
  tags: tagsOf(p.tags), nocomm: !!p.nocomm, hidelikes: !!p.hidelikes, aname: p.aname || '', more: shownMore(p.more), fx: p.fx || '', music: p.music ? { id: p.music, start: p.mstart || 0, label: musicLabel(p.music) } : null, orig: p.orig !== 0,
  user: { id: p.user, name: p.name, pic: p.pic_v, verified: !!p.verified } });
// "dhaka-nights" for the app's own tracks; "<name> · original audio" (with where to find it) for another reel's sound.
function musicLabel(m) {
  if (m.startsWith('gen:')) return { kind: 'gen', track: m.slice(4) };
  if (m.startsWith('snd:')) {
    const s = db.prepare('SELECT s.file, s.title, u.name FROM sounds s JOIN users u ON u.id = s.user WHERE s.id = ?').get(Number(m.slice(4)));
    return s ? { kind: 'file', src: 'media/' + s.file, title: s.title, by: s.name } : { kind: 'gone' };
  }
  if (m.startsWith('jam:')) {
    const t = db.prepare('SELECT * FROM ext_tracks WHERE id = ?').get(m);
    return t ? { kind: 'file', src: t.audio, title: t.title, by: t.artist, licence: t.licence } : { kind: 'gone' };
  }
  const src = db.prepare('SELECT p.id, p.file, p.aname, u.name FROM posts p JOIN users u ON u.id = p.user WHERE p.id = ?').get(Number(m.slice(5)));
  return src ? { kind: 'post', post: src.id, src: 'media/' + src.file, by: src.name, title: src.aname || '' } : { kind: 'gone' };
}

//   POST /api/explore/media   (the file itself as the body, Content-Type image/* or video/*) -> { media }
//   POST /api/explore/post    {media, poster?: data URL, caption, place?: {label, lat, lon}}  -> { post }
//   GET  /api/explore/feed?before=&user=&kind=video&q=   -> { posts }          GET /api/explore/post?id= -> { post, comments }
//   POST /api/explore/like {id}   /save {id}   /comment {id, body}   /delete {id}   /report {id, reason}
//   GET  /api/explore/stories    POST /api/explore/story {media, poster?}    POST /api/explore/story-delete {id}
// ---- "Fast start" for phone videos ----
// Many phones write a video's index (the moov box) at the end of the file, after the pictures. A browser must then
// fetch the end before it can play, and it stalls while it seeks back and forth. Like qt-faststart, this moves the
// index to the front and moves every chunk offset in it by the index's size; the new file replaces the old one
// in one rename once it is whole, so a viewer never sees half of it.
const VIDEO_SECS = 300, VIDEOS_A_DAY = 5;      // a video post or reel: up to 5 minutes; 5 of them a day
// How long a video is, read from the file: an MP4/MOV's movie header (mvhd), or a WebM's Duration. null when the
// file does not say (a WebM straight from a browser's recorder often leaves it out); then the app's own check stands.
async function videoSecs(file) {
  let fh;
  try {
    fh = await fs.promises.open(file, 'r');
    const { size: total } = await fh.stat(), head = Buffer.alloc(16);
    await fh.read(head, 0, 16, 0);
    if (head.readUInt32BE(0) === 0x1a45dfa3) {                       // WebM / Matroska
      const buf = Buffer.alloc(Math.min(total, 256 * 1024));
      await fh.read(buf, 0, buf.length, 0);
      const vint = p => { const b = buf[p]; let len = 1; while (len <= 8 && !(b & (0x80 >> (len - 1)))) len++; let v = b & (0xff >> len); for (let i = 1; i < len; i++) v = v * 256 + buf[p + i]; return [v, len]; };
      let scale = 1e6, dur = null;
      for (let p = 0; p + 12 < buf.length; p++) {
        if (buf[p] === 0x2a && buf[p + 1] === 0xd7 && buf[p + 2] === 0xb1) { const [n, l] = vint(p + 3); if (n > 0 && n <= 8) scale = buf.readUIntBE(p + 3 + l, n); }
        if (buf[p] === 0x44 && buf[p + 1] === 0x89) { const [n, l] = vint(p + 2); if (n === 4) dur = buf.readFloatBE(p + 2 + l); else if (n === 8) dur = buf.readDoubleBE(p + 2 + l); if (dur != null) break; }
      }
      return dur != null && isFinite(dur) && dur > 0 ? dur * scale / 1e9 : null;
    }
    for (let pos = 0; pos + 16 <= total;) {                           // MP4 / MOV: the top-level boxes, then mvhd inside moov
      await fh.read(head, 0, 16, pos);
      let size = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      if (size === 1) size = Number(head.readBigUInt64BE(8)); else if (size === 0) size = total - pos;
      if (size < 8) return null;
      if (type === 'moov') {
        const buf = Buffer.alloc(Math.min(size, 64e6));
        await fh.read(buf, 0, buf.length, pos);
        for (let p = 8; p + 32 <= buf.length;) {
          const s = buf.readUInt32BE(p);
          if (buf.toString('latin1', p + 4, p + 8) === 'mvhd') {
            const v1 = buf[p + 8] === 1, scale = buf.readUInt32BE(p + (v1 ? 28 : 20)), d = v1 ? Number(buf.readBigUInt64BE(p + 32)) : buf.readUInt32BE(p + 24);
            return scale ? d / scale : null;
          }
          if (s < 8) return null;
          p += s;
        }
        return null;
      }
      pos += size;
    }
    return null;
  } catch { return null; } finally { if (fh) await fh.close().catch(() => {}); }
}
async function mp4Faststart(file) {
  const fh = await fs.promises.open(file, 'r');
  let atoms = [], moov, buf;
  try {
    const { size: total } = await fh.stat(), head = Buffer.alloc(16);
    for (let pos = 0; pos < total;) {
      await fh.read(head, 0, 16, pos);
      let size = head.readUInt32BE(0);
      if (size === 1) size = Number(head.readBigUInt64BE(8)); else if (size === 0) size = total - pos;
      if (size < 8) return;
      atoms.push({ type: head.toString('latin1', 4, 8), pos, size });
      pos += size;
    }
    moov = atoms.find(a => a.type === 'moov');
    const mdat = atoms.find(a => a.type === 'mdat');
    if (!moov || !mdat || moov.pos < mdat.pos || moov.size > 64e6 || atoms[0].type !== 'ftyp') return;   // already in front, or not a plain MP4
    buf = Buffer.alloc(moov.size);
    await fh.read(buf, 0, moov.size, moov.pos);
  } finally { await fh.close(); }
  // every chunk offset that pointed before the old index moves forward by the index's size
  const shift = moov.size, before = moov.pos;
  const walk = (start, end) => {
    for (let p = start; p + 8 <= end;) {
      const size = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8);
      if (size < 8 || p + size > end) return false;
      if (['trak', 'mdia', 'minf', 'stbl'].includes(type)) { if (!walk(p + 8, p + size)) return false; }
      else if (type === 'stco') {
        const n = buf.readUInt32BE(p + 12);
        for (let i = 0; i < n; i++) { const at = p + 16 + i * 4, v = buf.readUInt32BE(at); if (v < before) { if (v + shift > 0xffffffff) return false; buf.writeUInt32BE(v + shift, at); } }
      } else if (type === 'co64') {
        const n = buf.readUInt32BE(p + 12);
        for (let i = 0; i < n; i++) { const at = p + 16 + i * 8, v = buf.readBigUInt64BE(at); if (v < BigInt(before)) buf.writeBigUInt64BE(v + BigInt(shift), at); }
      } else if (type === 'cmov') return false;                   // a compressed index: leave the file as it is
      p += size;
    }
    return true;
  };
  if (!walk(8, buf.length)) return;
  // ftyp, then the index, then everything else in its old order
  const tmp = file + '.fs', out = fs.createWriteStream(tmp), ftyp = atoms[0];
  const copy = (start, end) => new Promise((ok, bad) => {
    if (end <= start) return ok();
    const r = fs.createReadStream(file, { start, end: end - 1 });
    r.on('error', bad); r.on('end', ok); r.pipe(out, { end: false });
  });
  try {
    await copy(0, ftyp.size);
    await new Promise((ok, bad) => out.write(buf, e => (e ? bad(e) : ok())));
    await copy(ftyp.size, moov.pos);
    await copy(moov.pos + moov.size, atoms.at(-1).pos + atoms.at(-1).size);
    await new Promise((ok, bad) => out.end(e => (e ? bad(e) : ok())));
    await fs.promises.rename(tmp, file);
  } catch (e) { out.destroy(); fs.promises.unlink(tmp).catch(() => {}); throw e; }
}
const viewed = new Map();
setInterval(() => { const old = Date.now() - 6 * 36e5; for (const [k, t] of viewed) if (t < old) viewed.delete(k); }, 30 * 60_000).unref();
async function exploreApi(req, res, action, query) {
  const me = userOf(req), meId = me ? me.id : 0, now = Date.now();
  if (req.method === 'GET') {
    if (action === 'feed' && query.get('seed') && !query.get('user') && !query.get('q') && !query.get('saved')) {
      const seed = Math.max(1, Math.min(1e6, Number(query.get('seed')) | 0)), off = Math.max(0, Math.min(5000, Number(query.get('o')) | 0));
      const kind = query.get('kind') === 'video' ? 'video' : '', first = Number(query.get('first')) || 0;
      const rows = db.prepare(`${POST_SELECT} AND (?4 = '' OR (p.kind = ?4 AND p.more = ''))
        ORDER BY (CASE WHEN p.id = ?5 THEN -9 ELSE 0 END) + ((p.id * ?2 + 7919) % 1009) / 1009.0
          - MAX(0, 1 - (?6 - p.created) / 259200000.0) * 0.7
          - (CASE WHEN EXISTS (SELECT 1 FROM friends f WHERE f.a = min(p.user, ?1) AND f.b = max(p.user, ?1) AND (f.state = 'friends' OR (f.state = 'pending' AND f.actor = ?1))) THEN 0.25 ELSE 0 END)
        LIMIT 30 OFFSET ?3`).all(meId, seed, off, kind, first, now);
      return json(res, 200, { posts: rows.map(p => forViewer(shownPost(p), meId)) });
    }
    if (action === 'feed') {
      const before = Number(query.get('before')) || Number.MAX_SAFE_INTEGER, user = Number(query.get('user')) || 0;
      const kind = query.get('kind') === 'video' ? 'video' : '', q = (query.get('q') || '').trim().toLowerCase().replace(/[%_]/g, '');
      const rows = db.prepare(`${POST_SELECT} AND p.id < ?2 AND (?3 = 0 OR p.user = ?3) AND (?4 = '' OR (p.kind = ?4 AND p.more = ''))
                               AND (?5 = '' OR lower(p.caption) LIKE ?5 OR lower(p.place) LIKE ?5)
                               AND (?6 = 0 OR EXISTS (SELECT 1 FROM post_saves s WHERE s.post = p.id AND s.user = ?1)) ORDER BY p.id DESC LIMIT 30`)
        .all(meId, before, user, kind, q ? '%' + q + '%' : '', query.get('saved') && meId ? 1 : 0);
      return json(res, 200, { posts: rows.map(p => forViewer(shownPost(p), meId)) });
    }
    if (action === 'audios') {
      const rows = db.prepare(`SELECT p.id, p.file, p.poster, p.caption, p.created, p.aname, u.name, u.pic_v, u.id AS uid, (SELECT COUNT(*) FROM posts x WHERE x.music = 'post:' || p.id) AS uses
        FROM posts p JOIN users u ON u.id = p.user WHERE p.kind = 'video' AND p.orig = 1 AND p.music = '' AND u.banned = 0 AND p.audience = 'all' AND p.at <= ?
        ORDER BY uses DESC, p.id DESC LIMIT 30`).all(now);
      const sounds = db.prepare(`SELECT s.*, u.name, u.pic_v, (SELECT COUNT(*) FROM posts x WHERE x.music = 'snd:' || s.id) AS uses FROM sounds s JOIN users u ON u.id = s.user
        WHERE u.banned = 0 ORDER BY uses DESC, s.id DESC LIMIT 40`).all();
      const used = db.prepare("SELECT t.*, (SELECT COUNT(*) FROM posts x WHERE x.music = t.id) AS uses FROM ext_tracks t WHERE uses > 0 ORDER BY uses DESC LIMIT 20").all();
      return json(res, 200, { tracks: GEN_TRACKS.map(id => ({ id, uses: usesOf('gen:' + id) })), catalogue: !!process.env.JAMENDO_ID,
        audios: rows.map(r => ({ id: 'post:' + r.id, post: r.id, title: r.aname || '', src: 'media/' + r.file, poster: r.poster ? 'media/' + r.poster : '', uses: r.uses, created: r.created, user: { id: r.uid, name: r.name, pic: r.pic_v } })),
        sounds: sounds.map(s => ({ id: 'snd:' + s.id, src: 'media/' + s.file, title: s.title, secs: s.secs, uses: s.uses, created: s.created, user: { id: s.user, name: s.name, pic: s.pic_v } })),
        tracksUsed: used.map(t => ({ id: t.id, title: t.title, artist: t.artist, image: t.image, audio: t.audio, secs: t.secs, uses: t.uses })) });
    }
    if (action === 'music') {                          // Jamendo: this week's most played, or a search
      const q = (query.get('q') || '').trim().slice(0, 60);
      let tracks = await jamendo(q ? { search: q, order: 'relevance' } : { order: 'popularity_week' });
      // The weekly chart can come back empty; then the all-time favourites, then popular pop tracks.
      if (!q && !tracks.length) tracks = await jamendo({ order: 'popularity_total' });
      if (!q && !tracks.length) tracks = await jamendo({ tags: 'pop', order: 'popularity_total' });
      return json(res, 200, { catalogue: !!process.env.JAMENDO_ID, tracks });
    }
    if (action === 'stories') {
      // Everyone's stories from the last 24 hours, grouped by person: mine first, then the newest.
      const rows = db.prepare(`SELECT s.*, u.name, u.pic_v FROM stories s JOIN users u ON u.id = s.user WHERE u.banned = 0 AND s.created > ? ORDER BY s.id`).all(now - 864e5);
      const by = new Map();
      for (const r of rows) {
        if (!by.has(r.user)) by.set(r.user, { user: { id: r.user, name: r.name, pic: r.pic_v }, items: [] });
        by.get(r.user).items.push({ id: r.id, kind: r.kind, src: 'media/' + r.file, poster: r.poster ? 'media/' + r.poster : '', created: r.created, w: r.w || 0, h: r.h || 0, layers: layersOf(r.layers) });
      }
      const list = [...by.values()].sort((x, y) => (y.user.id === meId) - (x.user.id === meId) || y.items.at(-1).created - x.items.at(-1).created);
      return json(res, 200, { stories: list });
    }
    if (action === 'post') {
      const p = db.prepare(`${POST_SELECT} AND p.id = ?2`).get(meId, Number(query.get('id')));
      if (!p) return json(res, 404, { error: 'not found' });
      const comments = db.prepare('SELECT c.id, c.body, c.created, u.id AS uid, u.name, u.pic_v FROM post_comments c JOIN users u ON u.id = c.user WHERE c.post = ? ORDER BY c.id DESC LIMIT 60').all(p.id);
      return json(res, 200, { post: forViewer(shownPost(p), meId), comments: comments.reverse().map(c => ({ id: c.id, body: c.body, created: c.created, user: { id: c.uid, name: c.name, pic: c.pic_v } })) });
    }
    if (action === 'chunk') {                          // how much of an upload in pieces has arrived (to go on after a break)
      if (!me) return json(res, 401, { error: 'login' });
      const id = String(query.get('id') || ''), part = partials.get(me.id + '-' + id);
      if (!/^[a-f0-9]{24}$/.test(id) || !part) return json(res, 200, { size: 0 });
      let size = 0; try { size = fs.statSync(part.file).size; } catch { /* nothing yet */ }
      return json(res, 200, { size, total: part.total });
    }
    return json(res, 404, { error: 'not found' });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  if (action === 'view') {                           // posts that came on screen: counted once per viewer in 6 hours
    let body;
    try { body = JSON.parse(await readBody(req, 4000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }
    const who = me ? 'u' + me.id : clientIp(req);
    for (const id of (Array.isArray(body.ids) ? body.ids : []).slice(0, 30).map(Number)) {
      const key = who + '|' + id;
      if (!Number.isInteger(id) || viewed.has(key)) continue;
      viewed.set(key, now);
      db.prepare('UPDATE posts SET views = views + 1 WHERE id = ? AND user <> ?').run(id, meId);
    }
    return json(res, 200, { ok: true });
  }
  if (!me) { req.resume(); return json(res, 401, { error: 'login' }); }

  // A big file in pieces (a few MB each): ?id=<24 hex, chosen by the app>&offset=<bytes so far>&size=<whole size>,
  // the piece as the body. A piece that does not start where the last one ended is refused with the size there is,
  // so the app goes on from there after a lost connection; the last piece makes the upload, as 'media' does.
  if (action === 'chunk') {
    const id = String(query.get('id') || ''), offset = Number(query.get('offset')), total = Number(query.get('size'));
    const type = MEDIA_TYPES[(req.headers['content-type'] || '').split(';')[0].trim()];
    if (!/^[a-f0-9]{24}$/.test(id) || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(total) || total < 200 || !type || type[1] === 'audio') { req.resume(); return json(res, 400, { error: 'bad request' }); }
    const [ext, kind, limit] = type;
    if (total > limit) { req.resume(); return json(res, 413, { error: 'big' }); }
    const key = me.id + '-' + id;
    let part = partials.get(key);
    if (!part) {
      if (offset !== 0) { req.resume(); return json(res, 409, { size: 0 }); }
      if (count('SELECT COUNT(*) AS n FROM uploads WHERE user = ? AND created > ?', me.id, now - 864e5) >= 40) { req.resume(); return json(res, 429, { error: 'slow' }); }
      try { const f = fs.statfsSync(MEDIA_DIR); if (f.bavail * f.bsize < total + 300e6) { req.resume(); return json(res, 507, { error: 'space' }); } } catch { /* no statfs here */ }
      fs.mkdirSync(PARTIAL_DIR, { recursive: true });
      part = { file: path.join(PARTIAL_DIR, key + '.part'), total, ext, kind, made: now, busy: false };
      fs.rmSync(part.file, { force: true });
      partials.set(key, part);
    }
    if (part.total !== total || part.ext !== ext) { req.resume(); return json(res, 400, { error: 'bad request' }); }
    if (part.busy) { req.resume(); return json(res, 409, { size: -1 }); }
    let have = 0; try { have = fs.statSync(part.file).size; } catch { /* a first piece */ }
    if (offset !== have) { req.resume(); return json(res, 409, { size: have }); }
    part.busy = true; part.made = now;
    const out = fs.createWriteStream(part.file, { flags: 'a' });
    let got = 0, failed = false;
    const fail = (status, body) => { if (failed) return; failed = true; part.busy = false; out.destroy(); req.resume(); if (!res.headersSent) json(res, status, body); };
    req.on('data', c => { got += c.length; if (got > 9 * 1024 * 1024 || have + got > total) return fail(413, { error: 'big' }); if (!out.write(c)) { req.pause(); out.once('drain', () => req.resume()); } });
    req.on('aborted', () => fail(400, { error: 'bad request' }));
    req.on('error', () => fail(400, { error: 'bad request' }));
    out.on('error', () => fail(507, { error: 'space' }));
    req.on('end', () => {
      if (failed) return;
      out.end(() => {
        part.busy = false;
        const size = have + got;
        if (size < total) return json(res, 200, { size });
        partials.delete(key);
        const name = crypto.randomBytes(12).toString('hex') + ext, file = path.join(MEDIA_DIR, name);
        try { fs.renameSync(part.file, file); } catch { try { fs.copyFileSync(part.file, file); fs.rmSync(part.file, { force: true }); } catch { return json(res, 507, { error: 'space' }); } }
        db.prepare('INSERT INTO uploads (name, user, kind, created) VALUES (?, ?, ?, ?)').run(name, me.id, kind, Date.now());
        json(res, 200, { media: name, size });
        if (kind === 'video' && /\.(mp4|mov)$/.test(name)) mp4Faststart(file).catch(e => console.warn('faststart', name, e.message));
      });
    });
    return;
  }

  if (action === 'media') {
    const type = MEDIA_TYPES[(req.headers['content-type'] || '').split(';')[0].trim()];
    if (!type || type[1] === 'audio') { req.resume(); return json(res, 400, { error: 'type' }); }
    const [ext, kind, limit] = type;
    if (Number(req.headers['content-length']) > limit) { req.resume(); return json(res, 413, { error: 'big' }); }
    if (count('SELECT COUNT(*) AS n FROM uploads WHERE user = ? AND created > ?', me.id, now - 864e5) >= 40) { req.resume(); return json(res, 429, { error: 'slow' }); }
    const length = Number(req.headers['content-length']) || 0;
    try { const f = fs.statfsSync(MEDIA_DIR); if (length && f.bavail * f.bsize < length + 300e6) { req.resume(); return json(res, 507, { error: 'space' }); } } catch { /* no statfs here */ }
    const name = crypto.randomBytes(12).toString('hex') + ext, file = path.join(MEDIA_DIR, name);
    const out = fs.createWriteStream(file);
    let size = 0, failed = false;
    const fail = (status, error) => { if (failed) return; failed = true; out.destroy(); fs.unlink(file, () => {}); req.resume(); if (!res.headersSent) json(res, status, { error }); };
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) return fail(413, 'big');
      if (failed) return;
      if (!out.write(chunk)) { req.pause(); out.once('drain', () => req.resume()); }   // the network can be faster than the disk
    });
    out.on('error', () => fail(507, 'space'));
    req.on('error', () => fail(400, 'bad request'));
    req.on('aborted', () => fail(400, 'bad request'));
    req.on('end', () => {
      if (failed) return;
      out.end(() => {
        if (size < 200) return fail(400, 'bad request');
        db.prepare('INSERT INTO uploads (name, user, kind, created) VALUES (?, ?, ?, ?)').run(name, me.id, kind, Date.now());
        json(res, 200, { media: name });
        if (kind === 'video' && /\.(mp4|mov)$/.test(name)) mp4Faststart(file).catch(e => console.warn('faststart', name, e.message));
      });
    });
    return;
  }
  if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 400, { error: 'bad request' });
  let body;
  try { body = JSON.parse(await readBody(req, 600_000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }

  if ((action === 'post' || action === 'story') && !flagOn('posts') && me.role === 'user') return json(res, 403, { error: 'closed' });
  if (action === 'post' && !body.media) {              // words only
    const text = cleanText(body.caption, 1000);
    if (text.length < 2) return json(res, 400, { error: 'short' });
    if (count('SELECT COUNT(*) AS n FROM posts WHERE user = ? AND created > ?', me.id, now - 864e5) >= 40) return json(res, 429, { error: 'slow' });
    const id = Number(db.prepare("INSERT INTO posts (user, kind, file, caption, created) VALUES (?, 'text', '', ?, ?)").run(me.id, text, now).lastInsertRowid);
    return json(res, 200, { post: shownPost(db.prepare(`${POST_SELECT} AND p.id = ?2`).get(me.id, id)) });
  }
  if (action === 'post' || action === 'story') {
    const up = db.prepare('SELECT * FROM uploads WHERE name = ? AND user = ? AND used = 0').get(String(body.media), me.id);
    if (!up || (up.kind !== 'photo' && up.kind !== 'video')) return json(res, 400, { error: 'media' });
    let poster = '';
    if (up.kind === 'video' && typeof body.poster === 'string') {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body.poster), buf = m && Buffer.from(m[1], 'base64');
      if (buf && buf.length > 200 && buf.length < 400_000) { poster = crypto.randomBytes(12).toString('hex') + '.jpg'; fs.writeFileSync(path.join(MEDIA_DIR, poster), buf); }
    }
    if (action === 'story') {
      if (up.kind === 'video') { const secs = await videoSecs(path.join(MEDIA_DIR, up.name)); if (secs && secs > VIDEO_SECS + 1) { unlinkMedia(poster); return json(res, 400, { error: 'long', secs: Math.round(secs) }); } }
      db.prepare('INSERT INTO stories (user, kind, file, poster, created, w, h, layers) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(me.id, up.kind, up.name, poster, now, sizeOf(body.w), sizeOf(body.h), up.kind === 'video' ? cleanLayers(body.layers) : '');
      db.prepare('UPDATE uploads SET used = 1 WHERE name = ?').run(up.name);
      return json(res, 200, { ok: true });
    }
    const place = body.place && inBangladesh(body.place) ? body.place : null;
    // videos: 5 a day in posts and reels, each up to 5 minutes (storage is what costs; stories go after a day)
    const posted = db.prepare('SELECT kind, more FROM posts WHERE user = ? AND created > ?').all(me.id, now - 864e5);
    const videosToday = posted.reduce((n, p) => n + (p.kind === 'video' ? 1 : 0) + moreOf(p.more).filter(x => x.k === 'video').length, 0);
    const newVideos = [up, ...(Array.isArray(body.more) ? body.more : []).slice(0, 9).map(x => db.prepare('SELECT * FROM uploads WHERE name = ? AND user = ? AND used = 0').get(String(typeof x === 'string' ? x : x && x.media), me.id))].filter(u => u && u.kind === 'video');
    if (newVideos.length && videosToday + newVideos.length > VIDEOS_A_DAY && me.role === 'user') { unlinkMedia(poster); return json(res, 429, { error: 'videos', left: Math.max(0, VIDEOS_A_DAY - videosToday) }); }
    for (const v of newVideos) { const secs = await videoSecs(path.join(MEDIA_DIR, v.name)); if (secs && secs > VIDEO_SECS + 1) { unlinkMedia(poster); return json(res, 400, { error: 'long', secs: Math.round(secs) }); } }
    const fx = FX.includes(body.fx) ? body.fx : '', music = cleanMusic(body.music);
    const mstart = Math.max(0, Math.min(600, Number(body.mstart) || 0)), orig = body.orig === false ? 0 : 1;
    const audience = ['all', 'friends', 'me'].includes(body.audience) ? body.audience : 'all';
    // the other photos of a carousel (up to 10 in all): my own unused photo uploads
    // the rest of a carousel (up to 10 in all): my own unused photo and video uploads, each video with its picture and layers
    const seenMore = new Set([up.name]), more = [];
    for (const x of (Array.isArray(body.more) ? body.more : []).slice(0, 9)) {
      const name = String(typeof x === 'string' ? x : x && x.media);
      if (seenMore.has(name)) continue;
      const u = db.prepare("SELECT * FROM uploads WHERE name = ? AND user = ? AND used = 0 AND kind IN ('photo', 'video')").get(name, me.id);
      if (!u) continue;
      seenMore.add(name);
      const item = { f: u.name, k: u.kind, w: sizeOf(x && x.w), h: sizeOf(x && x.h) };
      if (u.kind === 'video' && x && typeof x.poster === 'string') {
        const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(x.poster), buf = m && Buffer.from(m[1], 'base64');
        if (buf && buf.length > 200 && buf.length < 400_000) { item.p = crypto.randomBytes(12).toString('hex') + '.jpg'; fs.writeFileSync(path.join(MEDIA_DIR, item.p), buf); }
      }
      if (u.kind === 'video' && x) { const l = cleanLayers(x.layers); if (l) item.l = l; }
      more.push(item);
    }
    const at = Math.max(now, Math.min(now + 75 * 864e5, Number(body.at) || now));          // scheduled up to 75 days ahead
    const tagged = [...new Set((Array.isArray(body.tags) ? body.tags : []).map(Number).filter(n => Number.isInteger(n) && n > 0 && n !== me.id))].slice(0, 20)
      .filter(id => db.prepare('SELECT 1 FROM users WHERE id = ? AND banned = 0').get(id));
    const { lastInsertRowid } = db.prepare(`INSERT INTO posts (user, kind, file, poster, caption, place, lat, lon, created, fx, music, mstart, orig, w, h, layers, audience, at, tags, nocomm, hidelikes, aname, more)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(me.id, up.kind, up.name, poster, cleanText(body.caption, 500), place ? cleanText(place.label, 80) : '', place ? place.lat : null, place ? place.lon : null, now, fx, music, mstart, orig,
        sizeOf(body.w), sizeOf(body.h), up.kind === 'video' ? cleanLayers(body.layers) : '', audience, at, tagged.length ? JSON.stringify(tagged) : '',
        body.nocomm ? 1 : 0, body.hidelikes ? 1 : 0, cleanText(body.aname, 60), more.length ? JSON.stringify(more) : '');
    for (const n of [up.name, ...more.map(x => x.f)]) db.prepare('UPDATE uploads SET used = 1 WHERE name = ?').run(n);
    const postId = Number(lastInsertRowid);
    if (audience !== 'me') for (const id of tagged) notify(id, me.id, 'tag', postId);
    // Also as a story: the same file under a second name (a hard link where the disk allows, so 3 GB is not copied).
    if (body.story && audience === 'all' && at <= now) {
      const twin = name => {
        if (!name) return '';
        const n2 = crypto.randomBytes(12).toString('hex') + path.extname(name);
        try { fs.linkSync(path.join(MEDIA_DIR, name), path.join(MEDIA_DIR, n2)); } catch { try { fs.copyFileSync(path.join(MEDIA_DIR, name), path.join(MEDIA_DIR, n2)); } catch { return ''; } }
        return n2;
      };
      const f2 = twin(up.name);
      if (f2) db.prepare('INSERT INTO stories (user, kind, file, poster, created, w, h, layers) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(me.id, up.kind, f2, twin(poster), now, sizeOf(body.w), sizeOf(body.h), up.kind === 'video' ? cleanLayers(body.layers) : '');
    }
    return json(res, 200, { post: shownPost(db.prepare(`${POST_SELECT} AND p.id = ?2`).get(me.id, postId)) });
  }
  if (action === 'sound') {                          // a sound of one's own for reels (the uploader confirms the rights)
    const up = db.prepare("SELECT * FROM uploads WHERE name = ? AND user = ? AND used = 0 AND kind = 'audio'").get(String(body.media), me.id);
    if (!up || body.rights !== true) return json(res, 400, { error: 'media' });
    if (count('SELECT COUNT(*) AS n FROM sounds WHERE user = ? AND created > ?', me.id, now - 864e5) >= 20) return json(res, 429, { error: 'slow' });
    db.prepare('UPDATE uploads SET used = 1 WHERE name = ?').run(up.name);
    const id = Number(db.prepare('INSERT INTO sounds (user, file, title, secs, created) VALUES (?, ?, ?, ?, ?)').run(me.id, up.name, cleanText(body.title, 80) || 'নিজের সাউন্ড', Math.max(0, Math.min(600, Math.round(Number(body.secs) || 0))), now).lastInsertRowid);
    return json(res, 200, { sound: { id: 'snd:' + id, src: 'media/' + up.name, title: cleanText(body.title, 80) || 'নিজের সাউন্ড', user: { id: me.id, name: me.name, pic: me.pic_v } } });
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
    if (liked) { db.prepare('INSERT INTO post_likes (post, user, made) VALUES (?, ?, ?)').run(p.id, me.id, now); notify(p.user, me.id, 'like', p.id); }
    else unnotify(p.user, me.id, 'like', p.id);
    return json(res, 200, { liked, likes: p.hidelikes && p.user !== me.id ? null : count('SELECT COUNT(*) AS n FROM post_likes WHERE post = ?', p.id) });
  }
  if (action === 'comment') {
    if (p.nocomm && p.user !== me.id) return json(res, 403, { error: 'closed' });
    const text = cleanText(body.body, 500);
    if (!text) return json(res, 400, { error: 'bad request' });
    if (!allowSend(me.id)) return json(res, 429, { error: 'slow' });
    const id = Number(db.prepare('INSERT INTO post_comments (post, user, body, created) VALUES (?, ?, ?, ?)').run(p.id, me.id, text, now).lastInsertRowid);
    notify(p.user, me.id, 'comment', p.id, text.slice(0, 120));
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
function serveMedia(req, res, name, again) {
  const file = path.join(MEDIA_DIR, path.basename(name));
  fs.stat(file, (err, stat) => {
    const valid = /^[a-f0-9]{24}\.\w+$/.test(path.basename(name));
    // gone from this disk (a fresh deploy): fetched back from R2 once, then served as usual
    if (err && valid && !again) { mediaBack(path.basename(name)).then(found => (found ? serveMedia(req, res, name, true) : res.writeHead(404).end())); return; }
    if (err || !stat.isFile() || !valid) { res.writeHead(404).end(); return; }
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
const card = (u, meId) => ({ id: u.id, name: u.name, username: u.username || '', bio: u.bio, pic: u.pic_v ?? u.pic, points: u.points, verified: !!u.verified, relation: relationOf(meId, u.id) });

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
    const rows = db.prepare(`SELECT ${USER_COLS} FROM users WHERE banned = 0 AND id <> ?1 AND (lower(name) LIKE ?2 OR username LIKE ?2)
                             ORDER BY (username = ?4) DESC, (lower(name) LIKE ?3 OR username LIKE ?3) DESC, points DESC, id LIMIT 30`).all(meId, '%' + q + '%', q + '%', q.replace(/^@/, ''));
    return json(res, 200, { people: rows.map(u => card(u, meId)).filter(p => p.relation !== 'blocked').slice(0, 20) });
  }
  if (action === 'verified') return json(res, 200, { ids: db.prepare('SELECT id FROM users WHERE verified = 1 AND banned = 0').all().map(r => r.id) });
  if (action === 'insights') {                       // a person's own dashboard: reach and response to their posts
    if (!me) return json(res, 401, { error: 'login' });
    const days = 14, today = dayOf(Date.now()), since = (today - days + 1) * DAY - TZ;
    const daily = rows => { const out = Array(days).fill(0); for (const r of rows) { const i = days - 1 - (today - dayOf(r.t)); if (i >= 0 && i < days) out[i]++; } return out; };
    const likes = db.prepare('SELECT l.made AS t FROM post_likes l JOIN posts p ON p.id = l.post WHERE p.user = ?1 AND l.user <> ?1 AND l.made >= ?2').all(meId, since);
    const comments = db.prepare('SELECT c.created AS t FROM post_comments c JOIN posts p ON p.id = c.post WHERE p.user = ?1 AND c.user <> ?1 AND c.created >= ?2').all(meId, since);
    const fol = db.prepare("SELECT updated AS t FROM friends WHERE (a = ?1 OR b = ?1) AND updated >= ?2 AND (state = 'friends' OR (state = 'pending' AND actor <> ?1))").all(meId, since);
    return json(res, 200, {
      followers: followers(meId), following: following(meId), posts: count('SELECT COUNT(*) AS n FROM posts WHERE user = ?', meId),
      likes: count('SELECT COUNT(*) AS n FROM post_likes l JOIN posts p ON p.id = l.post WHERE p.user = ?1 AND l.user <> ?1', meId),
      comments: count('SELECT COUNT(*) AS n FROM post_comments c JOIN posts p ON p.id = c.post WHERE p.user = ?1 AND c.user <> ?1', meId),
      saves: count('SELECT COUNT(*) AS n FROM post_saves s JOIN posts p ON p.id = s.post WHERE p.user = ?1 AND s.user <> ?1', meId),
      views: db.prepare('SELECT COALESCE(SUM(views), 0) AS n FROM posts WHERE user = ?').get(meId).n,
      points: me.points, fares: count('SELECT COUNT(*) AS n FROM contributions WHERE user = ?', meId), verified: !!me.verified, joined: me.created,
      series: { likes: daily(likes), comments: daily(comments), followers: daily(fol) },
      top: db.prepare(`${POST_SELECT} AND p.user = ?2 ORDER BY (likes + comments * 2 + p.views / 10.0) DESC, p.id DESC LIMIT 6`).all(meId, meId).map(shownPost) });
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
const POINTS_PER_FARE = 10, FARE_MODES = ['bus', 'cng', 'launch'];   // what can be reported now (older reports of other kinds still show)
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

// ---- Creator program: earnings in taka, paid out to a mobile wallet ----
// A person who meets the rules (followers, posts, a clean record) applies; an admin approves. From then on the
// team can credit earnings to them (a creator bonus, a share of sponsorship, a prize) and they can ask for
// their balance to be paid to bKash, Nagad or Rocket. The payment itself is sent by the team from the
// business wallet and marked paid here with its transaction ID. The app collects no money from anyone.
db.exec(`CREATE TABLE IF NOT EXISTS earnings (id INTEGER PRIMARY KEY, user INTEGER NOT NULL, amount INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', by INTEGER NOT NULL, created INTEGER NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS payouts (id INTEGER PRIMARY KEY, user INTEGER NOT NULL, amount INTEGER NOT NULL, method TEXT NOT NULL, account TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', ref TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, updated INTEGER NOT NULL)`);
if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('users') WHERE name = 'creator'").get().n) db.exec("ALTER TABLE users ADD COLUMN creator TEXT NOT NULL DEFAULT ''");
const WALLETS = ['bkash', 'nagad', 'rocket'];
const creatorRules = () => {
  const n = (key, d) => { const v = Number((sq.setting.get(key) || {}).value); return Number.isFinite(v) && v >= 0 ? v : d; };
  return { followers: n('creator_followers', 100), posts: n('creator_posts', 5), payoutMin: n('payout_min', 500) };
};
const creatorOf = id => (db.prepare('SELECT creator FROM users WHERE id = ?').get(id) || {}).creator || '';
function balanceOf(id) {
  const earned = db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM earnings WHERE user = ?').get(id).n;
  const paid = db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM payouts WHERE user = ? AND status = 'paid'").get(id).n;
  const pending = db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM payouts WHERE user = ? AND status = 'pending'").get(id).n;
  return { earned, paid, pending, balance: earned - paid - pending };
}
function creatorStanding(u) {
  const rules = creatorRules(), f = followers(u.id), p = count('SELECT COUNT(*) AS n FROM posts WHERE user = ?', u.id);
  const reports = count("SELECT COUNT(*) AS n FROM reports WHERE about = ? AND status = 'open'", u.id);
  return { rules, followers: f, posts: p, reports, verified: !!u.verified, eligible: f >= rules.followers && p >= rules.posts && !reports };
}
const shownPayout = x => ({ id: x.id, amount: x.amount, method: x.method, account: x.account, status: x.status, ref: x.ref, note: x.note, created: x.created, updated: x.updated });

//   GET  /api/creator/me             -> { status, standing, money, earnings, payouts }
//   POST /api/creator/apply          POST /api/creator/payout {amount, method, account}     POST /api/creator/cancel {id}
async function creatorApi(req, res, action) {
  const me = userOf(req);
  if (!me) return json(res, 401, { error: 'login' });
  if (req.method === 'GET' && action === 'me') {
    return json(res, 200, { status: creatorOf(me.id), standing: creatorStanding(me), money: balanceOf(me.id),
      earnings: db.prepare('SELECT amount, note, created FROM earnings WHERE user = ? ORDER BY id DESC LIMIT 50').all(me.id),
      payouts: db.prepare('SELECT * FROM payouts WHERE user = ? ORDER BY id DESC LIMIT 50').all(me.id).map(shownPayout) });
  }
  if (req.method !== 'POST' || !(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 400, { error: 'bad request' });
  let body;
  try { body = JSON.parse(await readBody(req, 4000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }
  const now = Date.now(), status = creatorOf(me.id);
  if (action === 'apply') {
    if (status === 'approved' || status === 'applied') return json(res, 200, { status });
    if (!creatorStanding(me).eligible) return json(res, 403, { error: 'rules' });
    db.prepare("UPDATE users SET creator = 'applied' WHERE id = ?").run(me.id);
    return json(res, 200, { status: 'applied' });
  }
  if (action === 'payout') {
    if (status !== 'approved') return json(res, 403, { error: 'creator' });
    const amount = Math.floor(Number(body.amount)), account = String(body.account || '').replace(/[\s-]/g, '').replace(/^\+?88/, '');
    if (!WALLETS.includes(body.method) || !/^01[3-9]\d{8}$/.test(account)) return json(res, 400, { error: 'account' });
    const { balance } = balanceOf(me.id), { payoutMin } = creatorRules();
    if (!Number.isInteger(amount) || amount < payoutMin || amount > balance) return json(res, 400, { error: 'amount' });
    if (count("SELECT COUNT(*) AS n FROM payouts WHERE user = ? AND status = 'pending'", me.id)) return json(res, 409, { error: 'pending' });
    db.prepare('INSERT INTO payouts (user, amount, method, account, created, updated) VALUES (?, ?, ?, ?, ?, ?)').run(me.id, amount, body.method, account, now, now);
    return json(res, 200, { money: balanceOf(me.id) });
  }
  if (action === 'cancel') {
    db.prepare("UPDATE payouts SET status = 'rejected', note = 'নিজে বাতিল করেছেন', updated = ? WHERE id = ? AND user = ? AND status = 'pending'").run(now, Number(body.id), me.id);
    return json(res, 200, { money: balanceOf(me.id) });
  }
  json(res, 404, { error: 'not found' });
}

//   GET /api/notify/list -> { items, unread }     GET /api/notify/count -> { unread }     POST /api/notify/read
// ---- Live ----
// One person broadcasts from their camera; each viewer gets the stream straight from the broadcaster's browser
// (WebRTC, the broadcaster offering). The server keeps who is live and who watches, and passes on the signals,
// the comments and the hearts. A live that stops sending its heartbeat for 40 seconds has ended.
const lives = new Map();              // id -> { id, user, title, started, last, viewers: Set, comments: [] }
let liveSeq = 0;
const LIVE_MAX = 25;                  // viewers per live: each one is a separate upload from the broadcaster's phone
const liveCard = l => { const u = aq.byId.get(l.user); return { id: l.id, title: l.title, started: l.started, viewers: l.viewers.size, user: { id: u.id, name: u.name, username: u.username || '', pic: u.pic_v, verified: !!u.verified } }; };
function liveTell(l, event, data, except) { for (const id of [l.user, ...l.viewers]) if (id !== except) push(id, event, data); }
function endLive(l) {
  if (!lives.has(l.id)) return;
  lives.delete(l.id);
  liveTell(l, 'live-end', { live: l.id });
}
setInterval(() => { const t = Date.now(); for (const l of lives.values()) if (t - l.last > 40_000) endLive(l); }, 10_000).unref();
async function liveApi(req, res, action) {
  const me = userOf(req);
  if (action === 'list') return json(res, 200, { lives: [...lives.values()].filter(l => { const u = aq.byId.get(l.user); return u && !u.banned; }).sort((a, b) => b.viewers.size - a.viewers.size || b.started - a.started).map(liveCard) });
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  if (!me) return json(res, 401, { error: 'login' });
  let body;
  try { body = JSON.parse(await readBody(req, 20_000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }
  if (action === 'start') {
    if (!flagOn('posts') && me.role === 'user') return json(res, 403, { error: 'closed' });
    for (const l of lives.values()) if (l.user === me.id) endLive(l);
    const l = { id: ++liveSeq, user: me.id, title: cleanText(body.title, 80), started: Date.now(), last: Date.now(), viewers: new Set(), comments: [] };
    lives.set(l.id, l);
    tellFriends(me.id, 'live-start', liveCard(l));
    return json(res, 200, { live: liveCard(l), iceServers: await iceServers() });
  }
  const l = lives.get(Number(body.id));
  if (!l) return json(res, 404, { error: 'ended' });
  const host = l.user === me.id;
  if (action === 'ping') { if (host) l.last = Date.now(); return json(res, 200, { viewers: l.viewers.size }); }
  if (action === 'end') { if (host || me.role !== 'user') endLive(l); return json(res, 200, { ok: true }); }
  if (action === 'join') {
    if (host) return json(res, 400, { error: 'host' });
    if (!l.viewers.has(me.id) && l.viewers.size >= LIVE_MAX) return json(res, 429, { error: 'full' });
    l.viewers.add(me.id);
    push(l.user, 'live-join', { live: l.id, viewer: { id: me.id, name: me.name, pic: me.pic_v } });
    liveTell(l, 'live-count', { live: l.id, viewers: l.viewers.size });
    return json(res, 200, { live: liveCard(l), comments: l.comments.slice(-30), iceServers: await iceServers() });
  }
  if (action === 'leave') {
    if (l.viewers.delete(me.id)) { push(l.user, 'live-leave', { live: l.id, viewer: me.id }); liveTell(l, 'live-count', { live: l.id, viewers: l.viewers.size }); }
    return json(res, 200, { ok: true });
  }
  if (action === 'signal') {
    const to = Number(body.to);
    if (!(host ? l.viewers.has(to) : l.viewers.has(me.id) && to === l.user)) return json(res, 403, { error: 'not in this live' });
    push(to, 'live-signal', { live: l.id, from: me.id, data: body.data });
    return json(res, 200, { ok: true });
  }
  if (action === 'comment' || action === 'heart') {
    if (!host && !l.viewers.has(me.id)) return json(res, 403, { error: 'not in this live' });
    if (!allowSend(me.id)) return json(res, 429, { error: 'slow' });
    if (action === 'heart') { liveTell(l, 'live-heart', { live: l.id, from: me.id }, me.id); return json(res, 200, { ok: true }); }
    const text = cleanText(body.body, 200);
    if (!text) return json(res, 400, { error: 'bad request' });
    const c = { id: Date.now() + Math.random(), body: text, user: { id: me.id, name: me.name, pic: me.pic_v } };
    l.comments.push(c);
    if (l.comments.length > 100) l.comments.shift();
    liveTell(l, 'live-comment', { live: l.id, comment: c });
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'not found' });
}

async function notifyApi(req, res, action) {
  const me = userOf(req);
  if (!me) return json(res, 401, { error: 'login' });
  if (action === 'count') return json(res, 200, { unread: count('SELECT COUNT(*) AS n FROM notifications WHERE user = ? AND seen = 0', me.id) });
  if (action === 'list') {
    const rows = db.prepare(`SELECT n.*, u.name, u.username, u.pic_v, u.verified, p.kind AS pkind, p.file, p.poster, p.caption FROM notifications n JOIN users u ON u.id = n.actor
      LEFT JOIN posts p ON p.id = n.post WHERE n.user = ? AND u.banned = 0 ORDER BY n.id DESC LIMIT 80`).all(me.id);
    return json(res, 200, { unread: rows.filter(r => !r.seen).length, items: rows.map(r => ({ id: r.id, kind: r.kind, body: r.body, created: r.created, seen: !!r.seen,
      actor: { id: r.actor, name: r.name, username: r.username, pic: r.pic_v, verified: !!r.verified, relation: relationOf(me.id, r.actor) },
      post: r.post && r.pkind ? { id: r.post, kind: r.pkind, thumb: r.pkind === 'video' ? (r.poster ? 'media/' + r.poster : '') : r.pkind === 'photo' ? 'media/' + r.file : '', text: r.pkind === 'text' ? r.caption.slice(0, 60) : '' } : null })) });
  }
  if (action === 'read' && req.method === 'POST') {
    db.prepare('UPDATE notifications SET seen = 1 WHERE user = ? AND seen = 0').run(me.id);
    return json(res, 200, { ok: true });
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
const briefUser = u => u && ({ id: u.id, name: u.name, email: u.email, pic: u.pic_v, role: u.role, banned: u.banned, verified: !!u.verified, created: u.created, seen: u.seen, online: isOnline(u.id) });

async function adminApi(req, res, action, query) {
  const me = userOf(req);
  if (!me || (me.role !== 'admin' && me.role !== 'staff')) return json(res, 403, { error: 'forbidden' });
  const admin = me.role === 'admin', now = Date.now();
  const log = (what, target, detail = '') => sq.audit.run(me.id, what, String(target), detail, now);

  if (req.method === 'GET') {
    if (action === 'me') return json(res, 200, { user: publicUser(me).user });
    if (action === 'gems') {                          // hidden gems people sent: waiting, approved or turned down
      const status = ['pending', 'ok', 'no'].includes(query.get('status')) ? query.get('status') : 'pending';
      const rows = db.prepare(`SELECT g.*, u.name AS uname, u.email AS uemail, u.pic_v AS upic, u.points AS upoints FROM gems g JOIN users u ON u.id = g.user
        WHERE g.status = ? ORDER BY ${status === 'pending' ? 'g.id' : 'g.decided DESC'} LIMIT 200`).all(status);
      return json(res, 200, { gems: rows.map(g => ({ ...shownGem(g), decided: g.decided, user: { id: g.user, name: g.uname, email: g.uemail, pic: g.upic, points: g.upoints } })),
        waiting: count("SELECT COUNT(*) AS n FROM gems WHERE status = 'pending'") });
    }
    if (action === 'place-photos') {                  // photos of places, waiting for a yes or no (or the latest decided)
      const status = ['pending', 'ok', 'no'].includes(query.get('status')) ? query.get('status') : 'pending';
      const rows = db.prepare(`SELECT p.*, u.name AS uname, u.email AS uemail, u.pic_v AS upic, u.points AS upoints FROM place_photos p JOIN users u ON u.id = p.user
        WHERE p.status = ? ORDER BY ${status === 'pending' ? 'p.id' : 'p.decided DESC'} LIMIT 200`).all(status);
      return json(res, 200, { photos: rows.map(p => ({ id: p.id, key: p.key, district: p.district, name: p.name, src: '/media/' + p.file, created: p.created, decided: p.decided,
        user: { id: p.user, name: p.uname, email: p.uemail, pic: p.upic, points: p.upoints } })), waiting: count("SELECT COUNT(*) AS n FROM place_photos WHERE status = 'pending'") });
    }
    if (action === 'overview') {
      const dayStart = dayOf(now) * DAY - TZ;
      return json(res, 200, {
        users: count('SELECT COUNT(*) AS n FROM users'), usersToday: count('SELECT COUNT(*) AS n FROM users WHERE created >= ?', dayStart),
        activeToday: count('SELECT COUNT(*) AS n FROM users WHERE seen >= ?', dayStart), active7: count('SELECT COUNT(*) AS n FROM users WHERE seen >= ?', now - 7 * DAY),
        online: streams.size, banned: count('SELECT COUNT(*) AS n FROM users WHERE banned = 1'),
        messages: count('SELECT COUNT(*) AS n FROM messages'), messagesToday: count('SELECT COUNT(*) AS n FROM messages WHERE sent >= ?', dayStart),
        friendships: count("SELECT COUNT(*) AS n FROM friends WHERE state = 'friends'"),
        ticketsOpen: count("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'"), tickets: count('SELECT COUNT(*) AS n FROM tickets'),
        reportsOpen: count("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"), placePhotosWaiting: count("SELECT COUNT(*) AS n FROM place_photos WHERE status = 'pending'"), gemsWaiting: count("SELECT COUNT(*) AS n FROM gems WHERE status = 'pending'"),
        ratings: count('SELECT COUNT(*) AS n FROM ratings'), fares: count('SELECT COUNT(*) AS n FROM fare_reports') + count('SELECT COUNT(*) AS n FROM contributions'),
        posts: count('SELECT COUNT(*) AS n FROM posts'), postsToday: count('SELECT COUNT(*) AS n FROM posts WHERE created >= ?', dayStart),
        signups: series('users', 'created', 14), chats: series('messages', 'sent', 14), support: series('tickets', 'created', 14),
        postsSeries: series('posts', 'created', 14), likesSeries: series('post_likes', 'made', 14), faresSeries: series('contributions', 'created', 14),
        groups: count('SELECT COUNT(*) AS n FROM chat_groups'), stories: count('SELECT COUNT(*) AS n FROM stories'), comments: count('SELECT COUNT(*) AS n FROM post_comments'),
        calls: groupCalls.size, verified: count('SELECT COUNT(*) AS n FROM users WHERE verified = 1'), twofa: count('SELECT COUNT(*) AS n FROM users WHERE totp_on = 1'),
        creatorsWaiting: count("SELECT COUNT(*) AS n FROM users WHERE creator = 'applied'"), payoutsWaiting: count("SELECT COUNT(*) AS n FROM payouts WHERE status = 'pending'"),
        payoutsPendingTaka: db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM payouts WHERE status = 'pending'").get().n,
        verifyWaiting: count("SELECT COUNT(*) AS n FROM tickets WHERE category = 'verify' AND status <> 'closed'"),
        topPosters: db.prepare(`SELECT u.id, u.name, u.pic_v AS pic, COUNT(p.id) AS n FROM posts p JOIN users u ON u.id = p.user GROUP BY u.id ORDER BY n DESC LIMIT 5`).all(),
        flags: { signups: flagOn('signups'), posts: flagOn('posts') },
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
      return json(res, 200, { user: { ...briefUser(u), bio: u.bio, username: u.username, twofa: !!u.totp_on, creator: creatorOf(u.id) }, stats: {
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
      const rows = db.prepare(`${POST_SELECT} AND p.id < ?2 ORDER BY p.id DESC LIMIT 60`).all(-1, Number(query.get('before')) || Number.MAX_SAFE_INTEGER);
      return json(res, 200, { posts: rows.map(p => ({ ...shownPost(p), email: aq.byId.get(p.user).email })) });
    }
    if (action === 'flags') return json(res, 200, { flags: { signups: flagOn('signups'), posts: flagOn('posts'), chat: flagOn('chat') } });
    if (action === 'search') {                          // one box for people, posts and groups
      const q = '%' + (query.get('q') || '').trim().toLowerCase().replace(/[%_]/g, '') + '%';
      return json(res, 200, {
        users: db.prepare(`SELECT ${USER_COLS} FROM users WHERE lower(name) LIKE ?1 OR email LIKE ?1 OR username LIKE ?1 ORDER BY id DESC LIMIT 12`).all(q).map(briefUser),
        posts: db.prepare(`${POST_SELECT} AND lower(p.caption) LIKE ?2 ORDER BY p.id DESC LIMIT 12`).all(-1, q).map(shownPost),
        groups: db.prepare('SELECT id, name, created FROM chat_groups WHERE lower(name) LIKE ? ORDER BY id DESC LIMIT 12').all(q) });
    }
    if (action === 'groups') {                          // group chats: names and numbers only, never their messages
      const rows = db.prepare(`SELECT g.id, g.name, g.created, u.name AS owner, (SELECT COUNT(*) FROM group_members m WHERE m.grp = g.id) AS members,
        (SELECT COUNT(*) FROM messages x WHERE x.grp = g.id AND x.kind <> 'sys') AS messages, (SELECT MAX(sent) FROM messages x WHERE x.grp = g.id) AS active
        FROM chat_groups g LEFT JOIN users u ON u.id = g.owner ORDER BY active DESC LIMIT 200`).all();
      return json(res, 200, { groups: rows.map(g => ({ ...g, call: callOf(g.id) })), calls: groupCalls.size });
    }
    if (action === 'stories') return json(res, 200, { stories: db.prepare('SELECT s.id, s.kind, s.file, s.poster, s.created, u.id AS uid, u.name, u.email, u.pic_v AS pic FROM stories s JOIN users u ON u.id = s.user ORDER BY s.id DESC LIMIT 200').all()
      .map(s => ({ id: s.id, kind: s.kind, src: 'media/' + s.file, poster: s.poster ? 'media/' + s.poster : '', created: s.created, user: { id: s.uid, name: s.name, email: s.email, pic: s.pic } })) });
    if (action === 'sounds') return json(res, 200, { sounds: db.prepare('SELECT s.id, s.title, s.file, s.created, u.id AS uid, u.name, u.email, (SELECT COUNT(*) FROM posts x WHERE x.music = \'snd:\' || s.id) AS uses FROM sounds s JOIN users u ON u.id = s.user ORDER BY s.id DESC LIMIT 200').all()
      .map(s => ({ id: s.id, title: s.title, src: 'media/' + s.file, created: s.created, uses: s.uses, user: { id: s.uid, name: s.name, email: s.email } })) });
    if (action === 'comments') return json(res, 200, { comments: db.prepare(`SELECT c.id, c.body, c.created, c.post, u.id AS uid, u.name, u.email, u.pic_v AS pic FROM post_comments c JOIN users u ON u.id = c.user ORDER BY c.id DESC LIMIT 200`).all()
      .map(c => ({ id: c.id, body: c.body, created: c.created, post: c.post, user: { id: c.uid, name: c.name, email: c.email, pic: c.pic } })) });
    if (action === 'sessions') {                        // where one person is signed in
      const rows = db.prepare('SELECT token, agent, made, last, ip FROM sessions WHERE user = ? AND expires > ? ORDER BY last DESC').all(Number(query.get('id')), now);
      return json(res, 200, { sessions: rows.map(s => ({ id: s.token.slice(0, 16), agent: s.agent || 'Browser', made: s.made, last: s.last, ip: s.ip })) });
    }
    if (action === 'export') {                          // every account, as a spreadsheet
      const rows = db.prepare(`SELECT ${USER_COLS} FROM users ORDER BY id`).all();
      const cell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
      const csv = '\ufeff' + [['id', 'name', 'username', 'email', 'role', 'verified', 'banned', 'points', 'followers', 'posts', 'joined', 'last seen'].join(','),
        ...rows.map(u => [u.id, u.name, u.username, u.email, u.role, u.verified ? 'yes' : '', u.banned ? 'yes' : '', u.points, followers(u.id), count('SELECT COUNT(*) AS n FROM posts WHERE user = ?', u.id),
          new Date(u.created).toISOString().slice(0, 10), u.seen ? new Date(u.seen).toISOString().slice(0, 10) : ''].map(cell).join(','))].join('\r\n');
      log('export', 'users', rows.length + ' rows');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bdmap-users-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' });
      res.end(csv);
      return;
    }
    if (action === 'creators') {
      const rows = db.prepare(`SELECT ${USER_COLS}, creator FROM users WHERE creator <> '' ORDER BY CASE creator WHEN 'applied' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, id DESC LIMIT 200`).all();
      return json(res, 200, { rules: creatorRules(), creators: rows.map(u => ({ ...briefUser(u), creator: u.creator, standing: creatorStanding(u), money: balanceOf(u.id) })),
        totals: { earned: db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM earnings').get().n, paid: db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM payouts WHERE status = 'paid'").get().n,
                  pending: db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM payouts WHERE status = 'pending'").get().n } });
    }
    if (action === 'payouts') {
      const status = query.get('status') || 'pending';
      const rows = db.prepare(`SELECT x.*, u.name, u.email, u.pic_v AS pic FROM payouts x JOIN users u ON u.id = x.user WHERE ?1 = 'all' OR x.status = ?1 ORDER BY x.id DESC LIMIT 200`).all(status);
      return json(res, 200, { payouts: rows.map(x => ({ ...shownPayout(x), user: { id: x.user, name: x.name, email: x.email, pic: x.pic } })) });
    }
    if (action === 'audit') return json(res, 200, { audit: db.prepare('SELECT x.id, x.action, x.target, x.detail, x.at, u.name FROM audit x LEFT JOIN users u ON u.id = x.actor ORDER BY x.id DESC LIMIT 150').all() });
    if (action === 'system') {
      let size = 0;
      try { size = fs.statSync(path.join(DATA_DIR, 'ratings.db')).size; } catch { /* not created yet */ }
      return json(res, 200, { mail: mailReady, mailFrom: MAIL.from || '', turn: hasTurn(), admins: ADMIN_EMAILS, dbBytes: size, dataDir: process.env.DATA_DIR ? 'DATA_DIR' : 'app folder',
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
    if (body.do === 'verify' || body.do === 'unverify') {          // the badge: an admin may give it, also to themselves
      if (!admin) return json(res, 403, { error: 'forbidden' });
      db.prepare('UPDATE users SET verified = ? WHERE id = ?').run(body.do === 'verify' ? 1 : 0, u.id);
      log(body.do, u.email);
      return json(res, 200, { ok: true });
    }
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
      if (mailReady && owner) sendMail(owner.email, MAILS.supportMail(t.subject, text)).catch(e => console.error('mail failed:', e.message));
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
  if (action === 'gem') {                            // approve a hidden gem (its sender earns points) or turn it down
    const g = db.prepare('SELECT * FROM gems WHERE id = ?').get(Number(body.id));
    if (!g) return json(res, 404, { error: 'not found' });
    const to = body.do === 'approve' ? 'ok' : body.do === 'reject' ? 'no' : '';
    if (!to) return json(res, 400, { error: 'bad request' });
    if (g.status !== to) {
      db.prepare('UPDATE gems SET status = ?, decided = ?, by = ? WHERE id = ?').run(to, now, me.id, g.id);
      if (to === 'ok') db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(POINTS_PER_GEM, g.user);
      if (g.status === 'ok') db.prepare('UPDATE users SET points = MAX(0, points - ?) WHERE id = ?').run(POINTS_PER_GEM, g.user);
      log(to === 'ok' ? 'gem approved' : 'gem rejected', 'gem ' + g.id, g.name);
    }
    return json(res, 200, { ok: true });
  }
  if (action === 'place-photo') {                    // approve a place photo (its taker earns points) or turn it down
    const p = db.prepare('SELECT * FROM place_photos WHERE id = ?').get(Number(body.id));
    if (!p) return json(res, 404, { error: 'not found' });
    const to = body.do === 'approve' ? 'ok' : body.do === 'reject' ? 'no' : '';
    if (!to) return json(res, 400, { error: 'bad request' });
    if (p.status !== to) {
      db.prepare('UPDATE place_photos SET status = ?, decided = ?, by = ? WHERE id = ?').run(to, now, me.id, p.id);
      if (to === 'ok' && p.status !== 'ok') db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(POINTS_PER_PHOTO, p.user);
      if (p.status === 'ok' && to !== 'ok') db.prepare('UPDATE users SET points = MAX(0, points - ?) WHERE id = ?').run(POINTS_PER_PHOTO, p.user);
      log(to === 'ok' ? 'place photo approved' : 'place photo rejected', 'photo ' + p.id, p.name);
    }
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
  if (action === 'flags') {                           // switch sign-ups or posting off and on for everyone
    for (const k of ['signups', 'posts']) if (typeof body[k] === 'boolean') { sq.setSet.run('flag_' + k, body[k] ? '1' : '0'); log('flag', k, body[k] ? 'on' : 'off'); }
    return json(res, 200, { flags: { signups: flagOn('signups'), posts: flagOn('posts') } });
  }
  if (action === 'story') {
    const st = db.prepare('SELECT * FROM stories WHERE id = ?').get(Number(body.id));
    if (st) { deleteStory(st); log('story removed', 'story ' + st.id); }
    return json(res, 200, { ok: true });
  }
  if (action === 'sound') {
    const s = db.prepare('SELECT * FROM sounds WHERE id = ?').get(Number(String(body.id).replace('snd:', '')));
    if (s) { unlinkMedia(s.file); db.prepare('DELETE FROM sounds WHERE id = ?').run(s.id); db.prepare("UPDATE posts SET music = '' WHERE music = ?").run('snd:' + s.id); log('sound removed', 'sound ' + s.id, s.title); }
    return json(res, 200, { ok: true });
  }
  if (action === 'comment') {
    const c = db.prepare('SELECT * FROM post_comments WHERE id = ?').get(Number(body.id));
    if (c) { db.prepare('DELETE FROM post_comments WHERE id = ?').run(c.id); log('comment removed', 'post ' + c.post, cleanText(c.body, 80)); }
    return json(res, 200, { ok: true });
  }
  if (action === 'session-end') {
    db.prepare('DELETE FROM sessions WHERE user = ? AND substr(token, 1, 16) = ?').run(Number(body.user), String(body.id || ''));
    log('signout', 'user ' + body.user, 'one device');
    return json(res, 200, { ok: true });
  }
  if (action === 'group') {                            // close a group (its messages go with it)
    const g = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(Number(body.id));
    if (!g) return json(res, 404, { error: 'not found' });
    const members = gq.members.all(g.id).map(m => m.id);
    for (const id of members) leaveGroup(g.id, id);
    for (const id of members) push(id, 'friends', {});
    log('group removed', 'group ' + g.id, g.name);
    return json(res, 200, { ok: true });
  }
  if (action === 'creator') {                         // approve, refuse or end a creator; credit earnings
    const u = aq.byId.get(Number(body.id));
    if (!u) return json(res, 404, { error: 'not found' });
    if (body.do === 'approve' || body.do === 'reject' || body.do === 'revoke') {
      db.prepare('UPDATE users SET creator = ? WHERE id = ?').run(body.do === 'approve' ? 'approved' : body.do === 'reject' ? 'rejected' : '', u.id);
      log('creator ' + body.do, u.email, cleanText(body.note, 200));
    } else if (body.do === 'credit') {
      const amount = Math.round(Number(body.amount)), note = cleanText(body.note, 120);
      if (creatorOf(u.id) !== 'approved') return json(res, 400, { error: 'creator' });
      if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000 || !note) return json(res, 400, { error: 'bad request' });
      if (amount < 0 && balanceOf(u.id).balance + amount < 0) return json(res, 400, { error: 'balance' });
      db.prepare('INSERT INTO earnings (user, amount, note, by, created) VALUES (?, ?, ?, ?, ?)').run(u.id, amount, note, me.id, now);
      log('earning', u.email, `${amount} ৳ — ${note}`);
    } else return json(res, 400, { error: 'bad request' });
    push(u.id, 'creator', {});
    return json(res, 200, { ok: true });
  }
  if (action === 'payout') {                          // after sending the money from the business wallet
    const x = db.prepare('SELECT * FROM payouts WHERE id = ?').get(Number(body.id));
    if (!x || x.status !== 'pending') return json(res, 404, { error: 'not found' });
    if (body.do === 'paid') {
      const ref = cleanText(body.ref, 40);
      if (ref.length < 4) return json(res, 400, { error: 'ref' });
      db.prepare("UPDATE payouts SET status = 'paid', ref = ?, updated = ? WHERE id = ?").run(ref, now, x.id);
      log('payout paid', 'payout ' + x.id, `${x.amount} ৳ · ${x.method} · ${ref}`);
      const owner = aq.byId.get(x.user);
      if (mailReady && owner) sendMail(owner.email, MAILS.payoutMail(x.amount, x.method, ref)).catch(e => console.error('mail failed:', e.message));
    } else if (body.do === 'reject') {
      db.prepare("UPDATE payouts SET status = 'rejected', note = ?, updated = ? WHERE id = ?").run(cleanText(body.note, 200) || 'বাতিল', now, x.id);
      log('payout rejected', 'payout ' + x.id, cleanText(body.note, 200));
    } else return json(res, 400, { error: 'bad request' });
    push(x.user, 'creator', {});
    return json(res, 200, { ok: true });
  }
  if (action === 'rules') {
    for (const [key, v, max] of [['creator_followers', body.followers, 1e6], ['creator_posts', body.posts, 1e5], ['payout_min', body.min, 1e6]]) {
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n >= 0 && n <= max) sq.setSet.run(key, String(n));
    }
    log('creator rules', 'app', JSON.stringify(creatorRules()));
    return json(res, 200, { rules: creatorRules() });
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
  if (!allowWrite(clientIp(req))) return json(res, 429, { error: 'too many ratings, try again in a minute' });

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad request' }); }
  const { key, stars, device } = body || {};
  const okKey = typeof key === 'string' && key.length >= 3 && key.length <= 200;
  const okDevice = typeof device === 'string' && /^[\w-]{8,64}$/.test(device);
  if (!okKey || !okDevice || !Number.isInteger(stars) || stars < 0 || stars > 5) return json(res, 400, { error: 'bad request' });

  const user = userOf(req);
  if (!user) return json(res, 401, { error: 'login' });           // one rating per account (S1)
  const voter = 'u' + user.id;
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
  if (!allowWrite(clientIp(req))) return json(res, 429, { error: 'too many reports, try again in a minute' });
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

// Cache versions: each page names its own scripts and styles as file?v=<hash of the file>, so a phone keeps them for
// a year and asks again only when one changes — no 30 round trips on every visit. vendor/ files carry their
// version in the name. The pages themselves stay no-cache, so a new version is seen on the next visit.
const assetHashes = new Map();     // path -> { key: mtime+size, v }
function assetVersion(rel) {
  const file = path.join(ROOT, rel);
  let st; try { st = fs.statSync(file); } catch { return ''; }
  const key = st.mtimeMs + ':' + st.size, hit = assetHashes.get(rel);
  if (hit && hit.key === key) return hit.v;
  const v = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
  assetHashes.set(rel, { key, v });
  return v;
}
const versionPage = html => html.replace(/(<(?:script|link)\b[^>]*?\b(?:src|href)=")((?:js|css|data)\/[\w./-]+\.(?:js|css))(")/g,
  (all, a, rel, b) => { const v = assetVersion(rel); return v ? a + rel + '?v=' + v + b : all; });
function serveFile(req, res, pathname, versioned) {
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
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    if (path.extname(file) === '.html') {
      fs.readFile(file, 'utf8', (e, html) => {
        if (e) { res.writeHead(500).end(); return; }
        const body = Buffer.from(versionPage(html));
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : body);
      });
      return;
    }
    const forever = versioned || parts[0] === 'vendor';
    // no-cache: the browser keeps a copy but checks it is current, so app updates show up on refresh.
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size,
                         'Cache-Control': forever ? 'public, max-age=31536000, immutable' : 'no-cache' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  });
}

// ---- Places: photos people took there (shown once an admin approves them) and reviews ----
// A place is keyed "district|article title" (or its name when it has no article). A photo is uploaded the usual way
// (POST /api/explore/media), then offered here; it waits until approved, and its taker earns POINTS_PER_PHOTO.
//   GET  /api/places/summary?d=district  -> { places: { key: { photo, photos, stars, reviews } } }
//   GET  /api/places/place?key=          -> { photos: [{ id, file, by }], reviews: [{ by, stars, body, created }], stars, n, mine: { review, waiting } }
//   POST /api/places/photo  { key, name, media }        -> { waiting }        (login)
//   POST /api/places/review { key, name, stars, body }  -> { stars, n }       (login; one per person, sent again it is replaced)
//   POST /api/places/unreview { key }                   -> { stars, n }
db.exec(`CREATE TABLE IF NOT EXISTS place_photos (id INTEGER PRIMARY KEY, key TEXT NOT NULL, district TEXT NOT NULL, name TEXT NOT NULL, user INTEGER NOT NULL,
  file TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL, decided INTEGER NOT NULL DEFAULT 0, by INTEGER NOT NULL DEFAULT 0)`);
db.exec('CREATE INDEX IF NOT EXISTS place_photos_key ON place_photos (key, status)');
db.exec(`CREATE TABLE IF NOT EXISTS place_reviews (key TEXT NOT NULL, district TEXT NOT NULL, name TEXT NOT NULL, user INTEGER NOT NULL, stars INTEGER NOT NULL,
  body TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, PRIMARY KEY (key, user))`);
const POINTS_PER_PHOTO = 3;
const placeKey = v => { const k = cleanText(v, 200); return /^[a-z]{3,20}\|.{2,}$/.test(k) ? k : ''; };
const reviewTally = key => db.prepare('SELECT COALESCE(ROUND(AVG(r.stars), 1), 0) AS stars, COUNT(*) AS n FROM place_reviews r JOIN users u ON u.id = r.user WHERE r.key = ? AND u.banned = 0').get(key);
const placePerson = (id, name, pic) => ({ id, name, pic });

// ---- "যেতে চাই" kept with the account, and লুকানো রত্ন: places people know that the guide does not ----
//   GET  /api/places/wants                 -> { keys: [...] }                      (login)
//   POST /api/places/want  { key, on }      -> { keys }                             (login)
//   POST /api/places/wants-merge { keys }   -> { keys }   the phone's list joins the account's after signing in
//   GET  /api/places/gems?d=district        -> { gems: [...] }   approved ones (all districts, newest first, without d)
//   POST /api/places/gem { district, name, kind, where, about, how, lat, lon, media: [up to 3] }  -> { id }  (login; waits for an admin)
db.exec('CREATE TABLE IF NOT EXISTS place_wants (user INTEGER NOT NULL, key TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (user, key))');
db.exec(`CREATE TABLE IF NOT EXISTS gems (id INTEGER PRIMARY KEY, user INTEGER NOT NULL, district TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
  place TEXT NOT NULL DEFAULT '', about TEXT NOT NULL DEFAULT '', how TEXT NOT NULL DEFAULT '', lat REAL, lon REAL, files TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL, decided INTEGER NOT NULL DEFAULT 0, by INTEGER NOT NULL DEFAULT 0)`);
db.exec('CREATE INDEX IF NOT EXISTS gems_district ON gems (district, status)');
const POINTS_PER_GEM = 5, GEM_KINDS = ['water', 'river', 'hill', 'heritage', 'faith', 'wetland', 'village', 'other'];
const wantKeys = userId => db.prepare('SELECT key FROM place_wants WHERE user = ? ORDER BY created DESC').all(userId).map(r => r.key);
const shownGem = g => ({ id: g.id, district: g.district, name: g.name, kind: g.kind, place: g.place, about: g.about, how: g.how, lat: g.lat, lon: g.lon,
  photos: JSON.parse(g.files || '[]').map(f => '/media/' + f), by: { id: g.user, name: g.uname, pic: g.upic }, created: g.created });
const GEM_SELECT = 'SELECT g.*, u.name AS uname, u.pic_v AS upic FROM gems g JOIN users u ON u.id = g.user WHERE u.banned = 0';

async function gemsApi(req, res, action, query, me) {
  const now = Date.now();
  if (req.method === 'GET' && action === 'gems') {
    const d = cleanText(query.get('d'), 20);
    const rows = /^[a-z]{3,20}$/.test(d) ? db.prepare(`${GEM_SELECT} AND g.district = ? AND g.status = 'ok' ORDER BY g.decided DESC LIMIT 60`).all(d)
      : db.prepare(`${GEM_SELECT} AND g.status = 'ok' ORDER BY g.decided DESC LIMIT 24`).all();
    return json(res, 200, { gems: rows.map(shownGem) });
  }
  if (req.method === 'GET' && action === 'feed') {   // মেঠোপথ: the newest approved photos of places, and who shares most
    const photos = db.prepare(`SELECT p.id, p.key, p.district, p.name, p.file, p.decided, u.id AS uid, u.name AS uname, u.pic_v AS upic FROM place_photos p JOIN users u ON u.id = p.user
      WHERE p.status = 'ok' AND u.banned = 0 ORDER BY p.decided DESC LIMIT 60`).all().map(p => ({ id: p.id, key: p.key, district: p.district, name: p.name, src: '/media/' + p.file, at: p.decided, by: { id: p.uid, name: p.uname, pic: p.upic } }));
    const top = db.prepare(`SELECT u.id, u.name, u.pic_v AS pic, (SELECT COUNT(*) FROM place_photos x WHERE x.user = u.id AND x.status = 'ok') AS photos,
      (SELECT COUNT(*) FROM gems y WHERE y.user = u.id AND y.status = 'ok') AS gems FROM users u WHERE u.banned = 0 AND (photos > 0 OR gems > 0) ORDER BY photos + gems * 2 DESC LIMIT 10`).all();
    return json(res, 200, { photos, top, counts: { photos: count("SELECT COUNT(*) AS n FROM place_photos WHERE status = 'ok'"), gems: count("SELECT COUNT(*) AS n FROM gems WHERE status = 'ok'"), people: count("SELECT COUNT(*) AS n FROM (SELECT user FROM place_photos WHERE status = 'ok' UNION SELECT user FROM gems WHERE status = 'ok')") } });
  }
  if (req.method === 'GET' && action === 'wants') {
    if (!me) return json(res, 401, { error: 'login' });
    return json(res, 200, { keys: wantKeys(me.id) });
  }
  if (req.method !== 'POST') return null;
  if (!me) { req.resume(); return json(res, 401, { error: 'login' }); }
  let body;
  try { body = JSON.parse(await readBody(req, 30000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }
  if (action === 'want') {
    const key = placeKey(body.key);
    if (!key) return json(res, 400, { error: 'bad request' });
    if (body.on) {
      if (count('SELECT COUNT(*) AS n FROM place_wants WHERE user = ?', me.id) >= 500) return json(res, 429, { error: 'full' });
      db.prepare('INSERT OR IGNORE INTO place_wants (user, key, created) VALUES (?, ?, ?)').run(me.id, key, now);
    } else db.prepare('DELETE FROM place_wants WHERE user = ? AND key = ?').run(me.id, key);
    return json(res, 200, { keys: wantKeys(me.id) });
  }
  if (action === 'wants-merge') {
    const add = db.prepare('INSERT OR IGNORE INTO place_wants (user, key, created) VALUES (?, ?, ?)');
    for (const k of (Array.isArray(body.keys) ? body.keys : []).slice(0, 300).map(placeKey).filter(Boolean)) add.run(me.id, k, now);
    return json(res, 200, { keys: wantKeys(me.id) });
  }
  if (action === 'gem') {
    const district = cleanText(body.district, 20), name = cleanText(body.name, 80), about = cleanText(body.about, 2000);
    if (!/^[a-z]{3,20}$/.test(district) || name.length < 2 || about.length < 20 || !GEM_KINDS.includes(body.kind)) return json(res, 400, { error: 'bad request' });
    if (count('SELECT COUNT(*) AS n FROM gems WHERE user = ? AND created > ?', me.id, now - 864e5) >= 5) return json(res, 429, { error: 'slow' });
    const files = [];
    for (const m of (Array.isArray(body.media) ? body.media : []).slice(0, 3)) {
      const up = db.prepare('SELECT * FROM uploads WHERE name = ? AND user = ? AND used = 0').get(String(m), me.id);
      if (up && up.kind === 'photo') { files.push(up.name); db.prepare('UPDATE uploads SET used = 1 WHERE name = ?').run(up.name); }
    }
    const lat = Number(body.lat), lon = Number(body.lon), inBd = lat > 20.3 && lat < 26.8 && lon > 88 && lon < 92.8;
    const id = Number(db.prepare(`INSERT INTO gems (user, district, name, kind, place, about, how, lat, lon, files, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(me.id, district, name, body.kind, cleanText(body.where, 160), about, cleanText(body.how, 1000), inBd ? lat : null, inBd ? lon : null, JSON.stringify(files), now).lastInsertRowid);
    return json(res, 200, { id });
  }
  return null;
}


async function placesApi(req, res, action, query) {
  const me = userOf(req), now = Date.now();
  if (['gems', 'wants', 'want', 'wants-merge', 'gem', 'feed'].includes(action)) { const done = await gemsApi(req, res, action, query, me); if (done !== null) return done; return json(res, 404, { error: 'not found' }); }
  if (req.method === 'GET') {
    if (action === 'summary') {
      const d = cleanText(query.get('d'), 20);
      if (!/^[a-z]{3,20}$/.test(d)) return json(res, 400, { error: 'bad request' });
      const places = {};
      for (const p of db.prepare(`SELECT key, COUNT(*) AS n, (SELECT file FROM place_photos q WHERE q.key = p.key AND q.status = 'ok' ORDER BY q.decided DESC LIMIT 1) AS file
                                  FROM place_photos p WHERE district = ? AND status = 'ok' GROUP BY key`).all(d))
        places[p.key] = { photo: '/media/' + p.file, photos: p.n, stars: 0, reviews: 0 };
      for (const r of db.prepare('SELECT r.key, ROUND(AVG(r.stars), 1) AS stars, COUNT(*) AS n FROM place_reviews r JOIN users u ON u.id = r.user WHERE r.district = ? AND u.banned = 0 GROUP BY r.key').all(d))
        Object.assign(places[r.key] = places[r.key] || { photo: '', photos: 0 }, { stars: r.stars, reviews: r.n });
      return json(res, 200, { places });
    }
    if (action === 'place') {
      const key = placeKey(query.get('key'));
      if (!key) return json(res, 400, { error: 'bad request' });
      const photos = db.prepare(`SELECT p.id, p.file, u.id AS uid, u.name, u.pic_v AS pic FROM place_photos p JOIN users u ON u.id = p.user
        WHERE p.key = ? AND p.status = 'ok' AND u.banned = 0 ORDER BY p.decided DESC LIMIT 20`).all(key).map(p => ({ id: p.id, file: '/media/' + p.file, by: placePerson(p.uid, p.name, p.pic) }));
      const reviews = db.prepare(`SELECT r.stars, r.body, r.created, u.id AS uid, u.name, u.pic_v AS pic FROM place_reviews r JOIN users u ON u.id = r.user
        WHERE r.key = ? AND u.banned = 0 ORDER BY (r.body <> '') DESC, r.created DESC LIMIT 50`).all(key).map(r => ({ by: placePerson(r.uid, r.name, r.pic), stars: r.stars, body: r.body, created: r.created }));
      const t = reviewTally(key);
      const mine = me && {
        review: db.prepare('SELECT stars, body FROM place_reviews WHERE key = ? AND user = ?').get(key, me.id) || null,
        waiting: count("SELECT COUNT(*) AS n FROM place_photos WHERE key = ? AND user = ? AND status = 'pending'", key, me.id)
      };
      return json(res, 200, { photos, reviews, stars: t.stars, n: t.n, mine });
    }
    return json(res, 404, { error: 'not found' });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  if (!me) { req.resume(); return json(res, 401, { error: 'login' }); }
  let body;
  try { body = JSON.parse(await readBody(req, 8000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }
  const key = placeKey(body.key), name = cleanText(body.name, 120) || (key.split('|')[1] || '');
  if (!key) return json(res, 400, { error: 'bad request' });
  const district = key.split('|')[0];
  if (action === 'photo') {
    const up = db.prepare('SELECT * FROM uploads WHERE name = ? AND user = ? AND used = 0').get(String(body.media), me.id);
    if (!up || up.kind !== 'photo') return json(res, 400, { error: 'media' });
    if (count("SELECT COUNT(*) AS n FROM place_photos WHERE key = ? AND user = ? AND status = 'pending'", key, me.id) >= 3) return json(res, 429, { error: 'three' });
    if (count('SELECT COUNT(*) AS n FROM place_photos WHERE user = ? AND created > ?', me.id, now - 864e5) >= 20) return json(res, 429, { error: 'slow' });
    db.prepare('UPDATE uploads SET used = 1 WHERE name = ?').run(up.name);
    db.prepare('INSERT INTO place_photos (key, district, name, user, file, created) VALUES (?, ?, ?, ?, ?, ?)').run(key, district, name, me.id, up.name, now);
    return json(res, 200, { waiting: count("SELECT COUNT(*) AS n FROM place_photos WHERE key = ? AND user = ? AND status = 'pending'", key, me.id) });
  }
  if (action === 'review') {
    const stars = Math.round(Number(body.stars));
    if (!(stars >= 1 && stars <= 5)) return json(res, 400, { error: 'stars' });
    if (count('SELECT COUNT(*) AS n FROM place_reviews WHERE user = ? AND created > ?', me.id, now - 864e5) >= 30) return json(res, 429, { error: 'slow' });
    db.prepare(`INSERT INTO place_reviews (key, district, name, user, stars, body, created) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (key, user) DO UPDATE SET stars = excluded.stars, body = excluded.body, created = excluded.created`).run(key, district, name, me.id, stars, cleanText(body.body, 600), now);
    const t = reviewTally(key);
    return json(res, 200, { stars: t.stars, n: t.n });
  }
  if (action === 'unreview') {
    db.prepare('DELETE FROM place_reviews WHERE key = ? AND user = ?').run(key, me.id);
    const t = reviewTally(key);
    return json(res, 200, { stars: t.stars, n: t.n });
  }
  return json(res, 404, { error: 'not found' });
}

// ---- More places for the map: Overture's (data/places-bd.tsv.gz, from tools/overture-places.mjs), in cells of
// 0.02° (about 2 km). The map asks for the cells on screen once it is close enough to show shops and schools.
const POI_CELL = 50;                                    // cells per degree
const poiCells = new Map();
try {
  const rows = require('node:zlib').gunzipSync(fs.readFileSync(path.join(ROOT, 'data', 'places-bd.tsv.gz'))).toString('utf8').split('\n');
  rows.shift();
  for (const r of rows) {
    if (!r) continue;
    const [la, lo, kind, name, bn, cat] = r.split('\t');
    const key = Math.floor(+la * POI_CELL) + ':' + Math.floor(+lo * POI_CELL);
    let cell = poiCells.get(key);
    if (!cell) poiCells.set(key, cell = []);
    cell.push([+la, +lo, kind, name, bn || '', cat || '']);
  }
  console.log(`Map places: ${[...poiCells.values()].reduce((n, c) => n + c.length, 0)} in ${poiCells.size} cells`);
} catch { /* no file: the map shows OpenStreetMap's places only */ }
// The same places for search: every name in lower case, Bangla and English, with its cell's place in the list.
const poiAll = [...poiCells.values()].flat();
const poiNames = poiAll.map(p => (p[3] + ' ' + p[4]).toLowerCase());
const poiKm = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.hypot(x, y) * 6371; };
const poiOut = (p, km) => ({ lat: p[0], lon: p[1], kind: p[2], name: p[3], bn: p[4], cat: p[5], km: km == null ? undefined : Math.round(km * 100) / 100 });
// ?q=text[&lat=&lon=]: names holding every word typed; whole-word and start-of-name matches first, then the nearest
function poisSearch(res, q, lat, lon) {
  const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 1).slice(0, 5);
  if (!words.length) return json(res, 200, { results: [] });
  const near = Number.isFinite(lat) && Number.isFinite(lon);
  const hits = [];
  for (let i = 0; i < poiAll.length && hits.length < 4000; i++) {
    const n = poiNames[i];
    if (!words.every(w => n.includes(w))) continue;
    const p = poiAll[i], km = near ? poiKm(lat, lon, p[0], p[1]) : null;
    const score = (n.startsWith(words[0]) ? 0 : n.includes(' ' + words[0]) ? 1 : 2) * 50 + (near ? Math.min(km, 400) / 8 : 0);
    hits.push([score, p, km]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  json(res, 200, { results: hits.slice(0, 8).map(([, p, km]) => poiOut(p, km)) });
}
// ?kind=food&lat=&lon=: the nearest places of one kind, from the cells around the point outwards
// What each map chip means: "হাসপাতাল" is hospitals (not pharmacies, dentists, labs or a medical-device company), "স্কুল"
// schools and colleges, "রেস্টুরেন্ট" places to eat (not bus stations or grocers that the data files there), "ব্যাংক ও এটিএম"
// banks and cash machines (not insurers or accountants). Other chips take their whole kind.
const CHIP_CATS = {
  health: c => c === 'hospital',
  learn: c => /school|college|university/.test(c) && !/driving|dance|art|music|swimming|cooking/.test(c),
  food: c => /restaurant|cafe|coffee|tea_room|bakery|food_court|dessert|ice_cream|sweet/.test(c),
  bank: c => /^(bank_or_credit_union|bank|atm|credit_union)$/.test(c)
};
function poisNear(res, kind, lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(res, 400, { error: 'where?' });
  const cy = Math.floor(lat * POI_CELL), cx = Math.floor(lon * POI_CELL), found = [];
  for (let ring = 0; ring <= 12 && found.length < 20; ring++) {
    for (let y = cy - ring; y <= cy + ring; y++) for (let x = cx - ring; x <= cx + ring; x++) {
      if (Math.max(Math.abs(y - cy), Math.abs(x - cx)) !== ring) continue;
      for (const p of poiCells.get(y + ':' + x) || []) if (p[2] === kind && (!CHIP_CATS[kind] || CHIP_CATS[kind](p[5]))) found.push([poiKm(lat, lon, p[0], p[1]), p]);
    }
  }
  found.sort((a, b) => a[0] - b[0]);
  // The same place listed twice (one record named in Bangla, one in English, a few metres apart — OpenStreetMap's and
  // another source's): one entry, carrying both names.
  const kept = [];
  for (const [km, p] of found) {
    const isBn = t => /[ঀ-৿]/.test(t), latin = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const twin = kept.find(([, q]) => q[5] === p[5] && poiKm(q[0], q[1], p[0], p[1]) < 0.03 &&
      (isBn(q[3]) !== isBn(p[3]) || (latin(q[3]) && latin(q[3]) === latin(p[3]))));
    if (twin) { const q = twin[1]; if (!q[4] && isBn(p[3]) && !isBn(q[3])) twin[1] = [...q.slice(0, 4), p[3], q[5]]; continue; }
    kept.push([km, p]);
    if (kept.length >= 20) break;
  }
  json(res, 200, { results: kept.map(([km, p]) => poiOut(p, km)) });
}
const poiZipped = new Map();                            // a busy city cell is a few hundred kB as text, a fifth of that zipped
function poisApi(req, res, searchParams) {
  const m = /^(-?\d+):(-?\d+)$/.exec(searchParams.get('c') || '');
  if (!m) return json(res, 400, { error: 'bad cell' });
  const key = m[1] + ':' + m[2], body = JSON.stringify({ p: poiCells.get(key) || [] });
  const head = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400', Vary: 'Accept-Encoding' };
  if (!/gzip/.test(req.headers['accept-encoding'] || '')) { res.writeHead(200, head); return res.end(body); }
  let z = poiZipped.get(key);
  if (!z) { z = require('node:zlib').gzipSync(body); poiZipped.set(key, z); if (poiZipped.size > 400) poiZipped.delete(poiZipped.keys().next().value); }
  res.writeHead(200, { ...head, 'Content-Encoding': 'gzip' });
  res.end(z);
}

// The site's own address. The old one (bd-map.onrender.com) sends pages there, so search engines and shared links see
// one site; the API stays answering on both, for apps still open on the old address.
const SITE = (process.env.SITE_URL || 'https://manzeela.com').replace(/\/+$/, '');
// Headers every answer carries: HTTPS only from now on (HSTS), no guessing of file types, no showing the site inside
// someone else's frame, only the origin as referrer, and the camera, microphone and location for this site alone.
// (A full allowlist CSP would have to name every map, search and music host; these four lines are the part that
// cannot break anything.)
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self), display-capture=(self)',
  'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
};
const ROBOTS = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin.html\nSitemap: ${SITE}/sitemap.xml\n`;
const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/privacy.html', '/terms.html', '/delete-account.html']
  .map(p => `  <url><loc>${SITE}${p}</loc><changefreq>${p === '/' ? 'daily' : 'monthly'}</changefreq></url>`).join('\n')}\n</urlset>\n`;

const server = http.createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const host = String(req.headers.host || '').toLowerCase();
  if (host.endsWith('.onrender.com') && (req.method === 'GET' || req.method === 'HEAD') && !pathname.startsWith('/api/') && !pathname.startsWith('/media/')) {
    res.writeHead(301, { Location: SITE + req.url, 'Cache-Control': 'public, max-age=86400' });
    return res.end();
  }
  if (pathname === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }); return res.end(req.method === 'HEAD' ? '' : ROBOTS); }
  if (pathname === '/sitemap.xml') { res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }); return res.end(req.method === 'HEAD' ? '' : sitemap()); }
  if (pathname === '/api/ratings') return api(req, res).catch(() => json(res, 500, { error: 'server error' }));
  if (pathname === '/api/fares') return faresApi(req, res).catch(() => json(res, 500, { error: 'server error' }));
  if (pathname.startsWith('/api/chat/')) return chatApi(req, res, pathname.slice(10), searchParams).catch(e => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server error' }); });
  if (pathname === '/api/turn-check') return iceServers().then(list => json(res, 200, {
    relay: hasTurn(), metered: !!(process.env.METERED_APP && process.env.METERED_KEY), turnUser: !!(process.env.TURN_USER || '').trim(), turnPass: !!(process.env.TURN_PASS || '').trim(),
    urls: list.flatMap(x => [].concat(x.urls || x.url || [])), withCredentials: list.filter(x => x.username && x.credential).length,
    lastTests: relayTests.slice(0, 8).map(t => ({ ago: Math.round((Date.now() - t.at) / 1000) + 's', ok: t.ok, kinds: t.kinds, ms: t.ms })) }));
  if (pathname.startsWith('/api/live/')) return liveApi(req, res, pathname.slice(10)).catch(e => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server error' }); });
  if (pathname.startsWith('/api/notify/')) return notifyApi(req, res, pathname.slice(12)).catch(e => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server error' }); });
  if (pathname.startsWith('/api/creator/')) return creatorApi(req, res, pathname.slice(13)).catch(e => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server error' }); });
  if (pathname.startsWith('/api/avatar/')) return avatarApi(req, res, pathname.slice(12));
  if (pathname.startsWith('/media/')) return serveMedia(req, res, pathname.slice(7));
  if (pathname.startsWith('/api/explore/')) return exploreApi(req, res, pathname.slice(13), searchParams).catch(e => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server error' }); });
  if (pathname.startsWith('/api/people/')) { try { return peopleApi(req, res, pathname.slice(12), searchParams); } catch (e) { console.error(e); return json(res, 500, { error: 'server error' }); } }
  if (pathname.startsWith('/api/places/')) return placesApi(req, res, pathname.slice(12), searchParams).catch(e => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server error' }); });
  if (pathname.startsWith('/api/community/')) return communityApi(req, res, pathname.slice(15), searchParams).catch(e => { console.error(e); json(res, 500, { error: 'server error' }); });
  if (pathname.startsWith('/api/support/')) return supportApi(req, res, pathname.slice(13), searchParams).catch(() => json(res, 500, { error: 'server error' }));
  if (pathname.startsWith('/api/admin/')) return adminApi(req, res, pathname.slice(11), searchParams).catch(e => { console.error(e); json(res, 500, { error: 'server error' }); });
  if (pathname === '/api/pois') return poisApi(req, res, searchParams);
  if (pathname === '/api/pois/search') return poisSearch(res, (searchParams.get('q') || '').slice(0, 80), parseFloat(searchParams.get('lat')), parseFloat(searchParams.get('lon')));
  if (pathname === '/api/pois/near') return poisNear(res, (searchParams.get('kind') || '').slice(0, 12), parseFloat(searchParams.get('lat')), parseFloat(searchParams.get('lon')));
  // The map's imagery key (ArcGIS Location Platform, Basemaps only). It travels to every browser anyway — tiles are
  // fetched there — so it is limited to basemaps; it lives in the environment (ESRI_KEY), not in the code.
  if (pathname === '/api/map-config') { const k = (process.env.ESRI_KEY || '').trim(); return json(res, 200, { esriKey: k.length >= 40 ? k : '' }); }   // a placeholder like '.env' is not a key
  if (pathname === '/api/notice') return json(res, 200, { text: (sq.setting.get('notice') || {}).value || '' });
  if (pathname.startsWith('/api/auth/')) return authApi(req, res, pathname.slice(10)).catch(() => json(res, 500, { error: 'server error' }));
  if (pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  serveFile(req, res, pathname, searchParams.has('v'));
});
server.requestTimeout = 0;           // uploads of big videos; idle sockets are still closed by keepAliveTimeout
server.headersTimeout = 60_000;
// ---- The copies on R2 (see "Keeping the data" at the top) ----
db.exec('CREATE TABLE IF NOT EXISTS r2_files (name TEXT PRIMARY KEY, at INTEGER NOT NULL)');
let dbCopied = -1, dbCopying = null;
const changesNow = () => db.prepare('SELECT total_changes() AS n').get().n;
// the database: a clean copy (VACUUM INTO) sent up whenever something has changed since the last one
function copyDbUp() {
  if (!backupOn) return Promise.resolve();
  if (dbCopying) return dbCopying;
  const n = changesNow();
  if (n === dbCopied) return Promise.resolve();
  const tmp = path.join(DATA_DIR, 'ratings.copy.db');
  dbCopying = (async () => {
    try {
      fs.rmSync(tmp, { force: true });
      db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
      await r2.put(R2_PREFIX + 'ratings.db', tmp, 'application/vnd.sqlite3');
      dbCopied = n;
    } catch (e) { console.error('Database copy to R2 failed:', e.message); }
    finally { fs.rmSync(tmp, { force: true }); dbCopying = null; }
  })();
  return dbCopying;
}
// uploaded files: each one sent up once, oldest first; a file still being written or rewritten (fast start) waits
let mediaSyncing = false;
async function copyMediaUp() {
  if (!backupOn || mediaSyncing) return;
  mediaSyncing = true;
  try {
    const done = new Set(db.prepare('SELECT name FROM r2_files').all().map(r => r.name)), now = Date.now();
    const todo = fs.readdirSync(MEDIA_DIR).filter(n => /^[a-f0-9]{24}\.\w+$/.test(n) && !done.has(n))
      .map(n => ({ n, st: fs.statSync(path.join(MEDIA_DIR, n)) })).filter(x => now - x.st.mtimeMs > 30_000).sort((a, b) => a.st.mtimeMs - b.st.mtimeMs);
    for (const { n } of todo) {
      const type = (Object.entries(MEDIA_TYPES).find(([, v]) => v[0] === path.extname(n)) || ['application/octet-stream'])[0];
      try { await r2.put(R2_PREFIX + 'media/' + n, path.join(MEDIA_DIR, n), type); db.prepare('INSERT OR REPLACE INTO r2_files (name, at) VALUES (?, ?)').run(n, Date.now()); }
      catch (e) { console.error('Media copy to R2 failed:', n, e.message); break; }
    }
  } finally { mediaSyncing = false; }
}
// a file the disk no longer has (it was wiped) is fetched back from R2 the first time someone asks for it
const mediaFetching = new Map();
function mediaBack(name) {
  if (!backupOn) return Promise.resolve(false);
  const fetchIt = async () => (await r2.get(R2_PREFIX + 'media/' + name, path.join(MEDIA_DIR, name))) || (R2_OLD ? r2.get(R2_OLD + 'media/' + name, path.join(MEDIA_DIR, name)) : false);
  if (!mediaFetching.has(name)) mediaFetching.set(name, fetchIt().catch(() => false).finally(() => setTimeout(() => mediaFetching.delete(name), 60_000)));
  return mediaFetching.get(name);
}
if (backupOn) {
  // a database just brought back from R2 is already up there; any other (the first run, or a disk that survived) goes up once now
  if (dbRestored) dbCopied = changesNow(); else setTimeout(copyDbUp, 30_000).unref();
  setInterval(() => { copyDbUp(); }, 2 * 60_000).unref();
  setInterval(() => { copyMediaUp(); }, 60_000).unref();
  setTimeout(copyMediaUp, 20_000).unref();
  // Leaving the old, public place: every file copied up there moves to the new name (R2 copies it), then the old copy
  // goes. The old server of a deploy may still write its last database there as it stops, so that one is removed again
  // every half hour.
  if (R2_OLD) {
    const leaveOld = async () => {
      try {
        for (const { name } of db.prepare('SELECT name FROM r2_files').all()) {
          if (db.prepare("SELECT 1 FROM settings WHERE key = ?").get('r2moved:' + name)) continue;
          await r2.copy(R2_OLD + 'media/' + name, R2_PREFIX + 'media/' + name);
          await r2.del(R2_OLD + 'media/' + name);
          db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('r2moved:' + name, '1');
        }
        if (dbCopied >= 0) await r2.del(R2_OLD + 'ratings.db');    // only once a copy sits at the new place
      } catch (e) { console.error('Moving the R2 copies failed (tried again later):', e.message); }
    };
    setTimeout(leaveOld, 90_000).unref();
    setInterval(leaveOld, 30 * 60_000).unref();
  }
  // the host stops the server before a deploy or when it sleeps: send the last changes first (Render waits 30 s)
  for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => {
    console.log(`${sig}: copying the database to R2 before stopping…`);
    const stop = setTimeout(() => process.exit(0), 25_000);
    copyDbUp().finally(() => { clearTimeout(stop); process.exit(0); });
  });
  console.log('R2 copies: on');
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Manzeela is running.\n  On this computer:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  On the same Wi-Fi: http://${a.address}:${PORT}`);
  }
});
