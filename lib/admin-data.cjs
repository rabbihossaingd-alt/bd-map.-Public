// ---- Admin panel v2, phase 3: content and transport data ----
// Content (posts and reels, stories, comments with flagged words first, sounds, groups), the media on disk and on R2,
// reported fares beside the BRTA rate and the community's middle value, review of place photos and মেঠোপথ, the Dhaka
// bus routes and stops (edits kept in the database and laid over the generated data file, which the server then
// serves — the app needs no change), the intercity data with suspicious ratings, and automatic data-quality checks.
// Registered on the v2 gate (lib/admin-v2.cjs): session, CSRF, permissions, rate; every change is logged.
'use strict';
const vm = require('node:vm');
const crypto = require('node:crypto');

const DAY = 864e5, HOUR = 3600e3;
// words that put a comment at the top of the comment queue (Bangla, Banglish, English); editable in phase 4
const FLAG_WORDS = ['শালা', 'হারামি', 'কুত্তা', 'বাস্টার্ড', 'মাগি', 'চুদ', 'বাল', 'শুয়োর', 'মেরে ফেলব', 'খুন করব', 'sala', 'harami', 'kutta', 'magi', 'chud', 'bal ', 'fuck', 'bitch', 'bastard', 'kill you', 'http://', 'https://', 'wa.me', 't.me/', 'bit.ly'];

module.exports = function adminData(A, ctx) {
  const { db, json, fs, path, ROOT, MEDIA_DIR, deletePost, deleteStory, unlinkMedia, leaveGroup, groupMembers, push, videoSecs, publishNow, groupCalls } = ctx;
  const count = (sql, ...a) => { try { return db.prepare(sql).get(...a).n; } catch { return 0; } };
  const now = () => Date.now();
  const fail = (res, s, e) => json(res, s, { error: e });
  const R = (k, o, f) => A.register(k, o, f);
  const clean = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  const person = u => u ? A.personOut(u) : null;
  const userRow = id => db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  const needReason = (res, body) => { if (!clean(body.reason, 40)) { fail(res, 400, 'reason'); return false; } return true; };

  // ---- the data files, read as the app reads them ----
  const read = f => fs.readFileSync(path.join(ROOT, 'data', f), 'utf8');
  const BASE = vm.runInNewContext(read('fares.js') + '\n' + read('bangladesh.js') + '\n' + read('dhaka-buses.js') + '\n' + read('places.js') +
    '\n;({ FARES, DISTRICTS, OPERATORS, BRTA_FARES, MARKET_FARES, TERMINALS, STOPS, LOCAL_ROUTES, PLACES })', {});
  const FARES = BASE.FARES;
  const keyOf = en => String(en).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const km = (a, b) => { const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const inZone = (p, z) => km(p, z) <= z.r;

  // ---- schema (added only) ----
  db.exec('CREATE TABLE IF NOT EXISTS route_edits (key TEXT PRIMARY KEY, data_json TEXT NOT NULL, by INTEGER NOT NULL, at INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS route_versions (id INTEGER PRIMARY KEY, key TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, by INTEGER NOT NULL, at INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS stop_edits (id TEXT PRIMARY KEY, data_json TEXT NOT NULL, by INTEGER NOT NULL, at INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS data_quality (key TEXT PRIMARY KEY, status TEXT NOT NULL, by INTEGER NOT NULL, at INTEGER NOT NULL, note TEXT NOT NULL DEFAULT \'\')');
  // a fare taken off the app by the team (kept, so it can be put back)
  for (const t of ['contributions', 'fare_reports'])
    if (!db.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('${t}') WHERE name = 'hidden'`).get().n) db.exec(`ALTER TABLE ${t} ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`);

  // ---- Dhaka buses: the generated file plus the team's edits ----
  const editsOf = () => new Map(db.prepare('SELECT * FROM route_edits').all().map(e => [e.key, { ...JSON.parse(e.data_json), by: e.by, at: e.at }]));
  const stopEditsOf = () => new Map(db.prepare('SELECT * FROM stop_edits').all().map(e => [e.id, { ...JSON.parse(e.data_json), by: e.by, at: e.at }]));
  function stopsNow() {
    const out = {};
    for (const [id, s] of Object.entries(BASE.STOPS)) out[id] = { bn: s.bn, en: s.en, lat: s.lat, lon: s.lon };
    for (const [id, e] of stopEditsOf()) out[id] = { bn: e.bn, en: e.en, lat: e.lat, lon: e.lon, edited: true, isNew: !BASE.STOPS[id] };
    return out;
  }
  function routesNow() {
    const edits = editsOf(), seen = new Set(), out = [];
    for (const r of BASE.LOCAL_ROUTES) {
      const key = keyOf(r.en), e = edits.get(key); seen.add(key);
      out.push({ key, bn: e ? e.bn : r.bn, en: e ? e.en : r.en, stops: e ? e.stops : r.stops, hidden: !!(e && e.hidden), edited: !!e, isNew: false, original: { bn: r.bn, en: r.en, stops: r.stops } });
    }
    for (const [key, e] of edits) if (!seen.has(key)) out.push({ key, bn: e.bn, en: e.en, stops: e.stops, hidden: !!e.hidden, edited: true, isNew: true, original: null });
    return out;
  }
  // the data file the app downloads: the same shape as tools/build-buses.py writes, with the edits in it
  let busCache = { stamp: '', text: null };
  function busesJs() {
    const st = db.prepare('SELECT COUNT(*) AS n, MAX(at) AS t FROM route_edits').get(), ss = db.prepare('SELECT COUNT(*) AS n, MAX(at) AS t FROM stop_edits').get();
    if (!st.n && !ss.n) return null;
    const stamp = `${st.n}:${st.t}:${ss.n}:${ss.t}`;
    if (busCache.stamp === stamp) return busCache.text;
    const stops = stopsNow(), routes = routesNow().filter(r => !r.hidden && r.stops.every(id => stops[id]));
    const q = s => JSON.stringify(String(s));
    const text = ['// ---- Dhaka-area local buses ----', '// GENERATED by tools/build-buses.py, with the admin panel\'s edits laid over it by the server (lib/admin-data.cjs).', '',
      'const STOPS = {', ...Object.entries(stops).map(([id, s]) => `  ${q(id)}: [${q(s.bn)}, ${q(s.en)}, ${Number(s.lat).toFixed(4)}, ${Number(s.lon).toFixed(4)}],`), '};',
      'for (const id in STOPS) {', '  const [bn, en, lat, lon] = STOPS[id];', '  STOPS[id] = { bn, en, lat, lon };', '}', '',
      'const LOCAL_ROUTES = [', ...routes.map(r => `  [${q(r.bn)}, ${q(r.en)}, ${q(r.stops.join(' '))}],`), '].map(([bn, en, stops]) => ({ bn, en, stops: stops.split(\' \') }));', ''].join('\n');
    busCache = { stamp, text };
    return text;
  }

  // ---- the reference fare for a reported trip: what the app itself would say, from the same rules ----
  function refFare(mode, a, b) {
    const d = km(a, b) * (FARES.bus.roadFactor || 1);
    if (mode === 'bus') {
      const zone = FARES.zones || {}, city = zone.dhakaMetro && inZone(a, zone.dhakaMetro) && inZone(b, zone.dhakaMetro);
      const rule = city ? FARES.bus.metro : d > 60 ? FARES.bus.intercity : FARES.bus.dtca;
      return { km: d, fare: Math.max(rule.min, Math.round(rule.perKm * d)), label: `BRTA ${rule.label}: ৳${rule.perKm}/কিমি, ন্যূনতম ৳${rule.min}` };
    }
    if (mode === 'cng') { const c = FARES.cng; return { km: d, fare: Math.round(c.base + Math.max(0, d - c.baseKm) * c.perKm), label: `সরকারি মিটার: প্রথম ${c.baseKm} কিমি ৳${c.base}, পরে ৳${c.perKm}/কিমি` }; }
    return { km: d, fare: null, label: 'লঞ্চের জন্য অ্যাপে কোনো সরকারি রেট নেই' };
  }
  const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
  const credOf = new Map();
  function credibility(userId) {
    if (credOf.has(userId)) return credOf.get(userId);
    const total = count('SELECT COUNT(*) AS n FROM contributions WHERE user = ?', userId) + count('SELECT COUNT(*) AS n FROM fare_reports WHERE device = ?', 'u' + userId);
    const ok = count('SELECT COUNT(*) AS n FROM contributions WHERE user = ? AND ok = 1 AND hidden = 0', userId) + count('SELECT COUNT(*) AS n FROM fare_reports WHERE device = ? AND ok = 1 AND hidden = 0', 'u' + userId);
    const hid = count('SELECT COUNT(*) AS n FROM contributions WHERE user = ? AND hidden = 1', userId) + count('SELECT COUNT(*) AS n FROM fare_reports WHERE device = ? AND hidden = 1', 'u' + userId);
    const c = { total, ok, hidden: hid }; credOf.set(userId, c); return c;
  }
  R('GET fares2', { perm: 'data.approve' }, ({ res, query }) => {
    credOf.clear();
    const status = query.get('status') || 'pending', mode = query.get('mode') || '';
    const stops = stopsNow();
    const want = r => status === 'all' ? true : status === 'hidden' ? r.hidden : status === 'approved' ? r.ok && !r.hidden : !r.ok && !r.hidden;
    const all = db.prepare('SELECT c.*, u.name, u.username, u.pic_v FROM contributions c LEFT JOIN users u ON u.id = c.user ORDER BY c.id DESC LIMIT 2000').all();
    const rows = [];
    for (const c of all) {
      const r = { kind: 'trip', id: String(c.id), mode: c.mode, fare: c.fare, created: c.created, ok: !!c.ok, hidden: !!c.hidden, from: { label: c.flabel, lat: c.flat, lon: c.flon }, to: { label: c.tlabel, lat: c.tlat, lon: c.tlon },
        user: c.name ? { id: c.user, name: c.name, username: c.username, pic: c.pic_v } : null };
      if (!want(r) || (mode && mode !== c.mode)) continue;
      const others = all.filter(o => o.id !== c.id && !o.hidden && o.mode === c.mode && ((km({ lat: o.flat, lon: o.flon }, r.from) <= 0.7 && km({ lat: o.tlat, lon: o.tlon }, r.to) <= 0.7) || (km({ lat: o.flat, lon: o.flon }, r.to) <= 0.7 && km({ lat: o.tlat, lon: o.tlon }, r.from) <= 0.7))).map(o => o.fare);
      const ref = refFare(c.mode, r.from, r.to);
      Object.assign(r, { km: Math.round(ref.km * 10) / 10, ref: ref.fare, refLabel: ref.label, median: median(others), n: others.length, cred: c.user ? credibility(c.user) : null });
      rows.push(r);
    }
    if (!mode || mode === 'stop') {
      const reps = db.prepare('SELECT * FROM fare_reports ORDER BY updated DESC LIMIT 2000').all();
      for (const f of reps) {
        const uid = /^u\d+$/.test(f.device) ? Number(f.device.slice(1)) : 0, u = uid ? userRow(uid) : null;
        const a = stops[f.a], b = stops[f.b];
        const r = { kind: 'stop', id: `${f.a}|${f.b}|${f.device}`, mode: 'stop', fare: f.fare, created: f.updated, ok: !!f.ok, hidden: !!f.hidden, from: a ? { label: a.bn, lat: a.lat, lon: a.lon } : { label: f.a }, to: b ? { label: b.bn, lat: b.lat, lon: b.lon } : { label: f.b },
          user: u ? { id: u.id, name: u.name, username: u.username, pic: u.pic_v } : null, anonymous: !uid };
        if (!want(r)) continue;
        const others = reps.filter(o => o.a === f.a && o.b === f.b && o.device !== f.device && !o.hidden).map(o => o.fare);
        const ref = a && b ? refFare('bus', a, b) : { km: 0, fare: null, label: 'স্টপ খুঁজে পাওয়া যায়নি' };
        Object.assign(r, { km: Math.round(ref.km * 10) / 10, ref: ref.fare, refLabel: ref.label, median: median(others), n: others.length, cred: uid ? credibility(uid) : null });
        rows.push(r);
      }
    }
    rows.sort((x, y) => y.created - x.created);
    json(res, 200, { rows: rows.slice(0, 600), total: rows.length });
  });
  // approve, take back, hide, put back — one or many; each pays or takes back the 10 points once
  const POINTS = 10;
  function fareRow(it) {
    if (it.kind === 'trip') return { row: db.prepare('SELECT * FROM contributions WHERE id = ?').get(Number(it.id)), table: 'contributions', where: 'id = ?', args: [Number(it.id)] };
    const [a, b, device] = String(it.id).split('|');
    return { row: db.prepare('SELECT * FROM fare_reports WHERE a = ? AND b = ? AND device = ?').get(a, b, device), table: 'fare_reports', where: 'a = ? AND b = ? AND device = ?', args: [a, b, device] };
  }
  const ownerOf = (it, row) => it.kind === 'trip' ? row.user : /^u\d+$/.test(row.device) ? Number(row.device.slice(1)) : 0;
  const points = (uid, d) => { if (uid) db.prepare('UPDATE users SET points = MAX(0, points + ?) WHERE id = ?').run(d, uid); };
  R('POST fares2/act', { perm: 'data.approve' }, ({ req, res, user, body }) => {
    const act = String(body.do || ''), items = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
    if (!['approve', 'unapprove', 'hide', 'unhide'].includes(act) || !items.length) return fail(res, 400, 'bad request');
    if (act === 'hide' && !needReason(res, body)) return;
    const done = [];
    db.exec('BEGIN');
    try {
      for (const it of items) {
        const f = fareRow(it); if (!f.row) continue;
        const r = f.row, uid = ownerOf(it, r), was = { ok: !!r.ok, hidden: !!r.hidden };
        let next = { ...was };
        if (act === 'approve' && !r.ok) { next.ok = true; if (!r.hidden) points(uid, POINTS); }
        if (act === 'unapprove' && r.ok) { next.ok = false; if (!r.hidden) points(uid, -POINTS); }
        if (act === 'hide' && !r.hidden) { next.hidden = true; if (r.ok) points(uid, -POINTS); }
        if (act === 'unhide' && r.hidden) { next.hidden = false; if (r.ok) points(uid, POINTS); }
        if (next.ok === was.ok && next.hidden === was.hidden) continue;
        db.prepare(`UPDATE ${f.table} SET ok = ?, hidden = ? WHERE ${f.where}`).run(next.ok ? 1 : 0, next.hidden ? 1 : 0, ...f.args);
        A.audit(user.id, 'fare.' + act, { type: 'fare', id: it.kind + ':' + it.id, before: was, after: next, reason: clean(body.reason, 40), note: clean(body.note, 300), req });
        done.push(it);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    json(res, 200, { done });
  });

  // ---- place photos and মেঠোপথ: review with duplicates ----
  R('GET review', { perm: 'data.approve' }, ({ res, query }) => {
    const kind = query.get('kind') === 'gem' ? 'gem' : 'photo', status = ['pending', 'ok', 'no'].includes(query.get('status')) ? query.get('status') : 'pending';
    if (kind === 'photo') {
      const rows = db.prepare(`SELECT p.*, u.name AS uname, u.username, u.pic_v FROM place_photos p JOIN users u ON u.id = p.user WHERE p.status = ? ORDER BY ${status === 'pending' ? 'p.id' : 'p.decided DESC'} LIMIT 200`).all(status);
      return json(res, 200, { items: rows.map(p => ({ id: p.id, title: p.name, district: p.district, key: p.key, src: 'media/' + p.file, created: p.created, decided: p.decided, status: p.status,
        user: { id: p.user, name: p.uname, username: p.username, pic: p.pic_v },
        same: db.prepare("SELECT id, file, status FROM place_photos WHERE key = ? AND id <> ? AND status <> 'no' LIMIT 6").all(p.key, p.id).map(x => ({ id: x.id, src: 'media/' + x.file, status: x.status })) })),
        waiting: count("SELECT COUNT(*) AS n FROM place_photos WHERE status = 'pending'") });
    }
    const rows = db.prepare(`SELECT g.*, u.name AS uname, u.username, u.pic_v FROM gems g JOIN users u ON u.id = g.user WHERE g.status = ? ORDER BY ${status === 'pending' ? 'g.id' : 'g.decided DESC'} LIMIT 200`).all(status);
    const others = db.prepare("SELECT id, name, district, lat, lon, status FROM gems WHERE status <> 'no'").all();
    const norm = s => String(s || '').toLowerCase().replace(/[\s\-.,()]/g, '');
    json(res, 200, { items: rows.map(g => ({ id: g.id, title: g.name, district: g.district, kind: g.kind, place: g.place, about: g.about, how: g.how, lat: g.lat, lon: g.lon, created: g.created, decided: g.decided, status: g.status,
      photos: JSON.parse(g.files || '[]').map(f => 'media/' + f), user: { id: g.user, name: g.uname, username: g.username, pic: g.pic_v },
      same: others.filter(o => o.id !== g.id && ((g.lat != null && o.lat != null && km(g, o) < 1.5) || (o.district === g.district && (norm(o.name).includes(norm(g.name)) || norm(g.name).includes(norm(o.name)))))).slice(0, 5)
        .map(o => ({ id: o.id, name: o.name, status: o.status, km: g.lat != null && o.lat != null ? Math.round(km(g, o) * 10) / 10 : null })) })),
      waiting: count("SELECT COUNT(*) AS n FROM gems WHERE status = 'pending'") });
  });
  R('POST review/decide', { perm: 'data.approve' }, ({ req, res, user, body }) => {
    const kind = body.kind === 'gem' ? 'gem' : 'photo', table = kind === 'gem' ? 'gems' : 'place_photos', to = { approve: 'ok', reject: 'no', pending: 'pending' }[body.do];
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(body.id));
    if (!row || !to) return fail(res, row ? 400 : 404, row ? 'bad request' : 'not found');
    if (to === 'no' && !needReason(res, body)) return;
    db.prepare(`UPDATE ${table} SET status = ?, decided = ?, by = ? WHERE id = ?`).run(to, to === 'pending' ? 0 : now(), user.id, row.id);
    A.audit(user.id, kind + '.' + body.do, { type: kind, id: row.id, before: { status: row.status }, after: { status: to }, reason: clean(body.reason, 40), note: clean(body.note, 300), req });
    json(res, 200, { ok: true, before: row.status });
  });

  // ---- content ----
  const reportsOfPost = id => count('SELECT COUNT(*) AS n FROM reports WHERE reason LIKE ?', `[পোস্ট #${id}]%`);
  R('GET posts2', { perm: 'content.remove' }, ({ res, query }) => {
    const kind = query.get('kind') || '', q = clean(query.get('q') || '', 60).toLowerCase().replace(/[%_]/g, ''), cursor = Number(query.get('cursor')) || 0, limit = Math.min(100, Number(query.get('limit')) || 30), reported = query.get('reported') === '1';
    const where = ['1 = 1'], args = [];
    if (kind) { where.push('p.kind = ?'); args.push(kind); }
    if (q) { where.push('(lower(p.caption) LIKE ? OR lower(u.name) LIKE ? OR u.username LIKE ? OR p.id = ?)'); args.push('%' + q + '%', '%' + q + '%', '%' + q.replace(/^@/, '') + '%', Number(q.replace('#', '')) || -1); }
    if (reported) where.push("EXISTS (SELECT 1 FROM reports r WHERE r.reason LIKE '[পোস্ট #' || p.id || ']%')");
    const total = count(`SELECT COUNT(*) AS n FROM posts p JOIN users u ON u.id = p.user WHERE ${where.join(' AND ')}`, ...args);
    if (cursor) { where.push('p.id < ?'); args.push(cursor); }
    const rows = db.prepare(`SELECT p.id, p.kind, p.file, p.poster, p.caption, p.created, p.views, p.audience, p.place, u.id AS uid, u.name, u.username, u.pic_v,
      (SELECT COUNT(*) FROM post_likes l WHERE l.post = p.id) AS likes, (SELECT COUNT(*) FROM post_comments c WHERE c.post = p.id) AS comments
      FROM posts p JOIN users u ON u.id = p.user WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT ${limit}`).all(...args);
    json(res, 200, { rows: rows.map(p => ({ id: p.id, kind: p.kind, src: p.file ? 'media/' + p.file : '', poster: p.poster ? 'media/' + p.poster : '', caption: p.caption, created: p.created, views: p.views, likes: p.likes, comments: p.comments,
      audience: p.audience, place: p.place, reports: reportsOfPost(p.id), user: { id: p.uid, name: p.name, username: p.username, pic: p.pic_v } })), total, next: rows.length === limit ? rows[rows.length - 1].id : 0 });
  });
  R('GET stories2', { perm: 'content.remove' }, ({ res }) => {
    const rows = db.prepare('SELECT s.*, u.name, u.username, u.pic_v FROM stories s JOIN users u ON u.id = s.user WHERE s.created > ? ORDER BY s.id DESC').all(now() - DAY);
    json(res, 200, { rows: rows.map(s => ({ id: s.id, kind: s.kind, src: 'media/' + s.file, poster: s.poster ? 'media/' + s.poster : '', created: s.created, ends: s.created + DAY, user: { id: s.user, name: s.name, username: s.username, pic: s.pic_v } })) });
  });
  R('GET comments2', { perm: 'content.remove' }, ({ res, query }) => {
    const flaggedOnly = query.get('flagged') === '1';
    const rows = db.prepare('SELECT c.id, c.post, c.body, c.created, u.id AS uid, u.name, u.username, u.pic_v FROM post_comments c JOIN users u ON u.id = c.user ORDER BY c.id DESC LIMIT 600').all();
    const out = rows.map(c => { const low = c.body.toLowerCase(), hits = FLAG_WORDS.filter(w => low.includes(w.toLowerCase())); return { id: c.id, post: c.post, body: c.body, created: c.created, hits, user: { id: c.uid, name: c.name, username: c.username, pic: c.pic_v } }; })
      .filter(c => !flaggedOnly || c.hits.length).sort((a, b) => (b.hits.length > 0) - (a.hits.length > 0) || b.created - a.created);
    json(res, 200, { rows: out, words: FLAG_WORDS, flagged: out.filter(c => c.hits.length).length });
  });
  R('GET sounds2', { perm: 'content.remove' }, ({ res }) => {
    const rows = db.prepare("SELECT s.*, u.name, u.username, u.pic_v, (SELECT COUNT(*) FROM posts p WHERE p.music = 'snd:' || s.id) AS uses FROM sounds s JOIN users u ON u.id = s.user ORDER BY s.id DESC LIMIT 300").all();
    json(res, 200, { rows: rows.map(s => ({ id: s.id, title: s.title, secs: s.secs, src: 'media/' + s.file, created: s.created, uses: s.uses, user: { id: s.user, name: s.name, username: s.username, pic: s.pic_v } })) });
  });
  R('GET groups2', { perm: 'content.remove' }, ({ res }) => {
    const rows = db.prepare(`SELECT g.*, u.name AS oname, (SELECT COUNT(*) FROM group_members m WHERE m.grp = g.id) AS members, (SELECT COUNT(*) FROM messages x WHERE x.grp = g.id) AS messages,
      (SELECT MAX(sent) FROM messages x WHERE x.grp = g.id) AS active FROM chat_groups g LEFT JOIN users u ON u.id = g.owner ORDER BY active DESC LIMIT 300`).all();
    json(res, 200, { rows: rows.map(g => ({ id: g.id, name: g.name, owner: g.oname, members: g.members, messages: g.messages, active: g.active || g.created, created: g.created, call: groupCalls.has(g.id) ? groupCalls.get(g.id).people.size : 0 })) });
  });
  // take content down: a reason (tier 2); the author of a post is told why in their notifications
  R('POST content/remove', { perm: 'content.remove' }, ({ req, res, user, body }) => {
    const type = String(body.type || ''), ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map(Number).filter(Boolean).slice(0, 100);
    if (!ids.length || !['post', 'story', 'comment', 'sound', 'group'].includes(type)) return fail(res, 400, 'bad request');
    if (!needReason(res, body)) return;
    const reason = clean(body.reason, 40), note = clean(body.note, 300), done = [];
    for (const id of ids) {
      if (type === 'post') {
        const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(id); if (!p) continue;
        deletePost(p);
        db.prepare('INSERT INTO notifications (user, actor, kind, post, body, created) VALUES (?, ?, ?, 0, ?, ?)').run(p.user, p.user, 'removed', reason, now());
        push(p.user, 'notify', {});
        db.prepare("UPDATE reports SET status = 'done', outcome = 'actioned' WHERE status = 'open' AND reason LIKE ?").run(`[পোস্ট #${id}]%`);
        A.audit(user.id, 'post.remove', { type: 'post', id, before: { user: p.user, kind: p.kind, caption: (p.caption || '').slice(0, 200) }, after: { removed: true }, reason, note, req });
      } else if (type === 'story') {
        const s = db.prepare('SELECT * FROM stories WHERE id = ?').get(id); if (!s) continue;
        deleteStory(s);
        A.audit(user.id, 'story.remove', { type: 'story', id, before: { user: s.user, kind: s.kind }, after: { removed: true }, reason, note, req });
      } else if (type === 'comment') {
        const c = db.prepare('SELECT * FROM post_comments WHERE id = ?').get(id); if (!c) continue;
        db.prepare('DELETE FROM post_comments WHERE id = ?').run(id);
        A.audit(user.id, 'comment.remove', { type: 'comment', id, before: { user: c.user, post: c.post, body: c.body.slice(0, 300) }, after: { removed: true }, reason, note, req });
      } else if (type === 'sound') {
        const s = db.prepare('SELECT * FROM sounds WHERE id = ?').get(id); if (!s) continue;
        const used = count("SELECT COUNT(*) AS n FROM posts WHERE music = ?", 'snd:' + id);
        unlinkMedia(s.file); db.prepare('DELETE FROM sounds WHERE id = ?').run(id); db.prepare("UPDATE posts SET music = '' WHERE music = ?").run('snd:' + id);
        A.audit(user.id, 'sound.remove', { type: 'sound', id, before: { title: s.title, user: s.user, usedIn: used }, after: { removed: true }, reason, note, req });
      } else if (type === 'group') {
        const g = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(id); if (!g) continue;
        const members = groupMembers(id);
        for (const m of members) leaveGroup(id, m);
        for (const m of members) push(m, 'friends', {});
        A.audit(user.id, 'group.remove', { type: 'group', id, before: { name: g.name, members: members.length }, after: { removed: true }, reason, note, req });
      }
      done.push(id);
    }
    json(res, 200, { done });
  });

  // ---- media on disk and on R2 ----
  R('GET media', { perm: 'system.view' }, async ({ res }) => {
    const kindOf = n => /\.(jpg|jpeg|png|webp)$/i.test(n) ? 'photo' : /\.(mp4|webm|mov)$/i.test(n) ? 'video' : /\.(weba|ogg|m4a|mp3)$/i.test(n) ? 'audio' : 'other';
    let files = [];
    try { files = fs.readdirSync(MEDIA_DIR).filter(n => /^[a-f0-9]{24}\.\w+$/.test(n)).map(n => { const s = fs.statSync(path.join(MEDIA_DIR, n)); return { name: n, size: s.size, at: s.mtimeMs, kind: kindOf(n) }; }); } catch { /* no media folder yet */ }
    const onR2 = new Set(db.prepare('SELECT name FROM r2_files').all().map(r => r.name)), pub = new Set((() => { try { return db.prepare('SELECT name FROM r2_public').all().map(r => r.name); } catch { return []; } })());
    const ups = new Map(db.prepare('SELECT u.name, u.user, u.kind, u.created, u.used, x.name AS uname FROM uploads u LEFT JOIN users x ON x.id = u.user').all().map(u => [u.name, u]));
    const by = { photo: [0, 0], video: [0, 0], audio: [0, 0], other: [0, 0] };
    for (const f of files) { by[f.kind][0]++; by[f.kind][1] += f.size; }
    const bytes = files.reduce((s, f) => s + f.size, 0);
    const list = files.sort((a, b) => b.at - a.at).slice(0, 150);
    // a video still heavy for its length was most likely not made smaller on the phone (old upload, or a browser without WebCodecs)
    for (const f of list.filter(f => f.kind === 'video' && f.size > 20e6).slice(0, 25)) { try { const secs = await videoSecs(path.join(MEDIA_DIR, f.name)); if (secs) f.mbps = Math.round(f.size * 8 / secs / 1e5) / 10; } catch { /* unknown */ } }
    json(res, 200, {
      totals: { files: files.length, bytes, by, onR2: onR2.size, public: pub.size, notOnR2: files.filter(f => !onR2.has(f.name)).length, costUsd: Math.round(bytes / 1e9 * 0.015 * 100) / 100 },
      rows: list.map(f => { const u = ups.get(f.name); return { ...f, onR2: onR2.has(f.name), public: pub.has(f.name), src: 'media/' + f.name, user: u ? { id: u.user, name: u.uname } : null, used: u ? !!u.used : null, big: f.size > 100e6 }; })
    });
  });
  R('POST media/retry', { perm: 'system.view' }, async ({ req, res, user }) => {
    const before = count('SELECT COUNT(*) AS n FROM r2_files');
    try { await publishNow(); } catch (e) { return fail(res, 500, 'server'); }
    A.audit(user.id, 'media.retry', { type: 'media', id: '', before: { onR2: before }, after: { onR2: count('SELECT COUNT(*) AS n FROM r2_files') }, req });
    json(res, 200, { ok: true });
  });

  // ---- Dhaka bus routes and stops ----
  R('GET routes', { perm: 'data.edit' }, ({ res }) => {
    const stops = stopsNow(), routes = routesNow();
    const uses = {};
    for (const r of routes) if (!r.hidden) for (const id of new Set(r.stops)) uses[id] = (uses[id] || 0) + 1;
    for (const [id, s] of Object.entries(stops)) s.uses = uses[id] || 0;
    json(res, 200, { routes: routes.map(r => ({ ...r, km: Math.round(r.stops.slice(1).reduce((s, id, i) => s + (stops[id] && stops[r.stops[i]] ? km(stops[r.stops[i]], stops[id]) : 0), 0) * 10) / 10,
      versions: count('SELECT COUNT(*) AS n FROM route_versions WHERE key = ?', r.key), missing: r.stops.filter(id => !stops[id]) })), stops });
  });
  R('GET routes/versions', { perm: 'data.edit' }, ({ res, query }) => json(res, 200, { versions: db.prepare('SELECT v.*, u.name FROM route_versions v LEFT JOIN users u ON u.id = v.by WHERE v.key = ? ORDER BY v.id DESC LIMIT 50').all(String(query.get('key') || ''))
    .map(v => ({ id: v.id, at: v.at, by: v.name, before: JSON.parse(v.before_json), after: JSON.parse(v.after_json) })) }));
  function saveRoute(req, user, key, next, reason) {
    const cur = routesNow().find(r => r.key === key);
    const before = cur ? { bn: cur.bn, en: cur.en, stops: cur.stops, hidden: cur.hidden } : null;
    if (next) db.prepare('INSERT INTO route_edits (key, data_json, by, at) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET data_json = excluded.data_json, by = excluded.by, at = excluded.at').run(key, JSON.stringify(next), user.id, now());
    else db.prepare('DELETE FROM route_edits WHERE key = ?').run(key);
    const after = next || (cur && cur.original ? { ...cur.original, hidden: false } : null);
    db.prepare('INSERT INTO route_versions (key, before_json, after_json, by, at) VALUES (?, ?, ?, ?, ?)').run(key, JSON.stringify(before), JSON.stringify(after), user.id, now());
    A.audit(user.id, next ? 'route.save' : 'route.revert', { type: 'route', id: key, before, after, reason, req });
  }
  R('POST routes/save', { perm: 'data.edit' }, ({ req, res, user, body }) => {
    const stops = stopsNow(), bn = clean(body.bn, 80), en = clean(body.en, 80), list = Array.isArray(body.stops) ? body.stops.map(String).filter(Boolean) : [];
    if (!bn || !en || list.length < 2) return fail(res, 400, 'bad request');
    const missing = list.filter(id => !stops[id]);
    if (missing.length) return json(res, 400, { error: 'stops', missing });
    if (!needReason(res, body)) return;
    const key = body.key ? String(body.key) : keyOf(en);
    if (!body.key && routesNow().some(r => r.key === key)) return fail(res, 400, 'exists');
    saveRoute(req, user, key, { bn, en, stops: list, hidden: !!body.hidden }, clean(body.reason, 40));
    json(res, 200, { key });
  });
  R('POST routes/revert', { perm: 'data.edit' }, ({ req, res, user, body }) => {
    const key = String(body.key || ''), r = routesNow().find(x => x.key === key);
    if (!r || !r.edited) return fail(res, 404, 'not found');
    saveRoute(req, user, key, null, clean(body.reason, 40));
    json(res, 200, { ok: true });
  });
  R('POST stops/save', { perm: 'data.edit' }, ({ req, res, user, body }) => {
    const bn = clean(body.bn, 80), en = clean(body.en, 80), lat = Number(body.lat), lon = Number(body.lon);
    if (!bn || !en || !(lat > 20 && lat < 27 && lon > 88 && lon < 93)) return fail(res, 400, 'bad request');
    const stops = stopsNow(), id = body.id ? String(body.id) : keyOf(en).replace(/-/g, '');
    if (!body.id && stops[id]) return fail(res, 400, 'exists');
    const before = stops[id] ? { bn: stops[id].bn, en: stops[id].en, lat: stops[id].lat, lon: stops[id].lon } : null;
    db.prepare('INSERT INTO stop_edits (id, data_json, by, at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET data_json = excluded.data_json, by = excluded.by, at = excluded.at').run(id, JSON.stringify({ bn, en, lat, lon }), user.id, now());
    A.audit(user.id, 'stop.save', { type: 'stop', id, before, after: { bn, en, lat, lon }, req });
    json(res, 200, { id });
  });

  // ---- intercity: companies, fares, ratings (suspicious ones flagged) ----
  R('GET intercity', { perm: 'data.edit' }, ({ res }) => {
    const ratings = db.prepare('SELECT key, device, stars, updated FROM ratings').all();
    const users = new Map(db.prepare('SELECT id, name, created FROM users').all().map(u => [u.id, u]));
    const byKey = new Map();
    for (const r of ratings) { if (!byKey.has(r.key)) byKey.set(r.key, []); byKey.get(r.key).push(r); }
    const flags = [];
    for (const [key, list] of byKey) for (const r of list) {
      const why = [], uid = /^u\d+$/.test(r.device) ? Number(r.device.slice(1)) : 0, u = users.get(uid);
      if (u && r.updated - u.created < DAY) why.push('অ্যাকাউন্ট খোলার এক দিনের মধ্যে রেটিং');
      if (list.filter(o => o.stars === r.stars && Math.abs(o.updated - r.updated) < HOUR).length >= 5) why.push('এক ঘণ্টায় একই তারায় ৫+ রেটিং');
      if (ratings.filter(o => o.device === r.device && Math.abs(o.updated - r.updated) < HOUR).length >= 10) why.push('এক ঘণ্টায় ১০+ জায়গায় রেটিং');
      if (why.length) flags.push({ key, device: r.device, stars: r.stars, updated: r.updated, user: u ? { id: u.id, name: u.name } : null, why });
    }
    const avg = key => { const l = byKey.get(key) || []; return l.length ? { avg: Math.round(l.reduce((s, r) => s + r.stars, 0) / l.length * 10) / 10, n: l.length } : { avg: 0, n: 0 }; };
    const dist = new Map(BASE.DISTRICTS.map(d => [d.id, d]));
    json(res, 200, {
      operators: BASE.OPERATORS.map(o => ({ bn: o.bn, en: o.en, ac: o.ac, nonAc: o.nonAc, districts: o.districts.length, rating: avg('bus:' + o.en) })),
      fares: BASE.DISTRICTS.filter(d => d.id !== 'dhaka').map(d => { const b = BASE.BRTA_FARES[d.id], m = BASE.MARKET_FARES[d.id];
        return { id: d.id, bn: d.bn, division: d.division, terminal: b ? BASE.TERMINALS[b[0]] : '', km: b ? b[1] : null, brta: b ? [b[2], b[3]] : null, market: m || null,
          operators: BASE.OPERATORS.filter(o => o.districts.includes(d.id)).length, perKm: b && m ? Math.round(m[0] / b[1] * 100) / 100 : null }; }),
      flags: flags.sort((a, b) => b.updated - a.updated).slice(0, 200), ratings: ratings.length
    });
  });
  R('POST ratings/remove', { perm: 'data.edit' }, ({ req, res, user, body }) => {
    const r = db.prepare('SELECT * FROM ratings WHERE key = ? AND device = ?').get(String(body.key || ''), String(body.device || ''));
    if (!r) return fail(res, 404, 'not found');
    if (!needReason(res, body)) return;
    db.prepare('DELETE FROM ratings WHERE key = ? AND device = ?').run(r.key, r.device);
    A.audit(user.id, 'rating.remove', { type: 'rating', id: r.key, before: { device: r.device, stars: r.stars }, after: { removed: true }, reason: clean(body.reason, 40), req });
    json(res, 200, { ok: true });
  });

  // ---- data quality: checks run on demand, each finding can be fixed (merge) or marked fine ----
  const issueKey = (...p) => crypto.createHash('sha1').update(p.join('|')).digest('hex').slice(0, 16);
  const edit = (a, b) => { const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; };
  function findIssues() {
    const out = [], stops = stopsNow(), routes = routesNow().filter(r => !r.hidden);
    const slim = s => s.toLowerCase().replace(/(paribahan|transport|enterprise|express|service|bus|ltd|limited|and|&)/g, '').replace(/[^a-z0-9]/g, '');
    for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i], b = routes[j], sa = slim(a.en), sb = slim(b.en);
      const shared = a.stops.filter(x => b.stops.includes(x)).length / Math.min(a.stops.length, b.stops.length);   // similar names alone are not enough (আকাশ / বিকাশ): the roads must match too
      if (sa.length >= 4 && sb.length >= 4 && edit(sa, sb) <= (Math.min(sa.length, sb.length) <= 6 ? 1 : 2) && shared >= 0.5) out.push({ key: issueKey('name', a.key, b.key), kind: 'bus-name', title: `প্রায় একই নামের দুটো বাস: ${a.bn} / ${b.bn}`, detail: `${a.en} · ${a.stops.length} স্টপ — ${b.en} · ${b.stops.length} স্টপ`, refs: [a.key, b.key], merge: true });
      if (a.stops.length > 2 && a.stops.join(' ') === [...b.stops].reverse().join(' ')) out.push({ key: issueKey('rev', a.key, b.key), kind: 'bus-reverse', title: `একই রুটের দুই দিক আলাদা এন্ট্রি: ${a.bn} / ${b.bn}`, detail: 'বাস দুই দিকেই চলে — এক এন্ট্রিই যথেষ্ট।', refs: [a.key, b.key], merge: true });
    }
    for (const r of routes) {
      if (/[A-Za-z]/.test(r.bn) || r.bn === r.en) out.push({ key: issueKey('bnr', r.key), kind: 'bangla', title: `বাসের বাংলা নাম নেই বা ইংরেজিতে: ${r.bn}`, detail: r.en, refs: [r.key] });
      for (let i = 1; i < r.stops.length; i++) { const a = stops[r.stops[i - 1]], b = stops[r.stops[i]]; if (a && b && km(a, b) > 12) out.push({ key: issueKey('gap', r.key, r.stops[i - 1], r.stops[i]), kind: 'gap', title: `${r.bn}: পাশাপাশি দুই স্টপ ${Math.round(km(a, b))} কিমি দূরে`, detail: `${a.bn} → ${b.bn} — মাঝে স্টপ বাদ পড়েছে, নাকি অবস্থান ভুল?`, refs: [r.key] }); }
      const missing = r.stops.filter(id => !stops[id]);
      if (missing.length) out.push({ key: issueKey('miss', r.key), kind: 'missing', title: `${r.bn}: অজানা স্টপ ${missing.join(', ')}`, detail: 'রুট থেকে বাদ যাবে, যতক্ষণ না স্টপটি যোগ হয়।', refs: [r.key] });
    }
    for (const [id, s] of Object.entries(stops)) if (/[A-Za-z]/.test(s.bn) || s.bn === s.en) out.push({ key: issueKey('bns', id), kind: 'bangla', title: `স্টপের বাংলা নাম নেই: ${s.bn}`, detail: id, refs: [id] });
    const P = BASE.PLACES.map(p => ({ bn: p[0] || p.bn, en: p[1] || p.en, lat: p[2] ?? p.lat, lon: p[3] ?? p.lon }));
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if (P[i].lat && P[j].lat && km(P[i], P[j]) < 0.08)
      out.push({ key: issueKey('poi', P[i].bn, P[j].bn), kind: 'poi', title: `৮০ মিটারের মধ্যে দুটো জায়গা: ${P[i].bn} / ${P[j].bn}`, detail: 'একই জায়গা দুবার (বাংলা আর ইংরেজি নামে) কিনা দেখুন।', refs: [] });
    for (const [id, m] of Object.entries(BASE.MARKET_FARES)) { const b = BASE.BRTA_FARES[id]; if (!b) continue; const per = m[0] / b[1];
      if (per < 0.8 || per > 6) out.push({ key: issueKey('fare', id), kind: 'fare', title: `${(BASE.DISTRICTS.find(d => d.id === id) || {}).bn || id}: কাউন্টারের ভাড়া কিমি প্রতি ৳${per.toFixed(2)}`, detail: `৳${m[0]}–${m[1]}, ${b[1]} কিমি — অস্বাভাবিক কম বা বেশি।`, refs: [id] }); }
    const marks = new Map(db.prepare('SELECT * FROM data_quality').all().map(m => [m.key, m]));
    return out.map(i => ({ ...i, status: marks.has(i.key) ? marks.get(i.key).status : 'open' }));
  }
  R('GET quality', { perm: 'data.edit' }, ({ res, query }) => {
    const all = findIssues(), status = query.get('status') || 'open';
    const routes = new Map(routesNow().map(r => [r.key, { bn: r.bn, en: r.en, stops: r.stops.length }]));
    json(res, 200, { issues: all.filter(i => status === 'all' || i.status === status).map(i => ({ ...i, routes: i.merge ? i.refs.map(k => ({ key: k, ...routes.get(k) })) : undefined })),
      tally: { open: all.filter(i => i.status === 'open').length, ok: all.filter(i => i.status === 'ok').length, fixed: all.filter(i => i.status === 'fixed').length },
      notChecked: ['সন্দেহজনক ক্যাটাগরির POI (দেশজুড়ে ১ লাখের বেশি জায়গা — আলাদা কাজ হিসেবে পরে)'] });
  });
  R('POST quality/resolve', { perm: 'data.edit' }, ({ req, res, user, body }) => {
    const issue = findIssues().find(i => i.key === String(body.key || ''));
    if (!issue) return fail(res, 404, 'not found');
    if (body.do === 'merge') {
      if (!issue.merge || !issue.refs.includes(String(body.drop))) return fail(res, 400, 'bad request');
      const drop = routesNow().find(r => r.key === String(body.drop));
      saveRoute(req, user, drop.key, { bn: drop.bn, en: drop.en, stops: drop.stops, hidden: true }, 'merge');
    }
    const status = body.do === 'merge' ? 'fixed' : body.do === 'reopen' ? null : 'ok';
    if (status) db.prepare('INSERT INTO data_quality (key, status, by, at, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET status = excluded.status, by = excluded.by, at = excluded.at, note = excluded.note').run(issue.key, status, user.id, now(), clean(body.note, 200));
    else db.prepare('DELETE FROM data_quality WHERE key = ?').run(issue.key);
    A.audit(user.id, 'quality.' + (body.do || 'ok'), { type: 'quality', id: issue.key, before: { status: issue.status }, after: { status: status || 'open', drop: body.drop || undefined }, note: issue.title, req });
    json(res, 200, { ok: true });
  });

  return { busesJs };
};
