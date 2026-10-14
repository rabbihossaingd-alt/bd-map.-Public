// ---- BD Map admin panel ----
// A separate page (admin.html) for the people who run the app: numbers at a glance, users, support tickets,
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
    const kpis = h('div', 'kpis');
    const kpi = (label, value, sub, tone) => { const k = h('div', 'kpi ' + (tone || '')); k.append(h('span', null, label), h('b', null, num(value)), h('small', null, sub)); kpis.appendChild(k); };
    kpi('মোট ব্যবহারকারী', o.users, `আজ নতুন ${num(o.usersToday)} জন`);
    kpi('আজ সক্রিয়', o.activeToday, `৭ দিনে ${num(o.active7)} জন`);
    kpi('এখন অনলাইন', o.online, 'অ্যাপ খোলা আছে', 'live');
    kpi('উত্তর বাকি', o.ticketsOpen, `মোট ${num(o.tickets)}টি সাপোর্ট অনুরোধ`, o.ticketsOpen ? 'warn' : '');
    kpi('খোলা রিপোর্ট', o.reportsOpen, `বন্ধ করা অ্যাকাউন্ট ${num(o.banned)}টি`, o.reportsOpen ? 'bad' : '');
    kpi('আজকের মেসেজ', o.messagesToday, `মোট ${num(o.messages)}টি · বন্ধুত্ব ${num(o.friendships)}টি`);
    kpi('পোস্ট', o.posts, `আজ ${num(o.postsToday)}টি`);
    kpi('জানানো ভাড়া', o.fares, 'যাত্রীদের কাছ থেকে');
    const charts = h('div', 'charts');
    const chart = (title, data) => {
      const c = h('div', 'card chart'), bars = h('div', 'bars'), max = Math.max(1, ...data);
      c.append(h('span', null, title), h('b', null, num(data.reduce((a, b) => a + b, 0))), h('small', null, 'গত ১৪ দিন'));
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
    chart('নতুন অ্যাকাউন্ট', o.signups); chart('মেসেজ', o.chats); chart('সাপোর্ট অনুরোধ', o.support);
    const cols = h('div', 'cols');
    const users = h('div', 'card'), tickets = h('div', 'card');
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
    cols.append(users, tickets);
    box.append(kpis, charts, cols);
  } },

  users: { title: 'ব্যবহারকারী', icon: 'users', state: { q: '', filter: 'all', page: 0 }, async draw(box) {
    const st = this.state;
    const search = h('input', 'search');
    search.placeholder = 'নাম বা ই-মেইল দিয়ে খুঁজুন';
    search.value = st.q;
    let timer;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { st.q = search.value; st.page = 0; fill(); }, 250); });
    $('tools').replaceChildren(search);
    const holder = h('div');
    box.append(tabs([['all', 'সবাই'], ['new', 'এই সপ্তাহে নতুন'], ['team', 'টিম'], ['banned', 'বন্ধ করা']], st.filter, v => { st.filter = v; st.page = 0; show('users'); }), holder);
    async function fill() {
      const d = await api(`users?q=${encodeURIComponent(st.q)}&filter=${st.filter}&page=${st.page}`);
      const rows = d.users.map(u => Object.assign([person(u), chip(ROLE[u.role], u.role === 'admin' ? 'violet' : u.role === 'staff' ? 'ok' : ''), ago(u.created),
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

  posts: { title: 'পোস্ট', icon: 'image', async draw(box) {
    const d = await api('posts');
    box.appendChild(h('p', 'hint', 'এক্সপ্লোরে সবাই যা পোস্ট করেছেন। আপত্তিকর ছবি বা ভিডিও এখান থেকে সরানো যায়; সরালে তা খতিয়ানে লেখা থাকে।'));
    if (!d.posts.length) { box.appendChild(empty('এখনো কেউ কিছু পোস্ট করেননি।')); return; }
    const grid = h('div', 'pgrid');
    for (const p of d.posts) {
      const card = h('div', 'card pcard');
      const media = h(p.kind === 'video' ? 'video' : 'img');
      media.src = p.src;
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
    box.appendChild(h('h3', 'sub', 'যেকোনো পথের ভাড়া (পয়েন্টসহ)'));
    box.appendChild(d.contributions.length ? table(['পথ', 'বাহন', 'ভাড়া', 'কে', 'কখন', ''], d.contributions.map(c => [`${c.flabel} → ${c.tlabel}`, MODE[c.mode] || c.mode, '৳' + num(c.fare), `${c.name} (${c.email})`, ago(c.created),
      btn('সরান, পয়েন্ট কাটুন', 'quiet small', async () => { if (await act(api('contribution', { id: c.id }), 'ভাড়াটি সরানো হলো, ১০ পয়েন্ট কাটা গেল।')) show('fares'); })])) : empty('এখনো কেউ এই পাতা থেকে ভাড়া জানাননি।'));
    box.appendChild(h('h3', 'sub', 'ঢাকার বাসের স্টপ-থেকে-স্টপ ভাড়া'));
    if (!d.fares.length) { box.appendChild(empty('এখনো কেউ ভাড়া জানাননি।')); return; }
    box.appendChild(table(['পথ', 'ভাড়া', 'কে', 'কখন', ''], d.fares.map(f => [`${stop(f.a)} ↔ ${stop(f.b)}`, '৳' + num(f.fare), f.device.startsWith('u') && f.device.length < 8 ? `অ্যাকাউন্ট #${f.device.slice(1)}` : 'লগইন ছাড়া', ago(f.updated),
      btn('সরান', 'quiet small', async () => { if (await act(api('fare', { a: f.a, b: f.b, device: f.device }), 'ভাড়াটি সরানো হলো।')) show('fares'); })])));
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
                   earning: 'আয় যোগ', 'payout paid': 'টাকা পাঠানো', 'payout rejected': 'টাকা তোলা বাতিল', 'creator rules': 'ক্রিয়েটর নিয়ম বদল', ban: 'অ্যাকাউন্ট বন্ধ', unban: 'অ্যাকাউন্ট চালু', role: 'ভূমিকা বদল', delete: 'অ্যাকাউন্ট মোছা', signout: 'সব ডিভাইস থেকে লগআউট', reply: 'সাপোর্টে উত্তর',
                   notice: 'ঘোষণা বদল', 'fare removed': 'ভাড়া সরানো', 'report dismissed': 'রিপোর্ট বন্ধ', 'post removed': 'পোস্ট সরানো' };
    box.appendChild(h('p', 'hint', 'অ্যাডমিন ও সাপোর্ট টিম এই প্যানেল থেকে যা যা বদলেছেন, তার তালিকা। এটি মোছা যায় না।'));
    if (!d.audit.length) { box.appendChild(empty('এখনো কিছু বদলানো হয়নি।')); return; }
    box.appendChild(table(['কখন', 'কে', 'কী', 'কার/কীসের', 'বিস্তারিত'], d.audit.map(a => [when(a.at), a.name || 'মুছে ফেলা অ্যাকাউন্ট', WHAT[a.action] || a.action, a.target, a.detail])));
  } },

  settings: { title: 'সেটিংস', icon: 'cog', async draw(box) {
    const s = await api('system');
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
    for (const [k, v] of [['ADMIN_EMAILS', 'যে ই-মেইল(গুলো) অ্যাডমিন হবে, কমা দিয়ে'], ['SMTP_HOST · SMTP_USER · SMTP_PASS', 'লগইন কোড পাঠানোর মেইল অ্যাকাউন্ট (Gmail হলে smtp.gmail.com ও একটি App Password)'],
                          ['DATA_DIR', 'ডাটাবেস রাখার স্থায়ী ডিস্কের ফোল্ডার'], ['TURN_URL · TURN_USER · TURN_PASS', 'মোবাইল ডাটায় কল চালানোর রিলে সার্ভার (ঐচ্ছিক)']]) {
      const r = h('div', 'line'); r.append(h('code', null, k), h('span', 'k', v)); help.appendChild(r);
    }
    box.append(notice, sys, help);
  } }
};

// ---- a user ----
async function openUser(id) {
  const { user: u, stats } = await api('user?id=' + id);
  const top = h('div', 'utop');
  top.append(avatar(u, 'xl'), h('b', null, u.name), h('span', null, u.email), h('p', null, u.bio || 'বায়ো লেখেননি।'));
  const chips = h('div', 'chips');
  chips.append(chip(ROLE[u.role], u.role === 'admin' ? 'violet' : u.role === 'staff' ? 'ok' : ''), u.banned ? chip('অ্যাকাউন্ট বন্ধ', 'bad') : chip('সচল', 'ok'), u.online ? chip('এখন অনলাইন', 'live') : chip('শেষ সক্রিয় ' + ago(u.seen)));
  if (u.verified) chips.appendChild(chip('ভেরিফায়েড', 'violet'));
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
  openDrawer('ব্যবহারকারী', [top, grid, h('p', 'hint', `যোগ দিয়েছেন ${when(u.created)}। ব্যক্তিগত মেসেজ এখানে দেখা যায় না — শুধু সংখ্যা।`), acts]);
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
function setCounts(o) {
  for (const [key, n] of [['support', o.ticketsOpen], ['reports', o.reportsOpen]]) {
    const b = document.querySelector(`#nav [data-page=${key}] em`);
    if (b) { b.textContent = num(n); b.hidden = !n; }
  }
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
    if (e.status === 403) { location.reload(); return; }
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
    if (e.status !== 403) $('gate-text').textContent = 'সার্ভারের সাথে যোগাযোগ করা যায়নি। একটু পরে আবার চেষ্টা করুন।';
    return;
  }
  for (const [key, p] of Object.entries(PAGES)) {
    const a = h('a');
    a.dataset.page = key;
    a.href = '#' + key;
    a.innerHTML = icon(p.icon);
    a.append(h('span', null, p.title), Object.assign(h('em'), { hidden: true }));
    a.addEventListener('click', e => { e.preventDefault(); show(key); });
    $('nav').appendChild(a);
  }
  const me = person(ME, ROLE[ME.role]);
  $('me').appendChild(me);
  $('shell').hidden = false;
  show(location.hash.slice(1) || 'overview');
  setInterval(() => { if (!document.hidden && $('drawer').hidden && (page === 'overview' || page === 'support' || page === 'reports')) show(page); }, 60_000);
})();
