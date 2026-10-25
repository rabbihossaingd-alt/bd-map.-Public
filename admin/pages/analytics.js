// অ্যানালিটিক্স: three pages in one file — growth and retention (DAU/WAU/MAU, stickiness, D1/D7/D30, weekly cohorts,
// the activation funnel), feature use (how many people opened each part of the app), and search insights (what people
// pick most, and searches that found nothing — the gaps in our data). A range (7/30/90 days) compared with the one
// before; CSV of each (the download is written in the audit log). Counting started on a known day, shown on each page.
import { api } from '../api.js';
import { badge, button, empty, errorBox, h, icon, skeleton, toast, attrs } from '../ui.js';
import { lineChart, barChart, sparkline } from '../chart.js';
import { full, num, pct } from '../fmt.js';

const change = (a, b) => b ? Math.round((a - b) / b * 100) : null;
const delta = (a, b) => { const c = change(a, b); return c == null ? h('span', 'muted small', 'আগের তুলনা নেই') : h('em', c > 0 ? 'up' : c < 0 ? 'down' : '', pct(c) + ' আগের তুলনায়'); };
const kpi = (label, value, sub, extra) => h('div', 'kpi', h('span', 'k-label', label), h('b', 'k-val', value), extra ? h('div', 'k-row', extra) : null, sub ? h('small', 'muted', sub) : null);

export async function render(box, { page }) {
  let days = 30;
  const kind = page.key, holder = h('div');
  const TITLE = { growth: ['বৃদ্ধি ও ধরে রাখা', 'কতজন আসছেন, কতজন ফিরে আসছেন, আর নতুনরা কতদূর যাচ্ছেন।'], features: ['ফিচার ব্যবহার', 'অ্যাপের কোন অংশ কতজন খুলছেন — একজন একদিনে একবারই গোনা হয়।'],
    searches: ['সার্চ ইনসাইট', 'মানুষ কী খোঁজেন, আর কী খুঁজে পান না — কোন জায়গা বা রুট যোগ করা দরকার তার তালিকা। কে খুঁজেছেন তা রাখা হয় না।'] }[kind];
  const rangeBar = h('div', 'seg');
  const paintRange = () => rangeBar.replaceChildren(...[7, 30, 90].map(n => { const b = button(`${num(n)} দিন`, { small: true, kind: n === days ? 'primary' : 'ghost', onClick: () => { days = n; paintRange(); load(); } }); return b; }));
  paintRange();
  box.append(h('div', 'page-head', h('div', null, h('h1', null, TITLE[0]), h('p', 'muted', TITLE[1])),
    h('div', 'row-acts', rangeBar, button('CSV', { ic: 'download', onClick: () => { location.href = `api/admin/v2/analytics.csv?kind=${kind}&days=${days}`; toast('ডাউনলোড শুরু হচ্ছে — খতিয়ানে লেখা থাকবে।'); } }))), holder);
  async function load() {
    holder.replaceChildren(skeleton(5, 'cards'));
    try { const d = await api(`analytics/${kind}?days=${days}`); holder.replaceChildren(...(kind === 'growth' ? growth(d) : kind === 'features' ? features(d) : searches(d)).filter(Boolean)); }
    catch (e) { holder.replaceChildren(errorBox(e, load)); }
  }
  const sinceNote = (at, what) => Date.now() - at < (days + 1) * 864e5 ? h('p', 'hint', icon('clock'), ` ${what} গোনা শুরু হয়েছে ${full(at)} থেকে — এর আগের দিনগুলোর হিসাব নেই, তাই শুরুর দিকে সংখ্যা কম দেখাবে।`) : null;

  function growth(d) {
    const s = d.series, ret = r => r ? `${num(r.pct)}%` : '—', retSub = r => r ? `${num(r.of)} জনের মধ্যে` : 'এখনো যথেষ্ট দিন হয়নি';
    const maxCell = 100;
    const cohort = d.cohorts.some(c => c.size) ? h('div', 'tbl-wrap', h('table', 'tbl cohort', h('thead', null, h('tr', null, h('th', null, 'সাইনআপের সপ্তাহ'), h('th', 'num', 'জন'), ...Array.from({ length: 8 }, (_, i) => h('th', 'num', `স${num(i)}`)))),
      h('tbody', null, ...d.cohorts.map(c => h('tr', null, h('td', null, full(c.from).split(',')[0]), h('td', 'num', num(c.size)),
        ...Array.from({ length: 8 }, (_, i) => { const v = c.cells[i]; const td = h('td', 'num heat', v == null ? '' : num(v) + '%'); if (v != null) td.dataset.level = String(Math.min(5, Math.ceil(v / maxCell * 5))); return td; })))))) : empty('এখনো কোনো কোহর্ট নেই।');
    const top = Math.max(1, d.funnel[0].n);
    return [
      h('div', 'kpi-grid',
        kpi('আজ সক্রিয় (DAU)', num(d.today.dau), `সপ্তাহে ${num(d.today.wau)} · মাসে ${num(d.today.mau)}`),
        kpi('স্টিকিনেস', num(d.today.stickiness) + '%', 'DAU ÷ MAU — মাসের কতজন রোজ আসেন'),
        kpi(`${num(days)} দিনে সক্রিয়`, num(d.now.active), null, delta(d.now.active, d.prev.active)),
        kpi(`${num(days)} দিনে নতুন অ্যাকাউন্ট`, num(d.now.signups), null, delta(d.now.signups, d.prev.signups))),
      sinceNote(d.since, 'দৈনিক সক্রিয় ব্যবহারকারী'),
      h('section', 'section', h('div', 'card', h('h3', null, 'সক্রিয় ব্যবহারকারী'), lineChart([{ name: 'DAU', data: s.map(x => x.dau), tone: 'brand' }, { name: 'WAU', data: s.map(x => x.wau), tone: 'info' }, { name: 'MAU', data: s.map(x => x.mau), tone: 'warn' }], { days: s.map(x => x.at) })),
        h('div', 'card', h('h3', null, 'নতুন অ্যাকাউন্ট'), lineChart([{ name: 'নতুন', data: s.map(x => x.signups), tone: 'brand' }], { days: s.map(x => x.at), h: 140 }))),
      h('section', 'section', h('h2', null, 'ফিরে আসা (রিটেনশন)'), h('div', 'kpi-grid', kpi('পরদিন (D1)', ret(d.retention.d1), retSub(d.retention.d1)), kpi('৭ দিন পরে (D7)', ret(d.retention.d7), retSub(d.retention.d7)), kpi('৩০ দিন পরে (D30)', ret(d.retention.d30), retSub(d.retention.d30))),
        h('div', 'card', h('h3', null, 'সাপ্তাহিক কোহর্ট — যে সপ্তাহে যোগ দিয়েছেন, তার পরের প্রতি সপ্তাহে কত % সক্রিয়'), cohort)),
      h('section', 'section', h('h2', null, `অ্যাক্টিভেশন — গত ${num(days)} দিনে যোগ দেওয়া মানুষ`), h('div', 'card funnel', ...d.funnel.map((f, i) => h('div', 'f-step', h('div', 'f-bar', (() => { const bar = h('i'); bar.style.width = Math.max(2, Math.round(f.n / top * 100)) + '%'; return bar; })()),
        h('div', 't', h('b', null, f.step), h('span', 'muted', `${num(f.n)} জন${i ? ` · ${num(Math.round(f.n / top * 100))}%` : ''}`))))),
        sinceNote(d.featureSince, '"রুট খোঁজা" ধাপ'))
    ];
  }
  function features(d) {
    if (!d.all) return [sinceNote(d.since, 'ফিচার ব্যবহার'), empty('এই সময়ে এখনো কেউ গোনা হয়নি।', 'অ্যাপের নতুন সংস্করণ খোলার পর থেকে গোনা শুরু হয়।', 'activity')];
    return [
      h('div', 'kpi-grid', kpi(`${num(days)} দিনে মোট`, num(d.all), 'আলাদা মানুষ বা ডিভাইস'), kpi('সবচেয়ে বেশি', d.rows[0].label, `${num(d.rows[0].people)} জন`)),
      sinceNote(d.since, 'ফিচার ব্যবহার'),
      h('div', 'tbl-wrap', h('table', 'tbl', h('thead', null, h('tr', null, ...['অংশ', 'কতজন', 'সবার কত %', 'আগের তুলনায়', 'রোজ'].map((t, i) => h('th', i && i < 4 ? 'num' : null, t)))),
        h('tbody', null, ...d.rows.map(r => h('tr', null, h('td', null, h('b', null, r.label)), h('td', 'num', num(r.people)), h('td', 'num', num(r.share) + '%'), h('td', 'num', delta(r.people, r.prev)), h('td', null, sparkline(r.series, { w: 120, h: 26 }))))))),
      h('p', 'hint', 'লগইন থাকলে অ্যাকাউন্ট, না থাকলে ডিভাইস ধরে গোনা হয় (একই মানুষ দুই ডিভাইসে দুবার আসতে পারেন)।')
    ];
  }
  function searches(d) {
    return [
      h('div', 'kpi-grid', kpi(`${num(days)} দিনে সার্চ`, num(d.total), 'বেছে নেওয়া আর খালি সার্চ মিলিয়ে'), kpi('কিছু পাওয়া যায়নি', num(d.none.reduce((s, r) => s + r.n, 0)), `${num(d.none.length)}টি আলাদা শব্দ`)),
      sinceNote(d.since, 'সার্চ'),
      h('div', 'two-col',
        h('div', 'card', h('h3', null, 'সবচেয়ে বেশি খোঁজা জায়গা'), d.top.length ? barChart(d.top.slice(0, 15).map(r => [r.q, r.n]), { tone: 'brand' }) : empty('এখনো কিছু নেই।')),
        h('div', 'card', h('h3', null, 'যা খুঁজে পাওয়া যায়নি — ডেটার ফাঁক'), d.none.length ? h('div', 'stack', ...d.none.map(r => h('div', 'feed-row', h('div', 't', h('b', 'no-tr', r.q), h('span', 'muted', `${num(r.n)} বার`)), badge('যোগ করা দরকার?', 'warn')))) : empty('সব সার্চেই কিছু না কিছু পাওয়া গেছে।'))),
      h('p', 'hint', 'জায়গার সার্চ (ম্যাপ ও রুট) গোনা হয়। জেলা অনুযায়ী ব্যবহারকারী দেখানো যায় না — কারও জেলা রাখা হয় না।')
    ];
  }
  await load();
  return {};
}
