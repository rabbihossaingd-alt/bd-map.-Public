// ---- Admin panel v2, phase 5: insights and the system ----
// Feature switches (on/off, a share of people, named people), the emergency read-only switch, announcements (a banner
// with a kind and a time window) and broadcasts (an in-app notification and a phone push to everyone, to creators or
// by language, with the count shown first), the system's health (mail, calls, R2, database, errors, settings set or
// not — never their values), and analytics: growth and retention from activity_days, how many use each part of the
// app, and what people search for (with the searches that found nothing). The app reports page opens and searches
// through POST /api/t: a page name, or a search's words and result count — never who searched.
'use strict';
const crypto = require('node:crypto');

const DAY = 864e5, HOUR = 3600e3, TZ = 6 * HOUR;
const bn = n => String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
// the switches; rollout: false for one that has no person to count (sign-up happens before an account exists)
const FLAGS = {
  signups: { bn: 'নতুন অ্যাকাউন্ট খোলা', rollout: false }, posts: { bn: 'পোস্ট ও স্টোরি', rollout: true }, live: { bn: 'লাইভ', rollout: true },
  chat: { bn: 'চ্যাট ও কল', rollout: true }, payouts: { bn: 'ক্রিয়েটরের টাকা তোলার অনুরোধ', rollout: true }
};
// the parts of the app that report when they open (the app's page names)
const FEATURES = { home: 'হোম', trip: 'ম্যাপ ও রুট', buses: 'নগরপথ (ঢাকার বাস)', train: 'ট্রেন', districts: 'রূপসী বাংলা', nearby: 'কাছাকাছি', fares: 'ভাড়া', chat: 'চ্যাট', explore: 'এক্সপ্লোর',
  live: 'লাইভ', profile: 'প্রোফাইল', support: 'সাহায্য', settings: 'সেটিংস', insights: 'ইনসাইট', more: 'আরও' };
const ENV = [['ADMIN_EMAILS', 'Owner-এর ই-মেইল'], ['SITE_URL', 'সাইটের ঠিকানা'], ['DATA_DIR', 'ডেটার ফোল্ডার'], ['BREVO_API_KEY', 'Brevo মেইল'], ['MAIL_FROM', 'মেইল পাঠানোর ঠিকানা'], ['HELP_EMAIL', 'সাহায্যের ই-মেইল'],
  ['R2_BACKUP', 'R2 ব্যাকআপ চালু'], ['R2_BUCKET', 'R2 বাকেট'], ['R2_ENDPOINT', 'R2 ঠিকানা'], ['R2_ACCESS_KEY_ID', 'R2 কী'], ['R2_SECRET_ACCESS_KEY', 'R2 গোপন কী'], ['MEDIA_HOST', 'মিডিয়ার ডোমেইন'],
  ['METERED_APP', 'Metered (কল)'], ['METERED_KEY', 'Metered কী'], ['TURN_URL', 'নিজের TURN (কল)'], ['ESRI_KEY', 'ম্যাপের কী'], ['JAMENDO_ID', 'গানের লাইব্রেরি']];

module.exports = function adminSystem(A, ctx) {
  const { db, json, readBody, push, pushTo, clientIp, userOf, mailInfo, hasTurn, backupOn, lastBackup, dbBytes } = ctx;
  const count = (sql, ...a) => { try { return db.prepare(sql).get(...a).n; } catch { return 0; } };
  const now = () => Date.now();
  const fail = (res, s, e, x) => json(res, s, { error: e, ...x });
  const R = (k, o, f) => A.register(k, o, f);
  const clean = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  const setting = (k, d) => { try { const v = (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) || {}).value; return v ? JSON.parse(v) : d; } catch { return d; } };
  const setSetting = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
  const dayNo = t => Math.floor((t + TZ) / DAY), dayStart = d => d * DAY - TZ, today = () => dayNo(now());

  // ---- schema (added only) ----
  // rollout: the old code reads settings.flag_*; those are kept in step with the on/off here.
  db.exec("CREATE TABLE IF NOT EXISTS feature_flags (key TEXT PRIMARY KEY, on_ INTEGER NOT NULL DEFAULT 1, rollout INTEGER NOT NULL DEFAULT 100, users_json TEXT NOT NULL DEFAULT '[]', updated INTEGER NOT NULL DEFAULT 0, by INTEGER NOT NULL DEFAULT 0)");
  db.exec("CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY, text TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'info', starts INTEGER NOT NULL, ends INTEGER NOT NULL DEFAULT 0, ended INTEGER NOT NULL DEFAULT 0, by INTEGER NOT NULL, created INTEGER NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS broadcasts (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, body_en TEXT NOT NULL DEFAULT '', target TEXT NOT NULL, count INTEGER NOT NULL, by INTEGER NOT NULL, at INTEGER NOT NULL)");
  db.exec('CREATE TABLE IF NOT EXISTS feature_use (day INTEGER NOT NULL, feature TEXT NOT NULL, who TEXT NOT NULL, PRIMARY KEY (day, feature, who))');
  db.exec('CREATE INDEX IF NOT EXISTS feature_use_f ON feature_use (feature, day)');
  db.exec("CREATE TABLE IF NOT EXISTS search_log (id INTEGER PRIMARY KEY, day INTEGER NOT NULL, q TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'place', results INTEGER NOT NULL, picked TEXT NOT NULL DEFAULT '')");
  db.exec('CREATE INDEX IF NOT EXISTS search_log_day ON search_log (day)');
  // the switches as they were (settings.flag_*), once
  for (const k of Object.keys(FLAGS)) {
    if (db.prepare('SELECT 1 FROM feature_flags WHERE key = ?').get(k)) continue;
    const old = (db.prepare('SELECT value FROM settings WHERE key = ?').get('flag_' + k) || {}).value;
    db.prepare('INSERT INTO feature_flags (key, on_, updated) VALUES (?, ?, ?)').run(k, old === '0' ? 0 : 1, now());
  }
  // the old one-line notice becomes the first announcement, once
  const oldNotice = (db.prepare("SELECT value FROM settings WHERE key = 'notice'").get() || {}).value;
  if (oldNotice && !count('SELECT COUNT(*) AS n FROM announcements')) db.prepare("INSERT INTO announcements (text, kind, starts, by, created) VALUES (?, 'info', ?, 0, ?)").run(oldNotice, now(), now());
  // keep a year of page opens and searches
  setInterval(() => { db.prepare('DELETE FROM feature_use WHERE day < ?').run(today() - 400); db.prepare('DELETE FROM search_log WHERE day < ?').run(today() - 400); }, 6 * HOUR).unref();

  // ---- the switches ----
  const flagRow = k => db.prepare('SELECT * FROM feature_flags WHERE key = ?').get(k);
  const bucket = (k, uid) => crypto.createHash('sha1').update(k + ':' + uid).digest().readUInt32BE(0) % 100;
  // on for this person? off = off for everyone; then the named people; then their share (the same people each time)
  function flag(key, uid, def = true) {
    const r = flagRow(key);
    if (!r) return def;
    if (!r.on_) return false;
    if (!FLAGS[key] || !FLAGS[key].rollout || r.rollout >= 100) return true;
    if (!uid) return r.rollout > 0;
    if (JSON.parse(r.users_json || '[]').includes(uid)) return true;
    return bucket(key, uid) < r.rollout;
  }
  const flagOut = k => { const r = flagRow(k) || { on_: 1, rollout: 100, users_json: '[]', updated: 0, by: 0 }; const users = JSON.parse(r.users_json || '[]');
    return { key: k, label: FLAGS[k].bn, rollable: FLAGS[k].rollout, on: !!r.on_, rollout: r.rollout, users: users.map(id => { const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id); return u ? A.personOut(u) : { id, name: '—' }; }),
      updated: r.updated, by: r.by ? (db.prepare('SELECT name FROM users WHERE id = ?').get(r.by) || {}).name : '' }; };
  R('GET flags2', { perm: 'flags.manage' }, ({ res }) => json(res, 200, { flags: Object.keys(FLAGS).map(flagOut), readonly: readonly(), people: count('SELECT COUNT(*) AS n FROM users WHERE deleted_at = 0 AND banned = 0') }));
  R('POST flags2/set', { perm: 'flags.manage' }, ({ req, res, user, body }) => {
    const k = String(body.key || '');
    if (!FLAGS[k]) return fail(res, 400, 'bad request');
    if (!clean(body.reason, 40)) return fail(res, 400, 'reason');
    const before = flagOut(k), on = typeof body.on === 'boolean' ? body.on : before.on;
    const rollout = FLAGS[k].rollout ? Math.max(0, Math.min(100, Math.round(Number(body.rollout ?? before.rollout)))) : 100;
    let ids = before.users.map(u => u.id);
    if (Array.isArray(body.users)) {
      ids = [];
      for (const x of body.users.slice(0, 200)) {
        const s = String(x).trim().replace(/^@/, '').toLowerCase();
        const u = db.prepare('SELECT id FROM users WHERE id = ? OR username = ? OR lower(email) = ?').get(Number(s) || -1, s, s);
        if (!u) return fail(res, 400, 'user', { who: String(x).slice(0, 40) });
        if (!ids.includes(u.id)) ids.push(u.id);
      }
    }
    db.prepare('UPDATE feature_flags SET on_ = ?, rollout = ?, users_json = ?, updated = ?, by = ? WHERE key = ?').run(on ? 1 : 0, rollout, JSON.stringify(ids), now(), user.id, k);
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run('flag_' + k, on ? '1' : '0');
    const after = flagOut(k);
    A.audit(user.id, 'flag.set', { type: 'flag', id: k, before: { on: before.on, rollout: before.rollout, users: before.users.length }, after: { on: after.on, rollout: after.rollout, users: after.users.length }, reason: clean(body.reason, 40), note: clean(body.note, 300), req });
    json(res, 200, { flag: after });
  });

  // ---- the emergency switch: the whole app read-only ----
  const readonly = () => setting('readonly', { on: false, message: '', since: 0, by: 0 });
  const READONLY_DEFAULT = 'রক্ষণাবেক্ষণ চলছে — কিছুক্ষণের জন্য নতুন কিছু পাঠানো যাবে না। দেখা আর খোঁজা চলবে।';
  // a POST the app may still make while read-only: signing in and out (the team must get in), the panel itself
  const ALLOWED = ['/api/admin/', '/api/auth/code', '/api/auth/verify', '/api/auth/logout', '/api/auth/2fa-', '/api/auth/session', '/api/push/', '/api/t'];
  function blocked(req, pathname) {
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'DELETE') return null;
    if (!pathname.startsWith('/api/') || ALLOWED.some(p => p === '/api/t' ? pathname === p : pathname.startsWith(p))) return null;
    const r = readonly();
    return r.on ? (r.message || READONLY_DEFAULT) : null;
  }
  R('POST readonly/set', { perm: 'killswitch', stepup: true }, ({ req, res, user, body }) => {
    if (!clean(body.reason, 40)) return fail(res, 400, 'reason');
    const before = readonly(), on = !!body.on;
    const next = { on, message: on ? (clean(body.message, 240) || READONLY_DEFAULT) : '', since: on ? (before.on ? before.since : now()) : 0, by: user.id };
    setSetting('readonly', next);
    A.audit(user.id, on ? 'killswitch.on' : 'killswitch.off', { type: 'app', id: 'readonly', before: { on: before.on }, after: { on, message: next.message }, reason: clean(body.reason, 40), note: clean(body.note, 300), req });
    A.broadcast('counts', {}, 'dashboard.view');
    json(res, 200, { readonly: next });
  });

  // ---- announcements: the banner in the app ----
  const KINDS = ['info', 'warn', 'urgent'];
  const annOut = a => ({ id: a.id, text: a.text, kind: a.kind, starts: a.starts, ends: a.ends, ended: a.ended, created: a.created,
    by: a.by ? (db.prepare('SELECT name FROM users WHERE id = ?').get(a.by) || {}).name : '', state: a.ended ? 'ended' : a.starts > now() ? 'scheduled' : a.ends && a.ends <= now() ? 'over' : 'live' });
  // what the app shows now: the most serious live one, the newest first
  function currentNotice() {
    const t = now();
    const a = db.prepare("SELECT * FROM announcements WHERE ended = 0 AND starts <= ? AND (ends = 0 OR ends > ?) ORDER BY CASE kind WHEN 'urgent' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, id DESC LIMIT 1").get(t, t);
    const r = readonly();
    return { text: a ? a.text : '', kind: a ? a.kind : '', id: a ? a.id : 0, readonly: r.on ? { on: true, message: r.message || READONLY_DEFAULT } : { on: false } };
  }
  R('GET notices2', { perm: 'notice.manage' }, ({ res }) => {
    json(res, 200, { announcements: db.prepare('SELECT * FROM announcements ORDER BY id DESC LIMIT 100').all().map(annOut), current: currentNotice(),
      broadcasts: db.prepare('SELECT b.*, u.name FROM broadcasts b LEFT JOIN users u ON u.id = b.by ORDER BY b.id DESC LIMIT 50').all().map(b => ({ id: b.id, title: b.title, body: b.body, bodyEn: b.body_en, target: b.target, count: b.count, by: b.name, at: b.at })) });
  });
  R('POST notices2/save', { perm: 'notice.manage' }, ({ req, res, user, body }) => {
    const text = clean(body.text, 240), kind = KINDS.includes(body.kind) ? body.kind : 'info';
    const starts = Number(body.starts) || now(), ends = Number(body.ends) || 0;
    if (!text) return fail(res, 400, 'text');
    if (ends && ends <= starts) return fail(res, 400, 'window');
    const old = body.id ? db.prepare('SELECT * FROM announcements WHERE id = ?').get(Number(body.id)) : null;
    let id;
    if (old) { db.prepare('UPDATE announcements SET text = ?, kind = ?, starts = ?, ends = ?, ended = 0 WHERE id = ?').run(text, kind, starts, ends, old.id); id = old.id; }
    else id = Number(db.prepare('INSERT INTO announcements (text, kind, starts, ends, by, created) VALUES (?, ?, ?, ?, ?, ?)').run(text, kind, starts, ends, user.id, now()).lastInsertRowid);
    db.prepare("INSERT INTO settings (key, value) VALUES ('notice', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(currentNotice().text);   // the older code's copy
    A.audit(user.id, 'notice.save', { type: 'announcement', id, before: old ? { text: old.text, kind: old.kind, starts: old.starts, ends: old.ends } : null, after: { text, kind, starts, ends }, req });
    json(res, 200, { id });
  });
  R('POST notices2/end', { perm: 'notice.manage' }, ({ req, res, user, body }) => {
    const a = db.prepare('SELECT * FROM announcements WHERE id = ?').get(Number(body.id));
    if (!a) return fail(res, 404, 'not found');
    db.prepare('UPDATE announcements SET ended = ? WHERE id = ?').run(body.undo ? 0 : now(), a.id);
    db.prepare("INSERT INTO settings (key, value) VALUES ('notice', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(currentNotice().text);
    A.audit(user.id, body.undo ? 'notice.restore' : 'notice.end', { type: 'announcement', id: a.id, before: { ended: !!a.ended }, after: { ended: !body.undo }, req });
    json(res, 200, { ok: true });
  });

  // ---- broadcast: a notification in the app and a phone push ----
  const TARGETS = { all: 'সবাই', creators: 'ক্রিয়েটর', bn: 'বাংলায় অ্যাপ ব্যবহারকারী', en: 'ইংরেজিতে অ্যাপ ব্যবহারকারী' };
  // the language is the one their devices use for pushes; people with no device registered count as Bangla
  const recipients = target => {
    const base = "SELECT id FROM users WHERE deleted_at = 0 AND banned = 0";
    if (target === 'creators') return db.prepare(base + " AND creator = 'approved'").all().map(r => r.id);
    if (target === 'en') return db.prepare(base + " AND id IN (SELECT user FROM push_subs WHERE lang = 'en')").all().map(r => r.id);
    if (target === 'bn') return db.prepare(base + " AND id NOT IN (SELECT user FROM push_subs WHERE lang = 'en')").all().map(r => r.id);
    return db.prepare(base).all().map(r => r.id);
  };
  const phones = ids => { if (!ids.length) return 0; try { return db.prepare(`SELECT COUNT(DISTINCT user) AS n FROM push_subs WHERE user IN (${ids.map(Number).join(',')})`).get().n; } catch { return 0; } };
  R('GET broadcast/count', { perm: 'notice.manage' }, ({ res, query }) => {
    const t = TARGETS[query.get('target')] ? query.get('target') : 'all', ids = recipients(t);
    json(res, 200, { target: t, people: ids.length, phones: phones(ids) });
  });
  R('POST broadcast/send', { perm: 'notice.manage' }, ({ req, res, user, body }) => {
    const target = TARGETS[body.target] ? body.target : '', title = clean(body.title, 60) || 'Manzeela', text = clean(body.body, 240), textEn = clean(body.bodyEn, 240);
    if (!target || !text) return fail(res, 400, 'bad request');
    if (!clean(body.reason, 40)) return fail(res, 400, 'reason');
    const ids = recipients(target);
    // the count the sender saw must still be right (nobody broadcasts to more people than they were shown)
    if (Number(body.expect) !== ids.length) return fail(res, 409, 'count', { people: ids.length });
    const last = db.prepare('SELECT at FROM broadcasts ORDER BY id DESC LIMIT 1').get();
    if (last && now() - last.at < 10 * 60_000 && !body.again) return fail(res, 429, 'recent');
    const id = Number(db.prepare('INSERT INTO broadcasts (title, body, body_en, target, count, by, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(title, text, textEn, target, ids.length, user.id, now()).lastInsertRowid);
    const add = db.prepare("INSERT INTO notifications (user, actor, kind, post, body, created) VALUES (?, ?, 'broadcast', 0, ?, ?)");
    db.exec('BEGIN');
    try { for (const uid of ids) add.run(uid, uid, 'broadcast:' + id, now()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    for (const uid of ids) { push(uid, 'notify', {}); try { pushTo(uid, lang => ({ title, body: lang === 'en' && textEn ? textEn : text, tag: 'b-' + id, url: '/#/explore' })); } catch { /* push is optional */ } }
    A.audit(user.id, 'broadcast.send', { type: 'broadcast', id, after: { target, people: ids.length, title, body: text }, reason: clean(body.reason, 40), req });
    json(res, 200, { id, people: ids.length });
  });
  // the app's notification row for one
  function broadcastInfo(b) {
    const m = /^broadcast:(\d+)$/.exec(b || ''); if (!m) return null;
    const x = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(Number(m[1]));
    return x ? { type: 'broadcast', id: x.id, title: x.title, body: x.body, bodyEn: x.body_en } : null;
  }

  // ---- what the app reports: a page opened, a search made ----
  const hits = new Map();
  setInterval(() => hits.clear(), 60_000).unref();
  async function trackApi(req, res) {
    if (req.method !== 'POST') return fail(res, 405, 'method');
    const ip = clientIp(req), n = (hits.get(ip) || 0) + 1; hits.set(ip, n);
    if (n > 120) return fail(res, 429, 'slow');
    let b; try { b = JSON.parse(await readBody(req, 2000)) || {}; } catch { return fail(res, 400, 'bad request'); }
    const me = userOf(req), d = today();
    if (b.f && FEATURES[b.f]) {
      const who = me ? 'u' + me.id : /^[a-z0-9]{8,32}$/.test(String(b.d || '')) ? 'd' + b.d : '';
      if (who) db.prepare('INSERT OR IGNORE INTO feature_use (day, feature, who) VALUES (?, ?, ?)').run(d, b.f, who);
    }
    if (typeof b.s === 'string') {
      const q = b.s.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
      if (q.length >= 2) db.prepare('INSERT INTO search_log (day, q, kind, results, picked) VALUES (?, ?, ?, ?, ?)').run(d, q, ['place', 'bus', 'people'].includes(b.k) ? b.k : 'place', Math.max(0, Math.min(999, Number(b.n) || 0)), clean(b.p, 80));
    }
    res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end();
  }

  // ---- analytics ----
  const range = q => { const n = Number(q.get('days')); return [7, 30, 90].includes(n) ? n : 30; };
  const since = () => (db.prepare('SELECT MIN(day) AS d FROM activity_days').get() || {}).d || today();
  function growth(days) {
    const t = today(), from = t - days + 1;
    const dau = new Map(db.prepare('SELECT day, COUNT(*) AS n FROM activity_days WHERE day >= ? GROUP BY day').all(from - days).map(r => [r.day, r.n]));
    const distinct = (a, b) => count('SELECT COUNT(DISTINCT user) AS n FROM activity_days WHERE day BETWEEN ? AND ?', a, b);
    const signups = new Map(db.prepare(`SELECT CAST((created + ${TZ}) / ${DAY} AS INTEGER) AS day, COUNT(*) AS n FROM users WHERE created >= ? GROUP BY day`).all(dayStart(from - days)).map(r => [r.day, r.n]));
    const series = Array.from({ length: days }, (_, i) => { const d = from + i; return { day: d, at: dayStart(d), dau: dau.get(d) || 0, wau: distinct(d - 6, d), mau: distinct(d - 29, d), signups: signups.get(d) || 0 }; });
    const sum = (a, b, m) => { let s = 0; for (let d = a; d <= b; d++) s += (m.get(d) || 0); return s; };
    const now_ = { active: distinct(from, t), signups: sum(from, t, signups), avgDau: Math.round(sum(from, t, dau) / days) };
    const prev = { active: distinct(from - days, from - 1), signups: sum(from - days, from - 1, signups), avgDau: Math.round(sum(from - days, from - 1, dau) / days) };
    const last = series[series.length - 1];
    // D1 / D7 / D30: of those who signed up on a day we have activity for, how many came back that many days later
    const ret = n => {
      const rows = db.prepare(`SELECT u.id, CAST((u.created + ${TZ}) / ${DAY} AS INTEGER) AS d FROM users u WHERE u.created >= ? AND u.created < ?`).all(dayStart(Math.max(since(), from - 60)), dayStart(t - n + 1));
      if (!rows.length) return null;
      const back = rows.filter(r => db.prepare('SELECT 1 FROM activity_days WHERE user = ? AND day = ?').get(r.id, r.d + n)).length;
      return { pct: Math.round(back / rows.length * 100), of: rows.length };
    };
    // weekly cohorts: the week they signed up (Saturday to Friday is not used — weeks count back from today), then each week after
    const weeks = 8, cohorts = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const a = t - (w + 1) * 7 + 1, b = t - w * 7;
      const ids = db.prepare('SELECT id FROM users WHERE created >= ? AND created < ?').all(dayStart(a), dayStart(b + 1)).map(r => r.id);
      const cells = [];
      for (let k = 0; k <= weeks - 1 - w; k++) {
        if (!ids.length) { cells.push(null); continue; }
        const ca = a + k * 7, cb = b + k * 7;
        const n = db.prepare(`SELECT COUNT(DISTINCT user) AS n FROM activity_days WHERE day BETWEEN ? AND ? AND user IN (${ids.join(',')})`).get(ca, cb).n;
        cells.push(Math.round(n / ids.length * 100));
      }
      cohorts.push({ from: dayStart(a), size: ids.length, cells });
    }
    // activation: those who signed up in the range → opened the map / a route → posted or reported a fare
    const signed = db.prepare('SELECT id FROM users WHERE created >= ? AND deleted_at = 0').all(dayStart(from)).map(r => r.id);
    const list = signed.length ? signed.join(',') : '0';
    const searched = count(`SELECT COUNT(DISTINCT who) AS n FROM feature_use WHERE feature IN ('trip', 'buses') AND who IN (${signed.map(id => "'u" + id + "'").join(',') || "''"})`);
    const contributed = count(`SELECT COUNT(*) AS n FROM users WHERE id IN (${list}) AND (EXISTS (SELECT 1 FROM posts p WHERE p.user = users.id) OR EXISTS (SELECT 1 FROM contributions c WHERE c.user = users.id))`);
    return { days, series, now: now_, prev, today: { dau: last.dau, wau: last.wau, mau: last.mau, stickiness: last.mau ? Math.round(last.dau / last.mau * 100) : 0 },
      retention: { d1: ret(1), d7: ret(7), d30: ret(30) }, cohorts, funnel: [{ step: 'সাইনআপ', n: signed.length }, { step: 'প্রথম রুট/বাস খোঁজা', n: searched }, { step: 'প্রথম পোস্ট বা ভাড়া জানানো', n: contributed }],
      since: dayStart(since()), featureSince: dayStart((db.prepare('SELECT MIN(day) AS d FROM feature_use').get() || {}).d || today()) };
  }
  function features(days) {
    const t = today(), from = t - days + 1;
    const cur = new Map(db.prepare('SELECT feature, COUNT(DISTINCT who) AS n FROM feature_use WHERE day >= ? GROUP BY feature').all(from).map(r => [r.feature, r.n]));
    const prev = new Map(db.prepare('SELECT feature, COUNT(DISTINCT who) AS n FROM feature_use WHERE day BETWEEN ? AND ? GROUP BY feature').all(from - days, from - 1).map(r => [r.feature, r.n]));
    const daily = db.prepare('SELECT day, feature, COUNT(*) AS n FROM feature_use WHERE day >= ? GROUP BY day, feature').all(from);
    const all = count('SELECT COUNT(DISTINCT who) AS n FROM feature_use WHERE day >= ?', from);
    return { days, all, rows: Object.entries(FEATURES).map(([k, label]) => ({ key: k, label, people: cur.get(k) || 0, prev: prev.get(k) || 0, share: all ? Math.round((cur.get(k) || 0) / all * 100) : 0,
      series: Array.from({ length: days }, (_, i) => (daily.find(r => r.day === from + i && r.feature === k) || {}).n || 0) })).sort((a, b) => b.people - a.people),
      since: dayStart((db.prepare('SELECT MIN(day) AS d FROM feature_use').get() || {}).d || today()) };
  }
  function searches(days) {
    const from = today() - days + 1;
    return { days, total: count('SELECT COUNT(*) AS n FROM search_log WHERE day >= ?', from),
      top: db.prepare("SELECT picked AS q, COUNT(*) AS n FROM search_log WHERE day >= ? AND picked <> '' GROUP BY picked ORDER BY n DESC LIMIT 30").all(from),
      none: db.prepare('SELECT q, COUNT(*) AS n, MAX(day) AS last FROM search_log WHERE day >= ? AND results = 0 GROUP BY q ORDER BY n DESC LIMIT 30').all(from).map(r => ({ ...r, last: dayStart(r.last) })),
      since: dayStart((db.prepare('SELECT MIN(day) AS d FROM search_log').get() || {}).d || today()) };
  }
  R('GET analytics/growth', { perm: 'analytics.view' }, ({ res, query }) => json(res, 200, growth(range(query))));
  R('GET analytics/features', { perm: 'analytics.view' }, ({ res, query }) => json(res, 200, features(range(query))));
  R('GET analytics/searches', { perm: 'analytics.view' }, ({ res, query }) => json(res, 200, searches(range(query))));
  const csvOut = (res, name, head, rows) => {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="manzeela-${name}.csv"`, 'Cache-Control': 'no-store' });
    res.end('﻿' + [head.join(','), ...rows.map(r => r.map(q).join(','))].join('\n'));
  };
  const isoDay = at => new Date(at + TZ).toISOString().slice(0, 10);
  R('GET analytics.csv', { perm: 'analytics.view' }, ({ req, res, user, query }) => {
    const kind = query.get('kind'), days = range(query);
    let rows;
    if (kind === 'features') { const f = features(days); rows = f.rows.map(r => [r.key, r.label, r.people, r.prev]); csvOut(res, `features-${days}d`, ['feature', 'name', 'people', 'previous period'], rows); }
    else if (kind === 'searches') { const s = searches(days); rows = [...s.top.map(r => ['picked', r.q, r.n]), ...s.none.map(r => ['no result', r.q, r.n])]; csvOut(res, `searches-${days}d`, ['type', 'search', 'times'], rows); }
    else { const g = growth(days); rows = g.series.map(r => [isoDay(r.at), r.dau, r.wau, r.mau, r.signups]); csvOut(res, `growth-${days}d`, ['day (Dhaka)', 'DAU', 'WAU', 'MAU', 'signups'], rows); }
    A.audit(user.id, 'export.csv', { type: 'analytics', id: (kind || 'growth') + ':' + days, after: { rows: rows.length }, req });
  });

  // ---- every account, as a spreadsheet (was in the older panel) ----
  R('GET users.csv', { perm: 'pii.unmask' }, ({ req, res, user }) => {
    const rows = db.prepare('SELECT id, name, username, email, role, verified, banned, points, created, seen, deleted_at FROM users ORDER BY id').all();
    csvOut(res, 'users-' + isoDay(now()), ['id', 'name', 'username', 'email', 'role', 'verified', 'banned', 'points', 'joined', 'last seen', 'deleted'],
      rows.map(u => [u.id, u.name, u.username, u.email, A.roleOf(u) || u.role, u.verified ? 'yes' : '', u.banned ? 'yes' : '', u.points, isoDay(u.created), u.seen ? isoDay(u.seen) : '', u.deleted_at ? 'yes' : '']));
    A.audit(user.id, 'export.csv', { type: 'users', id: 'all', after: { rows: rows.length }, note: 'ই-মেইলসহ', req });
  });

  // ---- system health ----
  const statusLog = [];   // [hour, requests, errors] for the last 48 hours
  function noteStatus(code) {
    const h = Math.floor(now() / HOUR);
    let last = statusLog[statusLog.length - 1];
    if (!last || last[0] !== h) { last = [h, 0, 0]; statusLog.push(last); while (statusLog.length > 48) statusLog.shift(); }
    last[1]++; if (code >= 500) last[2]++;
  }
  R('GET health', { perm: 'system.view' }, ({ res }) => {
    const h = Math.floor(now() / HOUR), day = statusLog.filter(x => x[0] > h - 24);
    const req24 = day.reduce((s, x) => s + x[1], 0), err24 = day.reduce((s, x) => s + x[2], 0);
    const last = lastBackup(), m = mailInfo();
    const r2files = count('SELECT COUNT(*) AS n FROM r2_files'), r2public = count('SELECT COUNT(*) AS n FROM r2_public');
    const tone = (ok, warn) => ok ? 'ok' : warn ? 'warn' : 'danger';
    const checks = [
      { key: 'mail', label: 'মেইল', tone: tone(m.ready && !m.failed, m.ready), text: m.ready ? `${m.provider} · আজ পাঠানো ${bn(m.sent)}, ব্যর্থ ${bn(m.failed)}` : 'মেইল সেট করা নেই — লগইন কোড যাবে না' },
      { key: 'turn', label: 'কল (TURN)', tone: tone(hasTurn(), false), text: hasTurn() ? (process.env.METERED_APP ? 'Metered' : 'নিজের TURN') + ' সেট করা আছে' : 'নেই — কিছু নেটওয়ার্কে কল জুড়বে না' },
      { key: 'r2', label: 'R2 ব্যাকআপ', tone: !backupOn ? 'warn' : !last || now() - last > DAY ? 'danger' : 'ok', text: !backupOn ? 'ব্যাকআপ চালু নেই (R2_BACKUP)' : last ? `শেষ কপি ${bn(Math.round((now() - last) / 60000))} মিনিট আগে · ${bn(r2files)}টি মিডিয়া ফাইল` : 'এখনো কোনো কপি হয়নি' },
      { key: 'db', label: 'ডাটাবেস', tone: 'ok', text: `${bn((dbBytes() / 1048576).toFixed(1))} MB` },
      { key: 'errors', label: 'সার্ভারের এরর (৫xx)', tone: !req24 ? 'ok' : err24 / req24 > 0.02 ? 'danger' : err24 ? 'warn' : 'ok', text: req24 ? `শেষ ২৪ ঘণ্টায় ${bn(err24)}টি — ${bn(req24)} অনুরোধের ${bn((err24 / req24 * 100).toFixed(2))}%` : 'সার্ভার চালু হওয়ার পর এখনো অনুরোধ নেই' }
    ];
    json(res, 200, { checks, uptime: Math.round(process.uptime()), node: process.version, startedAt: now() - Math.round(process.uptime() * 1000), readonly: readonly(),
      errors: Array.from({ length: 24 }, (_, i) => { const x = statusLog.find(s => s[0] === h - 23 + i); return { at: (h - 23 + i) * HOUR, requests: x ? x[1] : 0, errors: x ? x[2] : 0 }; }),
      env: ENV.map(([name, label]) => ({ name, label, set: name === 'BREVO_API_KEY' ? !!(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY || process.env.SMTP_HOST) : !!process.env[name] })),
      r2: { files: r2files, public: r2public, prefix: process.env.R2_PREFIX ? 'আলাদা প্রিফিক্স' : 'ডিফল্ট' } });
  });

  return { flag, blocked, currentNotice, broadcastInfo, trackApi, noteStatus, readonly };
};
