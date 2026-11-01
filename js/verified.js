// ---- Manzeela Verified ----
// The sheet that opens from anyone's blue badge (who they are, since when), and the page where a person sees the
// rules and buys the badge: $1 a month or $8 a year, through bKash, Nagad, a bank transfer or a card.
// The server side is lib/verified.cjs.

const VF_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2M8 17.5h2"/></svg>';
const VF_METHOD = { bkash: 'বিকাশ', nagad: 'নগদ', bank: 'ব্যাংক ট্রান্সফার', card: 'ভিসা / মাস্টারকার্ড' };
const vfMonth = t => new Date(t).toLocaleDateString(LANG === 'en' ? 'en-US' : 'bn-BD', { month: 'long', year: 'numeric' });
const vfDay = t => new Date(t).toLocaleDateString(LANG === 'en' ? 'en-US' : 'bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });

async function verifyApi(path, body) {
  const res = await fetch('api/verify/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : {};
  if (!res.ok) throw new Error(data.error || 'server');
  return data;
}

// a big badge drawn with the same shape as the small one
function vfBigBadge(cls) {
  const b = vbadge();
  b.className = 'vbadge ' + (cls || 'vf-big');
  return b;
}

// ---- the sheet from a badge, as Facebook shows it ----
let vfSheet = null;
function closeBadgeSheet() {
  if (!vfSheet) return;
  const s = vfSheet;
  vfSheet = null;
  s.classList.remove('on');
  setTimeout(() => s.remove(), 260);
}
async function openBadgeSheet(id) {
  closeBadgeSheet();
  const wrap = el('div', 'vf-sheet-wrap');
  const sheet = el('div', 'vf-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.append(el('div', 'vf-grab'), el('div', 'skeleton'));
  wrap.appendChild(sheet);
  wrap.addEventListener('click', e => { if (e.target === wrap) closeBadgeSheet(); });
  document.body.appendChild(wrap);
  vfSheet = wrap;
  requestAnimationFrame(() => wrap.classList.add('on'));
  let d;
  try { d = await verifyApi('about?id=' + id); } catch { sheet.replaceChildren(el('div', 'vf-grab'), el('div', 'empty', 'দেখানো যায়নি।')); return; }
  if (vfSheet !== wrap) return;

  const title = Object.assign(el('h3', 'no-tr'), { textContent: d.name });
  const lead = el('p', 'vf-lead', 'Manzeela নিরাপদ রাখতে আমরা মানুষ ও তাদের প্রোফাইল সম্পর্কে কিছু তথ্য দেখাই।');

  const card = el('div', 'vf-card vf-main');
  const txt = el('div', 't');
  const h = el('b');
  h.append(Object.assign(el('span', 'no-tr'), { textContent: d.name }), document.createTextNode(d.verified ? ' ভেরিফায়েড' : ' ভেরিফায়েড নন'));
  txt.append(h, el('span', null, 'ব্যাজ মানে অ্যাকাউন্টটি যাচাই করা: Manzeela Verified সাবস্ক্রাইবার, অথবা Manzeela টিমের যাচাই করা পরিচিত ব্যক্তি, প্রতিষ্ঠান বা ব্র্যান্ড।'));
  const more = el('button', 'vf-btn', 'আরও জানুন');
  more.addEventListener('click', () => { closeBadgeSheet(); go('verified'); });
  txt.appendChild(more);
  card.append(vfBigBadge('vf-mid'), txt);

  const facts = el('div', 'vf-card vf-facts');
  const fact = (icon, text, href) => {
    const row = el(href ? 'a' : 'div', 'vf-fact');
    if (href) { row.href = href; row.target = '_blank'; row.rel = 'noopener'; }
    const i = el('i');
    i.innerHTML = icon === 'cal' ? VF_CAL : svg(icon);
    row.append(i, el('span', null, text));
    facts.appendChild(row);
  };
  if (d.joined) fact('cal', `${vfMonth(d.joined)}-এ যোগ দিয়েছেন`);
  if (d.since) fact('verified', `${vfMonth(d.since)} থেকে ভেরিফায়েড`);
  if (d.username) { fact('user', ''); facts.lastChild.querySelector('span').append(Object.assign(el('span', 'no-tr'), { textContent: '@' + d.username })); }
  fact('info', 'স্বচ্ছতা ও প্রাইভেসি পলিসি', 'privacy.html');

  sheet.replaceChildren(el('div', 'vf-grab'), title, lead, card, facts);
}
// a badge anywhere opens the sheet; the click does not also open what the name sits in
document.addEventListener('click', e => {
  const b = e.target.closest('.vbadge[data-who]');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  openBadgeSheet(Number(b.dataset.who));
}, true);
addEventListener('keydown', e => { if (e.key === 'Escape') closeBadgeSheet(); });
addEventListener('hashchange', closeBadgeSheet);

// ---- the page: #/verified ----
let vfPlan = 'year', vfMethod = '';
async function drawVerified() {
  const box = $('vf-page');
  if (!ME) {
    const gate = el('div', 'chat-gate');
    gate.append(vfBigBadge(), el('h2', null, 'Manzeela Verified'), el('p', null, 'ভেরিফায়েড ব্যাজ পেতে লগইন করুন।'), button('user', 'লগইন করুন', openLogin));
    box.replaceChildren(gate);
    return;
  }
  if (!box.firstChild || box.querySelector('.chat-gate')) box.replaceChildren(el('div', 'skeleton'), el('div', 'skeleton'));
  let d;
  try { d = await verifyApi('me'); } catch { box.replaceChildren(el('div', 'empty', 'দেখানো যায়নি। একটু পরে আবার চেষ্টা করুন।')); return; }
  if (d.badge.on) VERIFIED.add(ME.id); else VERIFIED.delete(ME.id);
  ME.verified = d.badge.on;

  const hero = el('div', 'vf-hero');
  hero.append(vfBigBadge(), el('h1', null, 'Manzeela Verified'),
    el('p', null, d.badge.on ? 'আপনার নামের পাশে নীল ব্যাজ আছে।' : 'নামের পাশে নীল ব্যাজ, যাতে সবাই বোঝে এটা আসল আপনি।'));
  const parts = [hero];

  // the payment back from the card page
  const back = new URLSearchParams(location.hash.split('?')[1] || '').get('paid');
  if (back) {
    parts.push(el('div', 'vf-note ' + (back === '1' ? 'ok' : 'bad'), back === '1' ? 'পেমেন্ট হয়েছে, ব্যাজ চালু হয়েছে।' : 'পেমেন্ট সম্পন্ন হয়নি। আবার চেষ্টা করতে পারেন।'));
    history.replaceState(history.state, '', '#/verified');
  }

  // where they stand now
  if (d.badge.on) {
    const st = el('div', 'vf-card vf-status');
    const t = el('div', 't');
    t.append(el('b', null, 'আপনি ভেরিফায়েড'), el('span', null,
      d.badge.kind === 'sub' ? `${vfDay(d.badge.until)} পর্যন্ত চালু · নিজে থেকে টাকা কাটে না, মেয়াদ শেষের আগে নবায়ন করুন` : 'Manzeela টিম যাচাই করে দিয়েছে · মেয়াদ নেই'));
    st.append(vfBigBadge('vf-sm'), t);
    parts.push(st);
  }
  const pending = d.orders.find(o => o.status === 'pending' && o.method !== 'card');
  const lastBad = d.orders[0] && d.orders[0].status === 'rejected' ? d.orders[0] : null;
  if (pending) {
    const p = el('div', 'vf-card vf-status wait');
    const t = el('div', 't');
    t.append(el('b', null, 'পেমেন্ট যাচাই হচ্ছে'), el('span', null, `${VF_METHOD[pending.method]} · লেনদেন ${pending.ref} · ${taka(pending.bdt)}। মিলে গেলেই ব্যাজ চালু হবে।`));
    const c = el('button', 'pill-btn quiet', 'বাতিল');
    c.addEventListener('click', async () => { c.disabled = true; await verifyApi('cancel', { id: pending.id }).catch(() => {}); drawVerified(); });
    p.append(ic('clock'), t, c);
    parts.push(p);
  } else if (lastBad) {
    parts.push(el('div', 'vf-note bad', `আগের পেমেন্টটি মেলেনি${lastBad.note ? ': ' + lastBad.note : ''}। ঠিক তথ্য দিয়ে আবার চেষ্টা করুন।`));
  }

  if (d.badge.kind !== 'team') {
    // what it gives (only what the app does)
    const gets = el('div', 'vf-card vf-gets');
    for (const [icon, b, s] of [
      ['verified', 'নামের পাশে নীল ব্যাজ', 'পোস্ট, কমেন্ট, মেসেজ, সার্চ আর প্রোফাইলে'],
      ['user', 'ব্যাজে চাপলে আপনার পরিচয়', 'কবে যোগ দিয়েছেন আর কবে থেকে ভেরিফায়েড, সবাই দেখবে'],
      ['shield', 'যাচাই করা অ্যাকাউন্ট', 'শুধু ছবি, আসল নাম আর টু-স্টেপ চালু থাকা অ্যাকাউন্ট পায়']]) {
      const row = el('div', 'vf-get');
      const t = el('div', 't');
      t.append(el('b', null, b), el('span', null, s));
      row.append(ic(icon), t);
      gets.appendChild(row);
    }
    parts.push(gets);

    // the plans
    parts.push(el('div', 'label', d.badge.on ? 'নবায়ন করুন' : 'প্ল্যান বেছে নিন'));
    const plans = el('div', 'vf-plans');
    const plan = (key, name, per, save) => {
      const p = d.plans[key];
      const b = el('button', 'vf-plan' + (vfPlan === key ? ' on' : ''));
      b.type = 'button';
      const top = el('span', 'top');
      top.append(el('b', null, name));
      if (save) top.appendChild(el('em', null, save));
      const price = el('span', 'price');
      price.append(el('b', 'no-tr', '$' + p.usd), el('small', null, per));
      b.append(top, price, el('span', 'bdt', `বিকাশ/নগদ/ব্যাংকে ${taka(p.bdt)}`), el('i', 'radio'));
      b.addEventListener('click', () => { vfPlan = key; for (const x of plans.children) x.classList.toggle('on', x === b); });
      plans.appendChild(b);
    };
    plan('month', 'মাসিক', '/মাস');
    plan('year', 'বাৎসরিক', '/বছর', `${num(Math.round((1 - d.plans.year.usd / (d.plans.month.usd * 12)) * 100))}% সাশ্রয়`);
    parts.push(plans);

    // the rules, each with its tick
    parts.push(el('div', 'label', 'যাদের জন্য'));
    const rules = el('div', 'vf-card vf-rules');
    for (const r of d.rules) {
      const row = el('div', 'vf-rule' + (r.ok ? ' ok' : ''));
      const t = el('div', 't');
      t.append(el('b', null, r.label));
      if (!r.ok) t.appendChild(el('span', null, r.hint));
      row.append(el('i', 'tick'), t);
      if (!r.ok && r.key === '2fa') { const go2 = el('button', 'pill-btn quiet', 'চালু করুন'); go2.addEventListener('click', openTwoStep); row.appendChild(go2); }
      if (!r.ok && (r.key === 'photo' || r.key === 'name')) { const ed = el('button', 'pill-btn quiet', 'ঠিক করুন'); ed.addEventListener('click', () => openProfile()); row.appendChild(ed); }
      rules.appendChild(row);
    }
    parts.push(rules);

    // how to pay
    const ways = Object.keys(VF_METHOD).filter(k => k === 'card' ? d.methods.card : d.methods[k]);
    if (!ways.includes(vfMethod)) vfMethod = ways[0] || '';
    if (ways.length) {
      parts.push(el('div', 'label', 'পেমেন্ট'));
      const pay = el('div', 'vf-card vf-ways');
      for (const k of ways) {
        const b = el('button', 'vf-way' + (vfMethod === k ? ' on' : ''));
        b.type = 'button';
        const logo = el('i', 'vf-logo ' + k);
        logo.innerHTML = k === 'card' ? svg('card') : k === 'bank' ? svg('bank') : '';
        if (k === 'bkash' || k === 'nagad') logo.textContent = k === 'bkash' ? 'b' : 'n';
        b.append(logo, el('span', null, VF_METHOD[k]), el('i', 'radio'));
        b.addEventListener('click', () => { vfMethod = k; for (const x of pay.children) x.classList.toggle('on', x === b); });
        pay.appendChild(b);
      }
      parts.push(pay);
    }

    const cta = button('verified', d.badge.on ? 'নবায়ন করুন' : 'চালিয়ে যান', () => openVerifyPay(d));
    cta.classList.add('vf-cta');
    cta.disabled = !d.open || !d.eligible || !ways.length || !!pending;
    parts.push(cta, el('div', 'form-note vf-small', !d.open ? 'নতুন সাবস্ক্রিপশন এখন সাময়িকভাবে বন্ধ।' : !ways.length ? 'পেমেন্ট শিগগির চালু হবে।'
      : !d.eligible ? 'উপরের সব শর্ত পূরণ হলে কেনা যাবে।' : pending ? 'আগের পেমেন্টটি যাচাই হলে আবার কেনা যাবে।'
      : 'মেয়াদ শেষে নিজে থেকে টাকা কাটে না। ভুয়া পরিচয় বা নিয়ম ভাঙলে ব্যাজ সরিয়ে নেওয়া হতে পারে।'));
  }

  const free = el('button', 'vf-free');
  free.append(el('span', null, 'পরিচিত ব্যক্তি, প্রতিষ্ঠান বা সংবাদমাধ্যম? Manzeela টিমের কাছে বিনা খরচে যাচাইয়ের আবেদন করুন'), ic('chev'));
  free.addEventListener('click', () => openNewTicket('verify'));
  if (!d.badge.on) parts.push(free);
  box.replaceChildren(...parts);
}

// ---- paying ----
function openVerifyPay(d) {
  const p = d.plans[vfPlan], m = vfMethod, planName = vfPlan === 'year' ? 'বাৎসরিক' : 'মাসিক';
  if (m === 'card') {
    const go_ = button('card', `$${p.usd} দিন`, async () => {
      go_.disabled = true;
      note.className = 'form-note';
      note.textContent = 'পেমেন্ট পাতায় নিয়ে যাওয়া হচ্ছে…';
      try { location.href = (await verifyApi('card', { plan: vfPlan })).url; }
      catch { go_.disabled = false; note.className = 'form-note bad'; note.textContent = 'পেমেন্ট পাতা খোলা যায়নি। একটু পরে আবার চেষ্টা করুন।'; }
    });
    const note = el('div', 'form-note', 'SSLCommerz-এর নিরাপদ পাতায় কার্ডের তথ্য দেবেন। Manzeela কার্ডের নম্বর দেখে না বা রাখে না।');
    openModal(`${planName} · $${p.usd}`, 'ভিসা বা মাস্টারকার্ড', [note], [go_]);
    return;
  }
  const to = d.methods[m];
  const steps = el('ol', 'vf-steps');
  const copyRow = (label, value, shown) => {
    const li = el('li');
    li.append(el('span', null, label));
    const v = el('div', 'vf-copy');
    v.append(Object.assign(el('b', 'no-tr'), { textContent: shown || value }));
    const c = el('button', 'pill-btn quiet', 'কপি');
    c.addEventListener('click', async () => { try { await navigator.clipboard.writeText(value); c.textContent = 'কপি হয়েছে'; } catch { /* no clipboard */ } });
    v.appendChild(c);
    li.appendChild(v);
    steps.appendChild(li);
  };
  if (m === 'bank') copyRow('এই অ্যাকাউন্টে টাকা পাঠান', to);
  else copyRow(`${VF_METHOD[m]} অ্যাপ থেকে Send Money বা Payment করুন এই নম্বরে`, to);
  copyRow('ঠিক এই পরিমাণ', String(p.bdt), taka(p.bdt));
  steps.appendChild(el('li', null, m === 'bank' ? 'নিচে যে অ্যাকাউন্ট থেকে পাঠালেন আর লেনদেনের রেফারেন্স নম্বর লিখুন।' : 'নিচে যে নম্বর থেকে পাঠালেন আর মেসেজে আসা TrxID লিখুন।'));
  const [sBox, sender] = field(m === 'bank' ? 'যে অ্যাকাউন্ট থেকে পাঠালেন (নাম ও শেষ ৪ সংখ্যা)' : 'যে নম্বর থেকে পাঠালেন', m === 'bank' ? { maxLength: 40, autocomplete: 'off' } : { type: 'tel', inputMode: 'tel', placeholder: '01XXXXXXXXX', maxLength: 14, autocomplete: 'off' });
  const [rBox, ref] = field(m === 'bank' ? 'লেনদেন / রেফারেন্স নম্বর' : 'TrxID', { maxLength: 30, autocomplete: 'off', spellcheck: false, placeholder: m === 'bank' ? '' : 'যেমন 9A7B6C5D4E' });
  ref.classList.add('upper');
  const agree = el('label', 'vf-agree');
  const box = Object.assign(el('input'), { type: 'checkbox' });
  agree.append(box, el('span', null, 'আমার বয়স ১৮ বা তার বেশি, প্রোফাইলের নাম ও ছবি আমার নিজের।'));
  const note = el('div', 'form-note', 'Manzeela টিম স্টেটমেন্টের সাথে মিলিয়ে সাধারণত কয়েক ঘণ্টার মধ্যে ব্যাজ চালু করে।');
  const send = button('send', 'পেমেন্ট জমা দিন', async () => {
    send.disabled = true;
    try { await verifyApi('order', { plan: vfPlan, method: m, sender: sender.value, ref: ref.value, agree: box.checked }); closeModal(); drawVerified(); }
    catch (e) {
      send.disabled = false;
      note.className = 'form-note bad';
      note.textContent = { agree: 'নিচের ঘরে টিক দিন।', ref: 'লেনদেনের নম্বরটি ঠিক নয়, ইংরেজি অক্ষর ও সংখ্যা দিন।', sender: m === 'bank' ? 'কোন অ্যাকাউন্ট থেকে পাঠালেন লিখুন।' : '০১ দিয়ে শুরু ১১ সংখ্যার নম্বর দিন।',
        duplicate: 'এই লেনদেন নম্বর আগেই ব্যবহার হয়েছে।', pending: 'আগের একটি পেমেন্ট যাচাইয়ের অপেক্ষায়।', rules: 'সব শর্ত এখনো পূরণ হয়নি।', closed: 'নতুন সাবস্ক্রিপশন এখন বন্ধ।' }[e.message] || 'জমা দেওয়া যায়নি।';
    }
  });
  openModal(`${planName} · $${p.usd}`, `${VF_METHOD[m]} দিয়ে ${taka(p.bdt)}`, [steps, sBox, rBox, agree, note], [send]);
}

(() => {
  enter.verified = drawVerified;
  document.addEventListener('bdmap:auth', () => { if (current === 'verified') drawVerified(); });   // signed in or out while here
  if (current === 'verified') drawVerified();
})();
