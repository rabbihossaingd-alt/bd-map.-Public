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
  const t = el('div', 't');
  t.append(nameEl(p), Object.assign(el('span', 'no-tr'), { textContent: p.bio || '' }));
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
  const handle = el('span', 'prof-handle no-tr');
  handle.textContent = u.username ? u.username : '';
  if (isVerified(u)) handle.appendChild(vbadge());
  bar.appendChild(handle);
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
  info.append(nameEl(u, 'h2'), bio, chips);

  const actions = el('div', 'prof-actions');
  if (mine) actions.append(button('edit', 'প্রোফাইল এডিট', () => openProfile(), true), button('plus', 'নতুন পোস্ট', openNewPost));
  else {
    actions.appendChild(followButton(u, drawProfile, true));
    actions.appendChild(button('chat', 'মেসেজ', () => openThreadWith(u), true));
  }
  card.append(top, info, actions);
  // On your own profile, a line into the dashboard, the way a creator account shows it.
  if (mine) {
    const dash = el('button', 'prof-dash');
    dash.append(ic('chart'), el('span', 't'), ic('chev'));
    dash.querySelector('.t').append(el('b', null, 'প্রফেশনাল ড্যাশবোর্ড'), el('em', null, 'আপনার পোস্টের ভিউ, লাইক আর নতুন ফলোয়ার'));
    dash.addEventListener('click', () => go('insights'));
    card.appendChild(dash);
  }

  // Two tabs, as on any profile: what they posted, and the fares they shared.
  const tabs = el('div', 'prof-tabs'), pane = el('div', 'prof-pane');
  const show = which => {
    for (const t of tabs.children) t.classList.toggle('on', t.dataset.tab === which);
    if (which === 'posts') postGrid(pane, u.id, mine ? 'এখনো কিছু পোস্ট করেননি। ঘুরে আসা জায়গার একটি ছবি দিন।' : 'এখনো কোনো পোস্ট নেই।');
    else if (which === 'saved') postGrid(pane, 0, 'এখনো কিছু সেভ করেননি। পোস্টের নিচের বুকমার্ক চিহ্নে চাপ দিন।', '', true);
    else {
      const rows = d.fares.map(f => { const row = item(FARE_MODE_ICONS[f.mode], `${f.from} → ${f.to}`, FARE_MODE_NAMES[f.mode], taka(f.fare)); row.querySelector('.t b').classList.add('no-tr'); return row; });
      const none = el('div', 'prof-none');
      none.append(ic('tag'), el('b', null, 'এখনো কোনো ভাড়া জানানো হয়নি'));
      if (mine) none.appendChild(button('star', 'প্রথম ভাড়াটি জানান', () => go('community')));
      pane.replaceChildren(...(rows.length ? rows : [none]));
    }
  };
  for (const [which, icon, text] of [['posts', 'grid', 'পোস্ট'], ...(mine ? [['saved', 'bookmark', 'সেভ করা']] : []), ['fares', 'tag', `ভাড়া · ${num(d.fares.length)}`]]) {
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

// ---- the professional dashboard ----
// What happened to your posts: views (a post counts as seen once half of it was on screen), likes, comments,
// saves and new followers, day by day for the last 14 days, and your best posts.
async function drawInsights() {
  const box = $('dash');
  if (!ME) {
    const gate = el('div', 'chat-gate');
    gate.append(el('h2', null, 'প্রফেশনাল ড্যাশবোর্ড'), el('p', null, 'আপনার পোস্ট কেমন যাচ্ছে দেখতে লগইন করুন।'), button('user', 'লগইন করুন', openLogin));
    box.replaceChildren(gate);
    return;
  }
  box.replaceChildren(el('div', 'skeleton'), el('div', 'skeleton'));
  let d;
  try { d = await peopleApi('insights'); } catch { box.replaceChildren(el('div', 'empty', 'ড্যাশবোর্ড দেখানো যায়নি। একটু পরে আবার চেষ্টা করুন।')); return; }
  const head = el('div', 'dash-head');
  const back = el('button', 'icon-btn');
  back.innerHTML = svg('back');
  back.setAttribute('aria-label', 'ফিরে যান');
  back.addEventListener('click', () => history.length > 1 ? history.back() : go('profile'));
  const ht = el('div', 't');
  ht.append(el('h2', null, 'প্রফেশনাল ড্যাশবোর্ড'), el('span', null, 'গত ১৪ দিন'));
  head.append(back, ht);

  const who = el('div', 'card dash-who');
  const wt = el('div', 't');
  wt.append(nameEl({ ...ME, verified: d.verified }), el('span', null, d.verified ? 'ভেরিফায়েড অ্যাকাউন্ট' : `${num(d.points)} পয়েন্ট · ${num(d.fares)}টি ভাড়া জানিয়েছেন`));
  who.append(avatar(ME, 'lg'), wt, button('user', 'প্রোফাইল', () => openProfilePage(ME.id), true));

  const sum = arr => arr.reduce((a, b) => a + b, 0);
  const kpis = el('div', 'kpis');
  for (const [icon, label, value, sub] of [
    ['eye', tx('ভিউ', 'Views'), d.views, 'সব পোস্ট মিলিয়ে'], ['heart', tx('লাইক', 'Likes'), d.likes, `গত ১৪ দিনে ${num(sum(d.series.likes))}`],
    ['chat', tx('মন্তব্য', 'Comments'), d.comments, `গত ১৪ দিনে ${num(sum(d.series.comments))}`], ['bookmark', tx('সেভ', 'Saves'), d.saves, 'অন্যরা সেভ করেছেন'],
    ['users', tx('ফলোয়ার', 'Followers'), d.followers, `গত ১৪ দিনে +${num(sum(d.series.followers))}`], ['grid', tx('পোস্ট', 'Posts'), d.posts, `${num(d.following)} জনকে ফলো করছেন`]]) {
    const k = el('div', 'kpi');
    k.append(ic(icon), el('b', null, num(value)), el('span', null, label), el('em', null, sub));
    kpis.appendChild(k);
  }

  // The chart: one bar a day.
  const chart = el('div', 'card dash-chart');
  const seg = el('div', 'seg');
  const total = el('div', 'dash-total');
  const bars = el('div', 'bars');
  const axis = el('div', 'axis');
  const show = which => {
    for (const b of seg.children) b.classList.toggle('on', b.dataset.k === which);
    const data = d.series[which], max = Math.max(1, ...data);
    total.replaceChildren(el('b', null, num(sum(data))), el('span', null, { likes: 'লাইক, গত ১৪ দিনে', comments: 'মন্তব্য, গত ১৪ দিনে', followers: 'নতুন ফলোয়ার, গত ১৪ দিনে' }[which]));
    bars.replaceChildren(...data.map((n, i) => {
      const b = el('div', 'bar' + (i === data.length - 1 ? ' today' : ''));
      b.style.setProperty('--h', Math.round(n / max * 100) + '%');
      b.title = num(n);
      if (n) b.appendChild(el('span', null, num(n)));
      return b;
    }));
  };
  for (const [k, label] of [['likes', tx('লাইক', 'Likes')], ['comments', tx('মন্তব্য', 'Comments')], ['followers', tx('ফলোয়ার', 'Followers')]]) {
    const b = el('button', null, label);
    b.dataset.k = k;
    b.addEventListener('click', () => show(k));
    seg.appendChild(b);
  }
  const dayName = back => { const x = new Date(Date.now() - back * 864e5); return x.toLocaleDateString(NUM_LOCALE, { day: 'numeric', month: 'short' }); };
  axis.append(el('span', null, dayName(13)), el('span', null, dayName(7)), el('span', null, LANG === 'en' ? 'Today' : 'আজ'));
  chart.append(seg, total, bars, axis);
  show('likes');

  const topLabel = el('div', 'label', 'সবচেয়ে ভালো যাচ্ছে যে পোস্টগুলো');
  const top = el('div', 'post-grid dash-top');
  for (const p of d.top) {
    const tile = postTile(p, drawInsights, ME.id);
    const stat = el('span', 'dash-stat');
    stat.append(ic('eye'), document.createTextNode(num(p.views)));
    tile.appendChild(stat);
    top.appendChild(tile);
  }
  let topBlock = top;
  if (!d.top.length) {
    topBlock = el('div', 'prof-none');
    topBlock.append(ic('image'), el('b', null, 'এখনো কোনো পোস্ট নেই'), button('plus', 'প্রথম পোস্টটি দিন', openNewPost));
  }

  const tools = el('div', 'card menu');
  const tool = (icon, title, sub, fn) => { const b = el('button'); b.innerHTML = `<i class="mi soft">${svg(icon)}</i>`; const sp = el('span'); sp.append(el('b', null, title), el('em', null, sub)); b.append(sp, ic('chev')); b.addEventListener('click', fn); tools.appendChild(b); };
  tool('plus', 'নতুন পোস্ট', 'ছবি, ভিডিও বা শুধু লেখা', openNewPost);
  tool('star', 'পয়েন্ট বাড়ান', `ভাড়া জানালে প্রতিবার ${num(10)} পয়েন্ট · এখন ${num(d.points)}`, () => go('community'));
  tool('verified', 'ভেরিফায়েড ব্যাজ', d.verified ? 'আপনার অ্যাকাউন্ট ভেরিফায়েড' : 'কীভাবে পাবেন, আবেদন করুন', openVerifyInfo);

  const money = el('div', 'money-wrap');
  drawMoney(money);
  box.replaceChildren(head, who, kpis, chart, topLabel, topBlock, el('div', 'label', 'মনিটাইজেশন'), money, el('div', 'label', 'টুলস'), tools,
    el('div', 'form-note dash-note', 'ভিউ আর দিনভিত্তিক লাইক গোনা এই সুবিধা চালুর পর থেকে শুরু হয়েছে, তাই আগের পোস্টে সংখ্যা কম দেখাতে পারে।'));
}

// ---- the creator program: who can earn, the balance, and paying it out ----
// Earnings are added by the BD Map team (a creator bonus, a share of a sponsorship, a prize); the app takes no
// money from anyone. A payout goes to a bKash, Nagad or Rocket number and is marked with its transaction ID.
const WALLET_NAMES = { bkash: 'বিকাশ', nagad: 'নগদ', rocket: 'রকেট' };
const PAYOUT_STATUS = { pending: 'অপেক্ষায়', paid: 'পাঠানো হয়েছে', rejected: 'বাতিল' };
async function creatorApi(path, body) {
  const res = await fetch('api/creator/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : {};
  if (!res.ok) throw new Error(data.error || 'server');
  return data;
}
async function drawMoney(box) {
  box.replaceChildren(el('div', 'skeleton'));
  let d;
  try { d = await creatorApi('me'); } catch { box.replaceChildren(el('div', 'empty', 'দেখানো যায়নি।')); return; }
  const card = el('div', 'card money-card');
  const head = el('div', 'mc-head');
  const ht = el('div', 't');
  ht.append(el('b', null, 'ক্রিয়েটর প্রোগ্রাম'), el('span', null, d.status === 'approved' ? 'আপনি এখন আয় করতে পারেন' : 'নিয়মিত ভালো পোস্ট আর আসল ভাড়া জানিয়ে আয় করুন'));
  head.append(ic('wallet'), ht);
  if (d.status) head.appendChild(el('span', 'mc-tag ' + d.status, { applied: 'যাচাই হচ্ছে', approved: 'চালু', rejected: 'গৃহীত হয়নি' }[d.status] || ''));
  card.appendChild(head);

  if (d.status !== 'approved') {
    const st = d.standing, r = st.rules;
    const step = (done, label, have) => {
      const row = el('div', 'mc-step' + (done ? ' done' : ''));
      const bar = el('span', 'mc-bar');
      bar.style.setProperty('--p', Math.min(1, have).toFixed(3));
      const tt = el('span', 't');
      tt.append(el('b', null, label), bar);
      row.append(el('i', 'mc-tick'), tt);
      return row;
    };
    card.append(
      step(st.followers >= r.followers, `${num(st.followers)} / ${num(r.followers)} ফলোয়ার`, r.followers ? st.followers / r.followers : 1),
      step(st.posts >= r.posts, `${num(st.posts)} / ${num(r.posts)} পোস্ট`, r.posts ? st.posts / r.posts : 1),
      step(!st.reports, st.reports ? 'আপনার বিরুদ্ধে খোলা রিপোর্ট আছে' : 'কোনো খোলা রিপোর্ট নেই', st.reports ? 0 : 1));
    const apply = button('send', d.status === 'applied' ? 'আবেদন জমা আছে' : 'আবেদন করুন', async () => {
      apply.disabled = true;
      try { await creatorApi('apply', {}); drawMoney(box); } catch { apply.disabled = false; }
    });
    apply.disabled = d.status === 'applied' || !st.eligible;
    card.append(apply, el('div', 'form-note', d.status === 'applied' ? 'BD Map টিম আপনার প্রোফাইল দেখে জানাবে।'
      : d.status === 'rejected' ? 'আগের আবেদনটি গৃহীত হয়নি। প্রোফাইল ঠিক করে আবার আবেদন করতে পারেন।' : 'শর্ত পূরণ হলে আবেদন করা যাবে। অনুমোদনের পর থেকে আয় যোগ হবে।'));
    box.replaceChildren(card);
    return;
  }

  const m = d.money, r = d.standing.rules;
  const bal = el('div', 'mc-balance');
  bal.append(el('span', null, 'তোলা যাবে'), el('b', null, taka(m.balance)));
  const split = el('div', 'mc-split');
  for (const [label, v] of [['মোট আয়', m.earned], ['পেয়েছেন', m.paid], ['অপেক্ষায়', m.pending]]) { const x = el('div'); x.append(el('b', null, taka(v)), el('span', null, label)); split.appendChild(x); }
  const out = button('wallet', 'টাকা তুলুন', () => openPayout(m, r, () => drawMoney(box)));
  out.disabled = m.balance < r.payoutMin || m.pending > 0;
  card.append(bal, split, out, el('div', 'form-note', m.pending ? 'একটি অনুরোধ অপেক্ষায় আছে। সেটি পাঠানো হলে আবার তোলা যাবে।'
    : m.balance < r.payoutMin ? `কমপক্ষে ${taka(r.payoutMin)} হলে তোলা যায়।` : 'বিকাশ, নগদ বা রকেটে পাঠানো হয়।'));

  // The history: what came in, what went out.
  const rows = [
    ...d.earnings.map(e => ({ t: e.created, icon: 'plus', title: e.note, sub: dayOf(e.created), amount: '+' + taka(e.amount), cls: 'in' })),
    ...d.payouts.map(p => ({ t: p.created, icon: 'wallet', title: `${WALLET_NAMES[p.method]} · ${p.account.slice(0, 3)}••••${p.account.slice(-3)}`,
      sub: `${PAYOUT_STATUS[p.status]}${p.ref ? ' · লেনদেন ' + p.ref : ''}${p.status === 'rejected' && p.note ? ' · ' + p.note : ''} · ${dayOf(p.created)}`, amount: '−' + taka(p.amount), cls: p.status, id: p.id }))
  ].sort((a, b) => b.t - a.t);
  const hist = el('div', 'mc-hist');
  hist.appendChild(el('div', 'label', 'লেনদেন'));
  for (const x of rows) {
    const row = el('div', 'mc-row ' + x.cls);
    const tt = el('div', 't');
    tt.append(Object.assign(el('b', 'no-tr'), { textContent: x.title }), el('span', null, x.sub));
    row.append(ic(x.icon), tt, el('b', 'amt', x.amount));
    if (x.cls === 'pending') {
      const c = el('button', 'pill-btn quiet', 'বাতিল');
      c.addEventListener('click', async () => { c.disabled = true; await creatorApi('cancel', { id: x.id }).catch(() => {}); drawMoney(box); });
      row.appendChild(c);
    }
    hist.appendChild(row);
  }
  if (!rows.length) hist.appendChild(el('div', 'empty', 'এখনো কোনো লেনদেন নেই।'));
  box.replaceChildren(card, hist);
}
function openPayout(m, r, done) {
  let method = 'bkash';
  const chips = el('div', 'chips wallets');
  for (const [k, label] of Object.entries(WALLET_NAMES)) {
    const c = el('button', 'chip' + (k === method ? ' on' : ''), label);
    c.addEventListener('click', () => { method = k; for (const x of chips.children) x.classList.toggle('on', x === c); });
    chips.appendChild(c);
  }
  const [amountBox, amount] = field(`কত টাকা (${taka(r.payoutMin)} – ${taka(m.balance)})`, { type: 'number', inputMode: 'numeric', min: r.payoutMin, max: m.balance, value: m.balance, step: 1 });
  const [numBox, account] = field('ওয়ালেটের নম্বর (নিজের নামে)', { type: 'tel', inputMode: 'tel', placeholder: '01XXXXXXXXX', maxLength: 16, autocomplete: 'off' });
  const note = el('div', 'form-note', 'নম্বরটি শুধু BD Map টিম দেখবে। ভুল নম্বরে গেলে টাকা ফেরানো কঠিন — দুবার দেখে নিন।');
  const send = button('send', 'অনুরোধ পাঠান', async () => {
    send.disabled = true;
    try { await creatorApi('payout', { amount: Number(amount.value), method, account: account.value }); closeModal(); done(); }
    catch (e) {
      send.disabled = false;
      note.className = 'form-note bad';
      note.textContent = e.message === 'account' ? 'নম্বরটি ঠিক নয় — ০১ দিয়ে শুরু ১১ সংখ্যার নম্বর দিন।' : e.message === 'amount' ? `${taka(r.payoutMin)} থেকে ${taka(m.balance)}-এর মধ্যে লিখুন।`
        : e.message === 'pending' ? 'আগের একটি অনুরোধ এখনো অপেক্ষায়।' : 'অনুরোধ পাঠানো যায়নি।';
    }
  });
  openModal('টাকা তুলুন', `তোলা যাবে ${taka(m.balance)}`, [el('div', 'info-label', 'কোথায় পাঠাব'), chips, amountBox, numBox, note], [send]);
}

// How the badge is given. It is not sold: the team gives it to real, active accounts.
function openVerifyInfo() {
  if (ME && ME.verified) { openModal('আপনার অ্যাকাউন্ট ভেরিফায়েড', 'নামের পাশে নীল ব্যাজটি সবাই দেখতে পান।', [el('div', 'form-note', 'ব্যাজ টিকিয়ে রাখতে নিয়ম মেনে চলুন। ভুয়া তথ্য বা প্রতারণা পেলে ব্যাজ সরিয়ে নেওয়া হয়।')]); return; }
  const list = el('ul', 'verify-list');
  for (const line of ['প্রোফাইলে আপনার আসল নাম ও নিজের ছবি', 'অন্তত কয়েকটি পোস্ট বা জানানো ভাড়া', 'কোনো রিপোর্ট বা নিয়ম ভাঙা নেই', 'দোকান, পরিবহন বা ট্যুর কোম্পানি হলে তার পরিচয়ের প্রমাণ'])
    list.appendChild(el('li', null, line));
  const apply = button('send', 'আবেদন করুন', () => { closeModal(); openNewTicket('verify'); });
  openModal('ভেরিফায়েড ব্যাজ', 'ব্যাজ কেনা যায় না — BD Map টিম যাচাই করে দেয়।', [el('div', 'form-note', 'যা দেখা হয়:'), list], [apply]);
}

// ---- security: two-step verification and where the account is signed in ----
// The QR code is drawn in the browser by a small library loaded only when it is needed; the secret never leaves
// this page except to the server that made it.
let qrLib = null;
function loadQr() {
  if (qrLib) return qrLib;
  qrLib = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    s.onload = () => resolve(window.qrcode);
    s.onerror = () => { qrLib = null; reject(new Error('qr')); };
    document.head.appendChild(s);
  });
  return qrLib;
}
async function openTwoStep() {
  if (!ME) { openLogin(); return; }
  let info = {};
  try { info = await acctApi('sessions'); } catch { /* shown as off */ }
  if (info.twofa) {
    const [box, code] = field('অ্যাপের ৬ সংখ্যার কোড বা একটি ব্যাকআপ কোড', { type: 'text', maxLength: 11, autocomplete: 'one-time-code' });
    const note = el('div', 'form-note');
    const off = button('close', 'বন্ধ করুন', async () => {
      try { ME = (await acctApi('2fa-disable', { code: code.value })).user; closeModal(); if (enter.settings) enter.settings(); }
      catch { note.className = 'form-note bad'; note.textContent = 'কোডটি মিলছে না।'; }
    }, true);
    const state = el('div', 'sec-state on');
    state.append(ic('shield'), el('b', null, 'টু-স্টেপ ভেরিফিকেশন চালু আছে'), el('span', null, `নতুন ডিভাইসে লগইন করতে ই-মেইলের কোডের পর অ্যাপের কোডও লাগবে। ব্যাকআপ কোড বাকি: ${num(info.backupLeft || 0)}টি`));
    openModal('টু-স্টেপ ভেরিফিকেশন', '', [state, el('div', 'info-label', 'বন্ধ করতে কোড দিন'), box, note], [off]);
    return;
  }
  const intro = el('div', 'sec-intro');
  intro.append(Object.assign(el('div', 'sec-hero'), { innerHTML: svg('shield') }),
    el('b', null, 'অ্যাকাউন্টে আরেকটি তালা দিন'),
    el('p', null, 'কেউ আপনার ই-মেইলে ঢুকে গেলেও আপনার ফোনের অথেন্টিকেটর অ্যাপের কোড ছাড়া BD Map-এ লগইন করতে পারবে না।'));
  const steps = el('ol', 'sec-steps');
  for (const t of ['ফোনে Google Authenticator, Microsoft Authenticator বা 2FAS অ্যাপ নিন', 'অ্যাপে QR কোডটি স্ক্যান করুন (বা কী-টি লিখে দিন)', 'অ্যাপে আসা ৬ সংখ্যার কোড এখানে দিন']) steps.appendChild(el('li', null, t));
  const start = button('shield', 'শুরু করুন', setup);
  openModal('টু-স্টেপ ভেরিফিকেশন', '', [intro, steps], [start]);

  async function setup() {
    start.disabled = true;
    let s;
    try { s = await acctApi('2fa-setup', {}); } catch { start.disabled = false; return; }
    const qr = el('div', 'sec-qr');
    qr.appendChild(el('div', 'skeleton'));
    loadQr().then(make => {
      const q = make(0, 'M');
      q.addData(s.uri);
      q.make();
      qr.innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    }).catch(() => { qr.replaceChildren(el('div', 'form-note', 'QR দেখানো যায়নি — নিচের কী-টি অ্যাপে লিখে দিন।')); });
    const key = el('button', 'sec-key no-tr', s.secret.match(/.{1,4}/g).join(' '));
    key.title = 'কপি করুন';
    key.addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(s.secret); key.classList.add('copied'); setTimeout(() => key.classList.remove('copied'), 1200); });
    const openApp = el('a', 'text-btn', 'এই ফোনেই অথেন্টিকেটর অ্যাপ খুলুন');
    openApp.href = s.uri;
    const note = el('div', 'form-note');
    const boxes = codeBoxes(async code => {
      try {
        const r = await acctApi('2fa-enable', { code });
        ME = { ...ME, twofa: true };
        showBackup(r.codes);
      } catch { note.className = 'form-note bad'; note.textContent = 'কোডটি মিলছে না। অ্যাপে নতুন কোড এলে আবার দিন।'; boxes.clear(); }
    });
    openModal('অ্যাপ যুক্ত করুন', 'স্ক্যান করুন, তারপর কোড দিন', [qr, el('div', 'info-label', 'স্ক্যান না হলে এই কী'), key, openApp, el('div', 'info-label', 'অ্যাপের ৬ সংখ্যার কোড'), boxes, note]);
    boxes.focus();
  }
  function showBackup(codes) {
    const list = el('div', 'sec-codes no-tr');
    for (const c of codes) list.appendChild(el('span', null, c));
    const copy = button('copy', 'কপি করুন', () => { navigator.clipboard && navigator.clipboard.writeText(codes.join('\n')); copy.lastChild.textContent = 'কপি হয়েছে'; }, true);
    const save = button('file', 'ফাইলে রাখুন', () => {
      const a = el('a');
      a.href = URL.createObjectURL(new Blob([`BD Map — ব্যাকআপ কোড (${ME.email})\nপ্রতিটি কোড একবারই চলে।\n\n${codes.join('\n')}\n`], { type: 'text/plain' }));
      a.download = 'bdmap-backup-codes.txt';
      a.click();
    }, true);
    const done = button('check', 'রেখেছি', () => { closeModal(); if (enter.settings) enter.settings(); });
    const state = el('div', 'sec-state on');
    state.append(ic('shield'), el('b', null, 'চালু হয়েছে'), el('span', null, 'ফোন হারালে এই কোডগুলো দিয়ে লগইন করা যাবে। প্রতিটি একবারই চলে — নিরাপদ জায়গায় রাখুন। অন্য সব ডিভাইস থেকে লগআউট করা হয়েছে।'));
    openModal('ব্যাকআপ কোড', '', [state, list], [copy, save, done]);
  }
}

async function openSessions() {
  if (!ME) { openLogin(); return; }
  let d;
  try { d = await acctApi('sessions'); } catch { return; }
  const ago = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 5 ? 'এখন সক্রিয়' : m < 60 ? `${num(m)} মিনিট আগে` : m < 1440 ? `${num(Math.round(m / 60))} ঘণ্টা আগে` : `${num(Math.round(m / 1440))} দিন আগে`; };
  const rows = d.sessions.map(s => {
    const row = el('div', 'sess' + (s.here ? ' here' : ''));
    const phone = /iPhone|Android/.test(s.agent);
    const tt = el('div', 't');
    tt.append(Object.assign(el('b', 'no-tr'), { textContent: s.agent }), el('span', null, s.here ? 'এই ডিভাইস' : `${ago(s.last || s.made)} · লগইন ${new Date(s.made || s.last).toLocaleDateString(NUM_LOCALE, { day: 'numeric', month: 'short' })}`));
    row.append(ic(phone ? 'phone' : 'grid'), tt);
    if (!s.here) {
      const out = el('button', 'pill-btn quiet', 'লগআউট');
      out.addEventListener('click', async () => { out.disabled = true; await acctApi('session-end', { id: s.id }).catch(() => {}); row.remove(); });
      row.appendChild(out);
    } else row.appendChild(el('span', 'sess-here', 'এখানে'));
    return row;
  });
  const all = button('logout', 'অন্য সব ডিভাইস থেকে লগআউট', async () => { await acctApi('sessions-end', {}).catch(() => {}); closeModal(); openSessions(); }, true);
  openModal('লগইন অ্যাক্টিভিটি', 'যেসব ডিভাইসে আপনার অ্যাকাউন্ট খোলা আছে', rows, d.sessions.length > 1 ? [all] : []);
}

// ---- settings ----
(function initSettings() {
  $('set-edit').addEventListener('click', () => (ME ? openProfile() : openLogin()));
  // Theme: dark unless the person chose otherwise. The choice is read before the page draws, so changing it reloads.
  let theme = 'dark';
  try { theme = localStorage.getItem('bdmap.theme') || 'light'; } catch { /* storage unavailable */ }
  for (const b of $('theme-pick').children) {
    b.classList.toggle('on', b.dataset.themeSet === theme);
    b.addEventListener('click', () => { try { localStorage.setItem('bdmap.theme', b.dataset.themeSet); } catch { /* storage unavailable */ } location.reload(); });
  }
  document.querySelector('meta[name=theme-color]').content = document.documentElement.dataset.theme === 'dark' ? '#000000' : '#f5f5f7';
  // Who may write first, and whether others see when you are online.
  const paintPrivacy = () => {
    const p = (ME && ME.prefs) || { active: true, dm: 'all' };
    for (const b of $('dm-pick').children) b.classList.toggle('on', b.dataset.dm === p.dm);
    $('set-active').setAttribute('aria-checked', String(p.active));
    $('set-active').classList.toggle('on', p.active);
    $('set-verify-sub').textContent = ME && ME.verified ? 'আপনার অ্যাকাউন্ট ভেরিফায়েড' : 'নামের পাশে নীল ব্যাজ — কীভাবে পাবেন';
    $('set-2fa-sub').textContent = ME && ME.twofa ? 'চালু আছে' : 'বন্ধ — চালু করলে অ্যাকাউন্ট আরও নিরাপদ';
    $('set-2fa-sub').classList.toggle('on', !!(ME && ME.twofa));
  };
  const savePrivacy = async change => {
    if (!ME) { openLogin(); return; }
    try { const r = await acctApi('prefs', change); ME = r.user; CHAT.prefs = ME.prefs; } catch { /* the switch goes back */ }
    paintPrivacy();
    if (typeof loadChat === 'function') loadChat();
  };
  for (const b of $('dm-pick').children) b.addEventListener('click', () => savePrivacy({ dm: b.dataset.dm }));
  $('set-active').addEventListener('click', () => savePrivacy({ active: !((ME && ME.prefs) || { active: true }).active }));
  $('set-blocked').addEventListener('click', () => { if (typeof loadChat === 'function') loadChat().then(openBlocked); else openBlocked(); });
  $('set-verify').addEventListener('click', openVerifyInfo);
  $('set-2fa').addEventListener('click', openTwoStep);
  $('set-sessions').addEventListener('click', openSessions);
  $('set-logout').addEventListener('click', logOut);
  $('set-delete').addEventListener('click', confirmDelete);
  if ($('people-open')) $('people-open').addEventListener('click', openPeopleSearch);   // people are found in Explore now
  enter.profile = drawProfile;
  enter.insights = drawInsights;
  enter.settings = () => {
    for (const e of document.querySelectorAll('[data-needs-login]')) e.hidden = !ME;
    $('set-email').textContent = ME ? ME.email : 'লগইন করা নেই';
    $('set-email').classList.toggle('no-tr', !!ME);
    paintPrivacy();
  };
  if (current === 'profile') drawProfile();
  if (current === 'settings') enter.settings();
  if (current === 'insights') drawInsights();
})();
