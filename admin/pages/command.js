// কমান্ড সেন্টার: what needs doing first (with how long the oldest has waited, red past its SLA), then how the app is
// doing over a chosen range compared with the range before, anything unusual, the health of the system, the latest
// changes and newcomers, and the two emergency switches.
import { api, can, errText, session } from '../api.js';
import { attrs, badge, button, confirmAction, dot, empty, errorBox, h, icon, person, skeleton, tabs, toast, when } from '../ui.js';
import { num, pct, taka, waited } from '../fmt.js';
import { lineChart, sparkline } from '../chart.js';

const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage off */ } };

export async function render(box, ctx) {
  let range = Number(read('mzadm.range', '14')), compare = read('mzadm.compare', '1') === '1';
  let o;
  async function load() {
    box.replaceChildren(skeleton(8, 'cards'));
    try { o = await api('overview2?range=' + range); paint(); } catch (e) { box.replaceChildren(errorBox(e, load)); }
  }
  function paint() {
    const me = session.me, hour = (new Date().getUTCHours() + 6) % 24, t = o.tasks;
    const TASKS = [['support', 'সাপোর্টে উত্তর বাকি', '#/inbox/ticket', 'support.view'], ['reports', 'রিপোর্ট কেস', '#/inbox/report', 'reports.view'], ['fares', 'ভাড়া অনুমোদন বাকি', '#/inbox/fare', 'data.approve'],
      ['photos', 'জায়গার ছবি', '#/inbox/photo', 'data.approve'], ['gems', 'মেঠোপথ', '#/inbox/gem', 'data.approve'], ['payouts', 'পেআউট অপেক্ষায়', '#/inbox/payout', 'payouts.view'],
      ['creators', 'ক্রিয়েটর আবেদন', '#/inbox/creator', 'creators.manage'], ['verify', 'ব্যাজের আবেদন', '#/inbox/verify', 'support.view']].filter(x => can(x[3]));
    const mine = TASKS.reduce((s, [k]) => s + (t[k].n || 0), 0);
    const head = h('div', 'page-head', h('div', null, h('h1', null, `${hour < 12 ? 'শুভ সকাল' : hour < 17 ? 'শুভ দুপুর' : hour < 20 ? 'শুভ সন্ধ্যা' : 'শুভ রাত্রি'}, ${me.user.name}`),
      h('p', 'muted', `${me.roleName} · ${mine ? `আপনার জন্য ${num(mine)}টি কাজ` : 'কোনো কাজ বাকি নেই — সাবাস'} · এখন ${num(o.kpi.online)} জন অ্যাপে`)),
      mine && can('inbox.view') ? button('পরেরটা নাও', { kind: 'primary', ic: 'inbox', onClick: () => ctx.go('#/inbox/next') }) : null);

    // anything far from its usual day
    const alerts = o.alerts.length ? h('div', 'alerts', ...o.alerts.map(a => h('div', 'banner warn', icon('alert'), h('span', null, `গতকাল ${a.label} সাধারণ দিনের চেয়ে ${num(Math.abs(a.change))}% ${a.change < 0 ? 'কম' : 'বেশি'}।${a.hint ? ' ' + a.hint : ''}`)))) : null;

    const hl = o.health;
    const health = can('system.view') ? h('div', 'health', h('span', 'muted', 'সিস্টেম'),
      h('span', 'hp', dot(hl.mail ? 'ok' : 'danger'), hl.mail ? 'মেইল' : 'মেইল বন্ধ'), h('span', 'hp', dot(hl.turn ? 'ok' : 'warn'), hl.turn ? 'কলের রিলে' : 'কলের রিলে নেই'),
      h('span', 'hp', dot(!hl.r2 ? 'warn' : hl.backupLate ? 'danger' : 'ok'), !hl.r2 ? 'R2 কপি বন্ধ' : hl.lastBackup ? h('span', null, 'শেষ ব্যাকআপ ', when(hl.lastBackup)) : 'ব্যাকআপ এখনো হয়নি'),
      h('span', 'hp', dot('ok'), `ডাটাবেস ${num(hl.dbBytes / 1048576, 1)} MB`), attrs(h('a', 'link', 'বিস্তারিত'), { href: '#/health' })) : null;

    const grid = h('div', 'task-grid');
    for (const [k, label, link] of TASKS) {
      const x = t[k], late = x.oldest && Date.now() - x.oldest > x.sla * 3600e3, near = x.oldest && !late && Date.now() - x.oldest > x.sla * 3600e3 * 0.75;
      grid.append(attrs(h('a', 'task ' + (!x.n ? 'done' : late ? 'danger' : near ? 'warn' : ''), h('b', null, num(x.n)), h('span', null, label),
        h('small', null, !x.n ? 'সব ঠিক আছে' : k === 'payouts' && x.taka ? `মোট ${taka(x.taka)}${x.oldest ? ' · ' + waited(Date.now() - x.oldest) + ' অপেক্ষায়' : ''}` : x.oldest ? `সবচেয়ে পুরনো ${waited(Date.now() - x.oldest)}${late ? ' — SLA পার' : ''}` : 'খুলুন')), { href: link }));
    }

    // the range and the comparison
    const rangeBar = h('div', 'range-bar', tabs([[1, 'আজ'], [7, '৭ দিন'], [14, '১৪ দিন'], [30, '৩০ দিন'], [90, '৯০ দিন']].map(([v, l]) => [v, l]), range, v => { range = v; save('mzadm.range', String(v)); load(); }));
    const cmp = attrs(h('input'), { type: 'checkbox' }); cmp.checked = compare;
    cmp.addEventListener('change', () => { compare = cmp.checked; save('mzadm.compare', compare ? '1' : '0'); paint(); });
    rangeBar.append(h('label', 'check', cmp, ' আগের সময়ের সাথে তুলনা'));
    const n = Math.max(range, 2), cur = a => a.slice(-n), prev = a => a.slice(-2 * n, -n), sum = a => a.reduce((x, y) => x + y, 0);
    const change = a => { const p = sum(prev(a)), c = sum(cur(a)); return p ? Math.round((c - p) / p * 100) : c ? 100 : 0; };
    const kpi = (label, value, sub, s, tone) => h('div', 'kpi ' + (tone || ''), h('span', 'k-label', label), h('b', 'k-val', value),
      h('div', 'k-row', s && compare ? h('em', change(s) > 0 ? 'up' : change(s) < 0 ? 'down' : '', pct(change(s))) : h('span'), s ? sparkline(cur(s)) : null), h('small', 'muted', sub));
    const k = o.kpi, S = o.series;
    const kpis = h('div', 'kpi-grid',
      kpi('মোট ব্যবহারকারী', num(k.users), `আজ নতুন ${num(k.signupsToday)}`, S.signups),
      kpi('দৈনিক সক্রিয় (DAU)', num(k.dau), o.tracked < 7 ? `গোনা শুরু ${num(o.tracked)} দিন আগে` : `সাপ্তাহিক ${num(k.wau)} · মাসিক ${num(k.mau)}`, S.active, 'live'),
      kpi('স্টিকিনেস', num(k.stickiness) + '%', 'DAU ÷ MAU'),
      kpi('নতুন সাইনআপ', num(sum(cur(S.signups))), range === 1 ? 'আজ' : `গত ${num(range)} দিনে`, S.signups),
      kpi('পোস্ট', num(sum(cur(S.posts))), `মোট ${num(k.posts)}`, S.posts),
      kpi('মেসেজ', num(sum(cur(S.messages))), 'শুধু সংখ্যা — লেখা কখনো নয়', S.messages),
      kpi('জানানো ভাড়া', num(sum(cur(S.fares))), `মোট ${num(k.fares)}`, S.fares),
      kpi('চলতি গ্রুপ কল', num(k.calls), 'এই মুহূর্তে'),
      kpi('ভেরিফায়েড', num(k.verified), 'নীল ব্যাজ'),
      kpi('বন্ধ অ্যাকাউন্ট', num(k.banned), '', null, k.banned ? 'danger' : ''),
      kpi('অপেক্ষমাণ পেআউট', taka(k.payoutTaka), `${num(t.payouts.n)}টি অনুরোধ`, null, t.payouts.n ? 'warn' : ''));
    const charts = h('div', 'chart-grid',
      h('div', 'card', h('h3', null, 'নতুন অ্যাকাউন্ট ও সক্রিয় ব্যবহারকারী'), lineChart([{ name: 'নতুন', data: cur(S.signups), tone: 'brand' }, { name: 'সক্রিয়', data: cur(S.active), tone: 'info' }])),
      h('div', 'card', h('h3', null, 'পোস্ট ও লাইক'), lineChart([{ name: 'পোস্ট', data: cur(S.posts), tone: 'brand' }, { name: 'লাইক', data: cur(S.likes), tone: 'info' }])),
      h('div', 'card', h('h3', null, 'সাপোর্ট ও ভাড়া'), lineChart([{ name: 'সাপোর্ট', data: cur(S.tickets), tone: 'warn' }, { name: 'ভাড়া', data: cur(S.fares), tone: 'brand' }])));

    const lower = h('div', 'two-col');
    if (can('audit.view')) {
      const feed = h('div', 'card', h('div', 'card-head', h('h3', null, 'সাম্প্রতিক কাজ'), attrs(h('a', 'link', 'সব দেখুন'), { href: '#/audit' })));
      if (!o.recent.length) feed.append(empty('এখনো কোনো কাজ হয়নি।'));
      for (const r of o.recent) feed.append(h('div', 'feed-row', h('span', 'feed-dot'), h('div', 't', h('b', null, `${r.name || 'সিস্টেম'} · ${actionText(r.action)}`), h('span', 'muted', r.note || (r.target_type ? `${r.target_type} ${r.target_id}` : ''))), when(r.at)));
      lower.append(feed);
    }
    const people = h('div', 'card', h('div', 'card-head', h('h3', null, 'নতুন সদস্য'), can('users.view') ? attrs(h('a', 'link', 'সব দেখুন'), { href: '#/users' }) : null));
    for (const u of o.newcomers) { const row = h('div', 'feed-row' + (can('users.view') ? ' click' : ''), person(u, '@' + u.username), when(u.created)); if (can('users.view')) row.addEventListener('click', () => ctx.go('#/users/' + u.id)); people.append(row); }
    if (!o.newcomers.length) people.append(empty('এখনো কেউ যোগ দেননি।'));
    lower.append(people);
    if (can('flags.manage')) lower.append(switches());

    box.replaceChildren(head, ...(alerts ? [alerts] : []), ...(health ? [health] : []), h('section', 'section', h('h2', null, 'আজকের কাজ'), grid),
      h('section', 'section', h('div', 'section-head', h('h2', null, 'এক নজরে'), rangeBar), kpis, o.tracked < 7 ? h('p', 'hint', icon('clock'), ` দৈনিক সক্রিয় ব্যবহারকারী গোনা শুরু হয়েছে ${num(o.tracked)} দিন আগে — আগের দিনগুলোর হিসাব নেই।`) : null),
      h('section', 'section', charts), lower);
  }
  // the two emergency switches (tier 2: a reason, written in the log)
  function switches() {
    const card = h('div', 'card', h('h3', null, 'দ্রুত সুইচ'));
    api('flags2').then(({ flags: list }) => {
      const flags = Object.fromEntries(list.map(f => [f.key, f.on]));
      const row = (key, title, sub) => {
        const sw = attrs(h('button', 'switch' + (flags[key] ? ' on' : ''), h('i')), { role: 'switch', 'aria-checked': String(!!flags[key]), 'aria-label': title, type: 'button' });
        sw.addEventListener('click', async () => {
          const next = !flags[key];
          const ok = await confirmAction({ tier: 2, title: `${title} ${next ? 'চালু' : 'বন্ধ'} করবেন?`, text: next ? 'সবাই আবার এটা করতে পারবেন।' : 'পুরো অ্যাপের জন্য সঙ্গে সঙ্গে বন্ধ হবে (টিম ছাড়া)।', danger: !next, reasons: [['incident', 'সমস্যা চলছে'], ['spam', 'স্প্যামের ঢল'], ['maintenance', 'রক্ষণাবেক্ষণ'], ['resolved', 'সমস্যা মিটেছে'], ['other', 'অন্য']], confirmText: next ? 'চালু করুন' : 'বন্ধ করুন' });
          if (!ok) return;
          try { await api('flags2/set', { key, on: next, ...ok }); flags[key] = next; sw.classList.toggle('on', next); sw.setAttribute('aria-checked', String(next)); toast(next ? 'চালু করা হলো।' : 'বন্ধ করা হলো।'); }
          catch (e) { toast(errText(e), { bad: true }); }
        });
        return h('div', 'sw-row', h('div', 't', h('b', null, title), h('span', 'muted', sub)), sw);
      };
      card.append(row('signups', 'নতুন অ্যাকাউন্ট খোলা', 'বন্ধ করলে শুধু পুরনোরা লগইন করতে পারবেন'), row('posts', 'পোস্ট ও স্টোরি দেওয়া', 'বন্ধ করলে সাধারণ ব্যবহারকারীরা পোস্ট করতে পারবেন না'));
    }).catch(e => card.append(errorBox(e)));
    return card;
  }
  await load();
  const onCounts = () => {};       // the numbers above refresh with the range; the menu badges follow the stream
  return { destroy: () => {} , key: () => false, onCounts };
}

// what each logged action means, in a sentence fragment
export const ACTIONS = {
  'admin.login': 'প্যানেলে ঢুকেছেন', 'admin.login.failed': 'ভুল কোড দিয়েছেন', 'admin.lock': 'প্যানেল লক করেছেন', stepup: 'উচ্চ-ঝুঁকির কাজের আগে নিশ্চিত করেছেন', 'stepup.failed': 'নিশ্চিতকরণে ভুল কোড',
  'team.role': 'ভূমিকা বদলেছেন', 'role.save': 'ভূমিকা তৈরি/বদল', 'role.delete': 'ভূমিকা মুছেছেন', 'pii.unmask': 'গোপন তথ্য দেখেছেন', denied: 'অনুমতি ছাড়া চেষ্টা', export: 'ডাউনলোড করেছেন',
  'case.assign': 'কাজ অ্যাসাইন করেছেন', 'ticket.reply': 'টিকিটে উত্তর দিয়েছেন', 'ticket.note': 'টিকিটে নোট রেখেছেন', 'ticket.status': 'টিকিটের অবস্থা বদলেছেন', 'ticket.meta': 'টিকিটের ট্যাগ/প্রায়োরিটি',
  'macro.save': 'টেমপ্লেট সেভ', 'macro.delete': 'টেমপ্লেট মুছেছেন', 'user.note': 'ব্যবহারকারীর নোট', 'user.verify': 'ব্যাজ দিয়েছেন', 'user.unverify': 'ব্যাজ সরিয়েছেন', 'user.restrict': 'সীমিত করেছেন', 'user.unrestrict': 'সীমা তুলেছেন',
  'user.ban': 'অ্যাকাউন্ট বন্ধ করেছেন', 'user.unban': 'অ্যাকাউন্ট চালু করেছেন', 'user.signout': 'সব ডিভাইস থেকে লগআউট', 'user.signout.one': 'একটি ডিভাইস থেকে লগআউট', 'user.delete': 'অ্যাকাউন্ট মুছেছেন (৩০ দিন)', 'user.restore': 'অ্যাকাউন্ট ফিরিয়েছেন', 'user.purge': 'অ্যাকাউন্ট চিরতরে মুছে গেছে',
  'report.dismiss': 'রিপোর্ট বাতিল', 'report.remove': 'রিপোর্টে কনটেন্ট সরানো', 'report.restrict': 'রিপোর্টে সীমিত', 'report.ban': 'রিপোর্টে অ্যাকাউন্ট বন্ধ', 'report.reopen': 'রিপোর্ট আবার খোলা', 'post.remove': 'পোস্ট সরিয়েছেন',
  verify: 'ব্যাজ দিয়েছেন', unverify: 'ব্যাজ সরিয়েছেন', ban: 'অ্যাকাউন্ট বন্ধ করেছেন', unban: 'অ্যাকাউন্ট চালু করেছেন', role: 'ভূমিকা বদলেছেন (পুরনো প্যানেল)', delete: 'অ্যাকাউন্ট মুছেছেন',
  signout: 'সব ডিভাইস থেকে লগআউট করিয়েছেন', reply: 'সাপোর্টে উত্তর দিয়েছেন', notice: 'ঘোষণা বদলেছেন', flag: 'ফিচার সুইচ বদলেছেন', 'fare removed': 'ভাড়া সরিয়েছেন', 'fare approved': 'ভাড়া অনুমোদন করেছেন',
  'report dismissed': 'রিপোর্ট বন্ধ করেছেন', 'post removed': 'পোস্ট সরিয়েছেন', 'story removed': 'স্টোরি সরিয়েছেন', 'comment removed': 'মন্তব্য সরিয়েছেন', 'sound removed': 'সাউন্ড সরিয়েছেন', 'group removed': 'গ্রুপ বন্ধ করেছেন',
  'creator approve': 'ক্রিয়েটর অনুমোদন', 'creator reject': 'ক্রিয়েটর আবেদন বাতিল', 'creator revoke': 'ক্রিয়েটর বন্ধ', earning: 'আয় যোগ করেছেন', 'payout paid': 'টাকা পাঠিয়েছেন', 'payout rejected': 'পেআউট বাতিল', 'creator rules': 'ক্রিয়েটর নিয়ম বদলেছেন'
};
export const actionText = a => ACTIONS[a] || a;
