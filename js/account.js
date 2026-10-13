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
const AVATAR_HUES = [158, 200, 262, 330, 24, 48, 96, 222];
function avatar(person, cls = '') {
  const a = el('span', 'avatar no-tr ' + cls);
  if (person.pic) {
    const img = el('img');
    img.alt = '';
    img.src = `api/avatar/${person.id}?v=${person.pic}`;
    a.appendChild(img);
  } else {
    a.textContent = [...(person.name || '?').trim()][0] || '?';
    const hue = AVATAR_HUES[(person.id || 0) % AVATAR_HUES.length];
    a.style.background = `linear-gradient(135deg, hsl(${hue} 70% 46%), hsl(${(hue + 34) % 360} 76% 56%))`;
  }
  return a;
}

function renderAccount() {
  const card = $('acct-card');
  card.querySelector('.ic').replaceChildren(...(ME ? [avatar(ME)] : [Object.assign(el('i'), { innerHTML: svg('user') })]));
  card.querySelector('b').textContent = ME ? ME.name : 'লগইন করুন';
  card.querySelector('b').classList.toggle('no-tr', !!ME);
  card.querySelector('.t span').textContent = ME ? (ME.bio || ME.email) : 'প্রোফাইল, মেসেজ ও সাপোর্ট পেতে';
  card.querySelector('.t span').classList.toggle('no-tr', !!ME);
  const btn = $('acct-btn');
  btn.replaceChildren(ME ? avatar(ME, 'xs') : Object.assign(el('i'), { innerHTML: svg('user') }), Object.assign(el('span', ME ? 'no-tr' : ''), { textContent: ME ? ME.name : 'লগইন' }));
  for (const a of document.querySelectorAll('[data-admin-link]')) a.hidden = !ME || ME.role === 'user';
}

// Recent trips: on login the device's list and the account's are merged; after that every change is sent up.
function syncAccount() {
  if (ME) acctApi('data', { data: { recent: loadRecent() } }).catch(() => {});
}
function signedIn(reply) {
  ME = reply.user;
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
  renderAccount();
  loadRatings();
  loadFareReports();
  if (typeof chatAuthChanged === 'function') chatAuthChanged();
  if (typeof supportAuthChanged === 'function') supportAuthChanged();
  if (current === 'home' && enter.home) enter.home();
  if (typeof drawProfile === 'function' && current === 'profile') { if (!ME) PROFILE.id = null; drawProfile(); }
  if (enter.settings && current === 'settings') enter.settings();
}

function field(label, attrs, tag = 'input') {
  const input = el(tag);
  Object.assign(input, attrs);
  const wrap = el('label', 'money');
  wrap.append(el('span', null, label), input);
  return [wrap, input];
}

// Step 1: the address. Step 2: the six-digit code that was sent to it.
function openLogin() {
  const [emailBox, email] = field('আপনার ই-মেইল', { type: 'email', autocomplete: 'email', inputMode: 'email', placeholder: 'name@gmail.com', maxLength: 120 });
  const note = el('div', 'form-note', 'এই ঠিকানায় ৬ সংখ্যার একটি কোড যাবে। পাসওয়ার্ড লাগে না।');
  const go = button('send', 'কোড পাঠান', async () => {
    go.disabled = true;
    try {
      const reply = await acctApi('code', { email: email.value });
      openCode(email.value.trim(), reply.devCode);
    } catch (e) {
      go.disabled = false;
      note.className = 'form-note bad';
      note.textContent = acctError(e);
    }
  });
  email.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
  openModal('লগইন', 'ই-মেইলে আসা কোড দিয়ে', [emailBox, note], [go]);
  email.focus();
}

function openCode(email, devCode) {
  const [codeBox, code] = field('৬ সংখ্যার কোড', { type: 'text', inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 6, placeholder: '• • • • • •' });
  code.classList.add('code-input');
  const note = el('div', 'form-note', 'ই-মেইল না পেলে স্প্যাম ফোল্ডার দেখুন। কোড ১০ মিনিট চলবে।');
  if (devCode) {
    // Only ever sent by a server running on this same computer with no mail account set up.
    note.textContent = `এই কম্পিউটারে ই-মেইল সেটআপ করা নেই, তাই পরীক্ষার কোড এখানে দেখানো হলো: ${devCode}`;
    note.classList.add('no-tr');
  }
  const again = el('button', 'text-btn', 'অন্য ই-মেইল দিন');
  again.addEventListener('click', openLogin);
  const go = button('check', 'যাচাই করুন', async () => {
    go.disabled = true;
    try {
      const reply = await acctApi('verify', { email, code: code.value, device: deviceId() });
      signedIn(reply);
      closeModal();
      if (reply.isNew) openProfile(true);
    } catch (e) {
      go.disabled = false;
      note.className = 'form-note bad';
      note.textContent = acctError(e);
    }
  });
  code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, ''); if (code.value.length === 6) go.click(); });
  code.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
  openModal('কোড দিন', email, [codeBox, note, again], [go]);
  $('m-sub').classList.add('no-tr');
  code.focus();
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
  const [bioBox, bio] = field('বায়ো — নিজের সম্পর্কে এক-দুই লাইন', { rows: 2, maxLength: 160, value: ME.bio, placeholder: 'যেমন: ঢাকায় থাকি, ঘুরতে ভালোবাসি' }, 'textarea');
  const mail = el('div', 'form-note no-tr', ME.email);

  const save = button('check', 'সেভ করুন', async () => {
    save.disabled = true;
    try {
      ME = (await acctApi('profile', { name: name.value, bio: bio.value })).user;
      renderAccount();
      if (typeof chatAuthChanged === 'function') chatAuthChanged();
      closeModal();
      if (current === 'profile') drawProfile();
    } catch (e) { fail(e); }
    save.disabled = false;
  });
  openModal(welcome ? 'আপনার প্রোফাইল' : 'প্রোফাইল এডিট', '', [top, nameBox, bioBox, mail, note], [save]);
  if (welcome) name.select();
}

async function logOut() {
  try { await acctApi('logout', {}); } catch { /* the cookie is cleared the next time the server answers */ }
  signedOut();
  go('more');
}
function confirmDelete() {
  if (!ME) return;
  const sure = button('check', 'হ্যাঁ, সব মুছে ফেলুন', async () => { try { await acctApi('delete', {}); signedOut(); closeModal(); go('home'); } catch { closeModal(); } });
  openModal('অ্যাকাউন্ট মুছে ফেলবেন?', '', [el('div', 'empty', 'আপনার প্রোফাইল, ফলোয়ার, সব মেসেজ, পয়েন্ট, রেটিং ও সাপোর্টের কথোপকথন চিরতরে মুছে যাবে। এটি ফেরানো যায় না।')], [sure]);
}
const showProfile = person => openProfilePage(person.id);

$('acct-card').addEventListener('click', () => (ME ? openProfilePage(ME.id) : openLogin()));
$('acct-btn').addEventListener('click', () => (ME ? openProfilePage(ME.id) : openLogin()));
renderAccount();
acctApi('me').then(reply => { if (reply.user) signedIn(reply); }).catch(() => {
  // No server behind this copy of the app (opened as plain files): accounts are not available.
  $('acct-card').hidden = $('acct-btn').hidden = true;
});

// A notice from the people who run the app, shown once at the top of Home until it is closed or changed.
fetch('api/notice').then(r => r.json()).then(({ text }) => {
  let closed = '';
  try { closed = localStorage.getItem('bdmap.notice') || ''; } catch { /* storage unavailable */ }
  if (!text || text === closed) return;
  const bar = el('div', 'notice');
  const x = el('button', 'icon-btn');
  x.innerHTML = svg('close');
  x.addEventListener('click', () => { bar.remove(); try { localStorage.setItem('bdmap.notice', text); } catch { /* storage unavailable */ } });
  bar.append(Object.assign(el('i'), { innerHTML: svg('bell') }), Object.assign(el('span', 'no-tr'), { textContent: text }), x);
  $('page-home').prepend(bar);
}).catch(() => {});
