// The frame around every page: the menu (grouped, collapsible, with waiting-work badges, only what the role may
// use), the top bar (where you are, search, who is online, the bell, theme, profile), the phone's tab bar, the
// address-driven router (#/page/id — links and the back button work), shortcuts, and the live stream.
import { api, can, on, session, errText } from './api.js';
import { attrs, avatar, button, closeAllModals, closeDrawer, drawerOpen, drawerStep, h, icon, menu, modal, modalOpen, openDrawer, toast, badge } from './ui.js';
import { num, ago } from './fmt.js';
import { openPalette, paletteOpen } from './palette.js';

// The menu (every page is built; the older panel is gone).
// count: which waiting-work number shows beside it.
export const NAV = [
  ['প্রধান', [
    { key: 'command', title: 'কমান্ড সেন্টার', ic: 'home', perm: 'dashboard.view', status: 'v2', hint: 'g h' },
    { key: 'inbox', title: 'ইনবক্স', ic: 'inbox', perm: 'inbox.view', status: 'v2', hint: 'g i', count: 'all' }]],
  ['সাপোর্ট', [
    { key: 'tickets', title: 'টিকিট', ic: 'life', perm: 'support.view', status: 'v2', count: 'support' },
    { key: 'macros', title: 'উত্তর-টেমপ্লেট', ic: 'reply', perm: 'support.view', status: 'v2' }]],
  ['মানুষ', [
    { key: 'users', title: 'ব্যবহারকারী', ic: 'users', perm: 'users.view', status: 'v2' },
    { key: 'team', title: 'টিম ও অনুমতি', ic: 'key', perm: 'team.manage', status: 'v2' }]],
  ['বিশ্বাস ও নিরাপত্তা', [
    { key: 'reports', title: 'রিপোর্ট', ic: 'flag', perm: 'reports.view', status: 'v2', count: 'reports' },
    { key: 'modqueue', title: 'মডারেশন কিউ', ic: 'shield', perm: 'content.remove', status: 'v2' },
    { key: 'strikes', title: 'স্ট্রাইক ও আপিল', ic: 'strike', perm: 'content.remove', status: 'v2', count: 'appeals' },
    { key: 'risk', title: 'ঝুঁকি সংকেত', ic: 'radar', perm: 'users.ban', status: 'v2' }]],
  ['কনটেন্ট', [
    { key: 'posts', title: 'পোস্ট ও রিল', ic: 'image', perm: 'content.remove', status: 'v2' },
    { key: 'stories', title: 'স্টোরি', ic: 'story', perm: 'content.remove', status: 'v2' },
    { key: 'comments', title: 'মন্তব্য', ic: 'comment', perm: 'content.remove', status: 'v2' },
    { key: 'sounds', title: 'সাউন্ড', ic: 'music', perm: 'content.remove', status: 'v2' },
    { key: 'groups', title: 'গ্রুপ', ic: 'group', perm: 'content.remove', status: 'v2' },
    { key: 'media', title: 'মিডিয়া', ic: 'cpu', perm: 'system.view', status: 'v2' }]],
  ['যাতায়াত ডেটা', [
    { key: 'fares', title: 'জানানো ভাড়া', ic: 'tag', perm: 'data.approve', status: 'v2', count: 'fares' },
    { key: 'routes', title: 'ঢাকার বাস রুট ও স্টপ', ic: 'bus', perm: 'data.edit', status: 'v2' },
    { key: 'intercity', title: 'দূরপাল্লা · ট্রেন · লঞ্চ', ic: 'train', perm: 'data.edit', status: 'v2' },
    { key: 'photos', title: 'জায়গার ছবি', ic: 'pin', perm: 'data.approve', status: 'v2', count: 'photos' },
    { key: 'gems', title: 'মেঠোপথ', ic: 'leaf', perm: 'data.approve', status: 'v2', count: 'gems' },
    { key: 'quality', title: 'ডেটার মান', ic: 'checkc', perm: 'data.edit', status: 'v2' }]],
  ['আয়', [
    { key: 'creators', title: 'ক্রিয়েটর', ic: 'coins', perm: 'creators.manage', status: 'v2', count: 'creators' },
    { key: 'payouts', title: 'পেআউট', ic: 'wallet', perm: 'payouts.view', status: 'v2', count: 'payouts' },
    { key: 'ledger', title: 'লেজার', ic: 'book', perm: 'payouts.view', status: 'v2' }]],
  ['অ্যানালিটিক্স', [
    { key: 'growth', title: 'বৃদ্ধি ও ধরে রাখা', ic: 'chart', perm: 'analytics.view', status: 'v2' },
    { key: 'features', title: 'ফিচার ব্যবহার', ic: 'activity', perm: 'analytics.view', status: 'v2' },
    { key: 'searches', title: 'সার্চ ইনসাইট', ic: 'search', perm: 'analytics.view', status: 'v2' }]],
  ['সিস্টেম', [
    { key: 'foryou', title: 'ফর ইউ নিয়ন্ত্রণ', ic: 'radar', perm: 'foryou.manage', status: 'v2' },
    { key: 'flags', title: 'ফিচার ফ্ল্যাগ', ic: 'toggle', perm: 'flags.manage', status: 'v2' },
    { key: 'notices', title: 'ঘোষণা ও নোটিফিকেশন', ic: 'megaphone', perm: 'notice.manage', status: 'v2' },
    { key: 'audit', title: 'কাজের খতিয়ান', ic: 'list', perm: 'audit.view', status: 'v2' },
    { key: 'health', title: 'সিস্টেমের অবস্থা', ic: 'server', perm: 'system.view', status: 'v2' },
    { key: 'prefs', title: 'প্যানেল সেটিংস', ic: 'cog', perm: null, status: 'v2' }]]
];
const ALL_PAGES = NAV.flatMap(([group, items]) => items.map(p => ({ ...p, group })));
const PAGE_FILES = { command: './pages/command.js', audit: './pages/audit.js', team: './pages/team.js', prefs: './pages/prefs.js', inbox: './pages/inbox.js', tickets: './pages/tickets.js',
  macros: './pages/macros.js', users: './pages/users.js', reports: './pages/reports.js',
  posts: './pages/content.js', stories: './pages/content.js', comments: './pages/content.js', sounds: './pages/content.js', groups: './pages/content.js',
  media: './pages/media.js', fares: './pages/fares.js', photos: './pages/review.js', gems: './pages/review.js', routes: './pages/routes.js', intercity: './pages/intercity.js', quality: './pages/quality.js',
  growth: './pages/analytics.js', features: './pages/analytics.js', searches: './pages/analytics.js', flags: './pages/flags.js', foryou: './pages/foryou.js', notices: './pages/notices.js', health: './pages/health.js',
  creators: './pages/creators.js', payouts: './pages/payouts.js', ledger: './pages/ledger.js', strikes: './pages/strikes.js', modqueue: './pages/modqueue.js', risk: './pages/risk.js' };
export const pagesFor = () => ALL_PAGES.filter(p => !p.perm || can(p.perm));

let current = { key: '', mod: null, inst: null };
let counts = {};
const badgeEls = new Map();

export function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

// ---- the frame ----
export function buildShell(root) {
  const collapsed = (() => { try { return localStorage.getItem('mzadm.side') === 'mini'; } catch { return false; } })();
  document.body.classList.toggle('side-mini', collapsed);
  const side = h('nav', 'side'), top = h('header', 'top'), main = attrs(h('main', 'main'), { id: 'main', tabindex: '-1' }), tabbar = h('nav', 'tabbar');
  // the menu
  side.append(h('div', 'brand', h('span', 'logo'), h('b', null, 'Manzeela'), h('span', 'muted', 'অ্যাডমিন'),
    button('', { kind: 'ghost', ic: 'sidebar', title: 'মেনু ছোট/বড় করুন', onClick: () => { const m = !document.body.classList.contains('side-mini'); document.body.classList.toggle('side-mini', m); try { localStorage.setItem('mzadm.side', m ? 'mini' : ''); } catch { /* storage off */ } } })));
  const navList = h('div', 'nav-list');
  for (const [group, items] of NAV) {
    const allowed = items.filter(p => !p.perm || can(p.perm));
    if (!allowed.length) continue;
    navList.append(h('div', 'nav-group', group));
    for (const p of allowed) {
      const a = attrs(h('a', 'nav-item', icon(p.ic), h('span', 'label', p.title)), { href: '#/' + p.key, title: p.title, 'data-key': p.key });
      if (p.count) { const b = h('em', 'nbadge'); b.hidden = true; a.append(b); badgeEls.set(p.key, b); }
      a.addEventListener('click', () => document.body.classList.remove('side-open'));
      navList.append(a);
    }
  }
  side.append(navList);
  // the top bar
  const crumbs = h('div', 'crumbs');
  const searchBtn = h('button', 'top-search', icon('search'), h('span', null, 'খুঁজুন বা কোনো পাতায় যান'), h('kbd', null, 'Ctrl K'));
  searchBtn.type = 'button';
  searchBtn.addEventListener('click', () => palette());
  const online = attrs(h('span', 'online', h('span', 'sdot live'), h('b', null, '—'), h('span', 'muted', ' অনলাইন')), { title: 'এখন অ্যাপ খুলে রেখেছেন' });
  const bell = button('', { kind: 'ghost', ic: 'bell', title: 'যা বাকি', onClick: e => bellMenu(e.currentTarget) });
  const bellDot = h('span', 'bell-dot'); bellDot.hidden = true; bell.append(bellDot);
  const theme = button('', { kind: 'ghost', ic: document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun', title: 'থিম বদলান', onClick: () => toggleTheme(theme) });
  const me = session.me;
  const prof = h('button', 'prof', avatar(me.user, 'sm'), h('span', 'prof-t', h('b', null, me.user.name), h('small', null, me.roleName)));
  prof.type = 'button';
  prof.addEventListener('click', () => menu(prof, [{ label: `${me.user.name} · ${me.roleName}` }, { text: 'প্যানেল সেটিংস', ic: 'cog', run: () => go('#/prefs') }, { text: 'শর্টকাট', ic: 'keyboard', hint: '?', run: shortcutsHelp },
    { text: 'অ্যাপে ফিরে যান', ic: 'ext', run: () => { location.href = 'index.html'; } }, '-', { text: 'প্যানেল লক করুন', ic: 'lock', danger: true, run: lockNow }]));
  const env = h('span', 'env ' + me.env, me.env === 'production' ? 'Production' : 'Local');
  const menuBtn = button('', { kind: 'ghost', ic: 'menu', title: 'মেনু', onClick: () => document.body.classList.toggle('side-open') });
  menuBtn.classList.add('only-phone');
  top.append(menuBtn, crumbs, searchBtn, h('span', 'grow'), env, online, bell, theme, prof);
  // the phone's tab bar
  const tab = (key, ic, text, run) => { const b = attrs(h('button', 'tab', icon(ic), h('span', null, text)), { type: 'button', 'data-key': key }); b.addEventListener('click', run); return b; };
  tabbar.append(tab('command', 'home', 'কমান্ড', () => go('#/command')), tab('inbox', 'inbox', 'ইনবক্স', () => go('#/inbox')), tab('search', 'search', 'খুঁজুন', () => palette()), tab('menu', 'menu', 'মেনু', () => document.body.classList.toggle('side-open')));
  const scrim = h('div', 'side-scrim'); scrim.addEventListener('click', () => document.body.classList.remove('side-open'));
  // two-step not yet on: a reminder, with how long is left
  const tf = me.twofa;
  const banner = !tf.on ? h('div', 'banner warn', icon('alert'), h('span', null, me.owner ? 'আপনার অ্যাকাউন্টে টু-স্টেপ ভেরিফিকেশন চালু নেই। Owner হিসেবে এটা সবচেয়ে জরুরি।' : (tf.graceUntil > Date.now() ? `টু-স্টেপ ভেরিফিকেশন চালু করুন — ${num(Math.ceil((tf.graceUntil - Date.now()) / 864e5))} দিনের মধ্যে, নইলে প্যানেলে ঢোকা যাবে না।` : 'টু-স্টেপ ভেরিফিকেশন চালু করুন — না করলে পরের বার প্যানেলে ঢোকা যাবে না।')),
    attrs(h('a', 'btn sm secondary', 'চালু করুন'), { href: 'index.html#/settings' })) : null;
  root.replaceChildren(side, scrim, h('div', 'frame', top, ...(banner ? [banner] : []), h('div', 'offline', icon('alert'), 'ইন্টারনেট সংযোগ নেই — দেখানো তথ্য পুরনো হতে পারে।'), main), tabbar);
  addEventListener('offline', () => document.body.classList.add('is-offline'));
  addEventListener('online', () => document.body.classList.remove('is-offline'));
  if (!navigator.onLine) document.body.classList.add('is-offline');
  shell = { crumbs, main, online, bellDot, side };
  addEventListener('hashchange', route);
  wireKeys();
  stream();
  route();
}
let shell = null;

function toggleTheme(btn) {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('mzadm.theme', next); } catch { /* storage off */ }
  btn.replaceChildren(icon(next === 'light' ? 'moon' : 'sun'));
}
async function lockNow() { try { await api('lock', {}); } catch { /* locked anyway */ } location.reload(); }
function palette() { openPalette({ pages: pagesFor(), go, openPerson: u => can('users.view') ? go('#/users/' + u.id) : openPerson(u) }); }
// a person from the palette, for a role that cannot open the full 360 view: a short card
function openPerson(u) {
  openDrawer({ title: 'ব্যবহারকারী', ref: 'user:' + u.id, body: h('div', 'stack',
    h('div', 'person lg', avatar(u, 'lg'), h('div', 't', h('b', null, u.name), h('span', null, `@${u.username} · ID ${num(u.id)}`))),
    h('div', 'kv', h('span', null, 'ই-মেইল'), h('b', 'mono', u.email), can('pii.unmask') || can('pii.unmask.ticket') ? button('দেখান', { small: true, ic: 'eye', onClick: async e => { try { const r = await api('pii', { user: u.id, kind: 'email' }); e.currentTarget.previousSibling.textContent = r.value; toast('দেখানো হলো — খতিয়ানে লেখা থাকল।'); } catch (er) { toast(errText(er), { bad: true }); } } }) : null),
    h('div', 'kv', h('span', null, 'অবস্থা'), u.banned ? badge('বন্ধ', 'danger') : badge('সক্রিয়', 'ok'), u.verified ? badge('ভেরিফায়েড', 'info') : null),
    h('p', 'hint', 'পূর্ণ ৩৬০ দেখতে ব্যবহারকারী দেখার অনুমতি লাগে।')) });
  history.pushState({ drawer: 1 }, '', location.hash);
}
addEventListener('popstate', e => { if (drawerOpen() && !(e.state && e.state.drawer)) closeDrawer(); });

function bellMenu(anchor) {
  const lines = [['support', 'সাপোর্টে উত্তর বাকি', 'tickets'], ['reports', 'রিপোর্ট দেখা বাকি', 'reports'], ['fares', 'ভাড়া অনুমোদন বাকি', 'fares'], ['photos', 'জায়গার ছবি', 'photos'], ['gems', 'মেঠোপথ', 'gems'],
    ['payouts', 'পেআউট অপেক্ষায়', 'payouts'], ['appeals', 'আপিল দেখা বাকি', 'strikes'], ['creators', 'ক্রিয়েটর আবেদন', 'creators'], ['verify', 'ব্যাজের আবেদন', 'tickets']].filter(([k]) => counts[k]);
  menu(anchor, [{ label: lines.length ? 'যা বাকি' : 'সব কাজ শেষ — সাবাস' }, ...lines.map(([k, t, page]) => ({ text: `${t} · ${num(counts[k])}`, run: () => go('#/' + page) }))]);
}

// ---- badges and the live stream ----
function paintCounts(c) {
  counts = c;
  const all = ['support', 'reports', 'photos', 'gems', 'fares', 'payouts', 'creators', 'appeals'].reduce((s, k) => s + (c[k] || 0), 0);
  for (const [key, el] of badgeEls) {
    const p = ALL_PAGES.find(x => x.key === key), n = p.count === 'all' ? all : c[p.count] || 0;
    el.textContent = num(n); el.hidden = !n;
    const tone = c.tone && (p.count === 'all' ? (Object.values(c.tone).includes('danger') ? 'danger' : Object.values(c.tone).includes('warn') ? 'warn' : '') : c.tone[p.count]);
    el.className = 'nbadge' + (tone ? ' ' + tone : '');
  }
  shell.online.querySelector('b').textContent = num(c.online || 0);
  shell.bellDot.hidden = !all;
  document.dispatchEvent(new CustomEvent('mz:counts', { detail: c }));
}
let presence = {};
function paintWatching() {
  for (const w of document.querySelectorAll('.watching')) {
    const others = (presence[w.dataset.ref] || []).filter(p => p.id !== session.me.user.id);
    w.replaceChildren(...(others.length ? [icon('eye'), h('span', null, `${others.map(p => p.name).join(', ')} এটা দেখছেন`)] : []));
    w.hidden = !others.length;
  }
}
function stream() {
  let es, tries = 0;
  const connect = () => {
    es = new EventSource('api/admin/v2/stream');
    es.addEventListener('counts', e => { tries = 0; paintCounts(JSON.parse(e.data)); });
    es.addEventListener('presence', e => { presence = JSON.parse(e.data); paintWatching(); });
    es.addEventListener('audit', e => document.dispatchEvent(new CustomEvent('mz:audit', { detail: JSON.parse(e.data) })));
    for (const ev of ['assign', 'ticket']) es.addEventListener(ev, e => document.dispatchEvent(new CustomEvent('mz:' + ev, { detail: JSON.parse(e.data) })));
    es.onerror = () => {
      es.close();
      // a lock shows as a failed stream: check before trying again
      api('counts').then(c => { paintCounts(c); setTimeout(connect, Math.min(30000, 2000 * ++tries)); }).catch(() => {});
    };
  };
  connect();
  document.addEventListener('mz:watch', e => { api('presence', { ref: e.detail }).catch(() => {}); setTimeout(paintWatching, 50); });
  on('locked', () => es && es.close());
}

// ---- the router ----
async function route() {
  const [key = 'command', ...params] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const page = ALL_PAGES.find(p => p.key === key) || ALL_PAGES[0];
  for (const a of document.querySelectorAll('.nav-item, .tab')) a.classList.toggle('on', a.dataset.key === page.key);
  shell.crumbs.replaceChildren(h('span', 'muted', page.group), icon('chevr'), h('b', null, page.title));
  document.title = `${page.title} · Manzeela অ্যাডমিন`;
  if (page.perm && !can(page.perm)) { shell.main.replaceChildren(h('div', 'page', h('div', 'empty', icon('lock'), h('b', null, 'এই পাতার অনুমতি আপনার ভূমিকায় নেই')))); return; }
  // the same page with a new id: let it open or close its drawer without drawing again
  if (current.key === page.key && current.inst && current.inst.onParams) { current.inst.onParams(params); return; }
  if (current.inst && current.inst.destroy) current.inst.destroy();
  closeDrawer(true); closeAllModals();
  current = { key: page.key, inst: null };
  const box = h('div', 'page');
  shell.main.replaceChildren(box);
  const mod = await import(PAGE_FILES[page.key]);
  if (current.key !== page.key) return;
  current.inst = await mod.render(box, { params, page, go, counts });
  shell.main.focus({ preventScroll: true });
  scrollTo(0, 0);
}

// ---- shortcuts: g h, g i, ?, / and Ctrl/Cmd+K; j/k, Enter, x, a, r, e go to the page ----
function wireKeys() {
  let g = 0;
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); return; }
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing || modalOpen() || paletteOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape' && drawerOpen()) { history.back(); return; }
    if (e.key === '/') { e.preventDefault(); palette(); return; }
    if (e.key === '?') { shortcutsHelp(); return; }
    if (e.key === 'g') { g = Date.now(); return; }
    if (Date.now() - g < 1200) { g = 0; if (e.key === 'h') { go('#/command'); return; } if (e.key === 'i') { go('#/inbox'); return; } }
    if (drawerOpen() && (e.key === 'j' || e.key === 'k')) { drawerStep(e.key === 'j' ? 1 : -1); return; }
    if (current.inst && current.inst.key && current.inst.key(e)) e.preventDefault();
  });
}
function shortcutsHelp() {
  const rows = [['Ctrl/⌘ K অথবা /', 'খুঁজুন ও যান'], ['g তারপর h', 'কমান্ড সেন্টার'], ['g তারপর i', 'ইনবক্স'], ['j / k', 'তালিকায় নিচে / উপরে (খোলা থাকলে পরের/আগের)'], ['Enter', 'খুলুন'], ['x', 'বেছে নিন'],
    ['a / r', 'অনুমোদন / বাদ (রিভিউ পাতায়)'], ['e', 'উত্তর দিন (টিকিটে)'], ['Esc', 'বন্ধ করুন'], ['?', 'এই তালিকা']];
  modal({ title: 'কীবোর্ড শর্টকাট', body: h('div', 'keys', ...rows.map(([k, t]) => h('div', 'kv', h('kbd', null, k), h('span', null, t)))) });
}
