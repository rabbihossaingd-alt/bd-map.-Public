// ---- Manzeela admin panel ----
// The older panel (admin-old.html), kept while each page moves to the new one (admin.html, admin/). A separate page for the people who run the app: numbers at a glance, users, support tickets,
// reports, reported fares, the audit log and settings. Everything comes from /api/admin/* (see server.js),
// which only answers a staff or admin account. Private messages are never shown: the panel only counts them.

const $ = id => document.getElementById(id);
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const num = n => Number(n).toLocaleString('bn-BD');
const ICONS = {
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 5.2a3.5 3.5 0 010 5.6M18 14.4c2.1.7 3.5 2.6 3.5 5.6"/>',
  help: '<path d="M21 12a8 8 0 01-11.8 7L4 20l1.2-4.6A8 8 0 1121 12z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  story: '<circle cx="12" cy="12" r="9" stroke-dasharray="3 2.2"/><path d="M12 8v8M8 12h8"/>',
  comment: '<path d="M21 12a8 8 0 01-11.8 7L4 20l1.2-4.6A8 8 0 1121 12z"/><path d="M8 11h8M8 14.5h5"/>',
  group: '<circle cx="8" cy="9" r="3"/><circle cx="16.5" cy="9" r="3"/><path d="M2.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M13.5 15c.9-.4 1.9-.5 3-.5 2.7 0 4.9 1.5 5.5 4.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  out: '<path d="M14 4h5a1 1 0 011 1v14a1 1 0 01-1 1h-5M10 16l-4-4 4-4M6 12h10"/>',
  wallet: '<path d="M4 7a2 2 0 012-2h11v4"/><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M16 13.5h2"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.3l2-1.5-2-3.4-2.3.9a7 7 0 00-2.2-1.3L14 3h-4l-.4 2.4a7 7 0 00-2.2 1.3l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .9.1 1.3l-2 1.5 2 3.4 2.3-.9c.6.6 1.4 1 2.2 1.3L10 21h4l.4-2.4c.8-.3 1.6-.7 2.2-1.3l2.3.9 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z"/>'
};
const icon = name => `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`;

async function api(path, body) {
  const res = await fetch('api/admin/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : {};
  if (!res.ok) throw Object.assign(new Error(data.error || 'server'), { status: res.status });
  return data;
}

let ME = null, page = 'overview';
const ROLE = { user: 'ব্যবহারকারী', staff: 'সাপোর্ট টিম', admin: 'অ্যাডমিন' };
const KIND = { account: 'অ্যাকাউন্ট', fare: 'ভাড়া', route: 'রুটের তথ্য', chat: 'মেসেজ/কল', person: 'অভিযোগ', verify: 'ব্যাজ', other: 'অন্য' };
const STATUS = { open: 'উত্তর বাকি', answered: 'উত্তর দেওয়া', closed: 'বন্ধ' };

// "৫ মিনিট আগে", "গতকাল", or a date.
function ago(ts) {
  if (!ts) return '—';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'এইমাত্র';
  if (s < 3600) return `${num(Math.floor(s / 60))} মিনিট আগে`;
  if (s < 86400) return `${num(Math.floor(s / 3600))} ঘণ্টা আগে`;
  if (s < 172800) return 'গতকাল';
  return new Date(ts).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' });
}
const when = ts => new Date(ts).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const HUES = [158, 200, 262, 330, 24, 48, 96, 222];
function avatar(u, cls = '') {
  const a = h('span', 'av ' + cls);
  if (u.pic) { const img = h('img'); img.src = `api/avatar/${u.id}?v=${u.pic}`; img.alt = ''; a.appendChild(img); }
  else {
    a.textContent = [...(u.name || '?').trim()][0] || '?';
    const hue = HUES[(u.id || 0) % HUES.length];
    a.style.background = `linear-gradient(135deg, hsl(${hue} 70% 46%), hsl(${(hue + 34) % 360} 76% 56%))`;
  }
  return a;
}
function person(u, sub) {
  const box = h('div', 'person');
  const t = h('div', 't');
  t.append(h('b', null, u.name), h('span', null, sub ?? u.email));
  box.append(avatar(u), t);
  return box;
}
const chip = (text, tone = '') => h('span', 'chip ' + tone, text);
function btn(text, tone, fn) {
  const b = h('button', 'btn ' + (tone || ''), text);
  b.addEventListener('click', fn);
  return b;
}

let snackTimer;
function snack(text, bad) {
  const s = $('snack');
  s.textContent = text;
  s.className = 'snack on' + (bad ? ' bad' : '');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { s.className = 'snack'; }, 2600);
}
const ERR = { forbidden: 'এই কাজটি শুধু অ্যাডমিন করতে পারেন।', self: 'নিজের অ্যাকাউন্টে এটি করা যায় না।', ref: 'লেনদেন নম্বরটি ঠিক নয়।', balance: 'ব্যালান্সের চেয়ে বেশি কমানো যায় না।', creator: 'আগে ক্রিয়েটর হিসেবে অনুমোদন দিন।', 'bad request': 'তথ্যটি ঠিক নয়।' };
async function act(promise, done) {
  try { await promise; snack(done); return true; }
  catch (e) { snack(ERR[e.message] || 'কাজটি করা যায়নি।', true); return false; }
}

// ---- the drawer (details slide in from the right) ----
function openDrawer(title, body, foot = []) {
  $('drawer-title').textContent = title;
  $('drawer-body').replaceChildren(...body);
  $('drawer-foot').replaceChildren(...foot);
  $('drawer-foot').hidden = !foot.length;
  $('drawer').hidden = $('drawer-back').hidden = false;
  requestAnimationFrame(() => $('drawer').classList.add('on'));
}
function closeDrawer() {
  $('drawer').classList.remove('on');
  $('drawer-back').hidden = true;
  setTimeout(() => { $('drawer').hidden = true; }, 260);
}
$('drawer-close').addEventListener('click', closeDrawer);
$('drawer-back').addEventListener('click', closeDrawer);
addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

function empty(text) { return h('div', 'none', text); }
function table(heads, rows) {
  const t = h('table', 'tbl'), head = h('tr');
  for (const x of heads) head.appendChild(h('th', null, x));
  t.appendChild(head);
  for (const cells of rows) {
    const tr = h('tr');
    if (cells.onClick) { tr.className = 'click'; tr.addEventListener('click', cells.onClick); }
    for (const c of cells) { const td = h('td'); if (c instanceof Node) td.appendChild(c); else td.textContent = c; tr.appendChild(td); }
    t.appendChild(tr);
  }
  const wrap = h('div', 'card flush');
  wrap.appendChild(t);
  return wrap;
}
function tabs(items, current, onPick) {
  const box = h('div', 'tabs');
  for (const [value, text] of items) {
    const b = h('button', value === current ? 'on' : '', text);
    b.addEventListener('click', () => onPick(value));
    box.appendChild(b);
  }
  return box;
}

// ---- pages ----
const PAGES = {
  overview: { title: 'এক নজরে', icon: 'home', async draw(box) {
    const o = await api('overview');
    setCounts(o);
    const hour = new Date().getHours();
    const hello = h('div', 'hello');
    hello.append(h('b', null, `${hour < 12 ? 'শুভ সকাল' : hour < 17 ? 'শুভ দুপুর' : hour < 20 ? 'শুভ সন্ধ্যা' : 'শুভ রাত্রি'}, ${ME.name}`),
      h('span', null, new Date().toLocaleDateString('bn-BD', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · অ্যাপ এখন ' + (o.online ? `${num(o.online)} জন খুলে রেখেছেন` : 'কেউ খুলে রাখেননি')));
    // What needs someone today.
    const todo = h('div', 'todo');
    const task = (n, label, sub, go, tone) => {
      const t = h('button', 'task ' + (n ? tone : 'done'));
      t.append(h('b', null, num(n)), h('span', null, label), h('small', null, n ? sub : 'সব ঠিক আছে'));
      t.addEventListener('click', go);
      todo.appendChild(t);
    };
    task(o.ticketsOpen, 'সাপোর্টে উত্তর বাকি', 'ব্যবহারকারীরা অপেক্ষা করছেন', () => show('support'), 'warn');
    task(o.reportsOpen, 'রিপোর্ট দেখা বাকি', 'অভিযোগগুলো যাচাই করুন', () => show('reports'), 'bad');
    task(o.placePhotosWaiting, 'জায়গার ছবি দেখা বাকি', 'অনুমোদন দিন বা বাদ দিন', () => show('photos'), 'violet');
    task(o.gemsWaiting, 'মেঠোপথে নতুন জায়গা দেখা বাকি', 'নতুন জায়গার খোঁজ', () => show('gems'), 'violet');
    task(o.faresWaiting, 'ভাড়া অনুমোদন বাকি', 'অনুমোদন দিলে প্রতিটিতে ১০ পয়েন্ট', () => show('fares'), 'warn');
    task(o.payoutsWaiting, 'টাকা পাঠানো বাকি', `মোট ৳${num(o.payoutsPendingTaka)}`, () => { PAGES.creators.state.tab = 'payouts'; show('creators'); }, 'warn');
    task(o.creatorsWaiting, 'ক্রিয়েটর আবেদন', 'অনুমোদন দিন বা বাতিল করুন', () => { PAGES.creators.state.tab = 'creators'; show('creators'); }, 'violet');
    task(o.verifyWaiting, 'ব্যাজের আবেদন', 'সাপোর্টে "ব্যাজ" বিষয়ের অনুরোধ', () => show('support'), 'violet');

    const kpis = h('div', 'kpis');
    const kpi = (icon_, label, value, sub, tone) => { const k = h('div', 'kpi ' + (tone || '')); const i = h('i', 'ki'); i.innerHTML = icon(icon_); k.append(i, h('span', null, label), h('b', null, num(value)), h('small', null, sub)); kpis.appendChild(k); };
    kpi('users', 'মোট ব্যবহারকারী', o.users, `আজ নতুন ${num(o.usersToday)} · ৭ দিনে সক্রিয় ${num(o.active7)}`);
    kpi('home', 'আজ সক্রিয়', o.activeToday, `এখন অনলাইন ${num(o.online)}`, 'live');
    kpi('help', 'আজকের মেসেজ', o.messagesToday, `মোট ${num(o.messages)} · গ্রুপ ${num(o.groups)}`);
    kpi('image', 'পোস্ট', o.posts, `আজ ${num(o.postsToday)} · স্টোরি ${num(o.stories)} · মন্তব্য ${num(o.comments)}`);
    kpi('group', 'চলতি গ্রুপ কল', o.calls, `বন্ধুত্ব ${num(o.friendships)}টি`);
    kpi('flag', 'ভেরিফায়েড', o.verified, `টু-স্টেপ চালু ${num(o.twofa)} জন`);
    kpi('tag', 'জানানো ভাড়া', o.fares, `রেটিং ${num(o.ratings)}টি`);
    kpi('flag', 'বন্ধ অ্যাকাউন্ট', o.banned, `খোলা রিপোর্ট ${num(o.reportsOpen)}`, o.banned ? 'bad' : '');

    const charts = h('div', 'charts');
    const chart = (title, data, hue) => {
      const c = h('div', 'card chart'), bars = h('div', 'bars'), max = Math.max(1, ...data);
      const total = data.reduce((x, y) => x + y, 0), half = data.slice(7).reduce((x, y) => x + y, 0), before = data.slice(0, 7).reduce((x, y) => x + y, 0);
      const trend = before ? Math.round((half - before) / before * 100) : half ? 100 : 0;
      const head = h('div', 'ch-head');
      head.append(h('span', null, title), h('em', trend > 0 ? 'up' : trend < 0 ? 'down' : '', (trend > 0 ? '▲ ' : trend < 0 ? '▼ ' : '') + num(Math.abs(trend)) + '%'));
      c.append(head, h('b', null, num(total)), h('small', null, 'গত ১৪ দিন · আগের সপ্তাহের তুলনায়'));
      c.style.setProperty('--h1', hue);
      data.forEach((v, i) => {
        const bar = h('i');
        bar.style.height = Math.max(4, v / max * 100) + '%';
        if (!v) bar.className = 'zero';
        const d = new Date(Date.now() - (data.length - 1 - i) * 864e5);
        bar.title = `${d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' })}: ${num(v)}`;
        bars.appendChild(bar);
      });
      c.appendChild(bars);
      charts.appendChild(c);
    };
    chart('নতুন অ্যাকাউন্ট', o.signups, 158); chart('মেসেজ', o.chats, 210); chart('পোস্ট', o.postsSeries, 280);
    chart('লাইক', o.likesSeries, 340); chart('সাপোর্ট অনুরোধ', o.support, 30); chart('জানানো ভাড়া', o.faresSeries, 48);

    const cols = h('div', 'cols three');
    const users = h('div', 'card'), tickets = h('div', 'card'), side = h('div', 'card');
    users.appendChild(h('h3', null, 'নতুন যোগ দিয়েছেন'));
    for (const u of o.latestUsers) { const row = person(u, `${u.email} · ${ago(u.created)}`); row.classList.add('click'); row.addEventListener('click', () => openUser(u.id)); users.appendChild(row); }
    if (!o.latestUsers.length) users.appendChild(empty('এখনো কেউ যোগ দেননি।'));
    tickets.appendChild(h('h3', null, 'সাম্প্রতিক সাপোর্ট'));
    for (const t of o.latestTickets) {
      const row = h('div', 'line click');
      const txt = h('div', 't');
      txt.append(h('b', null, t.subject), h('span', null, `${t.name} · ${ago(t.updated)}`));
      row.append(txt, chip(STATUS[t.status], t.status === 'open' ? 'warn' : t.status === 'answered' ? 'ok' : ''));
      row.addEventListener('click', () => openTicket(t.id));
      tickets.appendChild(row);
    }
    if (!o.latestTickets.length) tickets.appendChild(empty('কোনো সাপোর্ট অনুরোধ নেই।'));
    side.appendChild(h('h3', null, 'দ্রুত সুইচ'));
    side.append(switchRow('নতুন অ্যাকাউন্ট খোলা', 'বন্ধ করলে শুধু পুরোনোরা লগইন করতে পারবেন', 'signups', o.flags.signups),
                switchRow('পোস্ট ও স্টোরি দেওয়া', 'বন্ধ করলে সাধারণ ব্যবহারকারীরা পোস্ট করতে পারবেন না', 'posts', o.flags.posts));
    side.appendChild(h('h3', 'gap', 'সবচেয়ে বেশি পোস্ট'));
    for (const u of o.topPosters) { const row = person(u, `${num(u.n)}টি পোস্ট`); row.classList.add('click'); row.addEventListener('click', () => openUser(u.id)); side.appendChild(row); }
    if (!o.topPosters.length) side.appendChild(empty('এখনো কোনো পোস্ট নেই।'));
    cols.append(users, tickets, side);
    box.append(hello, todo, kpis, charts, cols);
  } },

  stories: { title: 'স্টোরি', icon: 'story', async draw(box) {
    const d = await api('stories');
    box.appendChild(h('p', 'hint', 'গত ২৪ ঘণ্টার সব স্টোরি। আপত্তিকর কিছু থাকলে সরান — ২৪ ঘণ্টা পরে এমনিতেই মুছে যায়।'));
    if (!d.stories.length) { box.appendChild(empty('এখন কোনো স্টোরি নেই।')); return; }
    const grid = h('div', 'sgrid');
    for (const st of d.stories) {
      const c = h('div', 'scard');
      const m = h(st.kind === 'video' ? 'video' : 'img');
      m.src = st.src;
      if (st.kind === 'video') { m.muted = true; m.preload = 'metadata'; m.poster = st.poster; m.addEventListener('mouseenter', () => m.play().catch(() => {})); m.addEventListener('mouseleave', () => m.pause()); }
      const who = person(st.user, ago(st.created));
      who.classList.add('click');
      who.addEventListener('click', () => openUser(st.user.id));
      c.append(m, who, btn('সরান', 'bad quiet small', async () => { if (confirm('স্টোরিটি সরাবেন?') && await act(api('story', { id: st.id }), 'স্টোরি সরানো হলো।')) show('stories'); }));
      grid.appendChild(c);
    }
    box.appendChild(grid);
  } },

  sounds: { title: 'সাউন্ড', icon: 'comment', async draw(box) {
    const d = await api('sounds');
    box.appendChild(h('p', 'hint', 'ব্যবহারকারীরা রিলের জন্য যে সাউন্ড আপলোড করেছেন। অন্যের কপিরাইট করা গান (সিনেমার গান ইত্যাদি) পেলে বা কেউ অভিযোগ করলে সরিয়ে দিন — সরালে যেসব পোস্টে ব্যবহার হয়েছে সেখান থেকেও উঠে যায়।'));
    if (!d.sounds.length) { box.appendChild(empty('এখনো কেউ সাউন্ড আপলোড করেননি।')); return; }
    box.appendChild(table(['সাউন্ড', 'কে', 'ব্যবহার', 'কখন', ''], d.sounds.map(x => {
      const a = h('audio'); a.src = x.src; a.controls = true; a.preload = 'none'; a.style.maxWidth = '220px';
      const t = h('div'); t.append(h('b', null, x.title), a);
      return [t, `${x.user.name} (${x.user.email})`, num(x.uses), ago(x.created), btn('সরান', 'bad quiet small', async () => { if (confirm(`"${x.title}" সরাবেন?`) && await act(api('sound', { id: x.id }), 'সাউন্ড সরানো হলো।')) show('sounds'); })];
    })));
  } },

  comments: { title: 'মন্তব্য', icon: 'comment', async draw(box) {
    const d = await api('comments');
    box.appendChild(h('p', 'hint', 'পোস্টের নিচে করা সাম্প্রতিক মন্তব্য। গালিগালাজ, স্প্যাম বা হুমকি থাকলে সরান।'));
    if (!d.comments.length) { box.appendChild(empty('এখনো কোনো মন্তব্য নেই।')); return; }
    box.appendChild(table(['কে', 'মন্তব্য', 'পোস্ট', 'কখন', ''], d.comments.map(c => [person(c.user), h('span', 'wrap', c.body), '#' + num(c.post), ago(c.created),
      btn('সরান', 'bad quiet small', async () => { if (await act(api('comment', { id: c.id }), 'মন্তব্য সরানো হলো।')) show('comments'); })])));
  } },

  groups: { title: 'গ্রুপ চ্যাট', icon: 'group', async draw(box) {
    const d = await api('groups');
    box.appendChild(h('p', 'hint', `গ্রুপগুলোর নাম, সদস্য আর মেসেজের সংখ্যা — মেসেজ পড়া যায় না। এখন ${num(d.calls)}টি গ্রুপ কল চলছে। নিয়ম ভাঙা গ্রুপ বন্ধ করলে তার সব মেসেজ মুছে যায়।`));
    if (!d.groups.length) { box.appendChild(empty('এখনো কোনো গ্রুপ নেই।')); return; }
    box.appendChild(table(['গ্রুপ', 'বানিয়েছেন', 'সদস্য', 'মেসেজ', 'শেষ সক্রিয়', ''], d.groups.map(g => [h('b', null, g.name || 'নাম নেই'), g.owner || '—', num(g.members), num(g.messages),
      g.call ? chip(`কল চলছে · ${num(g.call.people.length)} জন`, 'live') : ago(g.active),
      btn('বন্ধ করুন', 'bad quiet small', async () => { if (confirm(`"${g.name || 'গ্রুপ'}" বন্ধ করবেন? সব মেসেজ মুছে যাবে।`) && await act(api('group', { id: g.id }), 'গ্রুপ বন্ধ হলো।')) show('groups'); })])));
  } },

  users: { title: 'ব্যবহারকারী', icon: 'users', state: { q: '', filter: 'all', page: 0 }, async draw(box) {
    const st = this.state;
    const search = h('input', 'search');
    search.placeholder = 'নাম বা ই-মেইল দিয়ে খুঁজুন';
    search.value = st.q;
    let timer;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { st.q = search.value; st.page = 0; fill(); }, 250); });
    const csv = h('a', 'btn quiet', 'CSV ডাউনলোড');
    csv.href = 'api/admin/export';
    $('tools').replaceChildren(search, csv);
    const holder = h('div');
    box.append(tabs([['all', 'সবাই'], ['new', 'এই সপ্তাহে নতুন'], ['team', 'টিম'], ['banned', 'বন্ধ করা']], st.filter, v => { st.filter = v; st.page = 0; show('users'); }), holder);
    async function fill() {
      const d = await api(`users?q=${encodeURIComponent(st.q)}&filter=${st.filter}&page=${st.page}`);
      const rows = d.users.map(u => Object.assign([person(u, u.email + (u.verified ? ' · ✔ ভেরিফায়েড' : '')), chip(ROLE[u.role], u.role === 'admin' ? 'violet' : u.role === 'staff' ? 'ok' : ''), ago(u.created),
        u.online ? chip('অনলাইন', 'live') : ago(u.seen), u.banned ? chip('বন্ধ', 'bad') : chip('সচল', 'ok')], { onClick: () => openUser(u.id) }));
      const pager = h('div', 'pager');
      pager.append(h('span', null, `মোট ${num(d.total)} জন · পাতা ${num(d.page + 1)}/${num(Math.max(1, Math.ceil(d.total / 25)))}`));
      if (d.page > 0) pager.appendChild(btn('আগের', 'quiet', () => { st.page--; fill(); }));
      if ((d.page + 1) * 25 < d.total) pager.appendChild(btn('পরের', 'quiet', () => { st.page++; fill(); }));
      holder.replaceChildren(d.users.length ? table(['ব্যবহারকারী', 'ভূমিকা', 'যোগ দিয়েছেন', 'শেষ সক্রিয়', 'অবস্থা'], rows) : empty('এই খোঁজে কাউকে পাওয়া যায়নি।'), pager);
    }
    await fill();
  } },

  support: { title: 'সাপোর্ট', icon: 'help', state: { status: 'open' }, async draw(box) {
    const st = this.state;
    const d = await api('tickets?status=' + st.status);
    box.appendChild(tabs([['open', 'উত্তর বাকি'], ['answered', 'উত্তর দেওয়া'], ['closed', 'বন্ধ'], ['all', 'সব']], st.status, v => { st.status = v; show('support'); }));
    if (!d.tickets.length) { box.appendChild(empty(st.status === 'open' ? 'সব অনুরোধের উত্তর দেওয়া হয়েছে। 🎉' : 'এখানে কিছু নেই।')); return; }
    const list = h('div', 'card flush');
    for (const t of d.tickets) {
      const row = h('div', 'line click pad');
      const txt = h('div', 't');
      txt.append(h('b', null, t.subject), h('span', null, `${t.name} · ${KIND[t.category]} · ${num(t.n)}টি বার্তা · ${ago(t.updated)}`));
      row.append(avatar({ id: t.uid, name: t.name, pic: t.pic }), txt, chip(STATUS[t.status], t.status === 'open' ? 'warn' : t.status === 'answered' ? 'ok' : ''));
      row.addEventListener('click', () => openTicket(t.id));
      list.appendChild(row);
    }
    box.appendChild(list);
  } },

  reports: { title: 'রিপোর্ট', icon: 'flag', state: { status: 'open' }, async draw(box) {
    const st = this.state;
    const d = await api('reports?status=' + st.status);
    box.appendChild(tabs([['open', 'দেখা বাকি'], ['all', 'সব']], st.status, v => { st.status = v; show('reports'); }));
    if (!d.reports.length) { box.appendChild(empty('কোনো রিপোর্ট বাকি নেই।')); return; }
    for (const r of d.reports) {
      const card = h('div', 'card report');
      const who = person({ id: r.aid, name: r.aname, pic: r.apic }, `${r.aemail} · মোট ${num(r.total)}টি রিপোর্ট`);
      who.classList.add('click');
      who.addEventListener('click', () => openUser(r.aid));
      const head = h('div', 'rhead');
      head.append(who, r.abanned ? chip('বন্ধ করা হয়েছে', 'bad') : r.status === 'done' ? chip('দেখা হয়েছে', '') : chip('দেখা বাকি', 'warn'));
      const acts = h('div', 'acts');
      if (r.status === 'open') {
        acts.append(btn('ব্যবস্থা লাগবে না', 'quiet', async () => { if (await act(api('report', { id: r.id, do: 'dismiss' }), 'রিপোর্টটি বন্ধ করা হলো।')) show('reports'); }));
        if (!r.abanned) acts.append(btn('অ্যাকাউন্ট বন্ধ করুন', 'bad', async () => { if (confirm(`${r.aname}-এর অ্যাকাউন্ট বন্ধ করবেন?`) && await act(api('report', { id: r.id, do: 'ban' }), 'অ্যাকাউন্টটি বন্ধ করা হলো।')) show('reports'); }));
      }
      card.append(head, h('p', 'reason', r.reason), h('small', null, `রিপোর্ট করেছেন ${r.bname} (${r.bemail}) · ${ago(r.made)}`), acts);
      box.appendChild(card);
    }
  } },

  photos: { title: 'জায়গার ছবি', icon: 'image', state: { status: 'pending' }, async draw(box) {
    const st = this.state;
    const d = await api('place-photos?status=' + st.status);
    const badge = document.querySelector('#nav [data-page=photos] em');
    if (badge) { badge.textContent = num(d.waiting); badge.hidden = !d.waiting; }
    box.appendChild(tabs([['pending', `দেখা বাকি (${num(d.waiting)})`], ['ok', 'অনুমোদিত'], ['no', 'বাদ দেওয়া']], st.status, v => { st.status = v; show('photos'); }));
    box.appendChild(h('p', 'hint', 'রূপসী বাংলায় ব্যবহারকারীরা জায়গার যে ছবি পাঠিয়েছেন। ছবিটি সত্যিই ওই জায়গার, পরিষ্কার, আর মানুষের মুখ মুখ্য নয় — এমন হলে অনুমোদন দিন (ছবির জন্য পয়েন্ট নেই)। অন্য জায়গার, ঝাপসা, স্ক্রিনশট বা কারও ওয়াটারমার্ক থাকা ছবি বাদ দিন।'));
    if (!d.photos.length) { box.appendChild(empty(st.status === 'pending' ? 'দেখার মতো কোনো ছবি বাকি নেই।' : 'এখানে এখনো কিছু নেই।')); return; }
    const grid = h('div', 'pgrid');
    for (const p of d.photos) {
      const card = h('div', 'card pcard');
      const img = h('img'); img.src = p.src; img.loading = 'lazy';
      img.addEventListener('click', () => window.open(p.src, '_blank'));
      const who = person(p.user, `${p.user.email} · ${num(p.user.points)} পয়েন্ট`);
      who.classList.add('click'); who.addEventListener('click', () => openUser(p.user.id));
      const acts = h('div', 'acts');
      if (p.key) {
        if (st.status !== 'ok') acts.append(btn('অনুমোদন দিন', '', async () => { if (await act(api('place-photo', { id: p.id, do: 'approve' }), 'ছবিটি অ্যাপে দেখা যাবে।')) show('photos'); }));
        if (st.status !== 'no') acts.append(btn(st.status === 'ok' ? 'সরিয়ে দিন' : 'বাদ দিন', 'bad', async () => { if (await act(api('place-photo', { id: p.id, do: 'reject' }), 'ছবিটি বাদ দেওয়া হলো।')) show('photos'); }));
      }
      card.append(img, h('b', null, p.name), h('small', null, `${p.district} · ${ago(st.status === 'pending' ? p.created : p.decided)}`), who, acts);
      grid.appendChild(card);
    }
    box.appendChild(grid);
  } },

  gems: { title: 'মেঠোপথ', icon: 'flag', state: { status: 'pending' }, async draw(box) {
    const st = this.state;
    const d = await api('gems?status=' + st.status);
    const badge = document.querySelector('#nav [data-page=gems] em');
    if (badge) { badge.textContent = num(d.waiting); badge.hidden = !d.waiting; }
    box.appendChild(tabs([['pending', `দেখা বাকি (${num(d.waiting)})`], ['ok', 'অনুমোদিত'], ['no', 'বাদ দেওয়া']], st.status, v => { st.status = v; show('gems'); }));
    box.appendChild(h('p', 'hint', 'ব্যবহারকারীরা যেসব অজানা জায়গার খোঁজ পাঠিয়েছেন। জায়গাটি সত্যিই আছে, বর্ণনা ঠিক আর ভদ্র, ছবি ওই জায়গার — এমন হলে অনুমোদন দিন (এর জন্য পয়েন্ট নেই)। বিজ্ঞাপন, ব্যক্তিগত বাড়ি বা ভুয়া তথ্য বাদ দিন।'));
    if (!d.gems.length) { box.appendChild(empty(st.status === 'pending' ? 'দেখার মতো কিছু বাকি নেই।' : 'এখানে এখনো কিছু নেই।')); return; }
    const KIND = { water: 'ঝর্ণা', river: 'নদী / সৈকত / লেক', hill: 'পাহাড় / বন', heritage: 'ঐতিহাসিক স্থাপনা', faith: 'ধর্মীয় স্থান', wetland: 'হাওর / বিল', village: 'গ্রাম ও গ্রামীণ জীবন', other: 'অন্যান্য' };
    for (const g of d.gems) {
      const card = h('div', 'card report');
      const head = h('div', 'rhead');
      const who = person(g.user, `${g.user.email} · ${num(g.user.points)} পয়েন্ট`);
      who.classList.add('click'); who.addEventListener('click', () => openUser(g.user.id));
      head.append(who, chip(KIND[g.kind] || g.kind, 'violet'));
      card.append(head, h('b', null, `${g.name} — ${g.district}${g.place ? ' · ' + g.place : ''}`), h('p', 'reason', g.about));
      if (g.how) card.appendChild(h('p', 'reason', 'যাবেন কীভাবে: ' + g.how));
      if (g.lat != null) { const a = h('a', null, 'ম্যাপে অবস্থান দেখুন ↗'); a.href = `https://www.openstreetmap.org/?mlat=${g.lat}&mlon=${g.lon}#map=15/${g.lat}/${g.lon}`; a.target = '_blank'; card.appendChild(a); }
      if (g.photos.length) { const row = h('div', 'pgrid'); for (const src of g.photos) { const i = h('img'); i.src = src; i.loading = 'lazy'; i.style.cssText = 'width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;cursor:zoom-in'; i.addEventListener('click', () => window.open(src, '_blank')); row.appendChild(i); } card.appendChild(row); }
      card.appendChild(h('small', null, ago(st.status === 'pending' ? g.created : g.decided)));
      const acts = h('div', 'acts');
      if (st.status !== 'ok') acts.append(btn('অনুমোদন দিন', '', async () => { if (await act(api('gem', { id: g.id, do: 'approve' }), 'জায়গাটি অ্যাপে দেখা যাবে।')) show('gems'); }));
      if (st.status !== 'no') acts.append(btn(st.status === 'ok' ? 'সরিয়ে দিন' : 'বাদ দিন', 'bad', async () => { if (await act(api('gem', { id: g.id, do: 'reject' }), 'বাদ দেওয়া হলো।')) show('gems'); }));
      card.appendChild(acts);
      box.appendChild(card);
    }
  } },

  posts: { title: 'পোস্ট', icon: 'image', async draw(box) {
    const d = await api('posts');
    box.appendChild(h('p', 'hint', 'এক্সপ্লোরে সবাই যা পোস্ট করেছেন। আপত্তিকর ছবি বা ভিডিও এখান থেকে সরানো যায়; সরালে তা খতিয়ানে লেখা থাকে।'));
    if (!d.posts.length) { box.appendChild(empty('এখনো কেউ কিছু পোস্ট করেননি।')); return; }
    const grid = h('div', 'pgrid');
    for (const p of d.posts) {
      const card = h('div', 'card pcard');
      const media = h(p.kind === 'video' ? 'video' : p.kind === 'text' ? 'div' : 'img', p.kind === 'text' ? 'ptext' : null);
      if (p.kind === 'text') media.textContent = p.caption; else media.src = p.src;
      if (p.kind === 'video') { media.controls = true; media.preload = 'none'; if (p.poster) media.poster = p.poster; }
      const who = person(p.user, `${p.email} · ${ago(p.created)}`);
      who.classList.add('click');
      who.addEventListener('click', () => openUser(p.user.id));
      card.append(media, who, h('p', 'cap', p.caption || '—'), h('small', null, `${num(p.likes)} লাইক · ${num(p.comments)} মন্তব্য${p.place ? ' · ' + p.place.label : ''}`),
        btn('পোস্টটি সরান', 'bad quiet small', async () => { if (confirm('পোস্টটি সরিয়ে ফেলবেন?') && await act(api('post', { id: p.id }), 'পোস্টটি সরানো হলো।')) show('posts'); }));
      grid.appendChild(card);
    }
    box.appendChild(grid);
  } },

  fares: { title: 'জানানো ভাড়া', icon: 'tag', async draw(box) {
    const d = await api('fares');
    const stop = id => { const s = typeof STOPS !== 'undefined' && STOPS[id]; return s ? s.bn || s[0] : id; };
    box.appendChild(h('p', 'hint', 'যাত্রীরা যে ভাড়া দিয়েছেন বলে জানিয়েছেন। একই পথের জানানো ভাড়াগুলোর মাঝেরটি অ্যাপে সবার জন্য দেখানো হয়। ভুল বা বাজে তথ্য এখান থেকে সরানো যায়।'));
    const MODE = { bus: 'বাস', cng: 'সিএনজি', rickshaw: 'রিকশা', leguna: 'লেগুনা', bike: 'বাইক', car: 'কার', train: 'ট্রেন', launch: 'লঞ্চ', other: 'অন্য' };
    box.appendChild(h('p', 'hint', `পয়েন্ট শুধু ভাড়া জানানোর জন্য, আর আপনি অনুমোদন দিলে তবেই: প্রতিটিতে ১০। ${d.waiting ? num(d.waiting) + 'টি ভাড়া অনুমোদনের অপেক্ষায়।' : 'অপেক্ষায় কোনো ভাড়া নেই।'}`));
    const okCell = (ok, approve) => ok ? h('span', 'pill ok', 'অনুমোদিত') : btn('অনুমোদন দিন · +১০', 'small', approve);
    box.appendChild(h('h3', 'sub', 'যেকোনো পথের ভাড়া'));
    box.appendChild(d.contributions.length ? table(['পথ', 'বাহন', 'ভাড়া', 'কে', 'কখন', '', ''], d.contributions.map(c => [`${c.flabel} → ${c.tlabel}`, MODE[c.mode] || c.mode, '৳' + num(c.fare), `${c.name} (${c.email})`, ago(c.created),
      okCell(c.ok, async () => { if (await act(api('approve-contribution', { id: c.id }), 'অনুমোদন দেওয়া হলো, ১০ পয়েন্ট যোগ হলো।')) show('fares'); }),
      btn(c.ok ? 'সরান, পয়েন্ট কাটুন' : 'ভুল — সরান', 'quiet small', async () => { if (await act(api('contribution', { id: c.id }), c.ok ? 'ভাড়াটি সরানো হলো, ১০ পয়েন্ট কাটা গেল।' : 'ভাড়াটি সরানো হলো।')) show('fares'); })])) : empty('এখনো কেউ এই পাতা থেকে ভাড়া জানাননি।'));
    box.appendChild(h('h3', 'sub', 'ঢাকার বাসের স্টপ-থেকে-স্টপ ভাড়া'));
    if (!d.fares.length) { box.appendChild(empty('এখনো কেউ ভাড়া জানাননি।')); return; }
    box.appendChild(table(['পথ', 'ভাড়া', 'কে', 'কখন', '', ''], d.fares.map(f => { const acct = /^u\d+$/.test(f.device); return [`${stop(f.a)} ↔ ${stop(f.b)}`, '৳' + num(f.fare), acct ? `অ্যাকাউন্ট #${f.device.slice(1)}` : 'লগইন ছাড়া', ago(f.updated),
      acct ? okCell(f.ok, async () => { if (await act(api('approve-fare', { a: f.a, b: f.b, device: f.device }), 'অনুমোদন দেওয়া হলো, ১০ পয়েন্ট যোগ হলো।')) show('fares'); }) : h('span', 'hint', 'পয়েন্ট নেই'),
      btn(acct && f.ok ? 'সরান, পয়েন্ট কাটুন' : 'সরান', 'quiet small', async () => { if (await act(api('fare', { a: f.a, b: f.b, device: f.device }), 'ভাড়াটি সরানো হলো।')) show('fares'); })]; })));
  } },

  creators: { title: 'ক্রিয়েটর ও পেমেন্ট', icon: 'wallet', state: { tab: 'payouts', status: 'pending' }, async draw(box) {
    const st = PAGES.creators.state;
    const taka = n => '৳' + num(n);
    box.appendChild(h('p', 'hint', 'ক্রিয়েটর প্রোগ্রাম: শর্ত পূরণ করা ব্যবহারকারী আবেদন করেন, আপনি অনুমোদন দেন, তারপর তাঁর আয় যোগ করেন (বোনাস, স্পনসরশিপের ভাগ, পুরস্কার)। তিনি টাকা তুলতে চাইলে বিজনেস ওয়ালেট থেকে পাঠিয়ে এখানে লেনদেন নম্বর দিয়ে "পাঠানো হয়েছে" করুন। অ্যাপ নিজে কোনো টাকা কাটে বা পাঠায় না।'));
    box.appendChild(tabs([['payouts', 'টাকা তোলার অনুরোধ'], ['creators', 'ক্রিয়েটর'], ['rules', 'নিয়ম']], st.tab, v => { st.tab = v; show('creators'); }));
    if (st.tab === 'payouts') {
      box.appendChild(tabs([['pending', 'অপেক্ষায়'], ['paid', 'পাঠানো'], ['rejected', 'বাতিল'], ['all', 'সব']], st.status, v => { st.status = v; show('creators'); }));
      const d = await api('payouts?status=' + st.status);
      const W = { bkash: 'বিকাশ', nagad: 'নগদ', rocket: 'রকেট' };
      const S = { pending: ['অপেক্ষায়', 'warn'], paid: ['পাঠানো হয়েছে', 'ok'], rejected: ['বাতিল', 'bad'] };
      if (!d.payouts.length) { box.appendChild(empty('এই তালিকায় কিছু নেই।')); return; }
      box.appendChild(table(['কে', 'কত', 'কোথায়', 'অবস্থা', 'কখন', ''], d.payouts.map(x => {
        const acts = h('div', 'acts');
        if (x.status === 'pending') acts.append(
          btn('পাঠানো হয়েছে', 'small', async () => { const ref = prompt(`${W[x.method]} ${x.account}-এ ${taka(x.amount)} পাঠানোর পর লেনদেন নম্বর (TrxID) লিখুন:`); if (ref && await act(api('payout', { id: x.id, do: 'paid', ref }), 'পরিশোধ হিসেবে চিহ্নিত হলো।')) show('creators'); }),
          btn('বাতিল', 'quiet small', async () => { const note = prompt('কেন বাতিল করছেন? (তিনি দেখতে পাবেন)'); if (note !== null && await act(api('payout', { id: x.id, do: 'reject', note }), 'অনুরোধ বাতিল হলো, টাকা ব্যালান্সে ফিরেছে।')) show('creators'); }));
        return [person(x.user), taka(x.amount), `${W[x.method]} · ${x.account}`, chip(S[x.status][0] + (x.ref ? ' · ' + x.ref : ''), S[x.status][1]), ago(x.created), acts];
      })));
      return;
    }
    const d = await api('creators');
    if (st.tab === 'rules') {
      const card = h('div', 'card');
      const inp = (label, value) => { const w = h('label', 'field'); const i = h('input'); i.type = 'number'; i.min = 0; i.value = value; w.append(h('span', null, label), i); card.appendChild(w); return i; };
      card.appendChild(h('h3', null, 'কারা আবেদন করতে পারবেন'));
      const f = inp('কমপক্ষে ফলোয়ার', d.rules.followers), p = inp('কমপক্ষে পোস্ট', d.rules.posts), m = inp('সবচেয়ে কম কত টাকা তোলা যাবে', d.rules.payoutMin);
      card.appendChild(btn('নিয়ম সেভ করুন', '', async () => { if (await act(api('rules', { followers: f.value, posts: p.value, min: m.value }), 'নিয়ম বদলানো হলো।')) show('creators'); }));
      const sum = h('div', 'card');
      sum.appendChild(h('h3', null, 'মোট হিসাব'));
      for (const [k, v] of [['মোট আয় যোগ করা হয়েছে', d.totals.earned], ['পাঠানো হয়েছে', d.totals.paid], ['পাঠানো বাকি', d.totals.pending]]) { const r = h('div', 'line'); r.append(h('span', 'k', k), chip(taka(v))); sum.appendChild(r); }
      box.append(card, sum);
      return;
    }
    const C = { applied: ['আবেদন করেছেন', 'warn'], approved: ['চালু', 'ok'], rejected: ['গৃহীত হয়নি', 'bad'] };
    if (!d.creators.length) { box.appendChild(empty('এখনো কেউ আবেদন করেননি।')); return; }
    box.appendChild(table(['কে', 'অবস্থা', 'ফলোয়ার · পোস্ট', 'ব্যালান্স', ''], d.creators.map(u => {
      const acts = h('div', 'acts');
      if (u.creator === 'applied') acts.append(
        btn('অনুমোদন দিন', 'small', async () => { if (await act(api('creator', { id: u.id, do: 'approve' }), 'ক্রিয়েটর প্রোগ্রাম চালু হলো।')) show('creators'); }),
        btn('বাতিল', 'quiet small', async () => { if (await act(api('creator', { id: u.id, do: 'reject' }), 'আবেদন গৃহীত হয়নি।')) show('creators'); }));
      if (u.creator === 'approved') acts.append(
        btn('আয় যোগ করুন', 'small', async () => {
          const amount = prompt(`${u.name}-এর ব্যালান্সে কত টাকা যোগ করবেন? (কমাতে চাইলে মাইনাস দিন, যেমন -100)`);
          if (!amount) return;
          const note = prompt('কীসের জন্য? (তিনি দেখতে পাবেন, যেমন: অক্টোবরের ক্রিয়েটর বোনাস)');
          if (note && await act(api('creator', { id: u.id, do: 'credit', amount: Number(amount), note }), 'আয় যোগ হলো।')) show('creators');
        }),
        btn('বন্ধ করুন', 'quiet small', async () => { if (confirm(`${u.name}-এর ক্রিয়েটর প্রোগ্রাম বন্ধ করবেন? আগের আয়ের হিসাব থাকবে।`) && await act(api('creator', { id: u.id, do: 'revoke' }), 'বন্ধ হলো।')) show('creators'); }));
      return [person(u), chip(C[u.creator][0], C[u.creator][1]), `${num(u.standing.followers)} · ${num(u.standing.posts)}`, taka(u.money.balance), acts];
    })));
  } },

  audit: { title: 'কাজের খতিয়ান', icon: 'list', async draw(box) {
    const d = await api('audit');
    const WHAT = { verify: 'ব্যাজ দেওয়া', unverify: 'ব্যাজ সরানো', 'creator approve': 'ক্রিয়েটর অনুমোদন', 'creator reject': 'ক্রিয়েটর আবেদন বাতিল', 'creator revoke': 'ক্রিয়েটর বন্ধ',
                   earning: 'আয় যোগ', 'payout paid': 'টাকা পাঠানো', 'payout rejected': 'টাকা তোলা বাতিল', 'creator rules': 'ক্রিয়েটর নিয়ম বদল', 'sound removed': 'সাউন্ড সরানো', 'story removed': 'স্টোরি সরানো', 'comment removed': 'মন্তব্য সরানো', 'group removed': 'গ্রুপ বন্ধ', flag: 'সুইচ বদল', export: 'তালিকা ডাউনলোড', ban: 'অ্যাকাউন্ট বন্ধ', unban: 'অ্যাকাউন্ট চালু', role: 'ভূমিকা বদল', delete: 'অ্যাকাউন্ট মোছা', signout: 'সব ডিভাইস থেকে লগআউট', reply: 'সাপোর্টে উত্তর',
                   notice: 'ঘোষণা বদল', 'fare removed': 'ভাড়া সরানো', 'fare approved': 'ভাড়া অনুমোদন', 'report dismissed': 'রিপোর্ট বন্ধ', 'post removed': 'পোস্ট সরানো' };
    box.appendChild(h('p', 'hint', 'অ্যাডমিন ও সাপোর্ট টিম এই প্যানেল থেকে যা যা বদলেছেন, তার তালিকা। এটি মোছা যায় না।'));
    if (!d.audit.length) { box.appendChild(empty('এখনো কিছু বদলানো হয়নি।')); return; }
    box.appendChild(table(['কখন', 'কে', 'কী', 'কার/কীসের', 'বিস্তারিত'], d.audit.map(a => [when(a.at), a.name || 'মুছে ফেলা অ্যাকাউন্ট', WHAT[a.action] || a.action, a.target, a.detail])));
  } },

  settings: { title: 'সেটিংস', icon: 'cog', async draw(box) {
    const s = await api('system');
    const f = (await api('flags')).flags;
    const sw = h('div', 'card');
    sw.append(h('h3', null, 'ফিচার চালু/বন্ধ'), h('p', 'hint', 'জরুরি অবস্থায় (স্প্যাম, আক্রমণ) পুরো অ্যাপের জন্য এক চাপে বন্ধ করুন। অ্যাডমিন ও টিম সবসময় পারবেন।'),
      switchRow('নতুন অ্যাকাউন্ট খোলা', 'বন্ধ করলে নতুন কেউ সাইন আপ করতে পারবেন না', 'signups', f.signups),
      switchRow('পোস্ট ও স্টোরি দেওয়া', 'বন্ধ করলে সাধারণ ব্যবহারকারীরা নতুন পোস্ট বা স্টোরি দিতে পারবেন না', 'posts', f.posts));
    box.appendChild(sw);
    const notice = h('div', 'card');
    const text = h('textarea');
    text.maxLength = 240; text.rows = 2; text.value = s.notice; text.placeholder = 'যেমন: ঈদের ছুটিতে কাউন্টারে ভাড়া বাড়তে পারে। ফাঁকা রাখলে কিছু দেখাবে না।';
    notice.append(h('h3', null, 'অ্যাপের ঘোষণা'), h('p', 'hint', 'অ্যাপের প্রথম পাতার উপরে সবার জন্য একটি ছোট বার্তা। শুধু অ্যাডমিন বদলাতে পারেন।'), text,
      btn('ঘোষণা সেভ করুন', '', () => act(api('notice', { text: text.value }), text.value.trim() ? 'ঘোষণাটি এখন অ্যাপে দেখাচ্ছে।' : 'ঘোষণা সরানো হলো।')));
    const sys = h('div', 'card');
    sys.appendChild(h('h3', null, 'সিস্টেমের অবস্থা'));
    const row = (label, value, tone) => { const r = h('div', 'line'); r.append(h('span', 'k', label), value instanceof Node ? value : chip(value, tone)); sys.appendChild(r); };
    row('ই-মেইল পাঠানো (লগইন কোড)', s.mail ? `চালু · ${s.mailFrom}` : 'সেটআপ হয়নি', s.mail ? 'ok' : 'bad');
    row('কলের রিলে সার্ভার (TURN)', s.turn ? 'চালু' : 'নেই — মোবাইল ডাটায় কল নাও লাগতে পারে', s.turn ? 'ok' : 'warn');
    row('ডাটাবেস', `${num((s.dbBytes / 1048576).toFixed(2))} MB · ${s.dataDir === 'DATA_DIR' ? 'আলাদা ডিস্কে' : 'অ্যাপের ফোল্ডারে'}`, s.dataDir === 'DATA_DIR' ? 'ok' : 'warn');
    row('সার্ভার চলছে', `${num(Math.floor(s.uptime / 3600))} ঘণ্টা ${num(Math.floor(s.uptime % 3600 / 60))} মিনিট`, '');
    row('অ্যাডমিন ই-মেইল', s.admins.length ? s.admins.join(', ') : 'ADMIN_EMAILS সেট করা নেই', s.admins.length ? '' : 'bad');
    row('Node.js', s.node, '');
    const help = h('div', 'card');
    help.append(h('h3', null, 'সার্ভারে যা সেট করতে হয়'), h('p', 'hint', 'হোস্টিংয়ের "Environment variables"-এ এগুলো বসান, তারপর সার্ভার আবার চালু করুন।'));
    for (const [k, v] of [['ADMIN_EMAILS', 'যে ই-মেইল(গুলো) অ্যাডমিন হবে, কমা দিয়ে'], ['BREVO_API_KEY · MAIL_FROM', 'লগইন কোডের মেইল পাঠানো (Brevo), পাঠানোর ঠিকানা no-reply@manzeela.com'],
                          ['R2_ENDPOINT · R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY · R2_BUCKET · R2_BACKUP=1', 'ছবি-ভিডিও আর ডাটাবেসের কপি Cloudflare R2-তে'], ['ESRI_KEY', 'স্যাটেলাইট ম্যাপের চাবি'],
                          ['DATA_DIR', 'ডাটাবেস রাখার স্থায়ী ডিস্কের ফোল্ডার'], ['TURN_URL · TURN_USER · TURN_PASS অথবা METERED_APP · METERED_KEY', 'মোবাইল ডাটায় কল চালানোর রিলে সার্ভার']]) {
      const r = h('div', 'line'); r.append(h('code', null, k), h('span', 'k', v)); help.appendChild(r);
    }
    box.append(notice, sys, help);
  } }
};

// ---- a user ----
async function openUser(id) {
  const { user: u, stats } = await api('user?id=' + id);
  const top = h('div', 'utop');
  top.append(avatar(u, 'xl'), h('b', null, u.name), h('span', null, `@${u.username || '—'} · ${u.email}`), h('p', null, u.bio || 'বায়ো লেখেননি।'));
  const chips = h('div', 'chips');
  chips.append(chip(ROLE[u.role], u.role === 'admin' ? 'violet' : u.role === 'staff' ? 'ok' : ''), u.banned ? chip('অ্যাকাউন্ট বন্ধ', 'bad') : chip('সচল', 'ok'), u.online ? chip('এখন অনলাইন', 'live') : chip('শেষ সক্রিয় ' + ago(u.seen)));
  if (u.verified) chips.appendChild(chip('ভেরিফায়েড', 'violet'));
  chips.appendChild(u.twofa ? chip('টু-স্টেপ চালু', 'ok') : chip('টু-স্টেপ বন্ধ'));
  if (u.creator) chips.appendChild(chip({ applied: 'ক্রিয়েটর আবেদন', approved: 'ক্রিয়েটর', rejected: 'ক্রিয়েটর বাতিল' }[u.creator] || u.creator, 'violet'));
  top.appendChild(chips);
  const grid = h('div', 'stats');
  for (const [label, value] of [['বন্ধু', stats.friends], ['পাঠানো মেসেজ', stats.messages], ['সাপোর্ট অনুরোধ', stats.tickets], ['তার বিরুদ্ধে রিপোর্ট', stats.reportsAbout],
                                ['তিনি রিপোর্ট করেছেন', stats.reportsBy], ['রেটিং', stats.ratings], ['জানানো ভাড়া', stats.fares], ['লগইন থাকা ডিভাইস', stats.sessions]]) {
    const s = h('div'); s.append(h('b', null, num(value)), h('span', null, label)); grid.appendChild(s);
  }
  const acts = h('div', 'acts col');
  const again = () => { openUser(id); if (page === 'users' || page === 'overview') show(page); };
  // The blue badge: only an admin gives it, and may give it to their own account too.
  if (ME.role === 'admin') acts.append(u.verified
    ? btn('ভেরিফায়েড ব্যাজ সরিয়ে নিন', 'quiet', async () => { if (await act(api('user', { id, do: 'unverify' }), 'ব্যাজ সরানো হলো।')) again(); })
    : btn('ভেরিফায়েড ব্যাজ দিন', '', async () => { if (await act(api('user', { id, do: 'verify' }), 'ব্যাজ দেওয়া হলো।')) again(); }));
  if (u.id !== ME.id) {
    acts.append(u.banned ? btn('অ্যাকাউন্ট আবার চালু করুন', '', async () => { if (await act(api('user', { id, do: 'unban' }), 'অ্যাকাউন্ট চালু হলো।')) again(); })
                         : btn('অ্যাকাউন্ট বন্ধ করুন (ব্যান)', 'bad', async () => { const note = prompt('কেন বন্ধ করছেন? (খতিয়ানে লেখা থাকবে)'); if (note !== null && await act(api('user', { id, do: 'ban', note }), 'অ্যাকাউন্ট বন্ধ হলো।')) again(); }));
    acts.append(btn('সব ডিভাইস থেকে লগআউট করান', 'quiet', () => act(api('user', { id, do: 'signout' }), 'সব ডিভাইস থেকে লগআউট হলো।')));
    if (ME.role === 'admin') {
      const role = h('select');
      for (const [v, t] of Object.entries(ROLE)) { const o = h('option', null, t); o.value = v; role.appendChild(o); }
      role.value = u.role;
      role.addEventListener('change', async () => { if (await act(api('user', { id, do: 'role', role: role.value }), 'ভূমিকা বদলানো হলো।')) again(); });
      const wrap = h('label', 'field'); wrap.append(h('span', null, 'ভূমিকা'), role);
      acts.append(wrap, btn('অ্যাকাউন্ট চিরতরে মুছে ফেলুন', 'bad quiet', async () => {
        if (confirm(`${u.name}-এর অ্যাকাউন্ট, মেসেজ ও সব তথ্য চিরতরে মুছে যাবে। নিশ্চিত?`) && await act(api('user', { id, do: 'delete' }), 'অ্যাকাউন্ট মুছে ফেলা হলো।')) { closeDrawer(); show(page); }
      }));
    }
  } else acts.appendChild(h('p', 'hint', 'এটি আপনার নিজের অ্যাকাউন্ট।'));
  const devices = h('div', 'card flat');
  devices.appendChild(h('h3', null, 'যেসব ডিভাইসে লগইন আছে'));
  try {
    const { sessions } = await api('sessions?id=' + id);
    for (const ss of sessions) {
      const row = h('div', 'line');
      const t = h('div', 't');
      t.append(h('b', null, ss.agent), h('span', null, `শেষ ব্যবহার ${ago(ss.last || ss.made)} · লগইন ${ss.made ? when(ss.made) : '—'}`));
      row.append(t);
      if (ME.role === 'admin') row.appendChild(btn('লগআউট', 'quiet small', async () => { if (await act(api('session-end', { user: id, id: ss.id }), 'ওই ডিভাইস থেকে লগআউট হলো।')) row.remove(); }));
      devices.appendChild(row);
    }
    if (!sessions.length) devices.appendChild(empty('কোথাও লগইন নেই।'));
  } catch { devices.appendChild(empty('দেখানো যায়নি।')); }
  openDrawer('ব্যবহারকারী', [top, grid, h('p', 'hint', `যোগ দিয়েছেন ${when(u.created)}। ব্যক্তিগত মেসেজ এখানে দেখা যায় না — শুধু সংখ্যা।`), devices, acts]);
}

// ---- a support ticket ----
async function openTicket(id) {
  const { ticket: t, user: u, messages } = await api('ticket?id=' + id);
  const who = u ? person(u) : h('div', 'hint', 'অ্যাকাউন্টটি আর নেই।');
  if (u) { who.classList.add('click'); who.addEventListener('click', () => openUser(u.id)); }
  const meta = h('div', 'chips');
  meta.append(chip(KIND[t.category]), chip(STATUS[t.status], t.status === 'open' ? 'warn' : t.status === 'answered' ? 'ok' : ''), chip(when(t.created)));
  const thread = h('div', 'thread');
  for (const m of messages) {
    const b = h('div', 'tmsg ' + (m.staff ? 'staff' : 'them'));
    b.append(h('small', null, `${m.staff ? (m.name || 'টিম') + ' · সাপোর্ট' : (m.name || 'ব্যবহারকারী')} · ${when(m.sent)}`), h('p', null, m.body));
    thread.appendChild(b);
  }
  const reply = h('textarea');
  reply.rows = 3; reply.maxLength = 3000; reply.placeholder = 'উত্তর লিখুন…';
  const done = () => { openTicket(id); if (page === 'support' || page === 'overview') show(page); };
  const send = close => async () => {
    if (!reply.value.trim()) { snack('আগে উত্তরটি লিখুন।', true); return; }
    if (await act(api('ticket', { id, body: reply.value, close }), close ? 'উত্তর পাঠিয়ে বন্ধ করা হলো।' : 'উত্তর পাঠানো হলো।')) done();
  };
  const foot = [reply, btn('উত্তর পাঠান', '', send(false)), btn('উত্তর দিয়ে বন্ধ করুন', 'quiet', send(true)),
    t.status === 'closed' ? btn('আবার খুলুন', 'quiet', async () => { if (await act(api('ticket', { id, status: 'open' }), 'আবার খোলা হলো।')) done(); })
                          : btn('উত্তর ছাড়াই বন্ধ', 'quiet', async () => { if (await act(api('ticket', { id, status: 'closed' }), 'বন্ধ করা হলো।')) done(); })];
  openDrawer(t.subject, [who, meta, thread], foot);
  $('drawer-body').scrollTop = $('drawer-body').scrollHeight;
}

// ---- shell ----
// An on/off switch for a feature of the whole app.
function switchRow(title, sub, key, on) {
  const row = h('div', 'line sw-row');
  const t = h('div', 't');
  t.append(h('b', null, title), h('span', null, sub));
  const sw = h('button', 'switch' + (on ? ' on' : ''));
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-checked', String(on));
  sw.appendChild(h('i'));
  sw.addEventListener('click', async () => {
    if (ME.role !== 'admin') { snack(ERR.forbidden, true); return; }
    const next = !sw.classList.contains('on');
    if (await act(api('flags', { [key]: next }), next ? 'চালু করা হলো।' : 'বন্ধ করা হলো।')) { sw.classList.toggle('on', next); sw.setAttribute('aria-checked', String(next)); }
  });
  row.append(t, sw);
  return row;
}

function setCounts(o) {
  for (const [key, n] of [['support', o.ticketsOpen], ['reports', o.reportsOpen], ['photos', o.placePhotosWaiting], ['gems', o.gemsWaiting], ['fares', o.faresWaiting], ['creators', (o.payoutsWaiting || 0) + (o.creatorsWaiting || 0)]]) {
    const b = document.querySelector(`#nav [data-page=${key}] em`);
    if (b) { b.textContent = num(n); b.hidden = !n; }
  }
}
// One search box for people, posts and groups, reachable from every page ("/" focuses it).
function wireSearch() {
  const q = $('gq'), out = $('gs');
  let timer = null, seq = 0;
  const close = () => { out.hidden = true; };
  q.addEventListener('input', () => {
    clearTimeout(timer);
    const text = q.value.trim(), mine = ++seq;
    if (text.length < 2) { close(); return; }
    timer = setTimeout(async () => {
      let d;
      try { d = await api('search?q=' + encodeURIComponent(text)); } catch { return; }
      if (mine !== seq) return;
      const parts = [];
      if (d.users.length) { parts.push(h('div', 'gs-label', 'মানুষ')); for (const u of d.users) { const r = person(u, `@${u.username || ''} · ${u.email}`); r.classList.add('click'); r.addEventListener('click', () => { close(); openUser(u.id); }); parts.push(r); } }
      if (d.posts.length) { parts.push(h('div', 'gs-label', 'পোস্ট')); for (const p of d.posts) { const r = h('div', 'line click'); const t = h('div', 't'); t.append(h('b', null, p.caption || '(ছবি/ভিডিও)'), h('span', null, p.user.name + ' · ' + ago(p.created))); r.appendChild(t); r.addEventListener('click', () => { close(); show('posts'); }); parts.push(r); } }
      if (d.groups.length) { parts.push(h('div', 'gs-label', 'গ্রুপ')); for (const g of d.groups) { const r = h('div', 'line click'); const t = h('div', 't'); t.append(h('b', null, g.name), h('span', null, 'গ্রুপ চ্যাট')); r.appendChild(t); r.addEventListener('click', () => { close(); show('groups'); }); parts.push(r); } }
      out.replaceChildren(...(parts.length ? parts : [h('div', 'gs-none', 'কিছু পাওয়া যায়নি।')]));
      out.hidden = false;
    }, 220);
  });
  q.addEventListener('keydown', e => { if (e.key === 'Escape') { q.value = ''; close(); q.blur(); } });
  document.addEventListener('click', e => { if (!e.target.closest('.gsearch')) close(); });
  addEventListener('keydown', e => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); q.focus(); } });
}

let drawing = 0;
async function show(name) {
  const mine = ++drawing;                          // a newer request to draw wins over one still loading
  page = PAGES[name] ? name : 'overview';
  if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
  for (const a of $('nav').children) a.classList.toggle('on', a.dataset.page === page);
  $('title').textContent = PAGES[page].title;
  $('tools').replaceChildren();
  const box = h('div', 'page');
  try { await PAGES[page].draw(box); }
  catch (e) {
    if (e.status === 403 || e.status === 401) { location.reload(); return; }
    box.replaceChildren(empty('তথ্য আনা যায়নি। পাতাটি আবার খুলে দেখুন।'));
  }
  if (mine !== drawing) return;
  $('content').replaceChildren(box);
  if (page !== 'overview') api('overview').then(setCounts).catch(() => {});
}

(async function start() {
  try { ME = (await api('me')).user; }
  catch (e) {
    $('gate').hidden = false;
    if (e.status === 401) { $('gate-text').textContent = 'প্যানেল লক করা আছে। নতুন প্যানেলে কোড দিয়ে খুলুন, তারপর এখানে ফিরে আসুন।'; const a = document.querySelector('#gate .btn'); if (a) { a.href = 'admin.html'; a.textContent = 'প্যানেল খুলুন'; } }
    else if (e.status !== 403) $('gate-text').textContent = 'সার্ভারের সাথে যোগাযোগ করা যায়নি। একটু পরে আবার চেষ্টা করুন।';
    return;
  }
  const NAV = [['প্রধান', ['overview']], ['মানুষ', ['users', 'support', 'reports']], ['কনটেন্ট', ['photos', 'gems', 'posts', 'stories', 'sounds', 'comments', 'groups']],
               ['আয় ও কমিউনিটি', ['creators', 'fares']], ['সিস্টেম', ['audit', 'settings']]];
  for (const [label, keys] of NAV) {
    $('nav').appendChild(h('div', 'nav-group', label));
    for (const key of keys) {
    const p = PAGES[key];
    if (!p) continue;
    const a = h('a');
    a.dataset.page = key;
    a.href = '#' + key;
    a.innerHTML = icon(p.icon);
    a.append(h('span', null, p.title), Object.assign(h('em'), { hidden: true }));
    a.addEventListener('click', e => { e.preventDefault(); show(key); });
    $('nav').appendChild(a);
    }
  }
  wireSearch();
  const me = person(ME, ROLE[ME.role]);
  $('me').appendChild(me);
  $('shell').hidden = false;
  show(location.hash.slice(1) || 'overview');
  setInterval(() => { if (!document.hidden && $('drawer').hidden && (page === 'overview' || page === 'support' || page === 'reports')) show(page); }, 60_000);
})();
