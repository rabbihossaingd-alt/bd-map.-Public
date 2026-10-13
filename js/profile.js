// ---- Profiles, following, people search, settings ----
// Every account has a public profile page: picture, name, bio, followers, following, points and the fares the
// person has shared. Following needs no approval; two people who follow each other can message and call.
// Settings (edit profile, language, help, log out, delete) live on their own page, away from the profile.

const PROFILE = { id: null };

async function peopleApi(path) {
  const res = await fetch('api/people/' + path);
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : {};
  if (!res.ok) throw new Error(data.error || 'server');
  return data;
}

function openProfilePage(id) {
  if (!id) { openLogin(); return; }
  PROFILE.id = id;
  if (!$('modal').hidden) closeModal();
  if (current === 'profile') drawProfile(); else go('profile');
}

// One button for the whole follow relationship. `p.relation` is kept up to date so lists redraw correctly.
const FOLLOW_TEXT = { none: 'ফলো করুন', follower: 'ফলো ব্যাক করুন', following: 'ফলো করছেন', mutual: 'বন্ধু' };
function followButton(p, onChange, big) {
  const b = el('button', (big ? 'btn' : 'pill-btn'));
  const paint = () => {
    b.textContent = FOLLOW_TEXT[p.relation] || FOLLOW_TEXT.none;
    b.classList.toggle('quiet', p.relation === 'following' || p.relation === 'mutual');
  };
  paint();
  b.addEventListener('click', async e => {
    e.stopPropagation();
    if (!ME) { openLogin(); return; }
    b.disabled = true;
    const follow = p.relation === 'none' || p.relation === 'follower';
    try {
      await chatApi(follow ? 'friend' : 'unfollow', { id: p.id });
      p.relation = follow ? (p.relation === 'follower' ? 'mutual' : 'following') : (p.relation === 'mutual' ? 'follower' : 'none');
      paint();
      if (typeof loadChat === 'function') loadChat();
      if (onChange) onChange();
    } catch { /* the button keeps its old state */ }
    b.disabled = false;
  });
  return b;
}

function personRow(p) {
  const row = el('div', 'person tap');
  const t = el('div', 't no-tr');
  t.append(el('b', null, p.name), el('span', null, p.bio || ''));
  row.append(avatar(p), t);
  if (p.relation !== 'self') row.appendChild(followButton(p));
  row.addEventListener('click', () => openProfilePage(p.id));
  return row;
}

async function openPeopleList(id, kind) {
  let data;
  try { data = await peopleApi(`list?id=${id}&kind=${kind}`); } catch { return; }
  openModal(kind === 'following' ? 'ফলোয়িং' : 'ফলোয়ার', '', data.people.length ? data.people.map(personRow) : [el('div', 'empty', kind === 'following' ? 'এখনো কাউকে ফলো করেননি।' : 'এখনো কোনো ফলোয়ার নেই।')]);
}

// Find people by name, the way a social app does.
function openPeopleSearch() {
  if (!ME) { openLogin(); return; }
  const input = el('input', 'people-q');
  Object.assign(input, { type: 'search', placeholder: 'নাম লিখুন', autocomplete: 'off', maxLength: 40 });
  const box = el('label', 'filter people-search');
  box.append(ic('search'), input);
  const results = el('div', 'people-results');
  const hint = el('div', 'empty', 'যাঁকে খুঁজছেন তাঁর নামের প্রথম কয়েকটি অক্ষর লিখুন।');
  results.appendChild(hint);
  let timer = null, seq = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim(), mine = ++seq;
    if (q.length < 2) { results.replaceChildren(hint); return; }
    timer = setTimeout(async () => {
      try {
        const { people } = await peopleApi('search?q=' + encodeURIComponent(q));
        if (mine !== seq) return;
        results.replaceChildren(...(people.length ? people.map(personRow) : [el('div', 'empty', 'এই নামে কাউকে পাওয়া যায়নি।')]));
      } catch { if (mine === seq) results.replaceChildren(el('div', 'empty', 'খোঁজা যায়নি। একটু পরে আবার চেষ্টা করুন।')); }
    }, 220);
  });
  openModal('মানুষ খুঁজুন', 'নাম দিয়ে', [box, results]);
  input.focus();
}

async function drawProfile() {
  const box = $('prof');
  const id = PROFILE.id || (ME && ME.id);
  if (!id) {
    const gate = el('div', 'chat-gate');
    gate.append(el('h2', null, 'আপনার প্রোফাইল'), el('p', null, 'প্রোফাইল দেখতে ও সাজাতে লগইন করুন।'), button('user', 'লগইন করুন', openLogin));
    box.replaceChildren(gate);
    return;
  }
  let d;
  try { d = await peopleApi('profile?id=' + id); }
  catch { box.replaceChildren(el('div', 'empty', 'প্রোফাইলটি পাওয়া যায়নি।')); return; }
  if ((PROFILE.id || (ME && ME.id)) !== id) return;
  const u = d.user, mine = u.relation === 'self';
  const iconBtn = (icon, title, fn) => { const b = el('button', 'icon-btn'); b.innerHTML = svg(icon); b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', fn); return b; };

  // The bar across the top: where you are, and (on your own profile) the way to Settings.
  const bar = el('div', 'prof-bar');
  bar.appendChild(el('span', 'no-tr', mine ? ME.email : ''));
  if (mine) bar.append(iconBtn('plus', 'নতুন পোস্ট', openNewPost), iconBtn('cog', 'সেটিংস', () => go('settings')));
  else bar.prepend(iconBtn('back', 'ফিরে যান', () => history.back()));

  const card = el('div', 'card prof-card');
  const pic = el(mine ? 'button' : 'div', 'prof-pic');
  pic.appendChild(avatar(u, 'xl'));
  if (mine) { pic.title = 'ছবি বদলান'; pic.addEventListener('click', () => openProfile()); }
  const stats = el('div', 'prof-stats');
  const stat = (value, label, fn) => { const b = el('button', 'stat'); b.append(el('b', null, num(value)), el('span', null, label)); if (fn) b.addEventListener('click', fn); stats.appendChild(b); };
  stat(d.posts, 'পোস্ট');
  stat(d.followers, 'ফলোয়ার', () => openPeopleList(u.id, 'followers'));
  stat(d.following, 'ফলোয়িং', () => openPeopleList(u.id, 'following'));
  const top = el('div', 'prof-top');
  top.append(pic, stats);

  const info = el('div', 'prof-info');
  const bio = el('p', 'no-tr', u.bio || '');
  if (mine && !u.bio) { bio.className = 'dim'; bio.textContent = 'নিজের সম্পর্কে এক-দুই লাইন লিখুন।'; }
  const chips = el('div', 'chips');
  const points = el('button', 'chip points');
  points.innerHTML = svg('star');
  points.appendChild(document.createTextNode(`${num(u.points)} পয়েন্ট`));
  points.addEventListener('click', () => go('community'));
  chips.appendChild(points);
  if (d.rank && d.rank <= 50) chips.appendChild(el('span', 'chip rank-chip', `লিডারবোর্ডে ${num(d.rank)} নম্বরে`));
  info.append(el('h2', 'no-tr', u.name), bio, chips);

  const actions = el('div', 'prof-actions');
  if (mine) actions.append(button('edit', 'প্রোফাইল এডিট', () => openProfile(), true), button('plus', 'নতুন পোস্ট', openNewPost));
  else {
    actions.appendChild(followButton(u, drawProfile, true));
    if (u.relation === 'mutual') actions.appendChild(button('chat', 'মেসেজ', () => { go('chat'); openThread(u.id); }, true));
    else if (u.relation === 'following') actions.appendChild(el('span', 'prof-hint', 'তিনি ফলো ব্যাক করলে মেসেজ করা যাবে'));
  }
  card.append(top, info, actions);

  // Two tabs, as on any profile: what they posted, and the fares they shared.
  const tabs = el('div', 'prof-tabs'), pane = el('div', 'prof-pane');
  const show = which => {
    for (const t of tabs.children) t.classList.toggle('on', t.dataset.tab === which);
    if (which === 'posts') postGrid(pane, u.id, mine ? 'এখনো কিছু পোস্ট করেননি। ঘুরে আসা জায়গার একটি ছবি দিন।' : 'এখনো কোনো পোস্ট নেই।');
    else {
      const rows = d.fares.map(f => { const row = item(FARE_MODE_ICONS[f.mode], `${f.from} → ${f.to}`, FARE_MODE_NAMES[f.mode], taka(f.fare)); row.querySelector('.t b').classList.add('no-tr'); return row; });
      const none = el('div', 'prof-none');
      none.append(ic('tag'), el('b', null, 'এখনো কোনো ভাড়া জানানো হয়নি'));
      if (mine) none.appendChild(button('star', 'প্রথম ভাড়াটি জানান', () => go('community')));
      pane.replaceChildren(...(rows.length ? rows : [none]));
    }
  };
  for (const [which, icon, text] of [['posts', 'grid', 'পোস্ট'], ['fares', 'tag', `জানানো ভাড়া · ${num(d.fares.length)}`]]) {
    const t = el('button');
    t.dataset.tab = which;
    t.innerHTML = svg(icon);
    t.appendChild(el('span', null, text));
    t.addEventListener('click', () => show(which));
    tabs.appendChild(t);
  }
  box.replaceChildren(bar, card, tabs, pane);
  show('posts');
}

// ---- settings ----
(function initSettings() {
  $('set-edit').addEventListener('click', () => (ME ? openProfile() : openLogin()));
  $('set-logout').addEventListener('click', logOut);
  $('set-delete').addEventListener('click', confirmDelete);
  $('people-open').addEventListener('click', openPeopleSearch);
  enter.profile = drawProfile;
  enter.settings = () => {
    for (const e of document.querySelectorAll('[data-needs-login]')) e.hidden = !ME;
    $('set-email').textContent = ME ? ME.email : 'লগইন করা নেই';
    $('set-email').classList.toggle('no-tr', !!ME);
  };
  if (current === 'profile') drawProfile();
  if (current === 'settings') enter.settings();
})();
