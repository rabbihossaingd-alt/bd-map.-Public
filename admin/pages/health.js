// সিস্টেমের অবস্থা: mail (today's sent and failed), calls (TURN), R2 (the last copy — red after 24 hours), the database,
// server errors (5xx) for the last 24 hours by hour, uptime and Node.js version, and which settings are set — only ✓
// or ✗, never a value. Refreshes every 30 seconds while open.
import { api } from '../api.js';
import { badge, errorBox, h, icon, skeleton } from '../ui.js';
import { barChart } from '../chart.js';
import { full, num } from '../fmt.js';

const dur = s => s >= 86400 ? `${num(Math.floor(s / 86400))} দিন ${num(Math.floor(s % 86400 / 3600))} ঘণ্টা` : s >= 3600 ? `${num(Math.floor(s / 3600))} ঘণ্টা ${num(Math.floor(s % 3600 / 60))} মিনিট` : `${num(Math.floor(s / 60))} মিনিট`;

export async function render(box) {
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'সিস্টেমের অবস্থা'), h('p', 'muted', 'প্রতি ৩০ সেকেন্ডে নিজে থেকে নতুন হয়। সেটিংসের মান কখনো দেখানো হয় না — শুধু আছে কি নেই।'))), holder);
  let first = true;
  async function load() {
    if (first) holder.replaceChildren(skeleton(5));
    let d;
    try { d = await api('health'); } catch (e) { if (first) holder.replaceChildren(errorBox(e, load)); return; }
    first = false;
    const errs = d.errors.reduce((s, x) => s + x.errors, 0);
    holder.replaceChildren(...[
      d.readonly.on ? h('div', 'banner danger flat', icon('lock'), h('span', null, 'অ্যাপ এখন রিড-অনলি (ফিচার ফ্ল্যাগ পাতা থেকে বদলানো যায়)।')) : null,
      h('div', 'health-grid', ...d.checks.map(c => h('div', 'card hcheck ' + c.tone, h('span', 'sdot ' + (c.tone === 'ok' ? 'live' : c.tone)), h('div', 't', h('b', null, c.label), h('span', 'muted', c.text))))),
      h('div', 'kpi-grid', h('div', 'kpi', h('span', 'k-label', 'চালু আছে'), h('b', 'k-val', dur(d.uptime)), h('small', 'muted', 'শুরু ' + full(d.startedAt))), h('div', 'kpi', h('span', 'k-label', 'Node.js'), h('b', 'k-val', d.node))),
      h('section', 'section', h('h2', null, `সার্ভারের এরর (৫xx) — শেষ ২৪ ঘণ্টা: ${num(errs)}টি`),
        h('div', 'card', errs ? barChart(d.errors.filter(x => x.requests).map(x => [new Date(x.at).toLocaleTimeString('bn-BD', { hour: 'numeric', timeZone: 'Asia/Dhaka' }), x.errors]), { tone: 'danger' }) : h('p', 'muted', 'কোনো এরর নেই।'),
          h('p', 'hint', 'সার্ভার নতুন করে চালু হলে এই গোনা শূন্য থেকে শুরু হয়।'))),
      h('section', 'section', h('h2', null, 'সেটিংস'), h('div', 'card flush', ...d.env.map(e => h('div', 'feed-row pad', h('div', 't', h('b', null, e.label), h('span', 'muted mono', e.name)), e.set ? badge('✓ সেট করা', 'ok') : badge('✗ নেই', '')))))].filter(Boolean));
  }
  await load();
  const timer = setInterval(() => { if (!document.hidden) load(); }, 30_000);
  return { destroy: () => clearInterval(timer) };
}
