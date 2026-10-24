// ---- Admin panel v2, phase 2: the daily work ----
// The command center's numbers, the inbox (every waiting item in one queue, with priority, SLA and who has it),
// support tickets (internal notes, templates, assignment, response times), the 360° view of a person, report cases
// (all reports about one person or post together), and custom roles. Every route is registered on the v2 gate in
// lib/admin-v2.cjs, so the session, CSRF, permission and rate rules apply; every change goes to the audit log.
'use strict';

const DAY = 864e5, HOUR = 3600e3;
// how long an item may wait before it is late (hours); editable later in panel settings (setting 'admin_sla')
const SLA_DEFAULT = { p1: 1, support: 12, reports: 24, data: 72, payouts: 48, creators: 72, verify: 72 };
// a report or ticket whose words point at danger goes first
const P1_WORDS = /হুমকি|মেরে ফেল|খুন|threat|kill|নাবালক|শিশু|minor|child|ধর্ষণ|rape|আত্মহত্যা|suicide/i;
const P2_WORDS = /হয়রানি|গালি|harass|abuse|scam|প্রতারণা|fraud|ভুয়া|fake|টাকা|blackmail|ব্ল্যাকমেইল/i;

const { PERMS } = require('./admin-v2.cjs');

module.exports = function adminOps(A, ctx) {
  const { db, json, deleteUser, deletePost, aq, endStreams, isOnline, push, sendMail, MAILS, mailReady, groupCalls, hasTurn, backupOn, lastBackup, dhakaDay, onlineCount, clientIp } = ctx;
  const count = (sql, ...a) => { try { return db.prepare(sql).get(...a).n; } catch { return 0; } };
  const now = () => Date.now();
  const fail = (res, status, error) => json(res, status, { error });
  const R = (key, opts, fn) => A.register(key, opts, fn);
  const clean = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';

  // ---- schema (added only) ----
  db.exec('CREATE TABLE IF NOT EXISTS case_assignments (type TEXT NOT NULL, ref TEXT NOT NULL, assignee INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (type, ref))');
  db.exec('CREATE TABLE IF NOT EXISTS support_macros (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL DEFAULT \'\', uses INTEGER NOT NULL DEFAULT 0, by INTEGER NOT NULL, updated INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS admin_notes (id INTEGER PRIMARY KEY, user INTEGER NOT NULL, author INTEGER NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL)');
  db.exec('CREATE INDEX IF NOT EXISTS admin_notes_user ON admin_notes (user, at)');
  for (const [col, def] of [['tags', "TEXT NOT NULL DEFAULT ''"], ['priority', "TEXT NOT NULL DEFAULT ''"]])
    if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('tickets') WHERE name = ?").get(col).n) db.exec(`ALTER TABLE tickets ADD COLUMN ${col} ${def}`);
  for (const sql of ['CREATE INDEX IF NOT EXISTS posts_created ON posts (created)', 'CREATE INDEX IF NOT EXISTS users_created ON users (created)', 'CREATE INDEX IF NOT EXISTS activity_day ON activity_days (day)',
    'CREATE INDEX IF NOT EXISTS ticket_msgs_ticket ON ticket_msgs (ticket, sent)', 'CREATE INDEX IF NOT EXISTS reports_about ON reports (about, status)']) { try { db.exec(sql); } catch { /* fresh database */ } }
  // a few starting templates, only when there are none
  if (!count('SELECT COUNT(*) AS n FROM support_macros')) {
    const add = db.prepare('INSERT INTO support_macros (title, body, category, by, updated) VALUES (?, ?, ?, 0, ?)');
    add.run('ধন্যবাদ ও সমাধান', 'প্রিয় {নাম}, আপনার জানানোর জন্য ধন্যবাদ। সমস্যাটি ঠিক করা হয়েছে — আবার কিছু হলে এখানেই জানাবেন।', 'অন্য', now());
    add.run('লগইন কোড আসছে না', 'প্রিয় {নাম}, কোডটি অনেক সময় স্প্যাম বা প্রমোশন ফোল্ডারে যায় — একটু দেখে নিন। এক মিনিট পরে আবার "কোড পাঠান" চাপলে নতুন কোড যাবে।', 'অ্যাকাউন্ট', now());
    add.run('ভাড়ার তথ্য যাচাই হচ্ছে', 'প্রিয় {নাম}, আপনার জানানো ভাড়াটি আমরা যাচাই করছি। ঠিক থাকলে অনুমোদন হবে আর আপনি ১০ পয়েন্ট পাবেন।', 'ভাড়া', now());
  }
  const sla = () => { try { return { ...SLA_DEFAULT, ...JSON.parse((db.prepare("SELECT value FROM settings WHERE key = 'admin_sla'").get() || {}).value || '{}') }; } catch { return SLA_DEFAULT; } };

  // ---- small helpers ----
  const userRow = id => db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  const person = u => u ? A.personOut(u) : null;
  const nameOf = id => (db.prepare('SELECT name FROM users WHERE id = ?').get(id) || {}).name || '';
  const assignee = (type, ref) => { const a = db.prepare('SELECT assignee, at FROM case_assignments WHERE type = ? AND ref = ?').get(type, String(ref)); return a ? { id: a.assignee, name: nameOf(a.assignee), at: a.at } : null; };
  const priorityOfText = (text, base) => P1_WORDS.test(text || '') ? 'P1' : P2_WORDS.test(text || '') ? (base === 'P3' ? 'P2' : base) : base;
  const dueOf = (created, prio, kind) => created + (prio === 'P1' ? sla().p1 : sla()[kind] || 72) * HOUR;
  const dayKey = col => `CAST((${col} + 21600000) / 86400000 AS INTEGER)`;
  function series(table, col, days, where = '1 = 1', args = []) {
    const today = dhakaDay(now()), from = today - days + 1;
    const rows = db.prepare(`SELECT ${dayKey(col)} AS d, COUNT(*) AS n FROM ${table} WHERE ${col} >= ? AND ${where} GROUP BY d`).all((from - 0) * DAY - 6 * HOUR, ...args);
    const out = Array(days).fill(0);
    for (const r of rows) { const i = r.d - from; if (i >= 0 && i < days) out[i] = r.n; }
    return out;
  }
  function activeSeries(days) {
    const today = dhakaDay(now()), from = today - days + 1, out = Array(days).fill(0);
    for (const r of db.prepare('SELECT day, COUNT(*) AS n FROM activity_days WHERE day >= ? GROUP BY day').all(from)) { const i = r.day - from; if (i >= 0) out[i] = r.n; }
    return out;
  }

  // ---- the command center ----
  R('GET overview2', { perm: 'dashboard.view' }, ({ res, query, can }) => {
    const range = [1, 7, 14, 30, 90].includes(Number(query.get('range'))) ? Number(query.get('range')) : 14, span = Math.max(range, 2) * 2;
    const today = dhakaDay(now()), dayStart = today * DAY - 6 * HOUR;
    const s = {
      signups: series('users', 'created', span), posts: series('posts', 'created', span), likes: series('post_likes', 'made', span), tickets: series('tickets', 'created', span),
      fares: series('contributions', 'created', span), messages: series('messages', 'sent', span), active: activeSeries(span)
    };
    const dau = count('SELECT COUNT(*) AS n FROM activity_days WHERE day = ?', today), wau = count('SELECT COUNT(DISTINCT user) AS n FROM activity_days WHERE day > ?', today - 7),
          mau = count('SELECT COUNT(DISTINCT user) AS n FROM activity_days WHERE day > ?', today - 30);
    const tracked = count('SELECT COUNT(DISTINCT day) AS n FROM activity_days');
    // anything far from its usual: yesterday against the 7 days before it (only when there is enough to compare)
    const alerts = [];
    const look = (key, label, hint) => {
      const d = s[key], y = d[d.length - 2], base = d.slice(-9, -2), avg = base.reduce((a, b) => a + b, 0) / base.length;
      if (avg >= 5 && Math.abs(y - avg) / avg >= 0.5) alerts.push({ key, label, change: Math.round((y - avg) / avg * 100), hint: y < avg ? hint : '' });
    };
    look('signups', 'নতুন অ্যাকাউন্ট', 'লগইন কোডের মেইল যাচ্ছে কিনা দেখুন (সিস্টেমের অবস্থা)।'); look('posts', 'পোস্ট', 'আপলোড বা পোস্টের সুইচ বন্ধ কিনা দেখুন।');
    look('active', 'সক্রিয় ব্যবহারকারী', 'সাইট ঠিকমতো খুলছে কিনা দেখুন।'); look('tickets', 'সাপোর্ট অনুরোধ', ''); look('messages', 'মেসেজ', 'চ্যাটের সংযোগ দেখুন।');
    // what waits, and how long the oldest has waited
    const oldest = (sql, ...a) => { try { return (db.prepare(sql).get(...a) || {}).t || 0; } catch { return 0; } };
    const tasks = {
      support: { n: count("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'"), oldest: oldest("SELECT MIN(updated) AS t FROM tickets WHERE status = 'open'"), sla: sla().support },
      reports: { n: count("SELECT COUNT(DISTINCT about) AS n FROM reports WHERE status = 'open'"), oldest: oldest("SELECT MIN(made) AS t FROM reports WHERE status = 'open'"), sla: sla().reports },
      fares: { n: count('SELECT COUNT(*) AS n FROM contributions WHERE ok = 0') + count("SELECT COUNT(*) AS n FROM fare_reports WHERE ok = 0 AND device LIKE 'u%'"), oldest: oldest('SELECT MIN(created) AS t FROM contributions WHERE ok = 0'), sla: sla().data },
      photos: { n: count("SELECT COUNT(*) AS n FROM place_photos WHERE status = 'pending'"), oldest: oldest("SELECT MIN(created) AS t FROM place_photos WHERE status = 'pending'"), sla: sla().data },
      gems: { n: count("SELECT COUNT(*) AS n FROM gems WHERE status = 'pending'"), oldest: oldest("SELECT MIN(created) AS t FROM gems WHERE status = 'pending'"), sla: sla().data },
      payouts: { n: count("SELECT COUNT(*) AS n FROM payouts WHERE status = 'pending'"), oldest: oldest("SELECT MIN(created) AS t FROM payouts WHERE status = 'pending'"), sla: sla().payouts, taka: count("SELECT COALESCE(SUM(amount), 0) AS n FROM payouts WHERE status = 'pending'") },
      creators: { n: count("SELECT COUNT(*) AS n FROM users WHERE creator = 'applied'"), oldest: 0, sla: sla().creators },
      verify: { n: count("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open' AND category = 'verify'"), oldest: oldest("SELECT MIN(updated) AS t FROM tickets WHERE status = 'open' AND category = 'verify'"), sla: sla().verify }
    };
    let dbBytes = 0; try { dbBytes = db.prepare('SELECT page_count * page_size AS n FROM pragma_page_count(), pragma_page_size()').get().n; } catch { /* unknown */ }
    const last = lastBackup();
    json(res, 200, {
      range, series: s, tracked,
      kpi: {
        users: count('SELECT COUNT(*) AS n FROM users WHERE deleted_at = 0'), dau, wau, mau, stickiness: mau ? Math.round(dau / mau * 100) : 0,
        signupsToday: count('SELECT COUNT(*) AS n FROM users WHERE created >= ?', dayStart), posts: count('SELECT COUNT(*) AS n FROM posts'), messages: count('SELECT COUNT(*) AS n FROM messages'),
        calls: groupCalls.size, fares: count('SELECT COUNT(*) AS n FROM contributions') + count('SELECT COUNT(*) AS n FROM fare_reports'), verified: count('SELECT COUNT(*) AS n FROM users WHERE verified = 1'),
        banned: count('SELECT COUNT(*) AS n FROM users WHERE banned = 1 AND deleted_at = 0'), payoutTaka: tasks.payouts.taka, online: onlineCount()
      },
      tasks, alerts,
      health: { mail: mailReady, turn: hasTurn(), r2: backupOn, lastBackup: last, backupLate: backupOn && (!last || now() - last > DAY), dbBytes },
      newcomers: db.prepare('SELECT id, name, username, email, pic_v, created FROM users WHERE deleted_at = 0 ORDER BY id DESC LIMIT 8').all().map(u => ({ ...person(u), created: u.created })),
      recent: can('audit.view') ? db.prepare('SELECT a.id, a.action, a.target_type, a.target_id, a.note, a.at, u.name FROM audit_log a LEFT JOIN users u ON u.id = a.actor ORDER BY a.id DESC LIMIT 10').all() : []
    });
  });

  // ---- the inbox: every waiting item of the kinds this role handles ----
  function inboxItems(can) {
    const items = [];
    const add = it => { it.assignee = assignee(it.type, it.ref); it.due = dueOf(it.created, it.priority, it.kind); it.overdue = now() > it.due; items.push(it); };
    if (can('support.view')) for (const t of db.prepare("SELECT t.*, u.name FROM tickets t JOIN users u ON u.id = t.user WHERE t.status = 'open' ORDER BY t.updated LIMIT 300").all()) {
      const first = (db.prepare('SELECT body FROM ticket_msgs WHERE ticket = ? ORDER BY id LIMIT 1').get(t.id) || {}).body || '';
      const base = t.priority || (t.category === 'person' || t.category === 'account' ? 'P2' : 'P3');
      add({ type: t.category === 'verify' ? 'verify' : 'ticket', kind: t.category === 'verify' ? 'verify' : 'support', ref: String(t.id), title: t.subject, sub: `${t.name} · টিকিট #${t.id}`, created: t.updated, priority: priorityOfText(t.subject + ' ' + first, base), link: `#/tickets/${t.id}` });
    }
    if (can('reports.view')) for (const c of db.prepare("SELECT r.about, COUNT(*) AS n, MIN(r.made) AS first, GROUP_CONCAT(r.reason, ' | ') AS reasons, u.name FROM reports r LEFT JOIN users u ON u.id = r.about WHERE r.status = 'open' GROUP BY r.about ORDER BY first LIMIT 300").all())
      add({ type: 'report', kind: 'reports', ref: String(c.about), title: `${c.name || 'অ্যাকাউন্ট #' + c.about} — ${c.n}টি রিপোর্ট`, sub: String(c.reasons || '').slice(0, 120), created: c.first, priority: priorityOfText(c.reasons, c.n >= 3 ? 'P2' : 'P3'), link: `#/reports/${c.about}` });
    if (can('data.approve')) {
      for (const f of db.prepare('SELECT c.*, u.name FROM contributions c JOIN users u ON u.id = c.user WHERE c.ok = 0 ORDER BY c.created LIMIT 200').all())
        add({ type: 'fare', kind: 'data', ref: String(f.id), title: `${f.flabel} → ${f.tlabel} · ৳${f.fare}`, sub: `${f.name} · ভাড়া`, created: f.created, priority: 'P3', link: '#/fares' });
      for (const f of db.prepare("SELECT * FROM fare_reports WHERE ok = 0 AND device LIKE 'u%' ORDER BY updated LIMIT 200").all())
        add({ type: 'stopfare', kind: 'data', ref: `${f.a}|${f.b}|${f.device}`, title: `${f.a} ↔ ${f.b} · ৳${f.fare}`, sub: 'ঢাকার বাসের স্টপ-থেকে-স্টপ ভাড়া', created: f.updated, priority: 'P3', link: '#/fares' });
      for (const p of db.prepare("SELECT p.*, u.name AS uname FROM place_photos p JOIN users u ON u.id = p.user WHERE p.status = 'pending' ORDER BY p.created LIMIT 200").all())
        add({ type: 'photo', kind: 'data', ref: String(p.id), title: `${p.name} — জায়গার ছবি`, sub: `${p.uname} · ${p.district}`, created: p.created, priority: 'P3', link: '#/photos' });
      for (const g of db.prepare("SELECT g.*, u.name AS uname FROM gems g JOIN users u ON u.id = g.user WHERE g.status = 'pending' ORDER BY g.created LIMIT 200").all())
        add({ type: 'gem', kind: 'data', ref: String(g.id), title: `${g.name} — মেঠোপথ`, sub: `${g.uname} · ${g.district}`, created: g.created, priority: 'P3', link: '#/gems' });
    }
    if (can('payouts.view')) for (const p of db.prepare("SELECT p.*, u.name FROM payouts p JOIN users u ON u.id = p.user WHERE p.status = 'pending' ORDER BY p.created LIMIT 200").all())
      add({ type: 'payout', kind: 'payouts', ref: String(p.id), title: `৳${p.amount} — ${p.name}`, sub: `${p.method} · পেআউট`, created: p.created, priority: 'P2', link: '#/payouts' });
    if (can('creators.manage')) for (const u of db.prepare("SELECT id, name, created FROM users WHERE creator = 'applied' LIMIT 200").all())
      add({ type: 'creator', kind: 'creators', ref: String(u.id), title: `${u.name} — ক্রিয়েটর আবেদন`, sub: 'ক্রিয়েটর', created: u.created, priority: 'P3', link: '#/creators' });
    const rank = { P1: 0, P2: 1, P3: 2 };
    return items.sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1) || rank[a.priority] - rank[b.priority] || a.due - b.due);
  }
  R('GET inbox', { perm: 'inbox.view' }, ({ res, query, user, can }) => {
    const view = query.get('view') || 'all', type = query.get('type') || '';
    let items = inboxItems(can);
    const tally = { all: items.length, mine: items.filter(i => i.assignee && i.assignee.id === user.id).length, unassigned: items.filter(i => !i.assignee).length, overdue: items.filter(i => i.overdue).length };
    if (view === 'mine') items = items.filter(i => i.assignee && i.assignee.id === user.id);
    if (view === 'unassigned') items = items.filter(i => !i.assignee);
    if (view === 'overdue') items = items.filter(i => i.overdue);
    if (type) items = items.filter(i => i.type === type);
    json(res, 200, { items: items.slice(0, 300), tally, sla: sla() });
  });
  function assign(req, user, type, ref, to) {
    const before = assignee(type, ref);
    if (to) db.prepare('INSERT INTO case_assignments (type, ref, assignee, at) VALUES (?, ?, ?, ?) ON CONFLICT (type, ref) DO UPDATE SET assignee = excluded.assignee, at = excluded.at').run(type, String(ref), to, now());
    else db.prepare('DELETE FROM case_assignments WHERE type = ? AND ref = ?').run(type, String(ref));
    A.audit(user.id, 'case.assign', { type, id: ref, before: { assignee: before ? before.name : null }, after: { assignee: to ? nameOf(to) : null }, req });
    A.broadcast('assign', { type, ref: String(ref), assignee: to ? { id: to, name: nameOf(to) } : null });
  }
  R('POST inbox/assign', { perm: 'inbox.view' }, ({ req, res, user, body }) => {
    const type = clean(body.type, 20), ref = clean(String(body.ref ?? ''), 120);
    if (!type || !ref) return fail(res, 400, 'bad request');
    const to = body.to === 'me' ? user.id : body.to === 'none' ? 0 : Number(body.to) || 0;
    const held = assignee(type, ref);
    if (held && held.id !== user.id && to === user.id && !body.force) return json(res, 409, { error: 'taken', assignee: held });
    assign(req, user, type, ref, to);
    json(res, 200, { ok: true, assignee: to ? { id: to, name: nameOf(to) } : null });
  });
  // the most urgent item no one has: it becomes mine, and opens
  R('POST inbox/next', { perm: 'inbox.view' }, ({ req, res, user, body, can }) => {
    const it = inboxItems(can).find(i => !i.assignee && (!body.type || i.type === body.type));
    if (!it) return json(res, 200, { item: null });
    assign(req, user, it.type, it.ref, user.id);
    json(res, 200, { item: { ...it, assignee: { id: user.id, name: user.name } } });
  });

  // ---- support ----
  const TICKET_STATUS = ['open', 'answered', 'closed'];
  R('GET tickets', { perm: 'support.view' }, ({ res, query }) => {
    const status = query.get('status') || 'open', cat = query.get('cat') || '', q = clean(query.get('q') || '', 60).toLowerCase(), cursor = Number(query.get('cursor')) || 0, limit = Math.min(100, Number(query.get('limit')) || 25);
    const where = ['1 = 1'], args = [];
    if (status !== 'all') { where.push('t.status = ?'); args.push(status); }
    if (cat) { where.push('t.category = ?'); args.push(cat); }
    if (q) { where.push('(lower(t.subject) LIKE ? OR lower(u.name) LIKE ? OR t.id = ?)'); args.push('%' + q + '%', '%' + q + '%', Number(q.replace('#', '')) || -1); }
    const total = count(`SELECT COUNT(*) AS n FROM tickets t JOIN users u ON u.id = t.user WHERE ${where.join(' AND ')}`, ...args);
    if (cursor) { where.push('t.id < ?'); args.push(cursor); }
    const rows = db.prepare(`SELECT t.*, u.name, u.username, u.pic_v, (SELECT COUNT(*) FROM ticket_msgs m WHERE m.ticket = t.id AND m.internal = 0) AS n,
      (SELECT MIN(sent) FROM ticket_msgs m WHERE m.ticket = t.id AND m.staff = 1 AND m.internal = 0) AS firstReply FROM tickets t JOIN users u ON u.id = t.user WHERE ${where.join(' AND ')} ORDER BY t.id DESC LIMIT ${limit}`).all(...args);
    json(res, 200, { rows: rows.map(t => ({ id: t.id, subject: t.subject, category: t.category, status: t.status, created: t.created, updated: t.updated, n: t.n, tags: t.tags ? t.tags.split(',') : [], priority: t.priority,
      user: { id: t.user, name: t.name, username: t.username, pic: t.pic_v }, assignee: assignee('ticket', t.id), firstReply: t.firstReply })), total, next: rows.length === limit ? rows[rows.length - 1].id : 0 });
  });
  R('GET ticket', { perm: 'support.view' }, ({ res, query }) => {
    const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(Number(query.get('id')));
    if (!t) return fail(res, 404, 'not found');
    const u = userRow(t.user);
    const msgs = db.prepare('SELECT m.id, m.staff, m.internal, m.body, m.sent, m.sender, u.name FROM ticket_msgs m LEFT JOIN users u ON u.id = m.sender WHERE m.ticket = ? ORDER BY m.id').all(t.id);
    json(res, 200, {
      ticket: { id: t.id, subject: t.subject, category: t.category, status: t.status, created: t.created, updated: t.updated, tags: t.tags ? t.tags.split(',') : [], priority: t.priority, assignee: assignee('ticket', t.id) },
      messages: msgs,
      user: u ? { ...person(u), created: u.created, seen: u.seen, verified: !!u.verified, banned: !!u.banned, twofa: !!u.totp_on, devices: count('SELECT COUNT(*) AS n FROM sessions WHERE user = ? AND expires > ?', u.id, now()),
        tickets: count('SELECT COUNT(*) AS n FROM tickets WHERE user = ?', u.id), reportsAbout: count('SELECT COUNT(*) AS n FROM reports WHERE about = ?', u.id),
        restrictions: db.prepare('SELECT kind, until FROM restrictions WHERE user = ? AND until > ? AND lifted = 0').all(u.id, now()),
        previous: db.prepare('SELECT id, subject, status, updated FROM tickets WHERE user = ? AND id <> ? ORDER BY id DESC LIMIT 5').all(u.id, t.id) } : null,
      macros: db.prepare('SELECT id, title, body, category, uses FROM support_macros ORDER BY uses DESC, title').all()
    });
  });
  R('POST ticket/reply', { perm: 'support.reply' }, async ({ req, res, user, body }) => {
    const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(Number(body.id));
    if (!t) return fail(res, 404, 'not found');
    const text = clean(body.body, 3000);
    if (!text) return fail(res, 400, 'bad request');
    const internal = !!body.internal, at = now();
    db.prepare('INSERT INTO ticket_msgs (ticket, sender, staff, body, sent, internal) VALUES (?, ?, 1, ?, ?, ?)').run(t.id, user.id, text, at, internal ? 1 : 0);
    if (!internal) {
      const next = body.close ? 'closed' : 'answered';
      db.prepare('UPDATE tickets SET status = ?, updated = ?, unread = 1 WHERE id = ?').run(next, at, t.id);
      push(t.user, 'support', { id: t.id });
      const owner = userRow(t.user);
      if (mailReady && owner) sendMail(owner.email, MAILS.supportMail(t.subject, text)).catch(() => {});
      A.audit(user.id, 'ticket.reply', { type: 'ticket', id: t.id, before: { status: t.status }, after: { status: next }, req });
    } else A.audit(user.id, 'ticket.note', { type: 'ticket', id: t.id, req });
    if (body.macro) db.prepare('UPDATE support_macros SET uses = uses + 1 WHERE id = ?').run(Number(body.macro));
    A.broadcast('ticket', { id: t.id });
    json(res, 200, { ok: true });
  });
  R('POST ticket/status', { perm: 'support.reply' }, ({ req, res, user, body }) => {
    const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(Number(body.id));
    if (!t || !TICKET_STATUS.includes(body.status)) return fail(res, t ? 400 : 404, t ? 'bad request' : 'not found');
    db.prepare('UPDATE tickets SET status = ?, updated = ? WHERE id = ?').run(body.status, now(), t.id);
    A.audit(user.id, 'ticket.status', { type: 'ticket', id: t.id, before: { status: t.status }, after: { status: body.status }, req });
    A.broadcast('ticket', { id: t.id });
    json(res, 200, { ok: true, before: t.status });
  });
  R('POST ticket/meta', { perm: 'support.reply' }, ({ req, res, user, body }) => {
    const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(Number(body.id));
    if (!t) return fail(res, 404, 'not found');
    const tags = Array.isArray(body.tags) ? [...new Set(body.tags.map(x => clean(String(x), 24).replace(/,/g, '')).filter(Boolean))].slice(0, 8).join(',') : t.tags;
    const priority = ['P1', 'P2', 'P3', ''].includes(body.priority) ? body.priority : t.priority;
    db.prepare('UPDATE tickets SET tags = ?, priority = ? WHERE id = ?').run(tags, priority, t.id);
    A.audit(user.id, 'ticket.meta', { type: 'ticket', id: t.id, before: { tags: t.tags, priority: t.priority }, after: { tags, priority }, req });
    json(res, 200, { ok: true });
  });
  R('GET support/metrics', { perm: 'support.view' }, ({ res }) => {
    const since = now() - 30 * DAY;
    const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const first = db.prepare(`SELECT t.created, (SELECT MIN(sent) FROM ticket_msgs m WHERE m.ticket = t.id AND m.staff = 1 AND m.internal = 0) AS r FROM tickets t WHERE t.created > ?`).all(since).filter(x => x.r).map(x => x.r - x.created);
    const solved = db.prepare("SELECT created, updated FROM tickets WHERE status = 'closed' AND created > ?").all(since).map(x => x.updated - x.created);
    const agents = db.prepare('SELECT m.sender AS id, u.name, COUNT(*) AS n FROM ticket_msgs m LEFT JOIN users u ON u.id = m.sender WHERE m.staff = 1 AND m.internal = 0 AND m.sent > ? GROUP BY m.sender ORDER BY n DESC').all(since);
    json(res, 200, { firstReply: median(first), resolve: median(solved), answered: first.length, closed: solved.length, opened: count('SELECT COUNT(*) AS n FROM tickets WHERE created > ?', since), agents });
  });
  R('GET macros', { perm: 'support.view' }, ({ res }) => json(res, 200, { macros: db.prepare('SELECT m.*, u.name AS byName FROM support_macros m LEFT JOIN users u ON u.id = m.by ORDER BY m.category, m.title').all() }));
  R('POST macros/save', { perm: 'support.reply' }, ({ req, res, user, body }) => {
    const title = clean(body.title, 80), text = clean(body.body, 3000), cat = clean(body.category, 30);
    if (!title || !text) return fail(res, 400, 'bad request');
    const old = body.id ? db.prepare('SELECT * FROM support_macros WHERE id = ?').get(Number(body.id)) : null;
    let id = old && old.id;
    if (old) db.prepare('UPDATE support_macros SET title = ?, body = ?, category = ?, by = ?, updated = ? WHERE id = ?').run(title, text, cat, user.id, now(), old.id);
    else id = Number(db.prepare('INSERT INTO support_macros (title, body, category, by, updated) VALUES (?, ?, ?, ?, ?)').run(title, text, cat, user.id, now()).lastInsertRowid);
    A.audit(user.id, 'macro.save', { type: 'macro', id, before: old ? { title: old.title, body: old.body } : null, after: { title, body: text }, req });
    json(res, 200, { id });
  });
  R('POST macros/delete', { perm: 'support.reply' }, ({ req, res, user, body }) => {
    const old = db.prepare('SELECT * FROM support_macros WHERE id = ?').get(Number(body.id));
    if (!old) return fail(res, 404, 'not found');
    db.prepare('DELETE FROM support_macros WHERE id = ?').run(old.id);
    A.audit(user.id, 'macro.delete', { type: 'macro', id: old.id, before: { title: old.title, body: old.body }, req });
    json(res, 200, { ok: true });
  });

  // ---- people ----
  const statusOf = u => u.deleted_at ? 'deleted' : u.banned ? 'banned' : db.prepare('SELECT 1 FROM restrictions WHERE user = ? AND until > ? AND lifted = 0 LIMIT 1').get(u.id, now()) ? 'restricted' : 'active';
  R('GET users', { perm: 'users.view' }, ({ res, query }) => {
    const tab = query.get('tab') || 'all', q = clean(query.get('q') || '', 60).toLowerCase().replace(/[%_]/g, ''), cursor = Number(query.get('cursor')) || 0, limit = Math.min(100, Number(query.get('limit')) || 25);
    const where = ['1 = 1'], args = [];
    if (q) { where.push('(lower(u.name) LIKE ? OR u.username LIKE ? OR lower(u.email) LIKE ? OR u.id = ?)'); const l = '%' + q.replace(/^@/, '') + '%'; args.push(l, l, l, Number(q.replace('#', '')) || -1); }
    if (tab === 'new') { where.push('u.created > ?'); args.push(now() - 7 * DAY); }
    if (tab === 'team') where.push("(u.role IN ('admin', 'staff') OR u.id IN (SELECT user FROM team_members))");
    if (tab === 'banned') where.push('u.banned = 1');
    if (tab === 'deleted') where.push('u.deleted_at > 0'); else where.push('u.deleted_at = 0');
    if (tab === 'risky') where.push("(SELECT COUNT(*) FROM reports r WHERE r.about = u.id) >= 2");
    const total = count(`SELECT COUNT(*) AS n FROM users u WHERE ${where.join(' AND ')}`, ...args);
    if (cursor) { where.push('u.id < ?'); args.push(cursor); }
    const rows = db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM posts p WHERE p.user = u.id) AS posts,
      (SELECT COUNT(*) FROM friends f WHERE (f.a = u.id OR f.b = u.id) AND (f.state = 'friends' OR (f.state = 'pending' AND f.actor <> u.id))) AS followers,
      (SELECT COUNT(*) FROM reports r WHERE r.about = u.id) AS reportsAbout, (SELECT COUNT(*) FROM reports r WHERE r.about = u.id AND r.status = 'open') AS reportsOpen,
      (SELECT role FROM team_members t WHERE t.user = u.id) AS teamRole
      FROM users u WHERE ${where.join(' AND ')} ORDER BY u.id DESC LIMIT ${limit}`).all(...args);
    json(res, 200, { rows: rows.map(u => ({ ...person(u), role: A.roleOf ? (A.roleOf(u) || '') : u.teamRole || '', status: statusOf(u), verified: !!u.verified, creator: u.creator, created: u.created, seen: u.seen,
      posts: u.posts, followers: u.followers, reports: u.reportsAbout, risk: Math.min(100, u.reportsOpen * 25 + u.reportsAbout * 5 + (u.created > now() - 7 * DAY ? 10 : 0)) })), total, next: rows.length === limit ? rows[rows.length - 1].id : 0 });
  });
  R('GET user', { perm: 'users.view' }, ({ res, query, can }) => {
    const u = userRow(query.get('id'));
    if (!u) return fail(res, 404, 'not found');
    const id = u.id, t = now();
    const timeline = [
      { at: u.created, kind: 'signup', text: 'অ্যাকাউন্ট খুলেছেন' },
      ...db.prepare('SELECT made, agent FROM sessions WHERE user = ? ORDER BY made DESC LIMIT 15').all(id).filter(s => s.made).map(s => ({ at: s.made, kind: 'login', text: `লগইন · ${s.agent || 'ডিভাইস'}` })),
      ...db.prepare('SELECT id, kind, caption, created FROM posts WHERE user = ? ORDER BY id DESC LIMIT 15').all(id).map(p => ({ at: p.created, kind: 'post', text: `পোস্ট #${p.id}${p.caption ? ' · ' + p.caption.slice(0, 60) : ''}` })),
      ...db.prepare('SELECT made, reason, status FROM reports WHERE about = ? ORDER BY id DESC LIMIT 15').all(id).map(r => ({ at: r.made, kind: 'reported', text: `তাঁর বিরুদ্ধে রিপোর্ট · ${r.reason.slice(0, 70)}` })),
      ...db.prepare('SELECT made, reason FROM reports WHERE reporter = ? ORDER BY id DESC LIMIT 10').all(id).map(r => ({ at: r.made, kind: 'report', text: `রিপোর্ট করেছেন · ${r.reason.slice(0, 70)}` })),
      ...db.prepare('SELECT created, subject FROM tickets WHERE user = ? ORDER BY id DESC LIMIT 10').all(id).map(x => ({ at: x.created, kind: 'ticket', text: `সাপোর্ট · ${x.subject}` })),
      ...db.prepare('SELECT created, flabel, tlabel, fare, ok FROM contributions WHERE user = ? ORDER BY id DESC LIMIT 10').all(id).map(c => ({ at: c.created, kind: 'fare', text: `ভাড়া · ${c.flabel} → ${c.tlabel} ৳${c.fare}${c.ok ? '' : ' (অপেক্ষায়)'}` })),
      ...db.prepare('SELECT made, kind, until, reason FROM restrictions WHERE user = ? ORDER BY id DESC LIMIT 10').all(id).map(r => ({ at: r.made, kind: 'restrict', text: `সীমিত (${r.kind === 'post' ? 'পোস্ট' : 'মেসেজ'}) · ${r.reason}` })),
      ...db.prepare("SELECT a.at, a.action, a.note, x.name FROM audit_log a LEFT JOIN users x ON x.id = a.actor WHERE (a.target_type = 'user' AND a.target_id = ?) OR (a.target_type = 'legacy' AND a.target_id = ?) ORDER BY a.id DESC LIMIT 20").all(String(id), u.email)
        .map(a => ({ at: a.at, kind: 'admin', text: `${a.name || 'টিম'} · ${a.action}${a.note ? ' · ' + a.note.slice(0, 60) : ''}` }))
    ].filter(x => x.at).sort((a, b) => b.at - a.at).slice(0, 80);
    const sessions = db.prepare('SELECT rowid AS sid, agent, ip, made, last, expires FROM sessions WHERE user = ? ORDER BY last DESC').all(id).map(s => ({ id: s.sid, agent: s.agent, ip: s.ip, made: s.made, last: s.last, live: s.expires > t }));
    // other accounts seen on the same network with the same kind of device: a hint, not proof (a shared Wi-Fi does this)
    const linked = db.prepare(`SELECT DISTINCT u2.id, u2.name, u2.username, u2.email, u2.pic_v, u2.banned FROM sessions s1 JOIN sessions s2 ON s1.ip = s2.ip AND s1.agent = s2.agent AND s2.user <> s1.user
      JOIN users u2 ON u2.id = s2.user WHERE s1.user = ? AND s1.ip <> '' LIMIT 10`).all(id).map(x => ({ ...person(x), banned: !!x.banned }));
    const out = {
      user: { ...person(u), bio: u.bio, role: A.roleOf(u) || '', status: statusOf(u), verified: !!u.verified, twofa: !!u.totp_on, creator: u.creator, created: u.created, seen: u.seen, points: u.points, deletedAt: u.deleted_at, banned: !!u.banned,
        risk: Math.min(100, count("SELECT COUNT(*) AS n FROM reports WHERE about = ? AND status = 'open'", id) * 25 + count('SELECT COUNT(*) AS n FROM reports WHERE about = ?', id) * 5 + linked.filter(l => l.banned).length * 30),
        riskWhy: [count("SELECT COUNT(*) AS n FROM reports WHERE about = ? AND status = 'open'", id) ? `${count("SELECT COUNT(*) AS n FROM reports WHERE about = ? AND status = 'open'", id)}টি খোলা রিপোর্ট` : '', linked.some(l => l.banned) ? 'একই নেটওয়ার্ক ও ডিভাইসে বন্ধ করা অ্যাকাউন্ট' : ''].filter(Boolean) },
      online: isOnline(id),
      counts: { friends: count("SELECT COUNT(*) AS n FROM friends WHERE (a = ?1 OR b = ?1) AND state = 'friends'", id), followers: count("SELECT COUNT(*) AS n FROM friends WHERE (a = ?1 OR b = ?1) AND (state = 'friends' OR (state = 'pending' AND actor <> ?1))", id),
        messages: count('SELECT COUNT(*) AS n FROM messages WHERE sender = ?', id), groups: count('SELECT COUNT(*) AS n FROM group_members WHERE user = ?', id), posts: count('SELECT COUNT(*) AS n FROM posts WHERE user = ?', id),
        comments: count('SELECT COUNT(*) AS n FROM post_comments WHERE user = ?', id) },
      timeline, sessions, linked,
      content: db.prepare('SELECT id, kind, file, poster, caption, created, views FROM posts WHERE user = ? ORDER BY id DESC LIMIT 24').all(id).map(p => ({ id: p.id, kind: p.kind, src: p.file ? 'media/' + p.file : '', poster: p.poster ? 'media/' + p.poster : '', caption: p.caption, created: p.created, views: p.views })),
      reports: { about: db.prepare('SELECT r.id, r.reason, r.made, r.status, r.outcome, u.name AS by FROM reports r LEFT JOIN users u ON u.id = r.reporter WHERE r.about = ? ORDER BY r.id DESC LIMIT 30').all(id),
                 by: db.prepare('SELECT r.id, r.reason, r.made, r.status, r.outcome, u.name AS about FROM reports r LEFT JOIN users u ON u.id = r.about WHERE r.reporter = ? ORDER BY r.id DESC LIMIT 30').all(id) },
      restrictions: db.prepare('SELECT r.id, r.kind, r.until, r.reason, r.made, r.lifted, u.name AS by FROM restrictions r LEFT JOIN users u ON u.id = r.by WHERE r.user = ? ORDER BY r.id DESC LIMIT 20').all(id),
      contributions: { fares: db.prepare('SELECT id, flabel, tlabel, mode, fare, ok, created FROM contributions WHERE user = ? ORDER BY id DESC LIMIT 30').all(id),
        stopFares: count('SELECT COUNT(*) AS n FROM fare_reports WHERE device = ?', 'u' + id), ratings: count('SELECT COUNT(*) AS n FROM ratings WHERE device = ?', 'u' + id),
        photos: count('SELECT COUNT(*) AS n FROM place_photos WHERE user = ?', id), gems: count('SELECT COUNT(*) AS n FROM gems WHERE user = ?', id) },
      notes: db.prepare('SELECT n.id, n.body, n.at, u.name FROM admin_notes n LEFT JOIN users u ON u.id = n.author WHERE n.user = ? ORDER BY n.id DESC').all(id)
    };
    if (can('payouts.view') && u.creator) out.money = { earned: count('SELECT COALESCE(SUM(amount), 0) AS n FROM earnings WHERE user = ?', id), payouts: db.prepare('SELECT id, amount, method, status, ref, created FROM payouts WHERE user = ? ORDER BY id DESC LIMIT 20').all(id) };
    json(res, 200, out);
  });
  R('POST user/note', { perm: 'users.view' }, ({ req, res, user, body }) => {
    const u = userRow(body.user), text = clean(body.body, 1000);
    if (!u || !text) return fail(res, u ? 400 : 404, u ? 'bad request' : 'not found');
    db.prepare('INSERT INTO admin_notes (user, author, body, at) VALUES (?, ?, ?, ?)').run(u.id, user.id, text, now());
    A.audit(user.id, 'user.note', { type: 'user', id: u.id, note: text.slice(0, 200), req });
    json(res, 200, { ok: true });
  });
  // the actions on a person: each needs its own permission, a reason (tier 2), and is logged with before → after
  const guard = (res, user, u) => {
    if (!u) return fail(res, 404, 'not found'), false;
    if (u.id === user.id) return fail(res, 400, 'self'), false;
    if (A.roleOf(u) === 'owner' || (A.roleOf(u) && A.roleOf(user) !== 'owner' && ['admin', 'owner'].includes(A.roleOf(u)))) return fail(res, 403, 'forbidden'), false;
    return true;
  };
  const needReason = (res, body) => { if (!clean(body.reason, 40)) { fail(res, 400, 'reason'); return false; } return true; };
  R('POST user/verify', { perm: 'users.verify' }, ({ req, res, user, body }) => {
    const u = userRow(body.user);
    if (!u) return fail(res, 404, 'not found');
    const on = !!body.on;
    db.prepare('UPDATE users SET verified = ? WHERE id = ?').run(on ? 1 : 0, u.id);
    A.audit(user.id, on ? 'user.verify' : 'user.unverify', { type: 'user', id: u.id, before: { verified: !!u.verified }, after: { verified: on }, reason: clean(body.reason, 40), note: clean(body.note, 500), req });
    json(res, 200, { ok: true });
  });
  R('POST user/restrict', { perm: 'users.restrict' }, ({ req, res, user, body }) => {
    const u = userRow(body.user);
    if (!guard(res, user, u) || !needReason(res, body)) return;
    const kind = body.kind === 'message' ? 'message' : 'post', days = Math.max(1, Math.min(90, Number(body.days) || 7)), until = now() + days * DAY;
    const id = Number(db.prepare('INSERT INTO restrictions (user, kind, until, reason, by, made) VALUES (?, ?, ?, ?, ?, ?)').run(u.id, kind, until, clean(body.reason, 40), user.id, now()).lastInsertRowid);
    A.audit(user.id, 'user.restrict', { type: 'user', id: u.id, after: { kind, days, until }, reason: clean(body.reason, 40), note: clean(body.note, 500), req });
    json(res, 200, { ok: true, id, until });
  });
  R('POST user/unrestrict', { perm: 'users.restrict' }, ({ req, res, user, body }) => {
    const r = db.prepare('SELECT * FROM restrictions WHERE id = ?').get(Number(body.id));
    if (!r) return fail(res, 404, 'not found');
    db.prepare('UPDATE restrictions SET lifted = ? WHERE id = ?').run(now(), r.id);
    A.audit(user.id, 'user.unrestrict', { type: 'user', id: r.user, before: { kind: r.kind, until: r.until }, after: { lifted: true }, req });
    json(res, 200, { ok: true });
  });
  R('POST user/ban', { perm: 'users.ban' }, ({ req, res, user, body }) => {
    const u = userRow(body.user), on = !!body.on;
    if (!guard(res, user, u)) return;
    if (on && !needReason(res, body)) return;
    aq.setBanned.run(on ? 1 : 0, u.id);
    if (on) { aq.endAll.run(u.id); endStreams(u.id); }
    A.audit(user.id, on ? 'user.ban' : 'user.unban', { type: 'user', id: u.id, before: { banned: !!u.banned }, after: { banned: on }, reason: clean(body.reason, 40), note: clean(body.note, 500), req });
    json(res, 200, { ok: true });
  });
  R('POST user/signout', { perm: 'users.ban' }, ({ req, res, user, body }) => {
    const u = userRow(body.user);
    if (!guard(res, user, u)) return;
    const n = count('SELECT COUNT(*) AS n FROM sessions WHERE user = ?', u.id);
    if (body.session) db.prepare('DELETE FROM sessions WHERE user = ? AND rowid = ?').run(u.id, Number(body.session)); else { aq.endAll.run(u.id); endStreams(u.id); }
    A.audit(user.id, body.session ? 'user.signout.one' : 'user.signout', { type: 'user', id: u.id, before: { sessions: n }, after: { sessions: count('SELECT COUNT(*) AS n FROM sessions WHERE user = ?', u.id) }, req });
    json(res, 200, { ok: true });
  });
  // deleting: the account is closed now and everything goes after 30 days (restorable until then); tier 3
  R('POST user/delete', { perm: 'users.delete', stepup: true }, ({ req, res, user, body }) => {
    const u = userRow(body.user);
    if (!guard(res, user, u) || !needReason(res, body)) return;
    db.prepare('UPDATE users SET deleted_at = ?, banned = 1 WHERE id = ?').run(now(), u.id);
    aq.endAll.run(u.id); endStreams(u.id);
    A.audit(user.id, 'user.delete', { type: 'user', id: u.id, before: { banned: !!u.banned, deleted: false }, after: { deleted: true, purgeAfter: now() + 30 * DAY }, reason: clean(body.reason, 40), note: clean(body.note, 500), req });
    json(res, 200, { ok: true, purgeAfter: now() + 30 * DAY });
  });
  R('POST user/restore', { perm: 'users.delete' }, ({ req, res, user, body }) => {
    const u = userRow(body.user);
    if (!u || !u.deleted_at) return fail(res, 404, 'not found');
    db.prepare('UPDATE users SET deleted_at = 0, banned = 0 WHERE id = ?').run(u.id);
    A.audit(user.id, 'user.restore', { type: 'user', id: u.id, before: { deleted: true }, after: { deleted: false }, req });
    json(res, 200, { ok: true });
  });
  // after the 30 days: everything of the account goes (the same as a person deleting their own)
  const purge = () => { for (const u of db.prepare('SELECT id FROM users WHERE deleted_at > 0 AND deleted_at < ?').all(now() - 30 * DAY)) { try { deleteUser(u.id); A.audit(0, 'user.purge', { type: 'user', id: u.id }); } catch (e) { console.error('purge failed', u.id, e.message); } } };
  setTimeout(purge, 60_000).unref(); setInterval(purge, 6 * HOUR).unref();

  // ---- reports, as cases: every open report about one person in one place ----
  const postOf = reason => { const m = /^\[পোস্ট #(\d+)\]/.exec(reason || ''); return m ? Number(m[1]) : 0; };
  function credibility(reporter) {
    const total = count('SELECT COUNT(*) AS n FROM reports WHERE reporter = ?', reporter), acted = count("SELECT COUNT(*) AS n FROM reports WHERE reporter = ? AND outcome = 'actioned'", reporter), dismissed = count("SELECT COUNT(*) AS n FROM reports WHERE reporter = ? AND outcome = 'dismissed'", reporter);
    return { total, acted, dismissed };
  }
  R('GET reports2', { perm: 'reports.view' }, ({ res, query }) => {
    const status = query.get('status') === 'all' ? 'all' : 'open';
    const rows = db.prepare(`SELECT r.*, u.name AS rname FROM reports r LEFT JOIN users u ON u.id = r.reporter WHERE ? = 'all' OR r.status = 'open' ORDER BY r.id DESC LIMIT 1000`).all(status);
    const cases = new Map();
    for (const r of rows) {
      const c = cases.get(r.about) || { about: r.about, reports: [], first: r.made, last: r.made, posts: new Set(), open: 0 };
      c.reports.push({ id: r.id, reason: r.reason, made: r.made, status: r.status, outcome: r.outcome, reporter: { id: r.reporter, name: r.rname, ...credibility(r.reporter) } });
      c.first = Math.min(c.first, r.made); c.last = Math.max(c.last, r.made); if (r.status === 'open') c.open++;
      const p = postOf(r.reason); if (p) c.posts.add(p);
      cases.set(r.about, c);
    }
    const out = [...cases.values()].map(c => {
      const u = userRow(c.about), text = c.reports.map(r => r.reason).join(' ');
      const posts = [...c.posts].map(id => db.prepare('SELECT id, kind, file, poster, caption, created FROM posts WHERE id = ?').get(id)).filter(Boolean).map(p => ({ id: p.id, kind: p.kind, src: p.file ? 'media/' + p.file : '', poster: p.poster ? 'media/' + p.poster : '', caption: p.caption }));
      return { about: c.about, target: u ? { ...person(u), banned: !!u.banned, status: statusOf(u), created: u.created, previous: count("SELECT COUNT(*) AS n FROM reports WHERE about = ? AND status <> 'open'", u.id),
        restrictions: count('SELECT COUNT(*) AS n FROM restrictions WHERE user = ?', u.id) } : null,
        count: c.reports.length, open: c.open, first: c.first, last: c.last, priority: priorityOfText(text, c.reports.length >= 3 ? 'P2' : 'P3'), reports: c.reports, posts, assignee: assignee('report', c.about) };
    }).sort((a, b) => (b.open > 0) - (a.open > 0) || a.priority.localeCompare(b.priority) || a.first - b.first);
    json(res, 200, { cases: out });
  });
  R('POST reports/resolve', { perm: 'reports.view' }, ({ req, res, user, body, can }) => {
    const about = Number(body.about), u = userRow(about), act = String(body.do || '');
    const open = db.prepare("SELECT * FROM reports WHERE about = ? AND status = 'open'").all(about);
    if (!open.length && act !== 'reopen') return fail(res, 404, 'not found');
    const need = { dismiss: 'reports.view', remove: 'content.remove', restrict: 'users.restrict', ban: 'users.ban', reopen: 'reports.view' }[act];
    if (!need) return fail(res, 400, 'bad request');
    if (!can(need)) { A.audit(user.id, 'denied', { type: 'report', id: about, note: act, req }); return fail(res, 403, 'forbidden'); }
    if (act !== 'dismiss' && act !== 'reopen' && !needReason(res, body)) return;
    const ids = open.map(r => r.id), reason = clean(body.reason, 40), note = clean(body.note, 500);
    if (act === 'reopen') {
      const back = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Boolean);
      for (const id of back) db.prepare("UPDATE reports SET status = 'open', outcome = '' WHERE id = ? AND about = ?").run(id, about);
      A.audit(user.id, 'report.reopen', { type: 'user', id: about, after: { reopened: back.length }, req });
      return json(res, 200, { ok: true });
    }
    if (act === 'remove') {
      const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user = ?').get(Number(body.post), about);
      if (!post) return fail(res, 404, 'not found');
      deletePost(post);
      push(about, 'notify', {});
      A.audit(user.id, 'post.remove', { type: 'post', id: post.id, before: { caption: (post.caption || '').slice(0, 120), kind: post.kind, user: about }, after: { removed: true }, reason, note, req });
    }
    if (act === 'restrict') {
      if (!guard(res, user, u)) return;
      const kind = body.kind === 'message' ? 'message' : 'post', days = Math.max(1, Math.min(90, Number(body.days) || 7));
      db.prepare('INSERT INTO restrictions (user, kind, until, reason, by, made) VALUES (?, ?, ?, ?, ?, ?)').run(about, kind, now() + days * DAY, reason, user.id, now());
      A.audit(user.id, 'user.restrict', { type: 'user', id: about, after: { kind, days }, reason, note, req });
    }
    if (act === 'ban') {
      if (!guard(res, user, u)) return;
      aq.setBanned.run(1, about); aq.endAll.run(about); endStreams(about);
      A.audit(user.id, 'user.ban', { type: 'user', id: about, before: { banned: !!u.banned }, after: { banned: true }, reason, note, req });
    }
    const outcome = act === 'dismiss' ? 'dismissed' : 'actioned';
    // a removed post closes only the reports about that post; the rest close with the case
    const closing = act === 'remove' ? open.filter(r => postOf(r.reason) === Number(body.post)) : open;
    for (const r of closing) db.prepare("UPDATE reports SET status = 'done', outcome = ? WHERE id = ?").run(outcome, r.id);
    A.audit(user.id, 'report.' + act, { type: 'user', id: about, before: { open: ids.length }, after: { open: ids.length - closing.length, outcome }, reason, note, req });
    db.prepare("DELETE FROM case_assignments WHERE type = 'report' AND ref = ?").run(String(about));
    json(res, 200, { ok: true, closed: closing.map(r => r.id) });
  });

  // ---- custom roles (owner only): a name and a set of permissions ----
  R('POST roles/save', { perm: 'team.manage' }, ({ req, res, user, body }) => {
    const name = clean(body.name, 40), perms = Array.isArray(body.perms) ? body.perms.filter(p => PERMS[p] && p !== 'team.manage') : [];
    if (!name || !perms.length) return fail(res, 400, 'bad request');
    let key = clean(body.key, 40);
    const old = key ? db.prepare('SELECT * FROM admin_roles WHERE key = ?').get(key) : null;
    if (old && old.builtin) return fail(res, 400, 'role');
    if (!old) key = 'c_' + require('node:crypto').randomBytes(4).toString('hex');
    db.prepare('INSERT INTO admin_roles (key, name, perms_json, builtin, created) VALUES (?, ?, ?, 0, ?) ON CONFLICT (key) DO UPDATE SET name = excluded.name, perms_json = excluded.perms_json').run(key, name, JSON.stringify(perms), now());
    A.audit(user.id, 'role.save', { type: 'role', id: key, before: old ? { name: old.name, perms: JSON.parse(old.perms_json) } : null, after: { name, perms }, req });
    json(res, 200, { key });
  });
  R('POST roles/delete', { perm: 'team.manage' }, ({ req, res, user, body }) => {
    const old = db.prepare('SELECT * FROM admin_roles WHERE key = ?').get(clean(body.key, 40));
    if (!old || old.builtin) return fail(res, 400, 'role');
    if (count('SELECT COUNT(*) AS n FROM team_members WHERE role = ?', old.key)) return fail(res, 400, 'in-use');
    db.prepare('DELETE FROM admin_roles WHERE key = ?').run(old.key);
    A.audit(user.id, 'role.delete', { type: 'role', id: old.key, before: { name: old.name, perms: JSON.parse(old.perms_json) }, req });
    json(res, 200, { ok: true });
  });

  // badges: late (red) and nearly late (amber) per queue
  A.setCountsExtra(() => {
    const t = now(), s = sla(), tone = (oldest, hours) => !oldest ? '' : t - oldest > hours * HOUR ? 'danger' : t - oldest > hours * HOUR * 0.75 ? 'warn' : '';
    const old = (sql) => { try { return (db.prepare(sql).get() || {}).t || 0; } catch { return 0; } };
    return { tone: {
      support: tone(old("SELECT MIN(updated) AS t FROM tickets WHERE status = 'open'"), s.support), reports: tone(old("SELECT MIN(made) AS t FROM reports WHERE status = 'open'"), s.reports),
      fares: tone(old('SELECT MIN(created) AS t FROM contributions WHERE ok = 0'), s.data), photos: tone(old("SELECT MIN(created) AS t FROM place_photos WHERE status = 'pending'"), s.data),
      gems: tone(old("SELECT MIN(created) AS t FROM gems WHERE status = 'pending'"), s.data), payouts: tone(old("SELECT MIN(created) AS t FROM payouts WHERE status = 'pending'"), s.payouts) } };
  });
};
