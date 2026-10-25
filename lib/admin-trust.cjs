// ---- Admin panel v2, phase 4: trust and safety ----
// Strikes (a policy: 1st a warning, 2nd seven days without posting, 3rd the account closed; a strike ends after 90
// days), the record of every removal, appeals from the app (someone other than the one who decided reviews them),
// the moderation queue (flagged words, link spam, new accounts posting a lot) with its editable word list, and risk
// signals worked out from what the app already stores (shared devices, bursts, one wallet for many creators,
// one fare sent again and again, a new account where a closed one was). Every change goes to the audit log.
'use strict';

const bn = n => String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
const DAY = 864e5, HOUR = 3600e3;
const DEFAULT_WORDS = ['শালা', 'হারামি', 'কুত্তা', 'বাস্টার্ড', 'মাগি', 'চুদ', 'বাল', 'শুয়োর', 'মেরে ফেলব', 'খুন করব', 'sala', 'harami', 'kutta', 'magi', 'chud', 'bal ', 'fuck', 'bitch', 'bastard', 'kill you', 'http://', 'https://', 'wa.me', 't.me/', 'bit.ly'];
const DEFAULT_POLICY = { expireDays: 90, steps: ['warn', 'restrict:7', 'ban'] };
const LINK = /(https?:\/\/|www\.|wa\.me|t\.me\/|bit\.ly)/i;
const REASON_BN = { spam: 'স্প্যাম', harass: 'হয়রানি/গালি', threat: 'হুমকি', scam: 'প্রতারণা/স্ক্যাম', fake: 'ভুয়া অ্যাকাউন্ট', copyright: 'কপিরাইট', sexual: 'যৌন কনটেন্ট',
  violence: 'সহিংস কনটেন্ট', wrong_data: 'ভুল তথ্য', minor: 'নাবালক সুরক্ষা', other: 'নিয়ম ভাঙা' };
const REASON_EN = { spam: 'spam', harass: 'harassment or abuse', threat: 'a threat', scam: 'a scam', fake: 'a fake account', copyright: 'copyright', sexual: 'sexual content',
  violence: 'violent content', wrong_data: 'wrong information', minor: 'child safety', other: 'breaking the rules' };

module.exports = function adminTrust(A, ctx) {
  const { db, json, readBody, deletePost, aq, push, endStreams, followers, pushTo } = ctx;
  // the phone too (in the language the device uses), when push is set up
  const phone = (uid, tag, bn, en) => { try { if (pushTo) pushTo(uid, lang => ({ title: 'Manzeela', body: lang === 'en' ? en : bn, tag, url: '/#/explore' })); } catch { /* push is optional */ } };
  const count = (sql, ...a) => { try { return db.prepare(sql).get(...a).n; } catch { return 0; } };
  const now = () => Date.now();
  const fail = (res, s, e, x) => json(res, s, { error: e, ...x });
  const R = (k, o, f) => A.register(k, o, f);
  const clean = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  const userRow = id => db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  const person = u => u ? A.personOut(u) : null;
  const nameOf = id => (db.prepare('SELECT name FROM users WHERE id = ?').get(id) || {}).name || '';
  const setting = (k, d) => { try { const v = (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) || {}).value; return v ? JSON.parse(v) : d; } catch { return d; } };
  const setSetting = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));

  // ---- schema (added only) ----
  // rollback: the old code ignores these tables.
  db.exec(`CREATE TABLE IF NOT EXISTS strikes (id INTEGER PRIMARY KEY, user INTEGER NOT NULL, reason TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
    by INTEGER NOT NULL, made INTEGER NOT NULL, expires INTEGER NOT NULL, outcome TEXT NOT NULL DEFAULT 'warn', restriction INTEGER NOT NULL DEFAULT 0,
    revoked_at INTEGER NOT NULL DEFAULT 0, revoked_by INTEGER NOT NULL DEFAULT 0, revoke_note TEXT NOT NULL DEFAULT '')`);
  db.exec('CREATE INDEX IF NOT EXISTS strikes_user ON strikes (user, made)');
  db.exec(`CREATE TABLE IF NOT EXISTS removals (id INTEGER PRIMARY KEY, user INTEGER NOT NULL, type TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', snippet TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL, by INTEGER NOT NULL, made INTEGER NOT NULL, strike INTEGER NOT NULL DEFAULT 0)`);
  db.exec('CREATE INDEX IF NOT EXISTS removals_user ON removals (user, made)');
  db.exec(`CREATE TABLE IF NOT EXISTS appeals (id INTEGER PRIMARY KEY, user INTEGER NOT NULL, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', made INTEGER NOT NULL, decided_by INTEGER NOT NULL DEFAULT 0, decided_at INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '')`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS appeals_target ON appeals (target_type, target_id)');
  db.exec('CREATE TABLE IF NOT EXISTS modq_reviewed (type TEXT NOT NULL, ref TEXT NOT NULL, by INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (type, ref))');
  // a closed account's devices, kept when its sign-ins are ended (whichever page closed it), for the "new account where a closed one was" signal
  db.exec('CREATE TABLE IF NOT EXISTS banned_devices (user INTEGER NOT NULL, agent TEXT NOT NULL, ip TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user, agent, ip))');
  db.exec("CREATE TRIGGER IF NOT EXISTS sessions_keep_banned BEFORE DELETE ON sessions WHEN OLD.agent <> '' AND OLD.ip <> '' AND (SELECT banned FROM users WHERE id = OLD.user) = 1 BEGIN INSERT OR IGNORE INTO banned_devices (user, agent, ip, at) VALUES (OLD.user, OLD.agent, OLD.ip, OLD.last); END");
  db.exec('CREATE TABLE IF NOT EXISTS risk_signals (key TEXT PRIMARY KEY, kind TEXT NOT NULL, users_json TEXT NOT NULL, cleared_by INTEGER NOT NULL, cleared_at INTEGER NOT NULL, note TEXT NOT NULL DEFAULT \'\')');

  const words = () => { const w = setting('mod_words', null); return Array.isArray(w) && w.length ? w : DEFAULT_WORDS; };
  const policy = () => { const p = setting('strike_policy', null); return p && Array.isArray(p.steps) && p.steps.length ? { ...DEFAULT_POLICY, ...p } : DEFAULT_POLICY; };
  const hitsOf = text => { const low = String(text || '').toLowerCase(); return words().filter(w => low.includes(w.toLowerCase())); };
  const activeStrikes = id => db.prepare('SELECT * FROM strikes WHERE user = ? AND revoked_at = 0 AND expires > ? ORDER BY id').all(id, now());
  const isTeam = u => !!A.roleOf(u);

  // ---- strikes: the policy decides what follows ----
  // step 'warn': a notice only; 'restrict:N': no posts, stories or comments for N days; 'ban': the account is closed.
  function giveStrike({ target, reason, note, source, by, req }) {
    const p = policy(), n = activeStrikes(target.id).length + 1;
    const step = p.steps[Math.min(n, p.steps.length) - 1] || 'warn';
    let outcome = 'warn', restriction = 0;
    const t = now();
    if (step.startsWith('restrict:')) {
      const days = Math.max(1, Math.min(90, Number(step.split(':')[1]) || 7));
      restriction = Number(db.prepare('INSERT INTO restrictions (user, kind, until, reason, by, made) VALUES (?, ?, ?, ?, ?, ?)').run(target.id, 'post', t + days * DAY, reason, by, t).lastInsertRowid);
      outcome = 'restrict:' + days;
    } else if (step === 'ban') {
      aq.setBanned.run(1, target.id); aq.endAll.run(target.id); endStreams(target.id);
      outcome = 'ban';
    }
    const id = Number(db.prepare('INSERT INTO strikes (user, reason, note, source, by, made, expires, outcome, restriction) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(target.id, reason, note || '', source || '', by, t, t + p.expireDays * DAY, outcome, restriction).lastInsertRowid);
    db.prepare('INSERT INTO notifications (user, actor, kind, post, body, created) VALUES (?, ?, ?, 0, ?, ?)').run(target.id, target.id, 'strike', 'strike:' + id, t);
    push(target.id, 'notify', {});
    phone(target.id, 'strike-' + id, 'আপনার অ্যাকাউন্টে একটি স্ট্রাইক দেওয়া হয়েছে — কারণ ও আপিল দেখতে খুলুন।', 'Your account got a strike — open to see why, and to appeal.');
    A.audit(by, 'strike.give', { type: 'user', id: target.id, before: { active: n - 1 }, after: { strike: id, number: n, outcome }, reason, note, req });
    return { id, number: n, outcome };
  }
  // take a strike back, and what it caused
  function revokeStrike(s, by, note, req) {
    if (s.revoked_at) return;
    db.prepare('UPDATE strikes SET revoked_at = ?, revoked_by = ?, revoke_note = ? WHERE id = ?').run(now(), by, note || '', s.id);
    if (s.restriction) db.prepare('UPDATE restrictions SET lifted = ? WHERE id = ? AND lifted = 0').run(now(), s.restriction);
    if (s.outcome === 'ban') {
      const u = userRow(s.user);
      // open the account again only when this strike closed it and no other strike says it stays closed
      if (u && u.banned && !db.prepare("SELECT 1 FROM strikes WHERE user = ? AND id <> ? AND outcome = 'ban' AND revoked_at = 0 AND expires > ?").get(s.user, s.id, now())) aq.setBanned.run(0, s.user);
    }
    A.audit(by, 'strike.revoke', { type: 'user', id: s.user, before: { strike: s.id, outcome: s.outcome }, after: { revoked: true }, note, req });
  }
  // a removal, kept so the person can see why and appeal; the notification points at it
  function recordRemoval({ target, type, ref, snippet, reason, by, strike = 0 }) {
    const id = Number(db.prepare('INSERT INTO removals (user, type, ref, snippet, reason, by, made, strike) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(target, type, String(ref || ''), String(snippet || '').slice(0, 140), reason, by, now(), strike).lastInsertRowid);
    db.prepare('INSERT INTO notifications (user, actor, kind, post, body, created) VALUES (?, ?, ?, 0, ?, ?)').run(target, target, 'removed', 'removal:' + id, now());
    push(target, 'notify', {});
    phone(target, 'removal-' + id, type === 'comment' ? 'টিম আপনার একটি মন্তব্য সরিয়েছে — কারণ ও আপিল দেখতে খুলুন।' : 'টিম আপনার একটি পোস্ট সরিয়েছে — কারণ ও আপিল দেখতে খুলুন।', type === 'comment' ? 'The team removed one of your comments — open to see why, and to appeal.' : 'The team removed one of your posts — open to see why, and to appeal.');
    return id;
  }

  // ---- what the person sees in the app (a notification's details, and the appeal) ----
  const appealOf = (type, id) => db.prepare('SELECT id, status, note, made, decided_at FROM appeals WHERE target_type = ? AND target_id = ?').get(type, id) || null;
  function modInfo(body, me) {
    const m = /^(removal|strike|appeal):(\d+)$/.exec(body || '');
    if (!m) return null;
    const id = Number(m[2]);
    if (m[1] === 'appeal') {
      const a = db.prepare('SELECT * FROM appeals WHERE id = ? AND user = ?').get(id, me);
      return a ? { type: 'appeal', id, status: a.status, note: a.note, target: a.target_type } : null;
    }
    if (m[1] === 'removal') {
      const r = db.prepare('SELECT * FROM removals WHERE id = ? AND user = ?').get(id, me);
      if (!r) return null;
      return { type: 'removal', id, what: r.type, snippet: r.snippet, reason: r.reason, reasonBn: REASON_BN[r.reason] || REASON_BN.other, reasonEn: REASON_EN[r.reason] || REASON_EN.other,
        made: r.made, strike: !!r.strike, appeal: appealOf('removal', id), canAppeal: !appealOf('removal', id) && now() - r.made < 30 * DAY };
    }
    const s = db.prepare('SELECT * FROM strikes WHERE id = ? AND user = ?').get(id, me);
    if (!s) return null;
    return { type: 'strike', id, reason: s.reason, reasonBn: REASON_BN[s.reason] || REASON_BN.other, reasonEn: REASON_EN[s.reason] || REASON_EN.other, made: s.made, expires: s.expires,
      outcome: s.outcome, revoked: !!s.revoked_at, active: activeStrikes(me).length, policy: policy(), appeal: appealOf('strike', id), canAppeal: !s.revoked_at && !appealOf('strike', id) && now() - s.made < 30 * DAY };
  }
  // POST /api/appeal {type: 'strike'|'removal', id, body} — once for each, within 30 days
  async function appealApi(req, res, me) {
    if (req.method !== 'POST' || !(req.headers['content-type'] || '').startsWith('application/json')) return fail(res, 400, 'bad request');
    let b; try { b = JSON.parse(await readBody(req, 4000)) || {}; } catch { return fail(res, 400, 'bad request'); }
    const type = b.type === 'strike' ? 'strike' : b.type === 'removal' ? 'removal' : '', id = Number(b.id), text = clean(b.body, 1000);
    if (!type || !id) return fail(res, 400, 'bad request');
    if (text.length < 10) return fail(res, 400, 'short');
    const row = db.prepare(`SELECT * FROM ${type === 'strike' ? 'strikes' : 'removals'} WHERE id = ? AND user = ?`).get(id, me.id);
    if (!row) return fail(res, 404, 'not found');
    if (now() - row.made > 30 * DAY) return fail(res, 400, 'late');
    if (appealOf(type, id)) return fail(res, 409, 'already');
    const aid = Number(db.prepare('INSERT INTO appeals (user, target_type, target_id, body, made) VALUES (?, ?, ?, ?, ?)').run(me.id, type, id, text, now()).lastInsertRowid);
    A.broadcast('counts', {}, 'content.remove');
    json(res, 200, { ok: true, id: aid });
  }

  // ---- panel: strikes and appeals ----
  const strikeOut = s => ({ id: s.id, user: person(userRow(s.user)), reason: s.reason, note: s.note, source: s.source, by: { id: s.by, name: nameOf(s.by) }, made: s.made, expires: s.expires,
    outcome: s.outcome, active: !s.revoked_at && s.expires > now(), revoked: s.revoked_at ? { at: s.revoked_at, by: nameOf(s.revoked_by), note: s.revoke_note } : null, appeal: appealOf('strike', s.id) });
  // who made the decision an appeal is about
  function deciderOf(a) {
    if (a.target_type === 'strike') return (db.prepare('SELECT by FROM strikes WHERE id = ?').get(a.target_id) || {}).by || 0;
    return (db.prepare('SELECT by FROM removals WHERE id = ?').get(a.target_id) || {}).by || 0;
  }
  function appealOut(a) {
    const target = a.target_type === 'strike' ? db.prepare('SELECT * FROM strikes WHERE id = ?').get(a.target_id) : db.prepare('SELECT * FROM removals WHERE id = ?').get(a.target_id);
    const by = deciderOf(a), u = userRow(a.user);
    return { id: a.id, type: a.target_type, targetId: a.target_id, body: a.body, status: a.status, made: a.made, note: a.note, decidedBy: a.decided_by ? nameOf(a.decided_by) : '', decidedAt: a.decided_at,
      user: person(u), strikes: u ? activeStrikes(u.id).length : 0, decider: { id: by, name: nameOf(by) },
      target: target ? { reason: target.reason, made: target.made, note: target.note || '', snippet: target.snippet || '', what: target.type || '', outcome: target.outcome || '', revoked: !!target.revoked_at } : null };
  }
  R('GET strikes', { perm: 'content.remove' }, ({ res, query }) => {
    const tab = query.get('tab') || 'appeals';
    const tally = { appeals: count("SELECT COUNT(*) AS n FROM appeals WHERE status = 'open'"), active: count('SELECT COUNT(*) AS n FROM strikes WHERE revoked_at = 0 AND expires > ?', now()),
      decided: count("SELECT COUNT(*) AS n FROM appeals WHERE status <> 'open'"), all: count('SELECT COUNT(*) AS n FROM strikes') };
    let rows;
    if (tab === 'appeals' || tab === 'decided') rows = db.prepare(`SELECT * FROM appeals WHERE ${tab === 'appeals' ? "status = 'open'" : "status <> 'open'"} ORDER BY ${tab === 'appeals' ? 'made' : 'decided_at DESC'} LIMIT 300`).all().map(appealOut);
    else rows = db.prepare(`SELECT * FROM strikes ${tab === 'active' ? 'WHERE revoked_at = 0 AND expires > ?' : 'WHERE ? > 0'} ORDER BY id DESC LIMIT 300`).all(now()).map(strikeOut);
    json(res, 200, { tab, rows, tally, policy: policy() });
  });
  R('GET strikes/user', { perm: 'users.view' }, ({ res, query }) => {
    const id = Number(query.get('id'));
    json(res, 200, { strikes: db.prepare('SELECT * FROM strikes WHERE user = ? ORDER BY id DESC LIMIT 50').all(id).map(strikeOut),
      removals: db.prepare('SELECT r.*, u.name AS byname FROM removals r LEFT JOIN users u ON u.id = r.by WHERE r.user = ? ORDER BY r.id DESC LIMIT 50').all(id).map(r => ({ id: r.id, type: r.type, snippet: r.snippet, reason: r.reason, by: r.byname, made: r.made, appeal: appealOf('removal', r.id) })),
      appeals: db.prepare('SELECT * FROM appeals WHERE user = ? ORDER BY id DESC LIMIT 20').all(id).map(appealOut), policy: policy() });
  });
  R('POST strikes/give', { perm: 'content.remove' }, ({ req, res, user, body, can }) => {
    const u = userRow(body.user), reason = clean(body.reason, 40);
    if (!u || u.deleted_at) return fail(res, 404, 'not found');
    if (u.id === user.id || isTeam(u)) return fail(res, 403, 'team');
    if (!reason) return fail(res, 400, 'reason');
    // what the next strike will do; closing an account also needs the right to close accounts
    const next = policy().steps[Math.min(activeStrikes(u.id).length + 1, policy().steps.length) - 1];
    if (next === 'ban' && !can('users.ban')) return fail(res, 403, 'ban-perm');
    json(res, 200, giveStrike({ target: u, reason, note: clean(body.note, 500), source: clean(body.source, 40) || 'manual', by: user.id, req }));
  });
  R('GET strikes/next', { perm: 'content.remove' }, ({ res, query }) => {
    const n = activeStrikes(Number(query.get('user'))).length + 1, p = policy();
    json(res, 200, { number: n, step: p.steps[Math.min(n, p.steps.length) - 1] });
  });
  R('POST strikes/revoke', { perm: 'content.remove' }, ({ req, res, user, body }) => {
    const s = db.prepare('SELECT * FROM strikes WHERE id = ?').get(Number(body.id));
    if (!s || s.revoked_at) return fail(res, 404, 'not found');
    if (!clean(body.reason, 40) && !clean(body.note, 500)) return fail(res, 400, 'reason');
    revokeStrike(s, user.id, clean(body.note, 500) || clean(body.reason, 40), req);
    json(res, 200, { ok: true });
  });
  R('POST strikes/policy', { perm: 'content.remove' }, ({ req, res, user, body, role }) => {
    if (!['owner', 'admin'].includes(role)) return fail(res, 403, 'forbidden');
    const expireDays = Math.round(Number(body.expireDays));
    const steps = (Array.isArray(body.steps) ? body.steps : []).map(String).filter(s => s === 'warn' || s === 'ban' || /^restrict:\d{1,2}$/.test(s)).slice(0, 6);
    if (!(expireDays >= 7 && expireDays <= 730) || !steps.length) return fail(res, 400, 'bad request');
    const before = policy();
    setSetting('strike_policy', { expireDays, steps });
    A.audit(user.id, 'strike.policy', { type: 'setting', id: 'strike_policy', before, after: { expireDays, steps }, req });
    json(res, 200, { policy: policy() });
  });
  // the decision on an appeal: someone other than the one who decided (the owner may, and it is written down)
  R('POST appeals/decide', { perm: 'content.remove' }, ({ req, res, user, body, role }) => {
    const a = db.prepare('SELECT * FROM appeals WHERE id = ?').get(Number(body.id)), act = body.do;
    if (!a || a.status !== 'open') return fail(res, 404, 'not found');
    if (act !== 'uphold' && act !== 'overturn') return fail(res, 400, 'bad request');
    const note = clean(body.note, 500);
    if (!note) return fail(res, 400, 'note');
    const decider = deciderOf(a), self = decider === user.id;
    if (self && role !== 'owner') return fail(res, 403, 'same-person');
    const status = act === 'overturn' ? 'overturned' : 'upheld';
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE appeals SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ?').run(status, user.id, now(), note, a.id);
      if (act === 'overturn') {
        const sid = a.target_type === 'strike' ? a.target_id : (db.prepare('SELECT strike FROM removals WHERE id = ?').get(a.target_id) || {}).strike;
        const s = sid ? db.prepare('SELECT * FROM strikes WHERE id = ?').get(sid) : null;
        if (s) revokeStrike(s, user.id, 'আপিলে বাতিল: ' + note, req);
      }
      db.prepare('INSERT INTO notifications (user, actor, kind, post, body, created) VALUES (?, ?, ?, 0, ?, ?)').run(a.user, a.user, 'appeal', 'appeal:' + a.id, now());
      A.audit(user.id, 'appeal.' + act, { type: 'user', id: a.user, before: { appeal: a.id, status: 'open', decider }, after: { status, selfReview: self || undefined }, note, req });
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    push(a.user, 'notify', {});
    phone(a.user, 'appeal-' + a.id, 'আপনার আপিলের সিদ্ধান্ত হয়েছে — দেখতে খুলুন।', 'Your appeal has been decided — open to see.');
    json(res, 200, { ok: true, status });
  });

  // ---- the moderation queue: what the app's own checks flagged ----
  function modItems() {
    const out = [], since = now() - 14 * DAY, reviewed = new Set(db.prepare('SELECT type || \':\' || ref AS k FROM modq_reviewed').all().map(r => r.k));
    const add = it => { it.reviewed = reviewed.has(it.type + ':' + it.ref); out.push(it); };
    const ws = words();
    for (const c of db.prepare('SELECT c.*, u.name, u.username, u.pic_v, u.created AS ucreated FROM post_comments c JOIN users u ON u.id = c.user WHERE c.created > ? ORDER BY c.id DESC LIMIT 3000').all(since)) {
      const hits = hitsOf(c.body);
      if (hits.length) add({ type: 'comment', ref: c.id + ':' + c.created, id: c.id, post: c.post, text: c.body, hits, why: LINK.test(c.body) ? 'link' : 'words', created: c.created, user: { id: c.user, name: c.name, username: c.username, pic: c.pic_v, created: c.ucreated } });
    }
    for (const p of db.prepare('SELECT p.id, p.user, p.kind, p.caption, p.file, p.poster, p.created, u.name, u.username, u.pic_v, u.created AS ucreated FROM posts p JOIN users u ON u.id = p.user WHERE p.created > ? ORDER BY p.id DESC LIMIT 3000').all(since)) {
      const hits = hitsOf(p.caption);
      if (hits.length) add({ type: 'post', ref: p.id + ':' + p.created, id: p.id, text: p.caption, kind: p.kind, src: p.file ? 'media/' + p.file : '', poster: p.poster ? 'media/' + p.poster : '', hits, why: LINK.test(p.caption) ? 'link' : 'words', created: p.created,
        user: { id: p.user, name: p.name, username: p.username, pic: p.pic_v, created: p.ucreated } });
    }
    // a new account (under 7 days) that posted 5 or more times, or commented 20 or more times, in one day
    for (const b of db.prepare(`SELECT u.id, u.name, u.username, u.pic_v, u.created, (SELECT COUNT(*) FROM posts p WHERE p.user = u.id AND p.created > ?1) AS posts,
        (SELECT COUNT(*) FROM post_comments c WHERE c.user = u.id AND c.created > ?1) AS comments FROM users u WHERE u.created > ?2 AND u.deleted_at = 0 AND u.banned = 0`).all(now() - DAY, now() - 7 * DAY)) {
      if (b.posts >= 5 || b.comments >= 20) add({ type: 'burst', ref: b.id + ':' + Math.floor(now() / DAY), id: b.id, text: `${b.posts}টি পোস্ট ও ${b.comments}টি মন্তব্য গত ২৪ ঘণ্টায়`, hits: [], why: 'new', created: b.created,
        user: { id: b.id, name: b.name, username: b.username, pic: b.pic_v, created: b.created } });
    }
    void ws;
    return out.sort((a, b) => b.created - a.created);
  }
  R('GET modqueue', { perm: 'content.remove' }, ({ res, query }) => {
    const tab = query.get('tab') === 'reviewed' ? 'reviewed' : 'open', all = modItems();
    json(res, 200, { rows: all.filter(i => tab === 'reviewed' ? i.reviewed : !i.reviewed).slice(0, 300), tally: { open: all.filter(i => !i.reviewed).length, reviewed: all.filter(i => i.reviewed).length }, words: words() });
  });
  R('POST modqueue/decide', { perm: 'content.remove' }, ({ req, res, user, body, can }) => {
    const type = String(body.type || ''), ref = clean(String(body.ref || ''), 60), act = body.do;
    if (!['comment', 'post', 'burst'].includes(type) || !ref) return fail(res, 400, 'bad request');
    const mark = () => db.prepare('INSERT INTO modq_reviewed (type, ref, by, at) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET by = excluded.by, at = excluded.at').run(type, ref, user.id, now());
    if (act === 'ok') { mark(); A.audit(user.id, 'modq.ok', { type, id: ref, after: { reviewed: true }, req }); return json(res, 200, { ok: true }); }
    if (act === 'reopen') { const was = db.prepare('SELECT * FROM modq_reviewed WHERE type = ? AND ref = ?').get(type, ref); db.prepare('DELETE FROM modq_reviewed WHERE type = ? AND ref = ?').run(type, ref); A.audit(user.id, 'modq.reopen', { type, id: ref, before: was ? { reviewed: true } : null, after: { reviewed: false }, req }); return json(res, 200, { ok: true }); }
    if (act !== 'remove' || type === 'burst') return fail(res, 400, 'bad request');
    const reason = clean(body.reason, 40), note = clean(body.note, 500);
    if (!reason) return fail(res, 400, 'reason');
    // ref is id:created — an id is used again after a delete, the time tells the two apart
    const [rid, rmade] = ref.split(':').map(Number);
    const row = (type === 'post' ? db.prepare('SELECT * FROM posts WHERE id = ?') : db.prepare('SELECT * FROM post_comments WHERE id = ?')).get(rid);
    if (!row || row.created !== rmade) { mark(); return fail(res, 404, 'not found'); }
    const target = userRow(row.user);
    let strike = null;
    if (body.strike && target && !isTeam(target)) {
      const next = policy().steps[Math.min(activeStrikes(target.id).length + 1, policy().steps.length) - 1];
      if (next === 'ban' && !can('users.ban')) return fail(res, 403, 'ban-perm');
    }
    if (type === 'post') {
      deletePost(row);
      db.prepare("UPDATE reports SET status = 'done', outcome = 'actioned' WHERE status = 'open' AND reason LIKE ?").run(`[পোস্ট #${row.id}]%`);
    } else db.prepare('DELETE FROM post_comments WHERE id = ?').run(row.id);
    if (body.strike && target && !isTeam(target)) strike = giveStrike({ target, reason, note, source: type + ':' + row.id, by: user.id, req });
    recordRemoval({ target: row.user, type, ref: row.id, snippet: type === 'post' ? row.caption : row.body, reason, by: user.id, strike: strike ? strike.id : 0 });
    A.audit(user.id, type + '.remove', { type, id: row.id, before: { user: row.user, text: String(type === 'post' ? row.caption : row.body).slice(0, 200) }, after: { removed: true, strike: strike ? strike.number : 0 }, reason, note, req });
    mark();
    json(res, 200, { ok: true, strike });
  });
  R('POST modqueue/words', { perm: 'content.remove' }, ({ req, res, user, body, role }) => {
    if (!['owner', 'admin'].includes(role)) return fail(res, 403, 'forbidden');
    const list = [...new Set((Array.isArray(body.words) ? body.words : []).map(w => String(w).slice(0, 40)).filter(w => w.trim().length >= 2))].slice(0, 500);
    if (!list.length) return fail(res, 400, 'bad request');
    const before = words();
    setSetting('mod_words', list);
    A.audit(user.id, 'modq.words', { type: 'setting', id: 'mod_words', before: { count: before.length, added: list.filter(w => !before.includes(w)).slice(0, 50) }, after: { count: list.length, removed: before.filter(w => !list.includes(w)).slice(0, 50) }, req });
    json(res, 200, { words: words() });
  });

  // ---- risk signals: worked out each time, from what is stored; a cleared one stays cleared ----
  function signals() {
    const out = [], t = now();
    const brief = id => { const u = userRow(id); return u ? { ...person(u), banned: !!u.banned, created: u.created } : { id, name: '—' }; };
    // 1. several accounts on one device and network (the same browser description and address) — "possible", one Wi-Fi is shared by many
    for (const g of db.prepare(`SELECT agent, ip, GROUP_CONCAT(DISTINCT user) AS users, COUNT(DISTINCT user) AS n, MAX(last) AS at FROM sessions WHERE ip <> '' AND agent <> '' AND last > ?
        GROUP BY agent, ip HAVING n >= 3 ORDER BY n DESC LIMIT 50`).all(t - 30 * DAY)) {
      const ids = g.users.split(',').map(Number);
      out.push({ key: 'device:' + ids.sort((a, b) => a - b).join('-'), kind: 'device', score: Math.min(60, g.n * 12), users: ids.map(brief), at: g.at,
        why: `${bn(g.n)}টি অ্যাকাউন্ট একই ডিভাইস (${g.agent}) আর একই নেটওয়ার্ক থেকে — সম্ভাব্য, একই ওয়াই-ফাইয়ে অনেকে থাকতে পারেন` });
    }
    // 2. after a closed account, a new one on the same device and network
    for (const b of db.prepare(`SELECT s.user AS banned, n.user AS fresh, s.agent, MAX(n.last) AS at FROM banned_devices s JOIN users ub ON ub.id = s.user AND ub.banned = 1
        JOIN sessions n ON n.agent = s.agent AND n.ip = s.ip AND n.user <> s.user JOIN users un ON un.id = n.user AND un.created > ub.created AND un.banned = 0
        GROUP BY s.user, n.user LIMIT 50`).all())
      out.push({ key: 'reborn:' + b.banned + '-' + b.fresh, kind: 'reborn', score: 70, users: [brief(b.fresh), brief(b.banned)], at: b.at,
        why: `বন্ধ করা অ্যাকাউন্টের ডিভাইস (${b.agent}) ও নেটওয়ার্ক থেকে নতুন অ্যাকাউন্ট` });
    // 3. bursts in one hour (the busiest hour of the last 7 days): follows, reports, messages (counts only)
    const burst = (sql, kind, min, label, score) => {
      for (const r of db.prepare(sql).all(t - 7 * DAY)) if (r.n >= min)
        out.push({ key: `${kind}:${r.user}:${r.h}`, kind, score, users: [brief(r.user)], at: r.h * HOUR, why: `এক ঘণ্টায় ${bn(r.n)}টি ${label}` });
    };
    burst('SELECT actor AS user, CAST(updated / 3600000 AS INTEGER) AS h, COUNT(*) AS n FROM friends WHERE updated > ? GROUP BY actor, h HAVING n >= 40 ORDER BY n DESC LIMIT 30', 'follows', 40, 'ফলো', 35);
    burst('SELECT reporter AS user, CAST(made / 3600000 AS INTEGER) AS h, COUNT(*) AS n FROM reports WHERE made > ? GROUP BY reporter, h HAVING n >= 8 ORDER BY n DESC LIMIT 30', 'reports', 8, 'রিপোর্ট', 30);
    burst('SELECT sender AS user, CAST(sent / 3600000 AS INTEGER) AS h, COUNT(DISTINCT CASE WHEN grp = 0 THEN a || \'-\' || b ELSE \'g\' || grp END) AS n FROM messages WHERE sent > ? GROUP BY sender, h HAVING n >= 25 ORDER BY n DESC LIMIT 30', 'messages', 25, 'আলাদা মানুষকে মেসেজ', 40);
    // 4. one wallet number for more than one creator
    for (const w of db.prepare('SELECT account, GROUP_CONCAT(DISTINCT user) AS users, COUNT(DISTINCT user) AS n, MAX(created) AS at FROM payouts GROUP BY account HAVING n >= 2 LIMIT 50').all()) {
      const ids = w.users.split(',').map(Number);
      out.push({ key: 'wallet:' + w.account, kind: 'wallet', score: 80, users: ids.map(brief), at: w.at, why: `একই ওয়ালেট নম্বর (${w.account.slice(0, 3)}••••${w.account.slice(-2)}) ${bn(w.n)}জন ক্রিয়েটরের পেআউটে` });
    }
    // 5. one person sending the same fare again and again
    for (const f of db.prepare('SELECT user, fare, COUNT(*) AS n, MAX(created) AS at FROM contributions WHERE created > ? GROUP BY user, fare HAVING n >= 5 ORDER BY n DESC LIMIT 30').all(t - 30 * DAY))
      out.push({ key: `fares:${f.user}:${f.fare}`, kind: 'fares', score: 25, users: [brief(f.user)], at: f.at, why: `৩০ দিনে ${bn(f.n)}টি ভাড়া জানিয়েছেন, সবগুলো ৳${bn(f.fare)}` });
    const cleared = new Map(db.prepare('SELECT r.*, u.name FROM risk_signals r LEFT JOIN users u ON u.id = r.cleared_by').all().map(r => [r.key, r]));
    for (const s of out) { const c = cleared.get(s.key); s.cleared = c ? { by: c.name, at: c.cleared_at, note: c.note } : null; }
    return out.sort((a, b) => b.score - a.score || b.at - a.at);
  }
  // the score of one person, for the people list and the 360 view
  function riskOf(id) {
    const mine = signals().filter(s => !s.cleared && s.users.some(u => u.id === id));
    return { score: Math.min(100, mine.reduce((n, s) => n + s.score, 0)), why: mine.map(s => s.why) };
  }
  let cache = { at: 0, list: [] };
  const cachedSignals = () => { if (now() - cache.at > 60_000) cache = { at: now(), list: signals() }; return cache.list; };
  R('GET risk', { perm: 'users.ban' }, ({ res, query }) => {
    const tab = query.get('tab') === 'cleared' ? 'cleared' : 'open';
    cache.at = 0;
    const all = cachedSignals();
    json(res, 200, { rows: all.filter(s => tab === 'cleared' ? s.cleared : !s.cleared), tally: { open: all.filter(s => !s.cleared).length, cleared: all.filter(s => s.cleared).length } });
  });
  R('POST risk/clear', { perm: 'users.ban' }, ({ req, res, user, body }) => {
    const key = clean(String(body.key || ''), 120), s = signals().find(x => x.key === key);
    if (!s) return fail(res, 404, 'not found');
    const note = clean(body.note, 300);
    if (!note) return fail(res, 400, 'note');
    db.prepare('INSERT INTO risk_signals (key, kind, users_json, cleared_by, cleared_at, note) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET cleared_by = excluded.cleared_by, cleared_at = excluded.cleared_at, note = excluded.note')
      .run(key, s.kind, JSON.stringify(s.users.map(u => u.id)), user.id, now(), note);
    cache.at = 0;
    A.audit(user.id, 'risk.clear', { type: 'signal', id: key, before: { score: s.score }, after: { cleared: true }, note, req });
    json(res, 200, { ok: true });
  });
  R('POST risk/reopen', { perm: 'users.ban' }, ({ req, res, user, body }) => {
    const key = clean(String(body.key || ''), 120), was = db.prepare('SELECT * FROM risk_signals WHERE key = ?').get(key);
    if (!was) return fail(res, 404, 'not found');
    db.prepare('DELETE FROM risk_signals WHERE key = ?').run(key);
    cache.at = 0;
    A.audit(user.id, 'risk.reopen', { type: 'signal', id: key, before: { cleared: true, note: was.note }, after: { cleared: false }, req });
    json(res, 200, { ok: true });
  });

  const api = { giveStrike, revokeStrike, recordRemoval, modInfo, appealApi, words, riskOf: id => { const list = cachedSignals().filter(s => !s.cleared && s.users.some(u => u.id === id)); return { score: Math.min(100, list.reduce((n, s) => n + s.score, 0)), why: list.map(s => s.why) }; },
    policy, activeStrikes, appealsOpen: () => count("SELECT COUNT(*) AS n FROM appeals WHERE status = 'open'"), modOpen: () => { try { return modItems().filter(i => !i.reviewed).length; } catch { return 0; } } };
  void riskOf; void followers;
  A.trust = api;
  return api;
};
