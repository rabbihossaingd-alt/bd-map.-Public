// দূরপাল্লা · ট্রেন · লঞ্চ: the intercity data the app shows — companies and their ratings, and each district's fares
// (BRTA's set fare, what counters usually charge, per km) — with ratings that look made up, which can be removed.
// The fares themselves change in data/bangladesh.js with a source; this page shows them side by side to check.
import { api, errText } from '../api.js';
import { badge, button, confirmAction, h, tabs, toast, when } from '../ui.js';
import { dataTable } from '../table.js';
import { num, taka } from '../fmt.js';

export async function render(box) {
  let tab = 'fares', data = null;
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'দূরপাল্লা · ট্রেন · লঞ্চ'), h('p', 'muted', 'কোম্পানি, জেলার ভাড়া (BRTA বনাম কাউন্টার) আর রেটিং। সন্দেহজনক রেটিং আলাদা করে দেখানো হয়।'))), holder);
  const load = async () => { if (!data) data = await api('intercity'); return data; };
  let table;
  function draw() {
    const t = tabs([['fares', 'জেলার ভাড়া'], ['operators', 'কোম্পানি'], ['flags', 'সন্দেহজনক রেটিং', data ? data.flags.length : 0]], tab, v => { tab = v; draw(); });
    if (tab === 'fares') table = dataTable({
      page: 'ic-fares', search: 'জেলা', rowKey: r => r.id,
      columns: [
        { key: 'bn', label: 'জেলা', render: r => h('div', 'cell-t', h('b', null, r.bn), h('span', 'muted', r.division + ' বিভাগ')), sort: r => r.bn },
        { key: 'km', label: 'দূরত্ব', render: r => r.km ? `${num(r.km)} কিমি` : '—', sort: r => r.km || 0, cls: 'num' },
        { key: 'brta', label: 'BRTA ভাড়া', render: r => r.brta ? `${taka(r.brta[0])} / ${taka(r.brta[1])}` : '—', sort: r => r.brta ? r.brta[0] : 0 },
        { key: 'market', label: 'কাউন্টারে সাধারণত', render: r => r.market ? `${taka(r.market[0])}–${num(r.market[1])}` : h('span', 'muted', 'তথ্য নেই'), sort: r => r.market ? r.market[0] : 0 },
        { key: 'perKm', label: 'কিমি প্রতি', render: r => r.perKm ? badge('৳' + num(r.perKm, 2), r.perKm < 0.8 || r.perKm > 6 ? 'danger' : '') : '—', sort: r => r.perKm || 0 },
        { key: 'terminal', label: 'টার্মিনাল', render: r => r.terminal || '—', sort: r => r.terminal },
        { key: 'operators', label: 'কোম্পানি', render: r => num(r.operators), sort: r => r.operators, cls: 'num' }
      ],
      load: async ({ q }) => { await load(); const rows = q ? data.fares.filter(r => r.bn.includes(q) || r.id.includes(q.toLowerCase())) : data.fares; return { rows, total: rows.length, next: 0 }; },
      emptyText: 'কিছু নেই।'
    });
    if (tab === 'operators') table = dataTable({
      page: 'ic-ops', search: 'কোম্পানির নাম', rowKey: o => o.en,
      columns: [
        { key: 'bn', label: 'কোম্পানি', render: o => h('div', 'cell-t', h('b', null, o.bn), h('span', 'muted', o.en)), sort: o => o.bn },
        { key: 'kind', label: 'ধরন', render: o => h('span', 'badges', o.ac ? badge('এসি', 'info') : null, o.nonAc ? badge('নন-এসি', '') : null), sortable: false },
        { key: 'districts', label: 'জেলা', render: o => num(o.districts), sort: o => o.districts, cls: 'num' },
        { key: 'rating', label: 'রেটিং', render: o => o.rating.n ? `★ ${num(o.rating.avg, 1)} (${num(o.rating.n)})` : h('span', 'muted', 'নেই'), sort: o => o.rating.avg }
      ],
      load: async ({ q }) => { await load(); const rows = q ? data.operators.filter(o => o.bn.includes(q) || o.en.toLowerCase().includes(q.toLowerCase())) : data.operators; return { rows, total: rows.length, next: 0 }; },
      emptyText: 'কিছু নেই।'
    });
    if (tab === 'flags') table = dataTable({
      page: 'ic-flags', rowKey: f => f.key + f.device,
      columns: [
        { key: 'key', label: 'কীসের রেটিং', render: f => h('b', null, f.key.replace(/^bus:/, '')), sort: f => f.key },
        { key: 'stars', label: 'তারা', render: f => '★'.repeat(f.stars), sort: f => f.stars },
        { key: 'who', label: 'কে', render: f => f.user ? f.user.name : f.device, sortable: false },
        { key: 'why', label: 'কেন সন্দেহ', render: f => h('span', 'badges', ...f.why.map(w => badge(w, 'warn'))), sortable: false },
        { key: 'updated', label: 'কখন', render: f => when(f.updated), sort: f => f.updated }
      ],
      load: async () => { await load(); return { rows: data.flags, total: data.flags.length, next: 0 }; },
      actions: f => [button('সরান', { small: true, kind: 'ghost', onClick: async () => {
        const ok = await confirmAction({ tier: 2, title: 'রেটিংটি সরাবেন?', reasons: [['fake', 'ভুয়া অ্যাকাউন্ট'], ['spam', 'স্প্যাম'], ['other', 'অন্য']], confirmText: 'সরান' });
        if (!ok) return;
        try { await api('ratings/remove', { key: f.key, device: f.device, ...ok }); toast('রেটিং সরানো হলো।'); data = null; draw(); } catch (e) { toast(errText(e), { bad: true }); }
      } })],
      emptyText: 'কোনো সন্দেহজনক রেটিং নেই।'
    });
    holder.replaceChildren(t, table);
  }
  await load(); draw();
  return { key: e => table.keyHandler(e) };
}
