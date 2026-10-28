// ---- Accounts: an e-mail address, proved by a code sent to it ----
// There are no passwords. Logged in, a person has a profile (name, bio, picture), their ratings and reported
// fares count once for them on every device, their recent trips follow them, and they can use the messenger
// and write to support.

let ME = null;   // { id, name, email, bio, pic, role } when logged in

async function acctApi(path, body) {
  const res = await fetch('api/auth/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : {};
  if (!res.ok) throw new Error(data.error || 'server');
  return data;
}

const ACCT_ERRORS = {
  email: 'ই-মেইল ঠিকানাটি ঠিক নয়।',
  wait: 'একটু আগে কোড পাঠানো হয়েছে। এক মিনিট পরে আবার চেষ্টা করুন।',
  mail: 'এই মুহূর্তে ই-মেইল পাঠানো যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।',
  wrong: 'কোডটি মিলছে না। ই-মেইলটি আবার দেখুন।',
  expired: 'কোডের সময় শেষ। নতুন কোড নিন।',
  slow: 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।',
  name: 'নাম অন্তত ২ অক্ষরের হতে হবে।',
  image: 'ছবিটি নেওয়া যায়নি। অন্য একটি ছবি দিয়ে চেষ্টা করুন।',
  banned: 'এই অ্যাকাউন্টটি বন্ধ করা হয়েছে। সাহায্যের জন্য সাপোর্টে লিখুন।',
  login: 'আবার লগইন করুন।'
};
const acctError = e => ACCT_ERRORS[e.message] || 'কাজটি করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।';

// A person's picture, or their initial on a colour of their own. Used everywhere a person is shown.
function avatar(person, cls = '') {
  const a = el('span', 'avatar no-tr ' + cls);
  if (person && person.id) {
    a.dataset.uid = person.id;
    // Someone with a story from the last day gets the coloured ring (grey once it has been watched).
    const ring = typeof storyClass === 'function' ? storyClass(person.id) : '';
    if (ring) a.className += ' ' + ring;
  }
  if (person.pic) {
    const img = el('img');
    img.alt = '';
    img.src = `api/avatar/${person.id}?v=${person.pic}`;
    a.appendChild(img);
  } else {
    // no photo: the first letter on a quiet circle (one colour for everyone, as the redesign keeps colour for photos)
    a.textContent = [...(person.name || '?').trim()][0] || '?';
    a.classList.add('initial');
  }
  return a;
}

// The blue badge beside the name of an account the Manzeela team has verified. The list is small and public.
const VERIFIED = new Set();
fetch('api/people/verified').then(r => r.json()).then(d => { for (const id of d.ids || []) VERIFIED.add(id); }).catch(() => {});
const isVerified = person => !!person && (!!person.verified || VERIFIED.has(person.id));
function vbadge() {
  if (!document.getElementById('vb-defs')) {
    // One shared gradient for every badge on the page.
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    defs.id = 'vb-defs';
    defs.setAttribute('aria-hidden', 'true');
    defs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    defs.innerHTML = '<defs><linearGradient id="vb-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4cc3ff"/><stop offset=".55" stop-color="#1d8cf8"/><stop offset="1" stop-color="#1565e8"/></linearGradient></defs>';
    document.body.appendChild(defs);
  }
  const s = el('span', 'vbadge');
  s.title = LANG === 'en' ? 'Verified' : 'ভেরিফায়েড';
  s.innerHTML = '<svg viewBox="-1.2 -1.2 26.4 26.4" aria-hidden="true"><path class="b" d="M12.00 2.65Q15.43 -0.82 16.67 3.90Q21.38 2.62 20.10 7.33Q24.82 8.57 21.35 12.00Q24.82 15.43 20.10 16.67Q21.38 21.38 16.67 20.10Q15.43 24.82 12.00 21.35Q8.57 24.82 7.33 20.10Q2.62 21.38 3.90 16.68Q-0.82 15.43 2.65 12.00Q-0.82 8.57 3.90 7.32Q2.62 2.62 7.32 3.90Q8.57 -0.82 12.00 2.65Z"/><path class="t" d="M8.3 12.3l2.5 2.5 5-5.2"/></svg>';
  return s;
}
// A person's name, with the badge when they have one. The name is the person's own words: never translated.
function nameEl(person, tag = 'b', cls = '') {
  const e = el(tag, ('no-tr ' + cls).trim());
  e.appendChild(Object.assign(el('span', 'nm'), { textContent: person.name }));
  if (isVerified(person)) e.appendChild(vbadge());
  return e;
}

function renderAccount() {
  const card = $('acct-card');
  card.querySelector('.ic').replaceChildren(...(ME ? [avatar(ME)] : [Object.assign(el('i'), { innerHTML: svg('user') })]));
  card.querySelector('b').textContent = ME ? ME.name : 'লগইন করুন';
  card.querySelector('b').classList.toggle('no-tr', !!ME);
  card.querySelector('.t span').textContent = ME ? '@' + (ME.username || '') : '';
  card.querySelector('.t span').classList.toggle('no-tr', !!ME);
  const btn = $('acct-btn');
  btn.replaceChildren(ME ? avatar(ME, 'xs') : Object.assign(el('i'), { innerHTML: svg('user') }), Object.assign(el('span', ME ? 'no-tr' : ''), { textContent: ME ? ME.name : 'লগইন' }));
  for (const a of document.querySelectorAll('[data-admin-link]')) a.hidden = !ME || ME.role === 'user';
  // Home's own button (phones): a glass 'login' pill, or the person's photo once signed in
  const home = document.getElementById('hm-acct');
  if (home) {
    home.classList.toggle('me', !!ME);
    home.setAttribute('aria-label', ME ? ME.name : 'লগইন');
    home.replaceChildren(...(ME ? [avatar(ME, 'sm')] : [Object.assign(el('i'), { innerHTML: svg('user') }), el('span', null, 'লগইন')]));
  }
}

// Recent trips: on login the device's list and the account's are merged; after that every change is sent up.
function syncAccount() {
  if (ME) acctApi('data', { data: { recent: loadRecent() } }).catch(() => {});
}
function signedIn(reply) {
  ME = reply.user;
  if (location.hash.startsWith('#/me') && typeof route === 'function') setTimeout(route, 0);   // the profile tab, opened before the login was known
  const seen = new Set(), merged = [];
  for (const r of [...loadRecent(), ...((reply.data && reply.data.recent) || [])]) {
    if (!r || !r.from || !r.to || typeof r.from.label !== 'string' || typeof r.to.label !== 'string') continue;
    const key = r.from.label + '>' + r.to.label;
    if (!seen.has(key) && merged.length < 4) { seen.add(key); merged.push(r); }
  }
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(merged)); } catch { /* storage unavailable */ }
  syncAccount();
  renderRecent();
  authChanged();
}
function signedOut() {
  ME = null;
  authChanged();
}
function authChanged() {
  document.dispatchEvent(new Event('bdmap:auth'));    // other parts (the guide's saved places) follow the account
  renderAccount();
  loadRatings();
  loadFareReports();
  if (typeof chatAuthChanged === 'function') chatAuthChanged();
  if (typeof supportAuthChanged === 'function') supportAuthChanged();
  if (current === 'home' && enter.home) enter.home();
  if (typeof drawProfile === 'function' && current === 'profile') { if (!ME) PROFILE.id = null; drawProfile(); }
  if (enter.settings && current === 'settings') enter.settings();
  if (enter.insights && current === 'insights') enter.insights();
  if (typeof refreshNotify === 'function') refreshNotify();
}

function field(label, attrs, tag = 'input') {
  const input = el(tag);
  Object.assign(input, attrs);
  const wrap = el('label', 'money');
  wrap.append(el('span', null, label), input);
  return [wrap, input];
}

// ---- Signing in, the way a social app does it ----
// A screen of its own (not a pop-up): log in with an e-mail address and the code sent to it, or create a new
// account (name, username, e-mail, code). With two-step verification on, a code from an authenticator app (or a
// backup code) is asked for after the e-mail code.
const AUTH_ERRORS = { noaccount: 'এই ই-মেইলে কোনো অ্যাকাউন্ট নেই।', exists: 'এই ই-মেইলে আগেই অ্যাকাউন্ট আছে — লগইন করুন।', closed: 'এই মুহূর্তে নতুন অ্যাকাউন্ট খোলা বন্ধ আছে।',
                      utaken: 'এই ইউজারনেম আগেই কেউ নিয়েছেন।', uformat: 'ইউজারনেমে ছোট হাতের a-z, 0-9, ডট ও আন্ডারস্কোর — ৩ থেকে ৩০ অক্ষর।' };
const authError = e => AUTH_ERRORS[e.message] || acctError(e);
let authBox = null;
function closeAuth() { if (authBox) { authBox.remove(); authBox = null; document.body.classList.remove('auth-open'); } }
function authShell(content, footer, step) {
  const reuse = authBox && document.body.contains(authBox);
  if (!reuse) {
    if (!$('modal').hidden) closeModal();
    authBox = el('div', 'auth');
    const x = el('button', 'icon-btn auth-x');
    x.innerHTML = svg('close');
    x.setAttribute('aria-label', 'বন্ধ করুন');
    x.addEventListener('click', closeAuth);
    const art = el('div', 'auth-art');
    art.innerHTML = '<span class="a1"></span><span class="a2"></span><span class="a3"></span><span class="a4"></span>';
    // What Manzeela is, shown beside the form on a wide screen: a few cards from the app, floating.
    const show = el('aside', 'auth-show');
    show.innerHTML = `
      <div class="as-copy"><b>${LANG === 'en' ? 'Bangladesh, in one app' : 'বাংলাদেশ, এক অ্যাপে'}</b>
        <span>${LANG === 'en' ? 'Routes and fares, reels and stories, messages and calls — with the people who travel it.' : 'রুট ও ভাড়া, রিল ও স্টোরি, মেসেজ ও কল — যাঁরা ঘোরেন তাঁদের সাথে।'}</span></div>
      <div class="as-stage">
        <div class="as-card as-map"><i class="pin"></i><i class="route"></i><em>${LANG === 'en' ? 'Dhaka → Sajek · ৳850' : 'ঢাকা → সাজেক · ৳৮৫০'}</em></div>
        <div class="as-card as-reel"><span class="play"></span><em>♪ ${LANG === 'en' ? 'Dhaka Nights' : 'ঢাকার রাত'}</em></div>
        <div class="as-card as-chat"><p>${LANG === 'en' ? 'Bus at 10 tonight?' : 'আজ রাত ১০টার বাস?'}</p><p class="me">${LANG === 'en' ? 'Booked 🎟️' : 'টিকিট কাটা শেষ 🎟️'}</p></div>
        <div class="as-card as-badge"><i></i><em>${LANG === 'en' ? 'Verified' : 'ভেরিফায়েড'}</em></div>
      </div>`;
    const main = el('div', 'auth-main');
    authBox.append(art, x, show, main);
    document.body.appendChild(authBox);
    document.body.classList.add('auth-open');
  }
  const main = authBox.querySelector('.auth-main');
  const card = el('div', 'auth-card');
  const brand = el('div', 'auth-brand');
  brand.append(Object.assign(el('span', 'auth-logo'), { innerHTML: '<i></i>' }), el('b', 'no-tr', 'Manzeela'));
  card.appendChild(brand);
  if (step) {
    const dots = el('div', 'auth-steps');
    for (let i = 1; i <= step[1]; i++) dots.appendChild(el('i', i < step[0] ? 'done' : i === step[0] ? 'on' : ''));
    card.appendChild(dots);
  }
  card.append(...content);
  const foot = el('div', 'auth-foot');
  foot.append(...footer);
  main.replaceChildren(card, foot);
  return authBox;
}
function authInput(label, attrs, icon) {
  const wrap = el('label', 'auth-field' + (icon ? ' has-ic' : ''));
  const input = el('input');
  Object.assign(input, attrs, { placeholder: ' ' });
  wrap.append(input, el('span', 'lbl', label));
  if (icon) wrap.appendChild(Object.assign(el('i', 'fic'), { innerHTML: svg(icon) }));
  return [wrap, input];
}
const linkBtn = (text, fn) => { const b = el('button', 'auth-link', text); b.type = 'button'; b.addEventListener('click', fn); return b; };

// Something needs an account (a like, a comment, a follow…): the login opens saying so.
let authWhy = '';
function needLogin(why) { authWhy = why || ''; openLogin(); }
function openLogin(mode = 'login', presetEmail = '') {
  if (mode === 'signup') return openSignup(presetEmail);
  const [emailBox, email] = authInput('ই-মেইল ঠিকানা', { type: 'email', autocomplete: 'email', inputMode: 'email', maxLength: 120, value: presetEmail }, 'send');
  const note = el('div', 'auth-note');
  const go = el('button', 'auth-btn', 'কোড পাঠান');
  const submit = async () => {
    go.disabled = true;
    note.className = 'auth-note';
    note.textContent = '';
    try {
      const reply = await acctApi('code', { email: email.value, mode: 'login' });
      openCode({ email: email.value.trim() }, reply.devCode);
    } catch (e) {
      go.disabled = false;
      note.className = 'auth-note bad';
      note.textContent = authError(e);
      if (e.message === 'noaccount') note.appendChild(linkBtn('নতুন অ্যাকাউন্ট খুলুন', () => openSignup(email.value)));
    }
  };
  go.addEventListener('click', submit);
  email.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  const form = el('div', 'auth-form');
  form.append(el('h2', null, 'লগইন করুন'), el('p', 'auth-sub', 'পাসওয়ার্ড লাগে না — ই-মেইলে একটি কোড যাবে।'), emailBox, go, note);
  const divider = el('div', 'auth-or', 'অথবা');
  const create = el('button', 'auth-btn ghost', 'নতুন অ্যাকাউন্ট খুলুন');
  create.addEventListener('click', () => openSignup(email.value));
  if (authWhy) { form.prepend(el('div', 'auth-why', authWhy)); authWhy = ''; }
  authShell([form, divider, create], [legalLine()]);
  email.focus();
}

// Creating an account: who you are first, then the code to prove the e-mail address is yours.
function openSignup(presetEmail = '') {
  const [emailBox, email] = authInput('ই-মেইল ঠিকানা', { type: 'email', autocomplete: 'email', inputMode: 'email', maxLength: 120, value: presetEmail }, 'send');
  const [nameBox, name] = authInput('পুরো নাম', { type: 'text', autocomplete: 'name', maxLength: 40 }, 'user');
  const [userBox, user] = authInput('ইউজারনেম', { type: 'text', autocomplete: 'username', maxLength: 30, autocapitalize: 'off', spellcheck: false }, 'at');
  const status = el('i', 'auth-check');
  userBox.appendChild(status);
  // Under the username: free or taken, and a few free ones to pick from when it is taken.
  const hint = el('div', 'auth-hint');
  let userOk = false, seq = 0, timer = null;
  const check = () => {
    const u = user.value.trim().toLowerCase();
    user.value = u.replace(/[^a-z0-9._]/g, '');
    clearTimeout(timer);
    userOk = false;
    status.className = 'auth-check';
    userBox.classList.remove('good', 'bad');
    hint.className = 'auth-hint';
    hint.replaceChildren();
    if (user.value.length < 3) return;
    const mine = ++seq;
    timer = setTimeout(async () => {
      try {
        const r = await (await fetch('api/auth/username?u=' + encodeURIComponent(user.value))).json();
        if (mine !== seq) return;
        userOk = r.ok;
        status.className = 'auth-check ' + (r.ok ? 'ok' : 'bad');
        userBox.classList.toggle('good', r.ok);
        userBox.classList.toggle('bad', !r.ok);
        hint.className = 'auth-hint ' + (r.ok ? 'ok' : 'bad');
        hint.replaceChildren(document.createTextNode(r.ok ? (LANG === 'en' ? `@${user.value} is available` : `@${user.value} — খালি আছে`)
          : r.problem === 'taken' ? (LANG === 'en' ? 'Taken. Try:' : 'আগেই নেওয়া। এগুলো চেষ্টা করুন:') : AUTH_ERRORS.uformat));
        if (r.problem === 'taken') {
          const base = user.value.replace(/\d+$/, '').slice(0, 24);
          const tries = [`${base}${new Date().getFullYear() % 100}`, `${base}.bd`, `${base}_${Math.floor(Math.random() * 90 + 10)}`];
          for (const t of tries) {
            const ok = (await (await fetch('api/auth/username?u=' + encodeURIComponent(t))).json()).ok;
            if (!ok || mine !== seq) continue;
            const chip = el('button', 'auth-sugg', '@' + t);
            chip.type = 'button';
            chip.addEventListener('click', () => { user.value = t; check(); });
            hint.appendChild(chip);
          }
        }
      } catch { /* checked again on submit */ }
    }, 280);
  };
  user.addEventListener('input', check);
  // A username is suggested from the name, the way apps do.
  name.addEventListener('blur', () => {
    if (user.value) return;
    const latin = name.value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '.');
    const fromMail = email.value.split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '');
    user.value = (latin.length >= 3 ? latin : fromMail).slice(0, 24);
    check();
  });
  const note = el('div', 'auth-note');
  const go = el('button', 'auth-btn', 'পরের ধাপ');
  const submit = async () => {
    note.className = 'auth-note bad';
    if (name.value.trim().length < 2) { note.textContent = 'নাম অন্তত ২ অক্ষরের হতে হবে।'; name.focus(); return; }
    if (!/^[a-z0-9._]{3,30}$/.test(user.value)) { note.textContent = AUTH_ERRORS.uformat; user.focus(); return; }
    go.disabled = true;
    note.textContent = '';
    try {
      const r = await (await fetch('api/auth/username?u=' + encodeURIComponent(user.value))).json();
      if (!r.ok) throw new Error(r.problem === 'taken' ? 'utaken' : 'uformat');
      const reply = await acctApi('code', { email: email.value, mode: 'signup' });
      openCode({ email: email.value.trim(), name: name.value.trim(), username: user.value }, reply.devCode);
    } catch (e) {
      go.disabled = false;
      note.textContent = authError(e);
      if (e.message === 'exists') note.appendChild(linkBtn('লগইন করুন', () => openLogin('login', email.value)));
    }
  };
  go.addEventListener('click', submit);
  for (const i of [email, name, user]) i.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  const form = el('div', 'auth-form');
  form.append(el('h2', null, 'নতুন অ্যাকাউন্ট'), el('p', 'auth-sub', 'বন্ধুদের ছবি-ভিডিও দেখুন, মেসেজ করুন, ভাড়া জানিয়ে পয়েন্ট নিন।'), emailBox, nameBox, userBox, hint, go, note);
  authShell([form], [el('span', null, 'আগে থেকেই অ্যাকাউন্ট আছে?'), linkBtn('লগইন করুন', () => openLogin('login', email.value))], [1, 2]);
  (presetEmail ? name : email).focus();
}

// Six boxes for a six-digit code: typing moves along, a pasted code fills them all.
function codeBoxes(onDone) {
  const row = el('div', 'otp');
  const boxes = Array.from({ length: 6 }, () => {
    const i = el('input');
    Object.assign(i, { type: 'text', inputMode: 'numeric', maxLength: 1, autocomplete: 'one-time-code' });
    row.appendChild(i);
    return i;
  });
  const value = () => boxes.map(b => b.value).join('');
  boxes.forEach((b, n) => {
    b.addEventListener('input', () => {
      const digits = b.value.replace(/\D/g, '');
      if (digits.length > 1) { digits.slice(0, 6 - n).split('').forEach((d, k) => { boxes[n + k].value = d; }); }
      else b.value = digits;
      const next = boxes.find(x => !x.value);
      (next || boxes[5]).focus();
      row.classList.toggle('full', value().length === 6);
      if (value().length === 6) onDone(value());
    });
    b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && n) { boxes[n - 1].value = ''; boxes[n - 1].focus(); } });
    b.addEventListener('paste', e => { const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (t.length > 1) { e.preventDefault(); t.split('').forEach((d, k) => { if (boxes[k]) boxes[k].value = d; }); boxes[Math.min(5, t.length)].focus(); if (t.length === 6) onDone(t); } });
  });
  row.clear = () => { for (const b of boxes) b.value = ''; row.classList.remove('full'); boxes[0].focus(); };
  row.focus = () => boxes[0].focus();
  return row;
}

function openCode(who, devCode) {
  const note = el('div', 'auth-note');
  if (devCode) { note.textContent = `এই কম্পিউটারে ই-মেইল সেটআপ নেই — পরীক্ষার কোড: ${devCode}`; note.classList.add('no-tr'); }
  let busy = false;
  const boxes = codeBoxes(async code => {
    if (busy) return;
    busy = true;
    note.className = 'auth-note';
    try {
      const reply = await acctApi('verify', { email: who.email, code, device: deviceId(), name: who.name, username: who.username });
      if (reply.need2fa) { openSecondStep(reply.ticket); return; }
      finishSignIn(reply);
    } catch (e) {
      note.className = 'auth-note bad';
      note.textContent = authError(e);
      boxes.clear();
    }
    busy = false;
  });
  const again = linkBtn('আবার কোড পাঠান', async () => {
    try { const r = await acctApi('code', { email: who.email, mode: who.name ? 'signup' : 'login' }); note.className = 'auth-note good'; note.textContent = r.devCode ? `নতুন কোড: ${r.devCode}` : 'নতুন কোড পাঠানো হয়েছে।'; }
    catch (e) { note.className = 'auth-note bad'; note.textContent = authError(e); }
  });
  const form = el('div', 'auth-form');
  const sub = el('p', 'auth-sub');
  sub.append(document.createTextNode('৬ সংখ্যার কোড পাঠানো হয়েছে '), Object.assign(el('b', 'no-tr'), { textContent: who.email }), document.createTextNode(' ঠিকানায়। ইনবক্স না পেলে স্প্যাম দেখুন।'));
  const mail = el('div', 'auth-mail');
  mail.innerHTML = svg('send');
  form.append(mail, el('h2', null, 'কোডটি দিন'), sub, boxes, note, again);
  authShell([form], [linkBtn(who.name ? 'তথ্য বদলান' : 'অন্য ই-মেইল দিন', () => (who.name ? openSignup(who.email) : openLogin('login', who.email)))], who.name ? [2, 2] : null);
  boxes.focus();
}

// Two-step verification: the authenticator app's code, or one of the backup codes.
function openSecondStep(ticket) {
  const note = el('div', 'auth-note');
  let busy = false;
  const send = async code => {
    if (busy) return;
    busy = true;
    try { finishSignIn(await acctApi('verify2fa', { ticket, code })); }
    catch (e) { note.className = 'auth-note bad'; note.textContent = e.message === 'expired' ? 'সময় শেষ — আবার লগইন করুন।' : e.message === 'wrong' ? 'কোডটি মিলছে না।' : authError(e); boxes.clear(); }
    busy = false;
  };
  const boxes = codeBoxes(send);
  const [backupBox, backup] = authInput('ব্যাকআপ কোড (যেমন abcde-12345)', { type: 'text', maxLength: 11, autocapitalize: 'off' });
  backupBox.hidden = true;
  const useBackup = el('button', 'auth-btn ghost', 'ব্যাকআপ কোড দিন');
  useBackup.hidden = true;
  useBackup.addEventListener('click', () => send(backup.value));
  const toggle = linkBtn('অ্যাপ হাতের কাছে নেই? ব্যাকআপ কোড ব্যবহার করুন', () => { boxes.hidden = true; backupBox.hidden = useBackup.hidden = false; toggle.hidden = true; backup.focus(); });
  const form = el('div', 'auth-form');
  const shield = el('div', 'auth-mail');
  shield.innerHTML = svg('shield');
  form.append(shield, el('h2', null, 'টু-স্টেপ ভেরিফিকেশন'), el('p', 'auth-sub', 'Google Authenticator বা অন্য অথেন্টিকেটর অ্যাপে Manzeela-র ৬ সংখ্যার কোডটি দিন।'), boxes, backupBox, useBackup, note, toggle);
  authShell([form], [linkBtn('আবার শুরু করুন', () => openLogin())]);
  boxes.focus();
}
function finishSignIn(reply) {
  closeAuth();
  signedIn(reply);
  if (reply.isNew) openProfile(true);
}

// A chosen photo is cut to a centred square and scaled to 320 px before it is sent (about 20-40 KB).
function squarePhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight), c = el('canvas');
      c.width = c.height = 320;
      c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 320, 320);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

function openProfile(welcome) {
  if (!ME) { openLogin(); return; }
  const note = el('div', 'form-note', welcome ? 'স্বাগতম! আপনার নাম আর একটি ছবি দিন, যাতে বন্ধুরা আপনাকে চিনতে পারে।' : '');
  const fail = e => { note.className = 'form-note bad'; note.textContent = acctError(e); };

  const pic = el('button', 'pic-edit');
  const file = Object.assign(el('input'), { type: 'file', accept: 'image/*', hidden: true });
  const drawPic = () => pic.replaceChildren(avatar(ME, 'xl'), Object.assign(el('i', 'cam'), { innerHTML: svg('camera') }));
  drawPic();
  pic.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    pic.classList.add('busy');
    try { ME = (await acctApi('avatar', { image: await squarePhoto(file.files[0]) })).user; drawPic(); renderAccount(); if (current === 'profile') drawProfile(); note.className = 'form-note'; note.textContent = 'ছবি বদলানো হয়েছে।'; }
    catch (e) { fail(e); }
    pic.classList.remove('busy');
    file.value = '';
  });
  const remove = el('button', 'text-btn', 'ছবি সরান');
  remove.hidden = !ME.pic;
  remove.addEventListener('click', async () => { try { ME = (await acctApi('avatar', { image: null })).user; drawPic(); renderAccount(); remove.hidden = true; } catch (e) { fail(e); } });
  const top = el('div', 'profile-top');
  top.append(pic, file, remove);

  const [nameBox, name] = field('নাম', { type: 'text', autocomplete: 'name', maxLength: 40, value: ME.name });
  const [userBox, user] = field('ইউজারনেম', { type: 'text', autocomplete: 'username', maxLength: 30, value: ME.username || '', autocapitalize: 'off', spellcheck: false });
  user.addEventListener('input', () => { user.value = user.value.toLowerCase().replace(/[^a-z0-9._]/g, ''); });
  const [bioBox, bio] = field('বায়ো — নিজের সম্পর্কে এক-দুই লাইন', { rows: 2, maxLength: 160, value: ME.bio, placeholder: 'যেমন: ঢাকায় থাকি, ঘুরতে ভালোবাসি' }, 'textarea');
  const mail = el('div', 'form-note no-tr', ME.email);

  const save = button('check', 'সেভ করুন', async () => {
    save.disabled = true;
    try {
      ME = (await acctApi('profile', { name: name.value, bio: bio.value, username: user.value })).user;
      renderAccount();
      if (typeof chatAuthChanged === 'function') chatAuthChanged();
      closeModal();
      if (current === 'profile') drawProfile();
    } catch (e) { note.className = 'form-note bad'; note.textContent = authError(e); }
    save.disabled = false;
  });
  openModal(welcome ? 'আপনার প্রোফাইল' : 'প্রোফাইল এডিট', '', [top, nameBox, userBox, bioBox, mail, note], [save]);
  if (welcome) name.select();
}

async function logOut() {
  try { await acctApi('logout', {}); } catch { /* the cookie is cleared the next time the server answers */ }
  signedOut();
  go('more');
}
// the line under sign-in, with the terms and the privacy policy one tap away (they open in a new tab)
function legalLine() {
  const s = el('span', 'legal-line');
  const a = (href, bn, en) => Object.assign(el('a', null, LANG === 'en' ? en : bn), { href: href + (LANG === 'en' ? '?lang=en' : ''), target: '_blank', rel: 'noopener' });
  if (LANG === 'en') s.append('By signing in you agree to Manzeela’s ', a('terms.html', 'নিয়ম', 'terms'), ' and ', a('privacy.html', 'প্রাইভেসি', 'privacy policy'), '.');
  else s.append('লগইন করলে আপনি Manzeela-র ', a('terms.html', 'নিয়ম', 'terms'), ' ও ', a('privacy.html', 'প্রাইভেসি পলিসি', 'privacy policy'), ' মেনে নিচ্ছেন।');
  return s;
}
function confirmDelete() {
  if (!ME) return;
  const sure = button('check', 'হ্যাঁ, সব মুছে ফেলুন', async () => { try { await acctApi('delete', {}); signedOut(); closeModal(); go('home'); } catch { closeModal(); } });
  openModal('অ্যাকাউন্ট মুছে ফেলবেন?', '', [el('div', 'empty', 'আপনার প্রোফাইল, ফলোয়ার, সব মেসেজ, পয়েন্ট, রেটিং ও সাপোর্টের কথোপকথন চিরতরে মুছে যাবে। এটি ফেরানো যায় না।')], [sure]);
}
const showProfile = person => openProfilePage(person.id);

$('acct-card').addEventListener('click', () => (ME ? openProfilePage(ME.id) : openLogin()));
$('acct-btn').addEventListener('click', () => (ME ? openProfilePage(ME.id) : openLogin()));
if (document.getElementById('hm-acct')) document.getElementById('hm-acct').addEventListener('click', () => (ME ? openProfilePage(ME.id) : openLogin()));
renderAccount();
acctApi('me').then(reply => { if (reply.user) signedIn(reply); }).catch(() => {
  // No server behind this copy of the app (opened as plain files): accounts are not available.
  $('acct-card').hidden = $('acct-btn').hidden = true;
});

// A notice from the people who run the app, shown once at the top of Home until it is closed or changed.
fetch('api/notice').then(r => r.json()).then(({ text, kind, readonly }) => {
  if (readonly && readonly.on) mzReadonly(readonly.message);
  let closed = '';
  try { closed = localStorage.getItem('bdmap.notice') || ''; } catch { /* storage unavailable */ }
  if (!text || text === closed) return;
  const bar = el('div', 'notice' + (kind === 'warn' || kind === 'urgent' ? ' ' + kind : ''));
  const x = el('button', 'icon-btn');
  x.innerHTML = svg('close');
  x.addEventListener('click', () => { bar.remove(); try { localStorage.setItem('bdmap.notice', text); } catch { /* storage unavailable */ } });
  bar.append(Object.assign(el('i'), { innerHTML: svg(kind === 'urgent' || kind === 'warn' ? 'info' : 'bell') }), Object.assign(el('span', 'no-tr'), { textContent: text }), x);
  $('page-home').prepend(bar);
}).catch(() => {});
