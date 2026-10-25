// ---- Admin panel v2, phase 4: money ----
// Creators (applications with followers, posts, engagement and risk; approve, refuse, end; earnings added or taken
// back with a reason; the rules and whether the program is open), payouts in two steps by two people (one approves,
// another sends the money from the business wallet and enters its transaction ID — the same TrxID never twice),
// and the ledger: every earning, adjustment and payout as two equal lines that are never changed, by month, as CSV.
// The app sends no money itself; the team pays from the business wallet and records it here.
'use strict';

const bn = n => String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
const DAY = 864e5;
const WALLET_BN = { bkash: 'বিকাশ', nagad: 'নগদ', rocket: 'রকেট' };
// a transaction ID as the wallets print it: capital letters and digits. The exact length of each wallet's ID is not
// published where we could check it, so this accepts 8–20; tighten it here once a real receipt of each is seen.
const TRX = /^[A-Z0-9]{8,20}$/;

module.exports = function adminMoney(A, ctx) {
  const { db, json, push, sendMail, MAILS, mailReady, followers, balanceOf, creatorRules, creatorStanding } = ctx;
  const count = (sql, ...a) => { try { return db.prepare(sql).get(...a).n; } catch { return 0; } };
  const now = () => Date.now();
  const fail = (res, s, e, x) => json(res, s, { error: e, ...x });
  const R = (k, o, f) => A.register(k, o, f);
  const clean = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  const userRow = id => db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  const person = u => u ? A.personOut(u) : null;
  const nameOf = id => (db.prepare('SELECT name FROM users WHERE id = ?').get(id) || {}).name || '';
  const setting = (k, d) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) || {}).value ?? d;
  const setSetting = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const stepupOver = () => { const v = Number(setting('payout_stepup', 5000)); return Number.isFinite(v) && v >= 0 ? v : 5000; };
  const programOpen = () => setting('creator_program', 'on') !== 'off';
  const mask = a => a ? a.slice(0, 3) + '••••' + a.slice(-3) : '';

  // ---- schema (added only) ----
  // rollback: the old code ignores these tables; payouts with status 'approved' read as waiting to the old code.
  db.exec('CREATE TABLE IF NOT EXISTS payout_approvals (payout INTEGER PRIMARY KEY, approver INTEGER NOT NULL, at INTEGER NOT NULL, note TEXT NOT NULL DEFAULT \'\')');
  for (const [col, def] of [['sent_by', 'INTEGER NOT NULL DEFAULT 0']])
    if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('payouts') WHERE name = ?").get(col).n) db.exec(`ALTER TABLE payouts ADD COLUMN ${col} ${def}`);
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS payouts_ref ON payouts (ref) WHERE ref <> ''"); } catch (e) { console.error('payouts_ref index not made (a TrxID is in twice):', e.message); }
  db.exec('CREATE INDEX IF NOT EXISTS payouts_status ON payouts (status, created)');
  db.exec(`CREATE TABLE IF NOT EXISTS ledger_entries (id INTEGER PRIMARY KEY, txn TEXT NOT NULL, account TEXT NOT NULL, user INTEGER NOT NULL DEFAULT 0, debit INTEGER NOT NULL DEFAULT 0,
    credit INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL, memo TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL)`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ledger_source ON ledger_entries (source, account)');
  db.exec('CREATE INDEX IF NOT EXISTS ledger_at ON ledger_entries (at)');
  db.exec("CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END");
  db.exec("CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END");
  db.exec('CREATE TABLE IF NOT EXISTS admin_idem (key TEXT PRIMARY KEY, user INTEGER NOT NULL, result TEXT NOT NULL, at INTEGER NOT NULL)');

  // ---- the ledger: written from the earnings and the paid payouts, once each (so the older code paths count too) ----
  // accounts: creator:<id> (what we owe that person), expense:creators (what the program cost), cash:wallet (the business wallet)
  const addLine = db.prepare('INSERT OR IGNORE INTO ledger_entries (txn, account, user, debit, credit, source, memo, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  function syncLedger() {
    let added = 0;
    db.exec('BEGIN');
    try {
      for (const e of db.prepare("SELECT * FROM earnings WHERE 'earning:' || id NOT IN (SELECT source FROM ledger_entries)").all()) {
        const src = 'earning:' + e.id, amt = Math.abs(e.amount), memo = e.note.slice(0, 120);
        if (e.amount >= 0) { addLine.run(src, 'expense:creators', e.user, amt, 0, src, memo, e.created); addLine.run(src, 'creator:' + e.user, e.user, 0, amt, src, memo, e.created); }
        else { addLine.run(src, 'creator:' + e.user, e.user, amt, 0, src, memo, e.created); addLine.run(src, 'expense:creators', e.user, 0, amt, src, memo, e.created); }
        added++;
      }
      for (const p of db.prepare("SELECT * FROM payouts WHERE status = 'paid' AND 'payout:' || id NOT IN (SELECT source FROM ledger_entries)").all()) {
        const src = 'payout:' + p.id, memo = `${WALLET_BN[p.method] || p.method} · ${p.ref}`;
        addLine.run(src, 'creator:' + p.user, p.user, p.amount, 0, src, memo, p.updated); addLine.run(src, 'cash:wallet', p.user, 0, p.amount, src, memo, p.updated);
        added++;
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); console.error('ledger sync failed:', e.message); }
    return added;
  }
  syncLedger();
  setInterval(syncLedger, 60_000).unref();

  // a repeated call with the same key gets the first answer (a double click, a retried request)
  const idemGet = (key, user) => { if (!key) return null; const r = db.prepare('SELECT result FROM admin_idem WHERE key = ? AND user = ?').get(key, user); return r ? JSON.parse(r.result) : null; };
  const idemPut = (key, user, result) => { if (key) db.prepare('INSERT OR IGNORE INTO admin_idem (key, user, result, at) VALUES (?, ?, ?, ?)').run(key, user, JSON.stringify(result), now()); };
  setInterval(() => db.prepare('DELETE FROM admin_idem WHERE at < ?').run(now() - DAY), 3600e3).unref();

  // ---- creators ----
  function engagement(u) {
    const posts = db.prepare(`SELECT (SELECT COUNT(*) FROM post_likes l WHERE l.post = p.id) + (SELECT COUNT(*) FROM post_comments c WHERE c.post = p.id) AS n FROM posts p WHERE p.user = ? ORDER BY p.id DESC LIMIT 30`).all(u.id);
    const f = followers(u.id);
    if (!posts.length || !f) return 0;
    return Math.round(posts.reduce((s, p) => s + p.n, 0) / posts.length / f * 1000) / 10;   // % of followers who react to a post, on average
  }
  const creatorOut = u => {
    const st = creatorStanding(u), risk = A.trust ? A.trust.riskOf(u.id) : { score: 0, why: [] };
    return { ...person(u), creator: u.creator, created: u.created, banned: !!u.banned, followers: st.followers, posts: st.posts, openReports: st.reports, eligible: st.eligible, verified: !!u.verified,
      engagement: engagement(u), risk: risk.score, riskWhy: risk.why, strikes: A.trust ? A.trust.activeStrikes(u.id).length : 0, money: balanceOf(u.id),
      appliedAt: (db.prepare("SELECT MAX(at) AS t FROM audit_log WHERE target_type = 'user' AND target_id = ? AND action LIKE 'creator.%'").get(String(u.id)) || {}).t || 0 };
  };
  R('GET creators2', { perm: 'creators.manage' }, ({ res, query }) => {
    const tab = ['applied', 'approved', 'rejected', 'all'].includes(query.get('tab')) ? query.get('tab') : 'applied';
    const rows = db.prepare(`SELECT * FROM users WHERE creator <> '' AND deleted_at = 0 AND (? = 'all' OR creator = ?) ORDER BY id DESC LIMIT 300`).all(tab, tab);
    const tally = Object.fromEntries(['applied', 'approved', 'rejected'].map(k => [k, count('SELECT COUNT(*) AS n FROM users WHERE creator = ? AND deleted_at = 0', k)]));
    json(res, 200, { rows: rows.map(creatorOut), tally, rules: { ...creatorRules(), stepup: stepupOver(), program: programOpen() },
      totals: { earned: count('SELECT COALESCE(SUM(amount), 0) AS n FROM earnings'), paid: count("SELECT COALESCE(SUM(amount), 0) AS n FROM payouts WHERE status = 'paid'"),
        waiting: count("SELECT COALESCE(SUM(amount), 0) AS n FROM payouts WHERE status IN ('pending', 'approved')") } });
  });
  R('POST creators2/decide', { perm: 'creators.manage' }, ({ req, res, user, body }) => {
    const u = userRow(body.id), act = body.do;
    if (!u || u.deleted_at) return fail(res, 404, 'not found');
    const to = { approve: 'approved', reject: 'rejected', revoke: '' }[act];
    if (to === undefined) return fail(res, 400, 'bad request');
    if (act !== 'approve' && !clean(body.reason, 40)) return fail(res, 400, 'reason');
    if (act === 'approve' && u.creator !== 'applied' && u.creator !== 'rejected') return fail(res, 409, 'state');
    if (act === 'revoke' && u.creator !== 'approved') return fail(res, 409, 'state');
    db.prepare('UPDATE users SET creator = ? WHERE id = ?').run(to, u.id);
    A.audit(user.id, 'creator.' + act, { type: 'user', id: u.id, before: { creator: u.creator }, after: { creator: to }, reason: clean(body.reason, 40), note: clean(body.note, 500), req });
    push(u.id, 'creator', {});
    json(res, 200, { ok: true, creator: to });
  });
  // add to or take from a creator's earnings: a reason always; over the limit, a fresh code
  R('POST creators2/adjust', { perm: 'creators.manage' }, ({ req, res, user, body, stepped }) => {
    const u = userRow(body.id), amount = Math.round(Number(body.amount)), note = clean(body.note, 120);
    const again = idemGet(clean(body.idem, 60), user.id); if (again) return json(res, 200, again);
    if (!u) return fail(res, 404, 'not found');
    if (u.creator !== 'approved') return fail(res, 400, 'creator');
    if (!Number.isInteger(amount) || !amount || Math.abs(amount) > 1_000_000) return fail(res, 400, 'amount');
    if (!note) return fail(res, 400, 'note');
    if (Math.abs(amount) > stepupOver() && !stepped()) return fail(res, 401, 'stepup');
    const before = balanceOf(u.id);
    if (amount < 0 && before.balance + amount < 0) return fail(res, 400, 'balance');
    const id = Number(db.prepare('INSERT INTO earnings (user, amount, note, by, created) VALUES (?, ?, ?, ?, ?)').run(u.id, amount, note, user.id, now()).lastInsertRowid);
    syncLedger();
    const out = { ok: true, id, money: balanceOf(u.id) };
    A.audit(user.id, 'creator.adjust', { type: 'user', id: u.id, before: { balance: before.balance }, after: { balance: out.money.balance, amount }, note, req });
    idemPut(clean(body.idem, 60), user.id, out);
    push(u.id, 'creator', {});
    json(res, 200, out);
  });
  R('POST creators2/rules', { perm: 'creators.manage' }, ({ req, res, user, body }) => {
    const before = { ...creatorRules(), stepup: stepupOver(), program: programOpen() };
    for (const [key, v, max] of [['creator_followers', body.followers, 1e6], ['creator_posts', body.posts, 1e5], ['payout_min', body.min, 1e6], ['payout_stepup', body.stepup, 1e7]]) {
      if (v === undefined) continue;
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < 0 || n > max) return fail(res, 400, 'bad request');
      setSetting(key, n);
    }
    if (typeof body.program === 'boolean') setSetting('creator_program', body.program ? 'on' : 'off');
    const after = { ...creatorRules(), stepup: stepupOver(), program: programOpen() };
    A.audit(user.id, 'creator.rules', { type: 'setting', id: 'creator', before, after, reason: clean(body.reason, 40), req });
    json(res, 200, { rules: after });
  });

  // ---- payouts ----
  function payoutOut(p, can) {
    const u = userRow(p.user), appr = db.prepare('SELECT * FROM payout_approvals WHERE payout = ?').get(p.id);
    const lastPaid = db.prepare("SELECT account, updated FROM payouts WHERE user = ? AND status = 'paid' AND id <> ? ORDER BY updated DESC LIMIT 1").get(p.user, p.id);
    const others = db.prepare('SELECT DISTINCT user FROM payouts WHERE account = ? AND user <> ?').all(p.account, p.user).map(r => r.user);
    const warnings = [];
    if (lastPaid && lastPaid.account !== p.account) warnings.push({ kind: 'wallet-new', tone: 'danger', text: `নতুন ওয়ালেট নম্বর — আগের টাকা গিয়েছিল ${mask(lastPaid.account)}-এ` });
    if (others.length) warnings.push({ kind: 'wallet-shared', tone: 'danger', text: `এই নম্বর আরও ${bn(others.length)}জনের পেআউটে আছে` });
    if (p.amount > stepupOver()) warnings.push({ kind: 'big', tone: 'warn', text: `৳${bn(stepupOver())}-এর বেশি — দুই ধাপেই নতুন কোড লাগবে` });
    if (u && u.creator !== 'approved' && (p.status === 'pending' || p.status === 'approved')) warnings.push({ kind: 'not-creator', tone: 'danger', text: 'এখন আর ক্রিয়েটর নন' });
    if (u && u.banned) warnings.push({ kind: 'banned', tone: 'danger', text: 'অ্যাকাউন্ট বন্ধ' });
    if (A.trust) { const r = A.trust.riskOf(p.user); if (r.score >= 30) warnings.push({ kind: 'risk', tone: r.score >= 60 ? 'danger' : 'warn', text: `ঝুঁকি স্কোর ${bn(r.score)}: ${r.why[0] || ''}` }); }
    // the wallet number stays hidden unless this role may see it (and that is then logged, through the pii route)
    return { id: p.id, amount: p.amount, method: p.method, methodBn: WALLET_BN[p.method] || p.method, account: mask(p.account), canUnmask: can('pii.wallet') || can('pii.unmask'),
      status: p.status, ref: p.ref, note: p.note, created: p.created, updated: p.updated, user: person(u), money: u ? balanceOf(u.id) : null,
      approval: appr ? { by: { id: appr.approver, name: nameOf(appr.approver) }, at: appr.at, note: appr.note } : null, sentBy: p.sent_by ? { id: p.sent_by, name: nameOf(p.sent_by) } : null, warnings };
  }
  R('GET payouts2', { perm: 'payouts.view' }, ({ res, query, can }) => {
    const tab = ['pending', 'approved', 'paid', 'rejected', 'all'].includes(query.get('tab')) ? query.get('tab') : 'pending';
    const rows = db.prepare(`SELECT * FROM payouts WHERE ? = 'all' OR status = ? ORDER BY ${tab === 'pending' || tab === 'approved' ? 'created' : 'updated DESC'} LIMIT 300`).all(tab, tab);
    const tally = Object.fromEntries(['pending', 'approved', 'paid', 'rejected'].map(k => [k, count('SELECT COUNT(*) AS n FROM payouts WHERE status = ?', k)]));
    const taka = Object.fromEntries(['pending', 'approved'].map(k => [k, count('SELECT COALESCE(SUM(amount), 0) AS n FROM payouts WHERE status = ?', k)]));
    json(res, 200, { rows: rows.map(p => payoutOut(p, can)), tally, taka, stepup: stepupOver(), trx: TRX.source });
  });
  // approve (first step) · send (second step: the money has gone, here is its TrxID) · reject (the money goes back to the balance)
  R('POST payouts2/act', { perm: 'payouts.view' }, ({ req, res, user, body, role, can, stepped }) => {
    const key = clean(body.idem, 60), again = idemGet(key, user.id);
    if (again) return json(res, 200, again);
    const p = db.prepare('SELECT * FROM payouts WHERE id = ?').get(Number(body.id)), act = body.do;
    if (!p) return fail(res, 404, 'not found');
    const need = { approve: 'payouts.approve', send: 'payouts.send', reject: can('payouts.approve') ? 'payouts.approve' : 'payouts.send' }[act];
    if (!need) return fail(res, 400, 'bad request');
    if (!can(need)) { A.audit(user.id, 'denied', { type: 'payout', id: p.id, note: act, req }); return fail(res, 403, 'forbidden'); }
    const big = p.amount > stepupOver(), u = userRow(p.user);
    let out;
    if (act === 'approve') {
      if (p.status !== 'pending') return fail(res, 409, 'state', { status: p.status });
      if (big && !stepped()) return fail(res, 401, 'stepup');
      if (!u || u.creator !== 'approved' || u.banned) return fail(res, 400, 'creator');
      db.exec('BEGIN');
      try {
        db.prepare("UPDATE payouts SET status = 'approved', updated = ? WHERE id = ? AND status = 'pending'").run(now(), p.id);
        db.prepare('INSERT OR REPLACE INTO payout_approvals (payout, approver, at, note) VALUES (?, ?, ?, ?)').run(p.id, user.id, now(), clean(body.note, 300));
        A.audit(user.id, 'payout.approve', { type: 'payout', id: p.id, before: { status: 'pending' }, after: { status: 'approved', amount: p.amount }, note: clean(body.note, 300), req });
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      out = { ok: true, status: 'approved' };
    } else if (act === 'send') {
      if (p.status !== 'approved') return fail(res, 409, 'state', { status: p.status });
      const appr = db.prepare('SELECT * FROM payout_approvals WHERE payout = ?').get(p.id);
      const self = appr && appr.approver === user.id;
      // the one who approved does not also send — except the owner, and that is written down
      if (self && role !== 'owner') { A.audit(user.id, 'denied', { type: 'payout', id: p.id, note: 'same-person', req }); return fail(res, 403, 'same-person'); }
      const ref = String(body.ref || '').trim().toUpperCase().replace(/\s+/g, '');
      if (!TRX.test(ref)) return fail(res, 400, 'ref');
      const dup = db.prepare('SELECT id FROM payouts WHERE ref = ? AND id <> ?').get(ref, p.id);
      if (dup) { A.audit(user.id, 'payout.duplicate', { type: 'payout', id: p.id, note: `TrxID ${ref} — পেআউট #${dup.id}-এ আছে`, req }); return fail(res, 409, 'duplicate', { other: dup.id }); }
      if (big && !stepped()) return fail(res, 401, 'stepup');
      db.exec('BEGIN');
      try {
        db.prepare("UPDATE payouts SET status = 'paid', ref = ?, sent_by = ?, updated = ? WHERE id = ? AND status = 'approved'").run(ref, user.id, now(), p.id);
        A.audit(user.id, 'payout.send', { type: 'payout', id: p.id, before: { status: 'approved' }, after: { status: 'paid', ref, amount: p.amount, selfCheck: self || undefined }, req });
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); if (/UNIQUE/.test(e.message)) return fail(res, 409, 'duplicate'); throw e; }
      syncLedger();
      if (mailReady && u) sendMail(u.email, MAILS.payoutMail(p.amount, p.method, ref)).catch(e => console.error('mail failed:', e.message));
      out = { ok: true, status: 'paid', ref };
    } else {
      if (p.status !== 'pending' && p.status !== 'approved') return fail(res, 409, 'state', { status: p.status });
      const reason = clean(body.reason, 40), note = clean(body.note, 200);
      if (!reason) return fail(res, 400, 'reason');
      db.prepare("UPDATE payouts SET status = 'rejected', note = ?, updated = ? WHERE id = ?").run(note || clean(body.text, 200) || 'বাতিল', now(), p.id);
      A.audit(user.id, 'payout.reject', { type: 'payout', id: p.id, before: { status: p.status }, after: { status: 'rejected', amount: p.amount }, reason, note, req });
      out = { ok: true, status: 'rejected' };
    }
    idemPut(key, user.id, out);
    push(p.user, 'creator', {});
    json(res, 200, out);
  });

  // ---- the ledger ----
  const TZ = 6 * 3600e3;
  const monthOf = t => new Date(t + TZ).toISOString().slice(0, 7);
  const monthRange = m => { const [y, mo] = m.split('-').map(Number); return [Date.UTC(y, mo - 1, 1) - TZ, Date.UTC(y, mo, 1) - TZ]; };
  function summary() {
    const rows = db.prepare('SELECT * FROM ledger_entries ORDER BY at').all(), months = new Map();
    let owed = 0;
    for (const e of rows) {
      const m = monthOf(e.at), s = months.get(m) || { month: m, earned: 0, takenBack: 0, paid: 0, owedEnd: 0 };
      if (e.account.startsWith('creator:')) {
        owed += e.credit - e.debit;
        if (e.source.startsWith('earning:')) { if (e.credit) s.earned += e.credit; else s.takenBack += e.debit; }
        if (e.source.startsWith('payout:')) s.paid += e.debit;
      }
      s.owedEnd = owed;
      months.set(m, s);
    }
    return [...months.values()].reverse();
  }
  function reconcile() {
    const t = db.prepare("SELECT COALESCE(SUM(debit), 0) AS d, COALESCE(SUM(credit), 0) AS c FROM ledger_entries").get();
    const owedLedger = db.prepare("SELECT COALESCE(SUM(credit - debit), 0) AS n FROM ledger_entries WHERE account LIKE 'creator:%' AND user IN (SELECT id FROM users)").get().n;
    const owedTables = count('SELECT COALESCE(SUM(amount), 0) AS n FROM earnings') - count("SELECT COALESCE(SUM(amount), 0) AS n FROM payouts WHERE status = 'paid'");
    const gone = db.prepare("SELECT COALESCE(SUM(credit - debit), 0) AS n FROM ledger_entries WHERE account LIKE 'creator:%' AND user NOT IN (SELECT id FROM users)").get().n;
    return { balanced: t.d === t.c, debit: t.d, credit: t.c, owedLedger, owedTables, matches: owedLedger === owedTables, deletedAccounts: gone,
      reserved: count("SELECT COALESCE(SUM(amount), 0) AS n FROM payouts WHERE status IN ('pending', 'approved')"), cashOut: db.prepare("SELECT COALESCE(SUM(credit), 0) AS n FROM ledger_entries WHERE account = 'cash:wallet'").get().n };
  }
  const entriesOf = (month, uid) => {
    const [a, b] = month ? monthRange(month) : [0, 9e15];
    return db.prepare('SELECT l.*, u.name FROM ledger_entries l LEFT JOIN users u ON u.id = l.user WHERE l.at >= ? AND l.at < ? AND (? = 0 OR l.user = ?) ORDER BY l.at DESC, l.id DESC LIMIT 2000').all(a, b, uid, uid);
  };
  R('GET ledger', { perm: 'payouts.view' }, ({ res, query }) => {
    syncLedger();
    const month = /^\d{4}-\d{2}$/.test(query.get('month') || '') ? query.get('month') : '', uid = Number(query.get('user')) || 0;
    json(res, 200, { entries: entriesOf(month, uid).slice(0, 500).map(e => ({ id: e.id, txn: e.txn, account: e.account, user: e.user ? { id: e.user, name: e.name || 'মুছে ফেলা অ্যাকাউন্ট' } : null, debit: e.debit, credit: e.credit, memo: e.memo, at: e.at })),
      months: summary(), reconcile: reconcile(), month });
  });
  R('GET ledger.csv', { perm: 'payouts.view' }, ({ req, res, user, query }) => {
    const month = /^\d{4}-\d{2}$/.test(query.get('month') || '') ? query.get('month') : '';
    const rows = entriesOf(month, 0), q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = '﻿' + ['id,txn,date (Dhaka),account,user,name,debit,credit,memo', ...rows.map(e => [e.id, e.txn, new Date(e.at + TZ).toISOString().replace('T', ' ').slice(0, 16), e.account, e.user, e.name, e.debit, e.credit, e.memo].map(q).join(','))].join('\n');
    A.audit(user.id, 'export.csv', { type: 'ledger', id: month || 'all', after: { rows: rows.length }, req });
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="manzeela-ledger-${month || 'all'}.csv"`, 'Cache-Control': 'no-store' });
    res.end(csv);
  });

  return { syncLedger, programOpen };
};
