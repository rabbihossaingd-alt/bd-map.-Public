// ---- Admin panel v2: roles and permissions, the panel's own session, the audit log, the live stream ----
// Everything under /api/admin/v2/. Every call goes through the same gate: a signed-in team member, an open panel
// session (opened with a code, locked after 30 minutes idle, never longer than 12 hours), the permission the action
// needs, a CSRF token on every change, and for high-risk changes a fresh code (step-up, 10 minutes). Every change is
// written to audit_log with who, when, from where, before and after; the table refuses UPDATE and DELETE.
// Private messages never pass through here: only counts.
'use strict';

// ---- permissions and the built-in roles ----
// A role is a set of permissions. The owner (ADMIN_EMAILS) holds all of them and cannot be changed from the panel.
const PERMS = {
  'dashboard.view': 'ড্যাশবোর্ড দেখা', 'analytics.view': 'অ্যানালিটিক্স দেখা', 'inbox.view': 'ইনবক্স দেখা',
  'support.view': 'সাপোর্ট টিকিট দেখা', 'support.reply': 'সাপোর্টে উত্তর দেওয়া',
  'reports.view': 'রিপোর্ট দেখা', 'content.remove': 'কনটেন্ট সরানো ও স্ট্রাইক', 'users.view': 'ব্যবহারকারী দেখা',
  'users.restrict': 'অ্যাকাউন্ট সীমিত করা', 'users.ban': 'অ্যাকাউন্ট বন্ধ করা', 'users.verify': 'ব্যাজ দেওয়া',
  'users.delete': 'অ্যাকাউন্ট চিরতরে মোছা', 'pii.unmask': 'ই-মেইল ও ওয়ালেট নম্বর দেখা', 'pii.unmask.ticket': 'খোলা টিকিটের মানুষের ই-মেইল দেখা',
  'pii.wallet': 'ওয়ালেট নম্বর দেখা', 'data.approve': 'ভাড়া, ছবি ও জায়গা অনুমোদন', 'data.edit': 'রুট ও যাতায়াত ডেটা এডিট',
  'payouts.view': 'পেআউট দেখা', 'payouts.approve': 'পেআউট অনুমোদন (প্রথম ধাপ)', 'payouts.send': 'পেআউট পাঠানো (দ্বিতীয় ধাপ)',
  'creators.manage': 'ক্রিয়েটর পরিচালনা', 'flags.manage': 'ফিচার ফ্ল্যাগ', 'notice.manage': 'ঘোষণা ও নোটিফিকেশন',
  'killswitch': 'জরুরি কিল-সুইচ', 'audit.view': 'কাজের খতিয়ান দেখা', 'team.manage': 'টিম ও ভূমিকা পরিচালনা', 'system.view': 'সিস্টেমের অবস্থা দেখা'
};
const ALL = Object.keys(PERMS);
const BASE = ['dashboard.view', 'analytics.view'];
const ROLES = {
  owner:       { name: 'Owner', perms: ALL },
  admin:       { name: 'Admin', perms: ALL.filter(p => !['payouts.send', 'team.manage'].includes(p)) },
  moderator:   { name: 'Moderator', perms: [...BASE, 'inbox.view', 'reports.view', 'content.remove', 'users.view', 'users.restrict', 'users.ban'] },
  support:     { name: 'Support', perms: [...BASE, 'inbox.view', 'support.view', 'support.reply', 'users.view', 'pii.unmask.ticket'] },
  data_editor: { name: 'Data Editor', perms: [...BASE, 'inbox.view', 'data.approve', 'data.edit', 'users.view'] },
  finance:     { name: 'Finance', perms: [...BASE, 'inbox.view', 'payouts.view', 'payouts.approve', 'payouts.send', 'creators.manage', 'users.view', 'pii.wallet'] },
  viewer:      { name: 'Viewer', perms: [...BASE] }
};
// what the legacy panel (and the main app) knows: admin, staff or a plain user
const LEGACY_ROLE = r => (r === 'owner' || r === 'admin') ? 'admin' : r ? 'staff' : 'user';

const IDLE = 30 * 60_000, MAX_AGE = 12 * 3600_000, STEPUP = 10 * 60_000, GRACE = 7 * 864e5;

module.exports = function adminV2(ctx) {
  const { db, json, readBody, userOf, sessionToken, sha, crypto, clientIp, totpOk, backupOk, sendMail, MAILS, mailReady, isLocal, ADMIN_EMAILS, deviceName, onlineCount } = ctx;
  const count = (sql, ...a) => db.prepare(sql).get(...a).n;
  const now = () => Date.now();

  // ---- schema (added only; nothing existing is changed or dropped) ----
  // rollback: the old code ignores these tables; dropping them loses only v2 state, never app data.
  db.exec(`CREATE TABLE IF NOT EXISTS admin_roles (key TEXT PRIMARY KEY, name TEXT NOT NULL, perms_json TEXT NOT NULL, builtin INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS team_members (user INTEGER PRIMARY KEY, role TEXT NOT NULL, added_by INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, grace_until INTEGER NOT NULL DEFAULT 0)`);
  db.exec(`CREATE TABLE IF NOT EXISTS admin_sessions (token TEXT PRIMARY KEY, user INTEGER NOT NULL, made INTEGER NOT NULL, last INTEGER NOT NULL, ip TEXT NOT NULL DEFAULT '', ua TEXT NOT NULL DEFAULT '',
    csrf TEXT NOT NULL, stepup_until INTEGER NOT NULL DEFAULT 0, ended INTEGER NOT NULL DEFAULT 0)`);
  db.exec('CREATE INDEX IF NOT EXISTS admin_sessions_user ON admin_sessions (user, made)');
  db.exec(`CREATE TABLE IF NOT EXISTS admin_codes (user INTEGER PRIMARY KEY, hash TEXT NOT NULL, expires INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY, actor INTEGER NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL DEFAULT '', target_id TEXT NOT NULL DEFAULT '',
    before_json TEXT NOT NULL DEFAULT '', after_json TEXT NOT NULL DEFAULT '', reason_code TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '', ua TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL)`);
  db.exec('CREATE INDEX IF NOT EXISTS audit_log_actor ON audit_log (actor, at)');
  db.exec('CREATE INDEX IF NOT EXISTS audit_log_target ON audit_log (target_type, target_id)');
  db.exec('CREATE INDEX IF NOT EXISTS audit_log_action ON audit_log (action, at)');
  // append-only, enforced by the database itself
  db.exec("CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END");
  db.exec("CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END");
  db.exec(`CREATE TABLE IF NOT EXISTS saved_views (id INTEGER PRIMARY KEY, owner INTEGER NOT NULL, page TEXT NOT NULL, name TEXT NOT NULL, state_json TEXT NOT NULL, shared INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)`);
  db.exec('CREATE INDEX IF NOT EXISTS saved_views_page ON saved_views (page, owner)');
  // indexes the queues and lists need
  for (const sql of ['CREATE INDEX IF NOT EXISTS reports_status ON reports (status, about)', 'CREATE INDEX IF NOT EXISTS tickets_status ON tickets (status, updated)',
    'CREATE INDEX IF NOT EXISTS payouts_status ON payouts (status, created)', 'CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user)',
    'CREATE INDEX IF NOT EXISTS contributions_ok ON contributions (ok, created)']) { try { db.exec(sql); } catch { /* a table not made yet on a fresh database */ } }

  // built-in roles: written on every start, so their permissions follow this file
  const putRole = db.prepare('INSERT INTO admin_roles (key, name, perms_json, builtin, created) VALUES (?, ?, ?, 1, ?) ON CONFLICT (key) DO UPDATE SET name = excluded.name, perms_json = excluded.perms_json, builtin = 1');
  for (const [k, r] of Object.entries(ROLES)) putRole.run(k, r.name, JSON.stringify(r.perms), now());

  const settingGet = k => (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) || {}).value;
  const settingSet = (k, v) => db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(k, String(v));

  // ---- the audit log ----
  const insAudit = db.prepare(`INSERT INTO audit_log (actor, action, target_type, target_id, before_json, after_json, reason_code, note, ip, ua, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const jsonOr = v => v == null ? '' : JSON.stringify(v);
  const streams = new Set();       // open admin streams: { res, user, perms }
  function audit(actor, action, { type = '', id = '', before, after, reason = '', note = '', req } = {}) {
    const row = { actor, action, target_type: type, target_id: String(id), before_json: jsonOr(before), after_json: jsonOr(after), reason_code: reason, note: String(note || '').slice(0, 1000),
                  ip: req ? clientIp(req) : '', ua: req ? deviceName(req.headers['user-agent']) : '', at: now() };
    const r = insAudit.run(row.actor, row.action, row.target_type, row.target_id, row.before_json, row.after_json, row.reason_code, row.note, row.ip, row.ua, row.at);
    broadcast('audit', { id: Number(r.lastInsertRowid), ...row, name: (db.prepare('SELECT name FROM users WHERE id = ?').get(actor) || {}).name || '' }, 'audit.view');
    return Number(r.lastInsertRowid);
  }
  // the legacy panel's log lines go into the same log (called from server.js), and the older lines are copied once
  function legacyAudit(actor, action, target, detail, req) { audit(actor, action, { type: 'legacy', id: target, note: detail, req }); }
  if (!settingGet('audit_v2_copied')) {
    const rows = db.prepare('SELECT * FROM audit ORDER BY id').all();
    db.exec('BEGIN');
    try { for (const a of rows) insAudit.run(a.actor, a.action, 'legacy', String(a.target), '', '', '', a.detail || '', '', '', a.at); settingSet('audit_v2_copied', String(now())); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); console.error('audit copy failed:', e.message); }
  }

  // ---- the team ----
  const isOwnerEmail = email => ADMIN_EMAILS.includes(String(email || '').toLowerCase());
  // today's admins and staff become team members (admin → Admin, staff → Support) with 7 days to turn on two-step
  for (const u of db.prepare("SELECT id, email, role FROM users WHERE role IN ('admin', 'staff')").all()) {
    if (db.prepare('SELECT 1 FROM team_members WHERE user = ?').get(u.id)) continue;
    db.prepare('INSERT INTO team_members (user, role, created, grace_until) VALUES (?, ?, ?, ?)').run(u.id, isOwnerEmail(u.email) ? 'owner' : u.role === 'admin' ? 'admin' : 'support', now(), now() + GRACE);
  }
  function roleOf(user) {
    if (!user) return null;
    if (isOwnerEmail(user.email)) return 'owner';
    const t = db.prepare('SELECT role FROM team_members WHERE user = ?').get(user.id);
    return t ? t.role : null;
  }
  function permsOf(role) {
    if (!role) return [];
    const r = db.prepare('SELECT perms_json FROM admin_roles WHERE key = ?').get(role);
    return r ? JSON.parse(r.perms_json) : [];
  }
  // two-step is required for the team after a grace period; the owner is reminded but never locked out
  function twofaState(user, role) {
    const t = db.prepare('SELECT grace_until FROM team_members WHERE user = ?').get(user.id);
    const grace = t ? t.grace_until : 0;
    return { on: !!user.totp_on, graceUntil: grace, required: role !== 'owner' && !user.totp_on && grace && now() > grace };
  }

  // ---- the panel session ----
  const COOKIE = 'mz_admin';
  const cookieOf = req => (new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})').exec(req.headers.cookie || '') || [])[1];
  const secure = req => req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted ? '; Secure' : '';
  const setCookie = (req, res, token, maxAge) => res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${maxAge}${secure(req)}`);
  const sessOf = req => { const t = cookieOf(req); return t ? db.prepare('SELECT * FROM admin_sessions WHERE token = ?').get(sha(t)) : null; };
  function liveSession(req, user) {
    const s = sessOf(req), t = now();
    if (!s || s.ended || s.user !== user.id || t - s.last > IDLE || t - s.made > MAX_AGE) return null;
    if (t - s.last > 30_000) db.prepare('UPDATE admin_sessions SET last = ? WHERE token = ?').run(t, s.token);
    return s;
  }
  // a code for opening the panel or for a high-risk step: the authenticator app when it is on, otherwise e-mail
  async function sendCode(req, user, why) {
    if (user.totp_on) return { method: 'totp' };
    const old = db.prepare('SELECT * FROM admin_codes WHERE user = ?').get(user.id);
    if (old && now() - old.sent < 45_000) return { method: 'email', wait: true };
    const code = String(crypto.randomInt(100000, 1000000));
    db.prepare('INSERT OR REPLACE INTO admin_codes (user, hash, expires, tries, sent) VALUES (?, ?, ?, 0, ?)').run(user.id, sha('admin:' + code + user.id), now() + 10 * 60_000, now());
    if (!mailReady) { if (isLocal(req)) return { method: 'email', devCode: code }; throw Object.assign(new Error('mail'), { status: 503 }); }
    await sendMail(user.email, MAILS.adminCodeMail(code, why));
    return { method: 'email' };
  }
  function codeOk(user, code) {
    if (user.totp_on) return totpOk(user.id, user.totp, code) || backupOk(user.id, code);
    const c = db.prepare('SELECT * FROM admin_codes WHERE user = ?').get(user.id);
    if (!c || c.expires < now() || c.tries >= 5) return false;
    if (c.hash !== sha('admin:' + String(code || '').replace(/\D/g, '') + user.id)) { db.prepare('UPDATE admin_codes SET tries = tries + 1 WHERE user = ?').run(user.id); return false; }
    db.prepare('DELETE FROM admin_codes WHERE user = ?').run(user.id);
    return true;
  }

  // ---- rate limit: 240 calls a minute for one team member ----
  const calls = new Map();
  const allow = id => { const t = now(), r = (calls.get(id) || []).filter(x => t - x < 60_000); if (r.length >= 240) { calls.set(id, r); return false; } r.push(t); calls.set(id, r); return true; };
  setInterval(() => { const t = now(); for (const [k, v] of calls) if (!v.some(x => t - x < 60_000)) calls.delete(k); }, 60_000).unref();

  // ---- the live stream for the panel ----
  function broadcast(event, data, perm) {
    for (const s of streams) if (!perm || s.perms.includes(perm)) s.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  const presence = new Map();      // user id -> { ref, name, at }
  const presenceOut = () => { const out = {}; const t = now(); for (const [id, p] of presence) { if (t - p.at > 60_000) { presence.delete(id); continue; } if (p.ref) (out[p.ref] = out[p.ref] || []).push({ id, name: p.name }); } return out; };
  // what is waiting, for the badges in the menu
  function counts() {
    const c = (sql, ...a) => { try { return count(sql, ...a); } catch { return 0; } };
    return {
      support: c("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'"), reports: c("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
      photos: c("SELECT COUNT(*) AS n FROM place_photos WHERE status = 'pending'"), gems: c("SELECT COUNT(*) AS n FROM gems WHERE status = 'pending'"),
      fares: c('SELECT COUNT(*) AS n FROM contributions WHERE ok = 0') + c("SELECT COUNT(*) AS n FROM fare_reports WHERE ok = 0 AND device LIKE 'u%'"),
      payouts: c("SELECT COUNT(*) AS n FROM payouts WHERE status = 'pending'"), creators: c("SELECT COUNT(*) AS n FROM users WHERE creator = 'applied'"),
      verify: c("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open' AND category = 'verify'"), online: onlineCount()
    };
  }
  let lastCounts = '';
  setInterval(() => {
    if (!streams.size) return;
    const c = JSON.stringify(counts());
    if (c !== lastCounts) { lastCounts = c; broadcast('counts', JSON.parse(c)); }
    for (const s of streams) s.res.write(': keep-alive\n\n');
  }, 15_000).unref();

  // ---- helpers for the answers ----
  const maskEmail = e => { const [u, d] = String(e || '').split('@'); return d ? (u.slice(0, 2) + '***@' + d) : '***'; };
  const personOut = u => u && { id: u.id, name: u.name, username: u.username || '', pic: u.pic_v ?? u.pic ?? 0, email: maskEmail(u.email) };
  const fail = (res, status, error, extra) => json(res, status, { error, ...extra });
  async function bodyOf(req) { try { return JSON.parse(await readBody(req, 20_000)) || {}; } catch { return null; } }

  // ---- the routes ----
  // perm: the permission needed; tier: 3 asks for a fresh code (step-up) as well
  const ROUTES = {
    'GET me': { open: true }, 'POST elevate/start': { open: true }, 'POST elevate/verify': { open: true },
    'POST stepup/start': {}, 'POST stepup/verify': {}, 'POST lock': {},
    'GET counts': { perm: 'dashboard.view' }, 'GET stream': { perm: 'dashboard.view' }, 'POST presence': { perm: 'dashboard.view' },
    'GET search': { perm: 'dashboard.view' }, 'POST pii': {},
    'GET audit': { perm: 'audit.view' }, 'GET audit.csv': { perm: 'audit.view' },
    'GET team': { perm: 'team.manage' }, 'POST team/set': { perm: 'team.manage' },
    'GET views': {}, 'POST views/save': {}, 'POST views/delete': {}
  };

  async function handle(req, res, path, query) {
    const route = ROUTES[req.method + ' ' + path];
    if (!route) return fail(res, 404, 'not found');
    const user = userOf(req), role = roleOf(user);
    if (!user || !role) return fail(res, 403, 'forbidden');
    const perms = permsOf(role), tf = twofaState(user, role);
    const sess = liveSession(req, user);

    // ---- before a panel session: who am I, and opening one ----
    if (path === 'me') return json(res, 200, { user: personOut(user), role, roleName: (ROLES[role] || {}).name || role, perms, owner: role === 'owner',
      elevated: !!sess, csrf: sess ? sess.csrf : '', stepupUntil: sess ? sess.stepup_until : 0, twofa: tf, method: user.totp_on ? 'totp' : 'email', idle: IDLE, maxAge: MAX_AGE,
      env: /onrender\.com|manzeela\.com/.test(req.headers.host || '') ? 'production' : 'local' });
    if (path === 'elevate/start') {
      if (tf.required) return fail(res, 403, 'needs-2fa');
      try { return json(res, 200, await sendCode(req, user, 'অ্যাডমিন প্যানেল খুলতে')); } catch (e) { return fail(res, e.status || 500, e.message); }
    }
    if (path === 'elevate/verify') {
      const body = await bodyOf(req);
      if (!body) return fail(res, 400, 'bad request');
      if (tf.required) return fail(res, 403, 'needs-2fa');
      if (!codeOk(user, body.code)) { audit(user.id, 'admin.login.failed', { type: 'user', id: user.id, req }); return fail(res, 401, 'code'); }
      const token = crypto.randomBytes(32).toString('hex'), csrf = crypto.randomBytes(24).toString('hex'), ua = deviceName(req.headers['user-agent']), ip = clientIp(req);
      const seenDevice = db.prepare('SELECT 1 FROM admin_sessions WHERE user = ? AND ua = ? LIMIT 1').get(user.id, ua);
      db.prepare('INSERT INTO admin_sessions (token, user, made, last, ip, ua, csrf) VALUES (?, ?, ?, ?, ?, ?, ?)').run(sha(token), user.id, now(), now(), ip, ua, csrf);
      setCookie(req, res, token, MAX_AGE / 1000);
      audit(user.id, 'admin.login', { type: 'user', id: user.id, after: { device: ua }, req });
      // a team member on a device never used for the panel: the owner(s) hear about it
      if (!seenDevice && role !== 'owner' && mailReady) {
        const when = new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });
        for (const email of ADMIN_EMAILS) sendMail(email, MAILS.adminLoginMail(user.name, user.email, ua, ip, when)).catch(() => {});
      }
      return json(res, 200, { ok: true, csrf });
    }
    // ---- everything else needs an open panel session ----
    if (!sess) return fail(res, 401, 'locked');
    if (!allow(user.id)) return fail(res, 429, 'slow');
    if (req.method === 'POST' && (req.headers['x-csrf'] !== sess.csrf || !(req.headers['content-type'] || '').startsWith('application/json'))) return fail(res, 403, 'csrf');
    if (route.perm && !perms.includes(route.perm)) { audit(user.id, 'denied', { type: 'route', id: path, req }); return fail(res, 403, 'forbidden'); }
    const body = req.method === 'POST' ? await bodyOf(req) : null;
    if (req.method === 'POST' && !body) return fail(res, 400, 'bad request');
    const stepped = () => sess.stepup_until > now();

    if (path === 'lock') { db.prepare('UPDATE admin_sessions SET ended = ? WHERE token = ?').run(now(), sess.token); setCookie(req, res, '', 0); audit(user.id, 'admin.lock', { type: 'user', id: user.id, req }); return json(res, 200, { ok: true }); }
    if (path === 'stepup/start') { try { return json(res, 200, await sendCode(req, user, 'একটি উচ্চ-ঝুঁকির কাজ নিশ্চিত করতে')); } catch (e) { return fail(res, e.status || 500, e.message); } }
    if (path === 'stepup/verify') {
      if (!codeOk(user, body.code)) { audit(user.id, 'stepup.failed', { type: 'user', id: user.id, req }); return fail(res, 401, 'code'); }
      const until = now() + STEPUP;
      db.prepare('UPDATE admin_sessions SET stepup_until = ? WHERE token = ?').run(until, sess.token);
      audit(user.id, 'stepup', { type: 'user', id: user.id, req });
      return json(res, 200, { stepupUntil: until });
    }

    if (path === 'counts') return json(res, 200, counts());
    if (path === 'stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
      res.write('retry: 4000\n\n');
      const s = { res, user: user.id, perms };
      streams.add(s);
      res.write(`event: counts\ndata: ${JSON.stringify(counts())}\n\n`);
      res.write(`event: presence\ndata: ${JSON.stringify(presenceOut())}\n\n`);
      req.on('close', () => { streams.delete(s); if (![...streams].some(x => x.user === user.id)) { presence.delete(user.id); broadcast('presence', presenceOut()); } });
      return;
    }
    if (path === 'presence') {
      presence.set(user.id, { ref: String(body.ref || '').slice(0, 60), name: user.name, at: now() });
      broadcast('presence', presenceOut());
      return json(res, 200, { ok: true });
    }

    // the command palette: people, posts, groups, tickets, payouts — one box
    if (path === 'search') {
      const q = String(query.get('q') || '').trim().slice(0, 60), low = q.toLowerCase().replace(/[%_]/g, '');
      if (q.length < 1) return json(res, 200, { users: [], posts: [], groups: [], tickets: [], payouts: [] });
      const like = '%' + low.replace(/^@/, '') + '%', idq = Number(q.replace(/^#/, ''));
      const out = { users: [], posts: [], groups: [], tickets: [], payouts: [] };
      if (perms.includes('users.view')) out.users = db.prepare(`SELECT id, name, username, email, pic_v, banned, verified FROM users WHERE id = ? OR lower(name) LIKE ? OR username LIKE ? OR lower(email) LIKE ? ORDER BY (id = ?) DESC, (username = ?) DESC, id LIMIT 8`)
        .all(idq || -1, like, like, like, idq || -1, low.replace(/^@/, '')).map(u => ({ ...personOut(u), banned: !!u.banned, verified: !!u.verified }));
      if (perms.includes('content.remove') || perms.includes('reports.view')) {
        out.posts = db.prepare(`SELECT p.id, p.caption, p.kind, p.created, u.name FROM posts p JOIN users u ON u.id = p.user WHERE p.id = ? OR lower(p.caption) LIKE ? ORDER BY p.id DESC LIMIT 5`).all(idq || -1, like);
        out.groups = db.prepare('SELECT id, name FROM chat_groups WHERE lower(name) LIKE ? LIMIT 5').all(like);
      }
      if (perms.includes('support.view')) out.tickets = db.prepare(`SELECT t.id, t.subject, t.status, u.name FROM tickets t JOIN users u ON u.id = t.user WHERE t.id = ? OR lower(t.subject) LIKE ? ORDER BY t.id DESC LIMIT 5`).all(idq || -1, like);
      if (perms.includes('payouts.view')) out.payouts = db.prepare(`SELECT x.id, x.amount, x.method, x.status, x.ref, u.name FROM payouts x JOIN users u ON u.id = x.user WHERE x.ref <> '' AND lower(x.ref) LIKE ? ORDER BY x.id DESC LIMIT 5`).all(like);
      return json(res, 200, out);
    }

    // a masked e-mail or wallet number, shown in full: allowed by role, and always written in the log
    if (path === 'pii') {
      const target = db.prepare('SELECT id, email FROM users WHERE id = ?').get(Number(body.user));
      if (!target) return fail(res, 404, 'not found');
      if (body.kind === 'email') {
        const ok = perms.includes('pii.unmask') || (perms.includes('pii.unmask.ticket') && count("SELECT COUNT(*) AS n FROM tickets WHERE user = ? AND status <> 'closed'", target.id) > 0);
        if (!ok) { audit(user.id, 'denied', { type: 'pii', id: target.id, note: 'email', req }); return fail(res, 403, 'forbidden'); }
        audit(user.id, 'pii.unmask', { type: 'user', id: target.id, note: 'email', reason: String(body.reason || '').slice(0, 40), req });
        return json(res, 200, { value: target.email });
      }
      if (body.kind === 'wallet') {
        if (!perms.includes('pii.unmask') && !perms.includes('pii.wallet')) { audit(user.id, 'denied', { type: 'pii', id: target.id, note: 'wallet', req }); return fail(res, 403, 'forbidden'); }
        const p = db.prepare('SELECT account, method FROM payouts WHERE user = ? ORDER BY id DESC LIMIT 1').get(target.id);
        audit(user.id, 'pii.unmask', { type: 'user', id: target.id, note: 'wallet', req });
        return json(res, 200, { value: p ? p.account : '' });
      }
      return fail(res, 400, 'bad request');
    }

    // ---- the audit log: filter, page through (newest first), export ----
    if (path === 'audit' || path === 'audit.csv') {
      const where = [], args = [];
      const cursor = Number(query.get('cursor')) || 0, limit = Math.min(100, Math.max(10, Number(query.get('limit')) || 50));
      if (query.get('actor')) { where.push('a.actor = ?'); args.push(Number(query.get('actor'))); }
      if (query.get('action')) { where.push('a.action LIKE ?'); args.push(String(query.get('action')).replace(/[%_]/g, '') + '%'); }
      if (query.get('target')) { const [t, i] = String(query.get('target')).split(':'); where.push('a.target_type = ?'); args.push(t); if (i) { where.push('a.target_id = ?'); args.push(i); } }
      if (query.get('from')) { where.push('a.at >= ?'); args.push(Number(query.get('from'))); }
      if (query.get('to')) { where.push('a.at <= ?'); args.push(Number(query.get('to'))); }
      if (query.get('q')) { where.push('(a.note LIKE ? OR a.target_id LIKE ? OR a.action LIKE ?)'); const l = '%' + String(query.get('q')).replace(/[%_]/g, '') + '%'; args.push(l, l, l); }
      const total = count(`SELECT COUNT(*) AS n FROM audit_log a${where.length ? ' WHERE ' + where.join(' AND ') : ''}`, ...args);
      if (cursor && path === 'audit') { where.push('a.id < ?'); args.push(cursor); }
      const sql = `SELECT a.*, u.name FROM audit_log a LEFT JOIN users u ON u.id = a.actor${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT ${path === 'audit.csv' ? 5000 : limit}`;
      const rows = db.prepare(sql).all(...args);
      if (path === 'audit.csv') {
        audit(user.id, 'export', { type: 'audit', id: '', note: `${rows.length} সারি · ${[...query.keys()].join(',') || 'সব'}`, req });
        const cell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
        const csv = '﻿' + [['id', 'at', 'actor', 'action', 'target_type', 'target_id', 'reason', 'note', 'ip', 'device', 'before', 'after'].join(','),
          ...rows.map(r => [r.id, new Date(r.at).toISOString(), r.name || r.actor, r.action, r.target_type, r.target_id, r.reason_code, r.note, r.ip, r.ua, r.before_json, r.after_json].map(cell).join(','))].join('\r\n');
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="manzeela-audit.csv"', 'Cache-Control': 'no-store' });
        return res.end(csv);
      }
      const actors = db.prepare('SELECT DISTINCT a.actor AS id, u.name FROM audit_log a LEFT JOIN users u ON u.id = a.actor ORDER BY u.name LIMIT 100').all();
      return json(res, 200, { rows, total, next: rows.length === limit ? rows[rows.length - 1].id : 0, actors });
    }

    // ---- the team: who has which role ----
    if (path === 'team') {
      const members = db.prepare(`SELECT t.user, t.role, t.created, t.grace_until, u.name, u.username, u.email, u.pic_v, u.seen, u.totp_on FROM team_members t JOIN users u ON u.id = t.user ORDER BY t.created`).all();
      const owners = db.prepare(`SELECT id, name, username, email, pic_v, seen, totp_on FROM users WHERE lower(email) IN (${ADMIN_EMAILS.map(() => '?').join(',') || "''"})`).all(...ADMIN_EMAILS);
      const list = [...owners.map(u => ({ ...personOut(u), role: 'owner', owner: true, seen: u.seen, twofa: !!u.totp_on, graceUntil: 0 })),
                    ...members.filter(m => !owners.some(o => o.id === m.user)).map(m => ({ ...personOut({ id: m.user, name: m.name, username: m.username, email: m.email, pic_v: m.pic_v }), role: m.role, seen: m.seen, twofa: !!m.totp_on, graceUntil: m.grace_until, since: m.created }))];
      const roles = db.prepare('SELECT key, name, perms_json, builtin FROM admin_roles').all().map(r => ({ key: r.key, name: r.name, perms: JSON.parse(r.perms_json), builtin: !!r.builtin, members: list.filter(m => m.role === r.key).length }));
      return json(res, 200, { members: list, roles, perms: PERMS });
    }
    if (path === 'team/set') {
      const target = db.prepare('SELECT * FROM users WHERE id = ? OR lower(email) = ? OR username = ?').get(Number(body.user) || -1, String(body.user || '').toLowerCase(), String(body.user || '').replace(/^@/, '').toLowerCase());
      const next = body.role === 'none' ? null : String(body.role || '');
      if (!target) return fail(res, 404, 'not found');
      if (isOwnerEmail(target.email)) return fail(res, 400, 'owner');
      if (target.id === user.id) return fail(res, 400, 'self');
      if (next && (next === 'owner' || !db.prepare('SELECT 1 FROM admin_roles WHERE key = ?').get(next))) return fail(res, 400, 'role');
      const before = roleOf(target);
      if (before === next) return json(res, 200, { ok: true, role: next });
      // giving someone the Admin role is high-risk: a fresh code is needed; any change needs a reason
      if (next === 'admin' && !stepped()) return fail(res, 401, 'stepup');
      const reason = String(body.reason || '').trim();
      if (!reason) return fail(res, 400, 'reason');
      db.exec('BEGIN');
      try {
        if (next) db.prepare('INSERT INTO team_members (user, role, added_by, created, grace_until) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user) DO UPDATE SET role = excluded.role').run(target.id, next, user.id, now(), now() + GRACE);
        else db.prepare('DELETE FROM team_members WHERE user = ?').run(target.id);
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(LEGACY_ROLE(next), target.id);
        if (!next) db.prepare('UPDATE admin_sessions SET ended = ? WHERE user = ? AND ended = 0').run(now(), target.id);
        audit(user.id, 'team.role', { type: 'user', id: target.id, before: { role: before }, after: { role: next }, note: reason, req });
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return json(res, 200, { ok: true, role: next });
    }

    // ---- saved views of a list: mine, and the ones shared with the team ----
    if (path === 'views') {
      const page = String(query.get('page') || '').slice(0, 40);
      return json(res, 200, { views: db.prepare('SELECT v.id, v.name, v.state_json, v.shared, v.owner, u.name AS by FROM saved_views v LEFT JOIN users u ON u.id = v.owner WHERE v.page = ? AND (v.owner = ? OR v.shared = 1) ORDER BY v.name').all(page, user.id)
        .map(v => ({ id: v.id, name: v.name, state: JSON.parse(v.state_json), shared: !!v.shared, mine: v.owner === user.id, by: v.by })) });
    }
    if (path === 'views/save') {
      const name = String(body.name || '').trim().slice(0, 60), page = String(body.page || '').slice(0, 40);
      if (!name || !page) return fail(res, 400, 'bad request');
      const id = Number(db.prepare('INSERT INTO saved_views (owner, page, name, state_json, shared, created) VALUES (?, ?, ?, ?, ?, ?)').run(user.id, page, name, JSON.stringify(body.state || {}).slice(0, 4000), body.shared ? 1 : 0, now()).lastInsertRowid);
      return json(res, 200, { id });
    }
    if (path === 'views/delete') {
      db.prepare('DELETE FROM saved_views WHERE id = ? AND owner = ?').run(Number(body.id), user.id);
      return json(res, 200, { ok: true });
    }
    return fail(res, 404, 'not found');
  }
  // what server.js uses: the handler; the legacy panel's log lines; and whether a request has an open panel session
  // (the legacy /api/admin/* answers only then, so the whole panel sits behind the same code)
  // The older panel's actions, each held to the same permission as in v2 (a Viewer, say, is "staff" to the older code,
  // which alone would let them read everything). Anything not listed is refused.
  const LEGACY_PERMS = {
    'GET me': 'dashboard.view', 'GET overview': 'dashboard.view', 'GET search': 'users.view', 'GET flags': 'dashboard.view', 'GET system': 'system.view', 'GET audit': 'audit.view',
    'GET users': 'users.view', 'GET user': 'users.view', 'GET sessions': 'users.view', 'GET export': 'pii.unmask', 'POST user': 'users.ban', 'POST session-end': 'users.ban',
    'GET tickets': 'support.view', 'GET ticket': 'support.view', 'POST ticket': 'support.reply',
    'GET reports': 'reports.view', 'POST report': 'content.remove',
    'GET place-photos': 'data.approve', 'POST place-photo': 'data.approve', 'GET gems': 'data.approve', 'POST gem': 'data.approve',
    'GET fares': 'data.approve', 'POST fare': 'data.approve', 'POST contribution': 'data.approve', 'POST approve-fare': 'data.approve', 'POST approve-contribution': 'data.approve',
    'GET posts': 'content.remove', 'POST post': 'content.remove', 'GET stories': 'content.remove', 'POST story': 'content.remove', 'GET sounds': 'content.remove', 'POST sound': 'content.remove',
    'GET comments': 'content.remove', 'POST comment': 'content.remove', 'GET groups': 'content.remove', 'POST group': 'content.remove',
    'GET creators': 'creators.manage', 'POST creator': 'creators.manage', 'POST rules': 'creators.manage', 'GET payouts': 'payouts.view', 'POST payout': 'payouts.send',
    'POST flags': 'flags.manage', 'POST notice': 'notice.manage'
  };
  function legacyAllowed(req, user, action) {
    const need = LEGACY_PERMS[req.method + ' ' + action], ok = !!need && permsOf(roleOf(user)).includes(need);
    if (!ok) audit(user.id, 'denied', { type: 'legacy', id: action, req });
    return ok;
  }
  return { handle, legacyAudit, legacyAllowed, panelOpen: (req, user) => !!(user && roleOf(user) && liveSession(req, user)), roleOf };
};
module.exports.PERMS = PERMS;
module.exports.ROLES = ROLES;
