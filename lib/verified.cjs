// ---- Manzeela Verified: the blue badge as a subscription ($1 a month, $8 a year) ----
// Two ways to the badge: the team gives it to a known person or business (kind 'team', no end), or a person who
// meets the rules buys it (kind 'sub', ends after the month or year unless renewed).
// Paying: bKash, Nagad or a bank transfer to the business account (the person enters the transaction ID, someone on
// the team checks the statement and approves), or a card through SSLCommerz once its store keys are set
// (SSLCOMMERZ_STORE_ID, SSLCOMMERZ_STORE_PASS; SSLCOMMERZ_SANDBOX=1 for the test store) — then it is checked with
// SSLCommerz's own validation call and turns on by itself. The business numbers, the bank account and the taka rate
// are set in the admin panel (ভেরিফায়েড).
'use strict';

const DAY = 864e5;
const PLANS = { month: { usd: 1, days: 30 }, year: { usd: 8, days: 365 } };
const METHODS = ['bkash', 'nagad', 'bank', 'card'];
const METHOD_BN = { bkash: 'বিকাশ', nagad: 'নগদ', bank: 'ব্যাংক', card: 'কার্ড' };
const TRX = /^[A-Z0-9]{6,30}$/;
const bn = n => String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);

module.exports = function verified(A, ctx) {
  const { db, json, readBody, userOf, push, SITE } = ctx;
  const now = () => Date.now();
  const count = (sql, ...a) => { try { return db.prepare(sql).get(...a).n; } catch { return 0; } };
  const setting = (k, d) => { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k); return r ? r.value : d; };
  const setSetting = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const clean = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';

  db.exec(`CREATE TABLE IF NOT EXISTS verify_orders (id INTEGER PRIMARY KEY, user INTEGER NOT NULL, plan TEXT NOT NULL, method TEXT NOT NULL, usd INTEGER NOT NULL,
    bdt INTEGER NOT NULL, sender TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '',
    by INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL)`);
  db.exec('CREATE INDEX IF NOT EXISTS verify_orders_status ON verify_orders (status, created)');
  db.exec('CREATE INDEX IF NOT EXISTS verify_orders_user ON verify_orders (user, id)');
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS verify_orders_ref ON verify_orders (method, ref) WHERE ref <> ''"); } catch (e) { console.error('verify_orders_ref:', e.message); }

  // ---- settings (admin panel) ----
  const conf = () => {
    const rate = Number(setting('verify_rate', 122));
    return {
      open: setting('verify_sales', 'on') !== 'off',
      rate: Number.isFinite(rate) && rate > 0 ? rate : 122,
      minDays: Math.max(0, Number(setting('verify_min_days', 30)) || 0),
      bkash: setting('verify_bkash', ''), nagad: setting('verify_nagad', ''), bank: setting('verify_bank', ''),
      card: !!(process.env.SSLCOMMERZ_STORE_ID && process.env.SSLCOMMERZ_STORE_PASS)
    };
  };
  const priceOf = (plan, c = conf()) => ({ usd: PLANS[plan].usd, bdt: Math.round(PLANS[plan].usd * c.rate) });

  // ---- who may buy: the rules, each checked here ----
  function rulesOf(u, c = conf()) {
    const age = Math.floor((now() - u.created) / DAY);
    const reports = count("SELECT COUNT(*) AS n FROM reports WHERE about = ? AND status = 'open'", u.id);
    const strikes = A && A.trust ? A.trust.activeStrikes(u.id).length : 0;
    const name = String(u.name || '').trim();
    const rules = [
      { key: 'photo', ok: !!u.pic_v, label: 'প্রোফাইলে নিজের ছবি', hint: 'প্রোফাইল এডিট থেকে ছবি দিন' },
      { key: 'name', ok: name.length >= 3 && !/\d/.test(name), label: 'আসল নাম (সংখ্যা ছাড়া)', hint: 'প্রোফাইল এডিট থেকে নাম ঠিক করুন' },
      { key: '2fa', ok: !!u.totp_on, label: 'টু-স্টেপ ভেরিফিকেশন চালু', hint: 'সেটিংস → টু-স্টেপ ভেরিফিকেশন' },
      { key: 'age', ok: age >= c.minDays, label: `অ্যাকাউন্ট কমপক্ষে ${bn(c.minDays)} দিনের পুরোনো`, hint: `আরও ${bn(Math.max(0, c.minDays - age))} দিন`, days: c.minDays, left: Math.max(0, c.minDays - age) },
      { key: 'clean', ok: !reports && !strikes && !u.banned, label: 'কোনো খোলা রিপোর্ট বা স্ট্রাইক নেই', hint: 'নিয়ম মেনে চলুন' }
    ];
    return { rules, eligible: rules.every(r => r.ok) };
  }
  const badgeOf = id => db.prepare('SELECT verified, verified_kind, verified_at, verified_until FROM users WHERE id = ?').get(id) || {};

  // turn the badge on (or add the paid time to what is left)
  function activate(order, byId) {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(order.user);
    if (!u) return false;
    const b = badgeOf(u.id), t = now();
    const from = b.verified_kind === 'sub' && b.verified_until > t ? b.verified_until : t;
    const until = from + PLANS[order.plan].days * DAY;
    db.exec('BEGIN');
    try {
      db.prepare("UPDATE verify_orders SET status = 'paid', by = ?, updated = ? WHERE id = ? AND status = 'pending'").run(byId || 0, t, order.id);
      // a badge the team gave stays as it is (no end); the payment is still recorded
      if (b.verified_kind !== 'team') db.prepare("UPDATE users SET verified = 1, verified_kind = 'sub', verified_until = ?, verified_at = CASE WHEN verified = 1 AND verified_at > 0 THEN verified_at ELSE ? END WHERE id = ?").run(until, t, u.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    try { push(u.id, 'verified', { on: true }); } catch { /* not online */ }
    return true;
  }
  // a paid month or year that has run out: the badge goes
  function sweep() {
    const r = db.prepare("UPDATE users SET verified = 0 WHERE verified = 1 AND verified_kind = 'sub' AND verified_until > 0 AND verified_until < ?").run(now());
    if (r.changes) console.log(`verified: ${r.changes} subscription(s) ended`);
  }
  sweep();
  setInterval(sweep, 3600e3).unref();

  const orderOut = o => ({ id: o.id, plan: o.plan, method: o.method, usd: o.usd, bdt: o.bdt, status: o.status, ref: o.ref, note: o.note, created: o.created, updated: o.updated });

  // ---- SSLCommerz (cards; also bKash, Nagad and bank cards on its own page) ----
  const sslBase = () => process.env.SSLCOMMERZ_SANDBOX === '1' ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com';
  async function sslStart(u, order) {
    const f = new URLSearchParams({
      store_id: process.env.SSLCOMMERZ_STORE_ID, store_passwd: process.env.SSLCOMMERZ_STORE_PASS,
      total_amount: String(order.usd), currency: 'USD', tran_id: 'MZV' + order.id,
      success_url: SITE + '/api/verify/ssl/done', fail_url: SITE + '/api/verify/ssl/done', cancel_url: SITE + '/api/verify/ssl/done', ipn_url: SITE + '/api/verify/ssl/ipn',
      cus_name: u.name || 'Manzeela user', cus_email: u.email || 'help@manzeela.com', cus_add1: 'Bangladesh', cus_city: 'Dhaka', cus_country: 'Bangladesh', cus_phone: '01700000000',
      shipping_method: 'NO', product_name: 'Manzeela Verified (' + order.plan + ')', product_category: 'subscription', product_profile: 'non-physical-goods', value_a: String(order.id)
    });
    const r = await fetch(sslBase() + '/gwprocess/v4/api.php', { method: 'POST', body: f, signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    if (d.status !== 'SUCCESS' || !d.GatewayPageURL) throw new Error('ssl: ' + (d.failedreason || d.status));
    return d.GatewayPageURL;
  }
  // ask SSLCommerz itself whether the payment went through, and for the right amount
  async function sslCheck(valId) {
    const q = new URLSearchParams({ val_id: valId, store_id: process.env.SSLCOMMERZ_STORE_ID, store_passwd: process.env.SSLCOMMERZ_STORE_PASS, v: '1', format: 'json' });
    const r = await fetch(sslBase() + '/validator/api/validationserverAPI.php?' + q, { signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    if (d.status !== 'VALID' && d.status !== 'VALIDATED') return null;
    const id = Number(String(d.tran_id || '').replace(/^MZV/, ''));
    const o = db.prepare("SELECT * FROM verify_orders WHERE id = ? AND method = 'card'").get(id);
    if (!o) return null;
    const paid = Number(d.currency_amount), cur = String(d.currency_type || '').toUpperCase();
    if (cur !== 'USD' || !(paid >= o.usd - 0.001)) { console.error('verify: amount mismatch for order', o.id, d.currency_type, d.currency_amount); return null; }
    return { order: o, ref: String(d.bank_tran_id || d.val_id || '').slice(0, 30) };
  }
  async function sslSettle(valId) {
    const ok = await sslCheck(valId);
    if (!ok) return null;
    if (ok.order.status === 'pending') {
      db.prepare('UPDATE verify_orders SET ref = ? WHERE id = ? AND ref = \'\'').run(ok.ref, ok.order.id);
      activate(ok.order, 0);
    }
    return ok.order;
  }

  // ---- the person's side: /api/verify/... ----
  //   GET  me                -> { badge, plans, methods, rules, eligible, orders, open }
  //   GET  about?id=         -> what the badge sheet shows about a person
  //   POST order {plan, method, sender, ref, agree}   POST cancel {id}   POST card {plan} -> { url }
  //   POST ssl/done, ssl/ipn (from SSLCommerz)
  async function api(req, res, action, query) {
    if (action === 'about' && req.method === 'GET') {
      const u = db.prepare('SELECT id, name, username, created, verified, verified_at, banned FROM users WHERE id = ?').get(Number(query.get('id')));
      if (!u || u.banned) return json(res, 404, { error: 'not found' });
      return json(res, 200, { id: u.id, name: u.name, username: u.username || '', joined: u.created, verified: !!u.verified, since: u.verified ? (u.verified_at || 0) : 0 });
    }
    if (action === 'ssl/done' || action === 'ssl/ipn') {
      let f = new URLSearchParams();
      try { f = new URLSearchParams(await readBody(req, 20000)); } catch { /* empty */ }
      const valId = f.get('val_id') || '';
      let order = null;
      if (valId && conf().card) { try { order = await sslSettle(valId); } catch (e) { console.error('verify ssl:', e.message); } }
      if (action === 'ssl/ipn') return json(res, 200, { ok: !!order });
      res.writeHead(303, { Location: '/#/verified?paid=' + (order ? '1' : '0') });
      return res.end();
    }
    const me = userOf(req);
    if (!me) return json(res, 401, { error: 'login' });
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id);
    const c = conf();
    if (action === 'me' && req.method === 'GET') {
      const b = badgeOf(u.id), r = rulesOf(u, c);
      return json(res, 200, {
        badge: { on: !!b.verified, kind: b.verified ? (b.verified_kind || 'team') : '', since: b.verified_at || 0, until: b.verified_kind === 'sub' ? b.verified_until : 0 },
        plans: { month: priceOf('month', c), year: priceOf('year', c) }, rate: c.rate,
        methods: { bkash: c.bkash || null, nagad: c.nagad || null, bank: c.bank || null, card: c.card },
        rules: r.rules, eligible: r.eligible, open: c.open,
        orders: db.prepare('SELECT * FROM verify_orders WHERE user = ? ORDER BY id DESC LIMIT 10').all(u.id).map(orderOut)
      });
    }
    if (req.method !== 'POST' || !(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 400, { error: 'bad request' });
    let body;
    try { body = JSON.parse(await readBody(req, 4000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }
    if (action === 'cancel') {
      const r = db.prepare("UPDATE verify_orders SET status = 'cancelled', updated = ? WHERE id = ? AND user = ? AND status = 'pending'").run(now(), Number(body.id), u.id);
      return json(res, r.changes ? 200 : 409, r.changes ? { ok: true } : { error: 'state' });
    }
    if (action !== 'order' && action !== 'card') return json(res, 404, { error: 'not found' });
    if (!c.open) return json(res, 403, { error: 'closed' });
    const plan = PLANS[body.plan] ? body.plan : '';
    if (!plan) return json(res, 400, { error: 'plan' });
    if (!rulesOf(u, c).eligible) return json(res, 403, { error: 'rules' });
    if (badgeOf(u.id).verified_kind === 'team' && badgeOf(u.id).verified) return json(res, 409, { error: 'team' });
    if (count("SELECT COUNT(*) AS n FROM verify_orders WHERE user = ? AND status = 'pending' AND method <> 'card'", u.id)) return json(res, 409, { error: 'pending' });
    const p = priceOf(plan, c), t = now();
    if (action === 'card') {
      if (!c.card) return json(res, 400, { error: 'method' });
      // a card attempt left unpaid is closed when a new one starts
      db.prepare("UPDATE verify_orders SET status = 'cancelled', updated = ? WHERE user = ? AND status = 'pending' AND method = 'card'").run(t, u.id);
      const id = Number(db.prepare("INSERT INTO verify_orders (user, plan, method, usd, bdt, created, updated) VALUES (?, ?, 'card', ?, ?, ?, ?)").run(u.id, plan, p.usd, p.bdt, t, t).lastInsertRowid);
      try { return json(res, 200, { url: await sslStart(u, { id, plan, usd: p.usd }) }); }
      catch (e) { console.error('verify card:', e.message); db.prepare("UPDATE verify_orders SET status = 'cancelled', note = 'gateway', updated = ? WHERE id = ?").run(now(), id); return json(res, 502, { error: 'gateway' }); }
    }
    const method = ['bkash', 'nagad', 'bank'].includes(body.method) ? body.method : '';
    if (!method || !c[method]) return json(res, 400, { error: 'method' });
    if (body.agree !== true) return json(res, 400, { error: 'agree' });
    const ref = String(body.ref || '').trim().toUpperCase().replace(/[\s-]+/g, '');
    if (!TRX.test(ref)) return json(res, 400, { error: 'ref' });
    const sender = clean(body.sender, 40).replace(/[^\d+A-Za-z ]/g, '');
    if (method !== 'bank' && !/^(\+?88)?01\d{9}$/.test(sender.replace(/\s/g, ''))) return json(res, 400, { error: 'sender' });
    if (method === 'bank' && sender.length < 3) return json(res, 400, { error: 'sender' });
    if (db.prepare('SELECT id FROM verify_orders WHERE method = ? AND ref = ?').get(method, ref)) return json(res, 409, { error: 'duplicate' });
    const id = Number(db.prepare('INSERT INTO verify_orders (user, plan, method, usd, bdt, sender, ref, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(u.id, plan, method, p.usd, p.bdt, sender, ref, t, t).lastInsertRowid);
    return json(res, 200, { ok: true, id });
  }

  // ---- the admin panel: /api/admin/v2/verify2... ----
  if (A) {
    const R = (k, o, f) => A.register(k, o, f);
    const fail = (res, s, e, x) => json(res, s, { error: e, ...x });
    const adminOut = o => {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(o.user);
      const dupSender = o.sender ? count('SELECT COUNT(DISTINCT user) AS n FROM verify_orders WHERE sender = ? AND user <> ?', o.sender, o.user) : 0;
      const warnings = [];
      if (u && !rulesOf(u).eligible) warnings.push({ tone: 'danger', text: 'এখন আর শর্ত পূরণ করেন না' });
      if (dupSender) warnings.push({ tone: 'warn', text: `এই নম্বর/অ্যাকাউন্ট থেকে আরও ${bn(dupSender)}জনের অর্ডার` });
      if (u && u.banned) warnings.push({ tone: 'danger', text: 'অ্যাকাউন্ট বন্ধ' });
      return { ...orderOut(o), sender: o.sender, methodBn: METHOD_BN[o.method], user: u ? A.personOut(u) : null, byName: o.by ? ((db.prepare('SELECT name FROM users WHERE id = ?').get(o.by) || {}).name || '') : '', warnings };
    };
    R('GET verify2', { perm: 'verify.manage' }, ({ res, query }) => {
      const tab = ['pending', 'paid', 'rejected', 'all'].includes(query.get('tab')) ? query.get('tab') : 'pending';
      const rows = db.prepare(`SELECT * FROM verify_orders WHERE (? = 'all' AND status <> 'cancelled') OR status = ? ORDER BY ${tab === 'pending' ? 'created' : 'updated DESC'} LIMIT 300`).all(tab, tab);
      const c = conf();
      json(res, 200, { rows: rows.map(adminOut), trx: TRX.source,
        tally: Object.fromEntries(['pending', 'paid', 'rejected'].map(k => [k, count('SELECT COUNT(*) AS n FROM verify_orders WHERE status = ?', k)])),
        active: count("SELECT COUNT(*) AS n FROM users WHERE verified = 1 AND verified_kind = 'sub'"),
        income: { bdt: count("SELECT COALESCE(SUM(bdt), 0) AS n FROM verify_orders WHERE status = 'paid' AND method <> 'card'"), usd: count("SELECT COALESCE(SUM(usd), 0) AS n FROM verify_orders WHERE status = 'paid' AND method = 'card'") },
        settings: { open: c.open, rate: c.rate, minDays: c.minDays, bkash: c.bkash, nagad: c.nagad, bank: c.bank, card: c.card, plans: { month: priceOf('month', c), year: priceOf('year', c) } } });
    });
    R('POST verify2/act', { perm: 'verify.manage' }, ({ req, res, user, body }) => {
      const o = db.prepare('SELECT * FROM verify_orders WHERE id = ?').get(Number(body.id));
      if (!o) return fail(res, 404, 'not found');
      if (o.status !== 'pending') return fail(res, 409, 'state', { status: o.status });
      if (body.do === 'approve') {
        activate(o, user.id);
        A.audit(user.id, 'verify.approve', { type: 'user', id: o.user, after: { order: o.id, plan: o.plan, method: o.method, ref: o.ref, bdt: o.bdt }, note: clean(body.note, 300), req });
        return json(res, 200, { ok: true });
      }
      if (body.do === 'reject') {
        const note = clean(body.note, 300);
        if (!note) return fail(res, 400, 'note');
        db.prepare("UPDATE verify_orders SET status = 'rejected', note = ?, by = ?, updated = ? WHERE id = ?").run(note, user.id, now(), o.id);
        A.audit(user.id, 'verify.reject', { type: 'user', id: o.user, after: { order: o.id, ref: o.ref }, reason: clean(body.reason, 40), note, req });
        try { push(o.user, 'verified', { on: false }); } catch { /* offline */ }
        return json(res, 200, { ok: true });
      }
      fail(res, 400, 'bad request');
    });
    R('POST verify2/settings', { perm: 'verify.manage' }, ({ req, res, user, body }) => {
      const before = conf();
      if (body.rate !== undefined) { const n = Number(body.rate); if (!Number.isFinite(n) || n < 1 || n > 1000) return fail(res, 400, 'rate'); setSetting('verify_rate', Math.round(n * 100) / 100); }
      if (body.minDays !== undefined) { const n = Math.round(Number(body.minDays)); if (!Number.isFinite(n) || n < 0 || n > 3650) return fail(res, 400, 'minDays'); setSetting('verify_min_days', n); }
      for (const k of ['bkash', 'nagad']) if (body[k] !== undefined) {
        const v = clean(body[k], 20).replace(/\s/g, '');
        if (v && !/^(\+?88)?01\d{9}$/.test(v)) return fail(res, 400, k);
        setSetting('verify_' + k, v);
      }
      if (body.bank !== undefined) setSetting('verify_bank', clean(body.bank, 400));
      if (typeof body.open === 'boolean') setSetting('verify_sales', body.open ? 'on' : 'off');
      const after = conf();
      A.audit(user.id, 'verify.settings', { type: 'setting', id: 'verify', before: { ...before, card: undefined }, after: { ...after, card: undefined }, req });
      json(res, 200, { ok: true });
    });
  }

  return { api, sweep, pendingCount: () => count("SELECT COUNT(*) AS n FROM verify_orders WHERE status = 'pending' AND method <> 'card'") };
};
module.exports.METHODS = METHODS;
