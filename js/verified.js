// ---- Manzeela Verified ----
// The sheet that opens from anyone's blue badge (who they are, since when), and the page where a person sees the
// rules and buys the badge: $1 a month or $8 a year, through bKash, Nagad, a bank transfer or a card.
// The server side is lib/verified.cjs.

const VF_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2M8 17.5h2"/></svg>';
// English mode: this page says it in English itself (its sentences carry numbers, dates and names)
const L = (bn, en) => LANG === 'en' ? en : bn;
const VF_METHOD = { bkash: L('বিকাশ', 'bKash'), nagad: L('নগদ', 'Nagad'), bank: L('ব্যাংক ট্রান্সফার', 'Bank transfer'), card: L('ভিসা / মাস্টারকার্ড', 'Visa / Mastercard') };
// the rules in English (the server sends them in Bangla); age carries its numbers
const VF_RULES_EN = {
  photo: ['Your own photo on your profile', 'Add one from Edit profile'], name: ['Your real name (no digits)', 'Fix it from Edit profile'],
  '2fa': ['Two-step verification on', 'Settings → Two-step verification'], age: [r => `Account at least ${r.days} days old`, r => `${r.left} more days`],
  clean: ['No open reports or strikes', 'Keep to the rules']
};
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
  try { d = await verifyApi('about?id=' + id); } catch { sheet.replaceChildren(el('div', 'vf-grab'), el('div', 'empty', L('দেখানো যায়নি।', 'Could not load.'))); return; }
  if (vfSheet !== wrap) return;

  const title = Object.assign(el('h3', 'no-tr'), { textContent: d.name });
  const lead = el('p', 'vf-lead', L('Manzeela নিরাপদ রাখতে আমরা মানুষ ও তাদের প্রোফাইল সম্পর্কে কিছু তথ্য দেখাই।', 'To keep Manzeela safe, we show some information about people and their profiles.'));

  const card = el('div', 'vf-card vf-main');
  const txt = el('div', 't');
  const h = el('b');
  h.append(Object.assign(el('span', 'no-tr'), { textContent: d.name }), document.createTextNode(d.verified ? L(' ভেরিফায়েড', ' is verified') : L(' ভেরিফায়েড নন', ' is not verified')));
  txt.append(h, el('span', null, L('ব্যাজ মানে অ্যাকাউন্টটি যাচাই করা: Manzeela Verified সাবস্ক্রাইবার, অথবা Manzeela টিমের যাচাই করা পরিচিত ব্যক্তি, প্রতিষ্ঠান বা ব্র্যান্ড।', 'Accounts with the badge have been checked: Manzeela Verified subscribers, or notable people, organisations or brands verified by the Manzeela team.')));
  const more = el('button', 'vf-btn', L('আরও জানুন', 'Learn more'));
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
  if (d.joined) fact('cal', L(`${vfMonth(d.joined)}-এ যোগ দিয়েছেন`, `Joined ${vfMonth(d.joined)}`));
  if (d.since) fact('verified', L(`${vfMonth(d.since)} থেকে ভেরিফায়েড`, `Verified since ${vfMonth(d.since)}`));
  if (d.username) { fact('user', ''); facts.lastChild.querySelector('span').append(Object.assign(el('span', 'no-tr'), { textContent: '@' + d.username })); }
  fact('info', L('স্বচ্ছতা ও প্রাইভেসি পলিসি', 'Transparency and privacy policy'), 'privacy.html');

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
    gate.append(vfBigBadge(), el('h2', null, 'Manzeela Verified'), el('p', null, L('ভেরিফায়েড ব্যাজ পেতে লগইন করুন।', 'Log in to get the verified badge.')), button('user', L('লগইন করুন', 'Log in'), openLogin));
    box.replaceChildren(gate);
    return;
  }
  if (!box.firstChild || box.querySelector('.chat-gate')) box.replaceChildren(el('div', 'skeleton'), el('div', 'skeleton'));
  let d;
  try { d = await verifyApi('me'); } catch { box.replaceChildren(el('div', 'empty', L('দেখানো যায়নি। একটু পরে আবার চেষ্টা করুন।', 'Could not load. Please try again later.'))); return; }
  if (d.badge.on) VERIFIED.add(ME.id); else VERIFIED.delete(ME.id);
  ME.verified = d.badge.on;

  const hero = el('div', 'vf-hero');
  hero.append(vfBigBadge(), el('h1', null, 'Manzeela Verified'),
    el('p', null, d.badge.on ? L('আপনার নামের পাশে নীল ব্যাজ আছে।', 'You have the blue badge beside your name.') : L('নামের পাশে নীল ব্যাজ, যাতে সবাই বোঝে এটা আসল আপনি।', 'A blue badge beside your name, so everyone knows it is really you.')));
  const parts = [hero];

  // the payment back from the card page
  const back = new URLSearchParams(location.hash.split('?')[1] || '').get('paid');
  if (back) {
    parts.push(el('div', 'vf-note ' + (back === '1' ? 'ok' : 'bad'), back === '1' ? L('পেমেন্ট হয়েছে, ব্যাজ চালু হয়েছে।', 'Payment done, your badge is on.') : L('পেমেন্ট সম্পন্ন হয়নি। আবার চেষ্টা করতে পারেন।', 'The payment did not go through. You can try again.')));
    history.replaceState(history.state, '', '#/verified');
  }

  // where they stand now
  if (d.badge.on) {
    const st = el('div', 'vf-card vf-status');
    const t = el('div', 't');
    t.append(el('b', null, L('আপনি ভেরিফায়েড', 'You are verified')), el('span', null,
      d.badge.kind === 'sub' ? L(`${vfDay(d.badge.until)} পর্যন্ত চালু · নিজে থেকে টাকা কাটে না, মেয়াদ শেষের আগে নবায়ন করুন`, `Active until ${vfDay(d.badge.until)} · nothing is charged automatically, renew before it ends`)
        : L('Manzeela টিম যাচাই করে দিয়েছে · মেয়াদ নেই', 'Verified by the Manzeela team · no end date')));
    st.append(vfBigBadge('vf-sm'), t);
    parts.push(st);
  }
  const pending = d.orders.find(o => o.status === 'pending' && o.method !== 'card');
  const lastBad = d.orders[0] && d.orders[0].status === 'rejected' ? d.orders[0] : null;
  if (pending) {
    const p = el('div', 'vf-card vf-status wait');
    const t = el('div', 't');
    t.append(el('b', null, L('পেমেন্ট যাচাই হচ্ছে', 'Checking your payment')), el('span', null, L(`${VF_METHOD[pending.method]} · লেনদেন ${pending.ref} · ${taka(pending.bdt)}। মিলে গেলেই ব্যাজ চালু হবে।`, `${VF_METHOD[pending.method]} · transaction ${pending.ref} · ${taka(pending.bdt)}. Your badge turns on once it matches.`)));
    const c = el('button', 'pill-btn quiet', L('বাতিল', 'Cancel'));
    c.addEventListener('click', async () => { c.disabled = true; await verifyApi('cancel', { id: pending.id }).catch(() => {}); drawVerified(); });
    p.append(ic('clock'), t, c);
    parts.push(p);
  } else if (lastBad) {
    parts.push(el('div', 'vf-note bad', L(`আগের পেমেন্টটি মেলেনি${lastBad.note ? ': ' + lastBad.note : ''}। ঠিক তথ্য দিয়ে আবার চেষ্টা করুন।`, `Your last payment did not match${lastBad.note ? ': ' + lastBad.note : ''}. Please try again with the right details.`)));
  }

  if (d.badge.kind !== 'team') {
    // what it gives (only what the app does)
    const gets = el('div', 'vf-card vf-gets');
    for (const [icon, b, s] of [
      ['verified', L('নামের পাশে নীল ব্যাজ', 'A blue badge beside your name'), L('পোস্ট, কমেন্ট, মেসেজ, সার্চ আর প্রোফাইলে', 'On posts, comments, messages, search and your profile')],
      ['user', L('ব্যাজে চাপলে আপনার পরিচয়', 'Who you are, one tap away'), L('কবে যোগ দিয়েছেন আর কবে থেকে ভেরিফায়েড, সবাই দেখবে', 'Anyone can see when you joined and since when you are verified')],
      ['shield', L('যাচাই করা অ্যাকাউন্ট', 'A checked account'), L('শুধু ছবি, আসল নাম আর টু-স্টেপ চালু থাকা অ্যাকাউন্ট পায়', 'Only accounts with a photo, a real name and two-step verification get it')]]) {
      const row = el('div', 'vf-get');
      const t = el('div', 't');
      t.append(el('b', null, b), el('span', null, s));
      row.append(ic(icon), t);
      gets.appendChild(row);
    }
    parts.push(gets);

    // the plans
    parts.push(el('div', 'label', d.badge.on ? L('নবায়ন করুন', 'Renew') : L('প্ল্যান বেছে নিন', 'Choose a plan')));
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
      b.append(top, price, el('span', 'bdt', L(`বিকাশ/নগদ/ব্যাংকে ${taka(p.bdt)}`, `${taka(p.bdt)} by bKash/Nagad/bank`)), el('i', 'radio'));
      b.addEventListener('click', () => { vfPlan = key; for (const x of plans.children) x.classList.toggle('on', x === b); });
      plans.appendChild(b);
    };
    plan('month', L('মাসিক', 'Monthly'), L('/মাস', '/month'));
    const save = num(Math.round((1 - d.plans.year.usd / (d.plans.month.usd * 12)) * 100));
    plan('year', L('বাৎসরিক', 'Yearly'), L('/বছর', '/year'), L(`${save}% সাশ্রয়`, `Save ${save}%`));
    parts.push(plans);

    // the rules, each with its tick
    parts.push(el('div', 'label', L('যাদের জন্য', 'Who can get it')));
    const rules = el('div', 'vf-card vf-rules');
    for (const r of d.rules) {
      const row = el('div', 'vf-rule' + (r.ok ? ' ok' : ''));
      const t = el('div', 't');
      const en = VF_RULES_EN[r.key] || [r.label, r.hint];
      t.append(el('b', null, L(r.label, typeof en[0] === 'function' ? en[0](r) : en[0])));
      if (!r.ok) t.appendChild(el('span', null, L(r.hint, typeof en[1] === 'function' ? en[1](r) : en[1])));
      row.append(el('i', 'tick'), t);
      if (!r.ok && r.key === '2fa') { const go2 = el('button', 'pill-btn quiet', L('চালু করুন', 'Turn on')); go2.addEventListener('click', openTwoStep); row.appendChild(go2); }
      if (!r.ok && (r.key === 'photo' || r.key === 'name')) { const ed = el('button', 'pill-btn quiet', L('ঠিক করুন', 'Fix')); ed.addEventListener('click', () => openProfile()); row.appendChild(ed); }
      rules.appendChild(row);
    }
    parts.push(rules);

    // how to pay
    const ways = Object.keys(VF_METHOD).filter(k => k === 'card' ? d.methods.card : d.methods[k]);
    if (!ways.includes(vfMethod)) vfMethod = ways[0] || '';
    if (ways.length) {
      parts.push(el('div', 'label', L('পেমেন্ট', 'Payment')));
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

    const cta = button('verified', d.badge.on ? L('নবায়ন করুন', 'Renew') : L('চালিয়ে যান', 'Continue'), () => openVerifyPay(d));
    cta.classList.add('vf-cta');
    cta.disabled = !d.open || !d.eligible || !ways.length || !!pending;
    parts.push(cta, el('div', 'form-note vf-small', !d.open ? L('নতুন সাবস্ক্রিপশন এখন সাময়িকভাবে বন্ধ।', 'New subscriptions are paused for now.') : !ways.length ? L('পেমেন্ট শিগগির চালু হবে।', 'Payments open soon.')
      : !d.eligible ? L('উপরের সব শর্ত পূরণ হলে কেনা যাবে।', 'You can buy it once every condition above is met.') : pending ? L('আগের পেমেন্টটি যাচাই হলে আবার কেনা যাবে।', 'You can buy again once your last payment is checked.')
      : L('মেয়াদ শেষে নিজে থেকে টাকা কাটে না। ভুয়া পরিচয় বা নিয়ম ভাঙলে ব্যাজ সরিয়ে নেওয়া হতে পারে।', 'Nothing is charged automatically when it ends. A false identity or breaking the rules can lose the badge.')));
  }

  const free = el('button', 'vf-free');
  free.append(el('span', null, L('পরিচিত ব্যক্তি, প্রতিষ্ঠান বা সংবাদমাধ্যম? Manzeela টিমের কাছে বিনা খরচে যাচাইয়ের আবেদন করুন', 'A notable person, organisation or news outlet? Ask the Manzeela team to verify you for free')), ic('chev'));
  free.addEventListener('click', () => openNewTicket('verify'));
  if (!d.badge.on) parts.push(free);
  box.replaceChildren(...parts);
}

// ---- paying ----
function openVerifyPay(d) {
  const p = d.plans[vfPlan], m = vfMethod, planName = vfPlan === 'year' ? L('বাৎসরিক', 'Yearly') : L('মাসিক', 'Monthly');
  if (m === 'card') {
    const go_ = button('card', L(`$${p.usd} দিন`, `Pay $${p.usd}`), async () => {
      go_.disabled = true;
      note.className = 'form-note';
      note.textContent = L('পেমেন্ট পাতায় নিয়ে যাওয়া হচ্ছে…', 'Taking you to the payment page…');
      try { location.href = (await verifyApi('card', { plan: vfPlan })).url; }
      catch { go_.disabled = false; note.className = 'form-note bad'; note.textContent = L('পেমেন্ট পাতা খোলা যায়নি। একটু পরে আবার চেষ্টা করুন।', 'Could not open the payment page. Please try again later.'); }
    });
    const note = el('div', 'form-note', L('SSLCommerz-এর নিরাপদ পাতায় কার্ডের তথ্য দেবেন। Manzeela কার্ডের নম্বর দেখে না বা রাখে না।', 'You enter your card on the secure SSLCommerz page. Manzeela never sees or keeps your card number.'));
    openModal(`${planName} · $${p.usd}`, L('ভিসা বা মাস্টারকার্ড', 'Visa or Mastercard'), [note], [go_]);
    return;
  }
  const to = d.methods[m];
  const steps = el('ol', 'vf-steps');
  const copyRow = (label, value, shown) => {
    const li = el('li');
    li.append(el('span', null, label));
    const v = el('div', 'vf-copy');
    v.append(Object.assign(el('b', 'no-tr'), { textContent: shown || value }));
    const c = el('button', 'pill-btn quiet', L('কপি', 'Copy'));
    c.addEventListener('click', async () => { try { await navigator.clipboard.writeText(value); c.textContent = L('কপি হয়েছে', 'Copied'); } catch { /* no clipboard */ } });
    v.appendChild(c);
    li.appendChild(v);
    steps.appendChild(li);
  };
  if (m === 'bank') copyRow(L('এই অ্যাকাউন্টে টাকা পাঠান', 'Send the money to this account'), to);
  else copyRow(L(`${VF_METHOD[m]} অ্যাপ থেকে Send Money বা Payment করুন এই নম্বরে`, `In the ${VF_METHOD[m]} app, use Send Money or Payment to this number`), to);
  copyRow(L('ঠিক এই পরিমাণ', 'Exactly this amount'), String(p.bdt), taka(p.bdt));
  steps.appendChild(el('li', null, m === 'bank' ? L('নিচে যে অ্যাকাউন্ট থেকে পাঠালেন আর লেনদেনের রেফারেন্স নম্বর লিখুন।', 'Below, enter the account you sent from and the reference number of the transfer.') : L('নিচে যে নম্বর থেকে পাঠালেন আর মেসেজে আসা TrxID লিখুন।', 'Below, enter the number you sent from and the TrxID from the message.')));
  const [sBox, sender] = field(m === 'bank' ? L('যে অ্যাকাউন্ট থেকে পাঠালেন (নাম ও শেষ ৪ সংখ্যা)', 'Account you sent from (name and last 4 digits)') : L('যে নম্বর থেকে পাঠালেন', 'Number you sent from'), m === 'bank' ? { maxLength: 40, autocomplete: 'off' } : { type: 'tel', inputMode: 'tel', placeholder: '01XXXXXXXXX', maxLength: 14, autocomplete: 'off' });
  const [rBox, ref] = field(m === 'bank' ? L('লেনদেন / রেফারেন্স নম্বর', 'Transaction / reference number') : 'TrxID', { maxLength: 30, autocomplete: 'off', spellcheck: false, placeholder: m === 'bank' ? '' : L('যেমন 9A7B6C5D4E', 'e.g. 9A7B6C5D4E') });
  ref.classList.add('upper');
  const agree = el('label', 'vf-agree');
  const box = Object.assign(el('input'), { type: 'checkbox' });
  agree.append(box, el('span', null, L('আমার বয়স ১৮ বা তার বেশি, প্রোফাইলের নাম ও ছবি আমার নিজের।', 'I am 18 or older, and the name and photo on my profile are my own.')));
  const note = el('div', 'form-note', L('Manzeela টিম স্টেটমেন্টের সাথে মিলিয়ে সাধারণত কয়েক ঘণ্টার মধ্যে ব্যাজ চালু করে।', 'The Manzeela team checks it against the statement and usually turns the badge on within a few hours.'));
  const send = button('send', L('পেমেন্ট জমা দিন', 'Submit payment'), async () => {
    send.disabled = true;
    try { await verifyApi('order', { plan: vfPlan, method: m, sender: sender.value, ref: ref.value, agree: box.checked }); closeModal(); drawVerified(); }
    catch (e) {
      send.disabled = false;
      note.className = 'form-note bad';
      note.textContent = { agree: L('নিচের ঘরে টিক দিন।', 'Tick the box below.'), ref: L('লেনদেনের নম্বরটি ঠিক নয়, ইংরেজি অক্ষর ও সংখ্যা দিন।', 'That transaction number is not right: use English letters and digits.'),
        sender: m === 'bank' ? L('কোন অ্যাকাউন্ট থেকে পাঠালেন লিখুন।', 'Enter the account you sent from.') : L('০১ দিয়ে শুরু ১১ সংখ্যার নম্বর দিন।', 'Enter an 11-digit number starting with 01.'),
        duplicate: L('এই লেনদেন নম্বর আগেই ব্যবহার হয়েছে।', 'This transaction number has already been used.'), pending: L('আগের একটি পেমেন্ট যাচাইয়ের অপেক্ষায়।', 'An earlier payment is still being checked.'),
        rules: L('সব শর্ত এখনো পূরণ হয়নি।', 'Not every condition is met yet.'), closed: L('নতুন সাবস্ক্রিপশন এখন বন্ধ।', 'New subscriptions are paused.') }[e.message] || L('জমা দেওয়া যায়নি।', 'Could not submit.');
    }
  });
  openModal(`${planName} · $${p.usd}`, L(`${VF_METHOD[m]} দিয়ে ${taka(p.bdt)}`, `${taka(p.bdt)} by ${VF_METHOD[m]}`), [steps, sBox, rBox, agree, note], [send]);
}

(() => {
  enter.verified = drawVerified;
  document.addEventListener('bdmap:auth', () => { if (current === 'verified') drawVerified(); });   // signed in or out while here
  if (current === 'verified') drawVerified();
})();
