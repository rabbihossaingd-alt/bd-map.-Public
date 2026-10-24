// কমান্ড সেন্টার: what needs doing today first, then how the app is doing. Phase 1 reads the older overview numbers
// (14 days); phase 2 adds the date range, DAU/WAU/MAU, alerts on unusual days and the waiting times.
import { api, can, legacy, session } from '../api.js';
import { badge, empty, errorBox, h, icon, person, skeleton, when, attrs, dot } from '../ui.js';
import { num, taka, pct } from '../fmt.js';
import { lineChart, sparkline } from '../chart.js';

export async function render(box, { go }) {
  box.append(skeleton(8, 'cards'));
  let o, c;
  try { [o, c] = await Promise.all([legacy('overview'), api('counts')]); }
  catch (e) { box.replaceChildren(errorBox(e, () => { box.replaceChildren(); render(box, { go }); })); return; }
  const me = session.me, hour = (new Date().getUTCHours() + 6) % 24;   // Dhaka time
  const tasks = [
    ['support', 'সাপোর্টে উত্তর বাকি', 'tickets', 'support.view', 'warn'], ['reports', 'রিপোর্ট দেখা বাকি', 'reports', 'reports.view', 'danger'],
    ['fares', 'ভাড়া অনুমোদন বাকি', 'fares', 'data.approve', 'warn'], ['photos', 'জায়গার ছবি দেখা বাকি', 'photos', 'data.approve', ''],
    ['gems', 'মেঠোপথে নতুন জায়গা', 'gems', 'data.approve', ''], ['payouts', 'পেআউট অপেক্ষায়', 'payouts', 'payouts.view', 'warn'],
    ['creators', 'ক্রিয়েটর আবেদন', 'creators', 'creators.manage', ''], ['verify', 'ব্যাজের আবেদন', 'tickets', 'support.view', '']
  ].filter(t => can(t[3]));
  const mine = tasks.reduce((s, t) => s + (c[t[0]] || 0), 0);

  const head = h('div', 'page-head', h('div', null, h('h1', null, `${hour < 12 ? 'শুভ সকাল' : hour < 17 ? 'শুভ দুপুর' : hour < 20 ? 'শুভ সন্ধ্যা' : 'শুভ রাত্রি'}, ${me.user.name}`),
    h('p', 'muted', `${me.roleName} · ${mine ? `আপনার জন্য ${num(mine)}টি কাজ অপেক্ষায়` : 'আপনার জন্য কোনো কাজ বাকি নেই — সাবাস'} · এখন ${num(c.online)} জন অ্যাপে`)));

  const todo = h('section', 'section', h('h2', null, 'আজকের কাজ'));
  const grid = h('div', 'task-grid');
  for (const [k, label, page, , tone] of tasks) {
    const n = c[k] || 0;
    const card = attrs(h('a', 'task ' + (n ? tone : 'done'), h('b', null, num(n)), h('span', null, label), h('small', null, n ? 'খুলুন' : 'সব ঠিক আছে')), { href: '#/' + page });
    if (k === 'payouts' && o.payoutsPendingTaka) card.querySelector('small').textContent = `মোট ${taka(o.payoutsPendingTaka)}`;
    grid.append(card);
  }
  todo.append(grid);

  // KPI cards: the 14-day series where one exists, compared with the week before
  const trend = d => { if (!d) return null; const a = d.slice(0, 7).reduce((x, y) => x + y, 0), b = d.slice(7).reduce((x, y) => x + y, 0); return a ? Math.round((b - a) / a * 100) : b ? 100 : 0; };
  const kpi = (label, value, sub, series, tone) => {
    const t = trend(series);
    return h('div', 'kpi ' + (tone || ''), h('span', 'k-label', label), h('b', 'k-val', value), h('div', 'k-row', t == null ? h('span') : h('em', t > 0 ? 'up' : t < 0 ? 'down' : '', pct(t)), series ? sparkline(series) : null), h('small', 'muted', sub));
  };
  const kpis = h('div', 'kpi-grid',
    kpi('মোট ব্যবহারকারী', num(o.users), `আজ নতুন ${num(o.usersToday)} · ৭ দিনে সক্রিয় ${num(o.active7)}`, o.signups),
    kpi('আজ সক্রিয়', num(o.activeToday), `এখন অনলাইন ${num(o.online)}`, null, 'live'),
    kpi('আজকের মেসেজ', num(o.messagesToday), `মোট ${num(o.messages)} · শুধু সংখ্যা, লেখা নয়`, o.chats),
    kpi('পোস্ট', num(o.posts), `আজ ${num(o.postsToday)} · স্টোরি ${num(o.stories)}`, o.postsSeries),
    kpi('লাইক', num((o.likesSeries || []).reduce((a, b) => a + b, 0)), 'গত ১৪ দিনে', o.likesSeries),
    kpi('জানানো ভাড়া', num(o.fares), `অনুমোদন বাকি ${num(c.fares)}`, o.faresSeries),
    kpi('চলতি গ্রুপ কল', num(o.calls), `বন্ধুত্ব ${num(o.friendships)}টি`),
    kpi('ভেরিফায়েড', num(o.verified), `টু-স্টেপ চালু ${num(o.twofa)} জন`),
    kpi('বন্ধ অ্যাকাউন্ট', num(o.banned), `খোলা রিপোর্ট ${num(o.reportsOpen)}`, null, o.banned ? 'danger' : ''),
    kpi('অপেক্ষমাণ পেআউট', taka(o.payoutsPendingTaka || 0), `${num(o.payoutsWaiting || 0)}টি অনুরোধ`, null, o.payoutsWaiting ? 'warn' : ''));

  const charts = h('section', 'section', h('h2', null, 'গত ১৪ দিন'), h('div', 'chart-grid',
    h('div', 'card', h('h3', null, 'নতুন অ্যাকাউন্ট ও পোস্ট'), lineChart([{ name: 'নতুন অ্যাকাউন্ট', data: o.signups, tone: 'brand' }, { name: 'পোস্ট', data: o.postsSeries, tone: 'info' }])),
    h('div', 'card', h('h3', null, 'লাইক, সাপোর্ট ও ভাড়া'), lineChart([{ name: 'লাইক', data: o.likesSeries, tone: 'info' }, { name: 'সাপোর্ট', data: o.support, tone: 'warn' }, { name: 'ভাড়া', data: o.faresSeries, tone: 'brand' }]))));

  const lower = h('div', 'two-col');
  // the latest changes from the audit log
  if (can('audit.view')) {
    const feed = h('div', 'card', h('div', 'card-head', h('h3', null, 'সাম্প্রতিক কাজ'), attrs(h('a', 'link', 'সব দেখুন'), { href: '#/audit' })));
    try {
      const a = await api('audit?limit=10');
      if (!a.rows.length) feed.append(empty('এখনো কোনো কাজ হয়নি।'));
      for (const r of a.rows) feed.append(h('div', 'feed-row', h('span', 'feed-dot'), h('div', 't', h('b', null, `${r.name || 'মুছে ফেলা অ্যাকাউন্ট'} · ${actionText(r.action)}`), h('span', 'muted', r.note || (r.target_type ? `${r.target_type} ${r.target_id}` : ''))), when(r.at)));
    } catch (e) { feed.append(errorBox(e)); }
    lower.append(feed);
  }
  const people = h('div', 'card', h('h3', null, 'নতুন যোগ দিয়েছেন'));
  for (const u of o.latestUsers || []) people.append(h('div', 'feed-row', person({ ...u, pic: u.pic }, '@' + (u.username || '')), when(u.created)));
  if (!(o.latestUsers || []).length) people.append(empty('এখনো কেউ যোগ দেননি।'));
  lower.append(people);

  // the health strip: green, amber or red at a glance
  let health = null;
  if (can('system.view')) {
    try {
      const s = await legacy('system');
      health = h('div', 'health', h('span', 'muted', 'সিস্টেম'),
        h('span', 'hp', dot(s.mail ? 'ok' : 'danger'), 'মেইল'), h('span', 'hp', dot(s.turn ? 'ok' : 'warn'), 'কলের রিলে'),
        h('span', 'hp', dot(s.dataDir === 'DATA_DIR' ? 'ok' : 'warn'), `ডাটাবেস ${num((s.dbBytes / 1048576).toFixed(1), 1)} MB`), h('span', 'hp', dot('ok'), `চলছে ${num(Math.floor(s.uptime / 3600))} ঘণ্টা`),
        attrs(h('a', 'link', 'বিস্তারিত'), { href: '#/health' }));
    } catch { /* the strip is left out */ }
  }
  box.replaceChildren(head, ...(health ? [health] : []), todo, h('section', 'section', h('h2', null, 'এক নজরে'), kpis), charts, lower);
  // live: the task numbers follow the stream
  const onCounts = e => { const n = e.detail; grid.querySelectorAll('.task').forEach((card, i) => { const k = tasks[i][0]; const v = n[k] || 0; card.querySelector('b').textContent = num(v); card.className = 'task ' + (v ? tasks[i][4] : 'done'); }); };
  document.addEventListener('mz:counts', onCounts);
  return { destroy: () => document.removeEventListener('mz:counts', onCounts) };
}

// what each logged action means, in a sentence fragment
export const ACTIONS = {
  'admin.login': 'প্যানেলে ঢুকেছেন', 'admin.login.failed': 'ভুল কোড দিয়েছেন', 'admin.lock': 'প্যানেল লক করেছেন', stepup: 'উচ্চ-ঝুঁকির কাজের আগে নিশ্চিত করেছেন', 'stepup.failed': 'নিশ্চিতকরণে ভুল কোড',
  'team.role': 'ভূমিকা বদলেছেন', 'pii.unmask': 'গোপন তথ্য দেখেছেন', denied: 'অনুমতি ছাড়া চেষ্টা', export: 'ডাউনলোড করেছেন',
  verify: 'ব্যাজ দিয়েছেন', unverify: 'ব্যাজ সরিয়েছেন', ban: 'অ্যাকাউন্ট বন্ধ করেছেন', unban: 'অ্যাকাউন্ট চালু করেছেন', role: 'ভূমিকা বদলেছেন (পুরনো প্যানেল)', delete: 'অ্যাকাউন্ট মুছেছেন',
  signout: 'সব ডিভাইস থেকে লগআউট করিয়েছেন', reply: 'সাপোর্টে উত্তর দিয়েছেন', notice: 'ঘোষণা বদলেছেন', flag: 'ফিচার সুইচ বদলেছেন', 'fare removed': 'ভাড়া সরিয়েছেন', 'fare approved': 'ভাড়া অনুমোদন করেছেন',
  'report dismissed': 'রিপোর্ট বন্ধ করেছেন', 'post removed': 'পোস্ট সরিয়েছেন', 'story removed': 'স্টোরি সরিয়েছেন', 'comment removed': 'মন্তব্য সরিয়েছেন', 'sound removed': 'সাউন্ড সরিয়েছেন', 'group removed': 'গ্রুপ বন্ধ করেছেন',
  'creator approve': 'ক্রিয়েটর অনুমোদন', 'creator reject': 'ক্রিয়েটর আবেদন বাতিল', 'creator revoke': 'ক্রিয়েটর বন্ধ', earning: 'আয় যোগ করেছেন', 'payout paid': 'টাকা পাঠিয়েছেন', 'payout rejected': 'পেআউট বাতিল', 'creator rules': 'ক্রিয়েটর নিয়ম বদলেছেন'
};
export const actionText = a => ACTIONS[a] || a;
