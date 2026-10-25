// মিডিয়া: what is stored, where, and what it costs. Videos are made smaller on the phone before upload (no server
// queue), so this shows the result: sizes, how many are copied to R2 and served from Cloudflare, very large or
// probably-not-made-smaller videos, and a retry for files not yet copied.
import { api, errText } from '../api.js';
import { badge, button, dot, empty, errorBox, h, skeleton, toast, when, attrs } from '../ui.js';
import { dataTable } from '../table.js';
import { num } from '../fmt.js';

const size = b => b > 1e9 ? `${num(b / 1e9, 2)} GB` : b > 1e6 ? `${num(b / 1e6, 1)} MB` : `${num(Math.round(b / 1e3))} KB`;
const KIND = { photo: 'ছবি', video: 'ভিডিও', audio: 'অডিও', other: 'অন্য ফাইল' };

export async function render(box) {
  const head = h('div'), holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'মিডিয়া'), h('p', 'muted', 'ভিডিও ফোনেই ছোট হয়ে আসে (720p, ~2 Mbit/s) — সার্ভারে কোনো কিউ নেই। এখানে ফলাফল: আকার, R2-তে কপি, Cloudflare থেকে দেখানো, আর খরচ।')),
    button('R2-তে কপি আবার চেষ্টা', { ic: 'refresh', onClick: async () => { try { await api('media/retry', {}); toast('চেষ্টা করা হলো।'); load(); } catch (e) { toast(errText(e), { bad: true }); } } })), head, holder);
  let data;
  async function load() {
    head.replaceChildren(skeleton(4, 'cards'));
    try { data = await api('media'); } catch (e) { head.replaceChildren(errorBox(e, load)); return; }
    const t = data.totals;
    head.replaceChildren(h('div', 'kpi-grid',
      h('div', 'kpi', h('span', 'k-label', 'মোট ফাইল'), h('b', 'k-val', num(t.files)), h('small', 'muted', size(t.bytes))),
      ...Object.entries(t.by).filter(([, v]) => v[0]).map(([k, v]) => h('div', 'kpi', h('span', 'k-label', KIND[k]), h('b', 'k-val', num(v[0])), h('small', 'muted', size(v[1])))),
      h('div', 'kpi ' + (t.notOnR2 ? 'warn' : ''), h('span', 'k-label', 'R2-তে কপি'), h('b', 'k-val', num(t.onR2)), h('small', 'muted', t.notOnR2 ? `${num(t.notOnR2)}টি এখনো কপি হয়নি` : 'সব কপি হয়েছে')),
      h('div', 'kpi', h('span', 'k-label', 'Cloudflare থেকে দেখানো'), h('b', 'k-val', num(t.public)), h('small', 'muted', 'media.manzeela.com')),
      h('div', 'kpi', h('span', 'k-label', 'আনুমানিক মাসিক খরচ'), h('b', 'k-val', '$' + num(t.costUsd, 2)), h('small', 'muted', 'R2 স্টোরেজ $0.015/GB · ডাউনলোড ফ্রি'))));
  }
  const table = dataTable({
    page: 'media', search: 'ফাইলের নাম',
    filters: [{ key: 'kind', label: 'ধরন', options: Object.entries(KIND) }, { key: 'flag', label: 'অবস্থা', options: [['big', '১০০ MB-এর বেশি'], ['heavy', 'সম্ভবত ছোট করা হয়নি'], ['notr2', 'R2-তে নেই']] }],
    columns: [
      { key: 'name', label: 'ফাইল', render: f => attrs(h('a', 'mono link', f.name), { href: f.src, target: '_blank', rel: 'noopener' }), sort: f => f.name },
      { key: 'kind', label: 'ধরন', render: f => KIND[f.kind], sort: f => f.kind },
      { key: 'size', label: 'আকার', render: f => h('span', f.big ? 'strong' : '', size(f.size)), sort: f => f.size, cls: 'num' },
      { key: 'mbps', label: 'বিটরেট', render: f => f.mbps ? badge(`${num(f.mbps, 1)} Mbit/s`, f.mbps > 4 ? 'warn' : '') : '—', sort: f => f.mbps || 0 },
      { key: 'where', label: 'কোথায়', render: f => h('span', 'hp', dot(f.public ? 'ok' : f.onR2 ? 'warn' : 'danger'), f.public ? 'Cloudflare' : f.onR2 ? 'শুধু R2 ব্যাকআপ' : 'শুধু সার্ভারে'), sortable: false },
      { key: 'user', label: 'কে', render: f => f.user ? f.user.name : '—', sortable: false },
      { key: 'at', label: 'কখন', render: f => when(f.at), sort: f => f.at }
    ],
    load: async ({ q, filters }) => {
      if (!data) await load();
      let rows = data.rows;
      if (filters.kind) rows = rows.filter(f => f.kind === filters.kind);
      if (filters.flag === 'big') rows = rows.filter(f => f.big);
      if (filters.flag === 'heavy') rows = rows.filter(f => f.mbps > 4);
      if (filters.flag === 'notr2') rows = rows.filter(f => !f.onR2);
      if (q) rows = rows.filter(f => f.name.includes(q));
      return { rows, total: rows.length, next: 0 };
    },
    emptyText: 'কোনো ফাইল নেই।'
  });
  holder.append(table);
  await load();
  return {};
}
