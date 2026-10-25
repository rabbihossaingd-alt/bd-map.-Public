// জানানো ভাড়া: each report beside the rate the app itself would show (BRTA for buses, the government meter for CNG),
// the middle of what others reported for the same trip, how far it is from both, and the sender's record. Approving
// pays 10 points once; hiding takes the fare off the app (and the points back). Both can be undone. A smart filter
// picks reports within ±10% of the middle, to approve them together.
import { api, errText } from '../api.js';
import { attrs, avatar, badge, button, confirmAction, h, icon, tabs, toast, when } from '../ui.js';
import { dataTable } from '../table.js';
import { num, taka } from '../fmt.js';

const MODE = { bus: 'বাস', cng: 'সিএনজি', launch: 'লঞ্চ', stop: 'ঢাকার বাস (স্টপ)' };
const dev = (a, b) => b ? Math.round((a - b) / b * 100) : null;
const devBadge = d => d == null ? h('span', 'muted', '—') : badge((d > 0 ? '+' : '') + num(d) + '%', Math.abs(d) <= 10 ? 'ok' : Math.abs(d) <= 35 ? 'warn' : 'danger');

export async function render(box) {
  let status = 'pending';
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'জানানো ভাড়া'), h('p', 'muted', 'পয়েন্ট শুধু ভাড়ার জন্য, আর অনুমোদন দিলে তবেই: প্রতিটিতে ১০। লগইন ছাড়া জানানো ভাড়ায় পয়েন্ট নেই।'))), holder);
  let table;
  async function act(doIt, items, label) {
    let extra = {};
    if (doIt === 'hide') { const ok = await confirmAction({ tier: 2, title: `${num(items.length)}টি ভাড়া অ্যাপ থেকে সরাবেন?`, text: 'অনুমোদিত হলে ১০ পয়েন্ট করে কাটা যাবে। পরে ফেরানো যায়।', reasons: [['wrong_data', 'ভুল তথ্য (ভাড়া/রুট)'], ['spam', 'স্প্যাম'], ['other', 'অন্য']], confirmText: 'সরান' }); if (!ok) return; extra = ok; }
    try {
      const r = await api('fares2/act', { do: doIt, items: items.map(x => ({ kind: x.kind, id: x.id })), ...extra });
      const back = { approve: 'unapprove', hide: 'unhide' }[doIt];
      toast(`${num(r.done.length)}টি ${label}`, back ? { undo: async () => { await api('fares2/act', { do: back, items: r.done }); table.reload(); } } : {});
      table.reload();
    } catch (e) { toast(errText(e), { bad: true }); }
  }
  function draw() {
    const t = tabs([['pending', 'অনুমোদন বাকি'], ['approved', 'অনুমোদিত'], ['hidden', 'সরানো'], ['all', 'সব']], status, v => { status = v; draw(); });
    table = dataTable({
      page: 'fares', search: 'জায়গার নাম বা নাম', rowKey: r => r.kind + ':' + r.id,
      filters: [{ key: 'mode', label: 'মাধ্যম', options: Object.entries(MODE) }, { key: 'smart', label: 'স্মার্ট ফিল্টার', options: [['near', 'মধ্যমার ±১০%-এর মধ্যে'], ['far', 'মধ্যমা বা রেট থেকে ৩৫%+ দূরে'], ['noref', 'তুলনার কিছু নেই']] }],
      columns: [
        { key: 'trip', label: 'পথ', render: r => h('div', 'cell-t', h('b', null, `${r.from.label} → ${r.to.label}`), h('span', 'muted', `${MODE[r.mode] || r.mode} · ${num(r.km, 1)} কিমি`,
          r.from.lat && r.to.lat ? attrs(h('a', 'link small', ' · ম্যাপে দেখুন'), { href: `index.html#/trip?from=${r.from.lat},${r.from.lon},${encodeURIComponent(r.from.label)}&to=${r.to.lat},${r.to.lon},${encodeURIComponent(r.to.label)}`, target: '_blank' }) : null)), sort: r => r.from.label },
        { key: 'fare', label: 'জানানো', render: r => h('b', null, taka(r.fare)), sort: r => r.fare, cls: 'num' },
        { key: 'ref', label: 'অ্যাপের রেট', render: r => r.ref ? attrs(h('span', null, taka(r.ref), ' ', devBadge(dev(r.fare, r.ref))), { title: r.refLabel }) : attrs(h('span', 'muted', '—'), { title: r.refLabel }), sort: r => dev(r.fare, r.ref) ?? 0 },
        { key: 'median', label: 'কমিউনিটির মধ্যমা', render: r => r.median ? h('span', null, taka(r.median), h('small', 'muted', ` (${num(r.n)} জন) `), devBadge(dev(r.fare, r.median))) : h('span', 'muted', 'আর কেউ জানাননি'), sort: r => Math.abs(dev(r.fare, r.median) ?? 999) },
        { key: 'user', label: 'কে', render: r => r.user ? h('div', 'person', avatar(r.user, 'sm'), h('div', 't', h('b', null, r.user.name), h('span', null, r.cred ? `অনুমোদিত ${num(r.cred.ok)}/${num(r.cred.total)}${r.cred.hidden ? ` · সরানো ${num(r.cred.hidden)}` : ''}` : ''))) : h('span', 'muted', 'লগইন ছাড়া — পয়েন্ট নেই'), sort: r => r.cred ? r.cred.ok / Math.max(1, r.cred.total) : -1 },
        { key: 'state', label: 'অবস্থা', render: r => r.hidden ? badge('সরানো', 'danger') : r.ok ? badge('অনুমোদিত', 'ok') : badge('বাকি', 'warn'), sortable: false },
        { key: 'created', label: 'কখন', render: r => when(r.created), sort: r => r.created }
      ],
      load: async ({ q, filters }) => {
        const { rows } = await api(`fares2?status=${status}${filters.mode ? '&mode=' + filters.mode : ''}`);
        let out = rows;
        if (filters.smart === 'near') out = out.filter(r => r.median && Math.abs(dev(r.fare, r.median)) <= 10);
        if (filters.smart === 'far') out = out.filter(r => (r.median && Math.abs(dev(r.fare, r.median)) >= 35) || (r.ref && Math.abs(dev(r.fare, r.ref)) >= 35));
        if (filters.smart === 'noref') out = out.filter(r => !r.median && !r.ref);
        if (q) out = out.filter(r => (r.from.label + ' ' + r.to.label + ' ' + (r.user ? r.user.name : '')).includes(q));
        return { rows: out, total: out.length, next: 0 };
      },
      actions: r => [
        !r.ok && !r.hidden ? button('অনুমোদন · +১০', { small: true, kind: 'primary', onClick: () => act('approve', [r], 'ভাড়া অনুমোদিত — পয়েন্ট যোগ হলো।') }) : null,
        r.ok && !r.hidden ? button('অনুমোদন তুলুন', { small: true, kind: 'ghost', onClick: () => act('unapprove', [r], 'অনুমোদন তোলা হলো — পয়েন্ট কাটা গেল।') }) : null,
        !r.hidden ? button('সরান', { small: true, kind: 'ghost', onClick: () => act('hide', [r], 'ভাড়া অ্যাপ থেকে সরানো হলো।') }) : button('ফেরান', { small: true, onClick: () => act('unhide', [r], 'ভাড়া আবার অ্যাপে।') })
      ].filter(Boolean),
      bulk: [{ text: 'অনুমোদন দিন', ic: 'check', run: rows => act('approve', rows.filter(r => !r.ok && !r.hidden), 'ভাড়া অনুমোদিত — প্রতিটিতে ১০ পয়েন্ট।') },
             { text: 'সরান', ic: 'x', danger: true, run: rows => act('hide', rows.filter(r => !r.hidden), 'ভাড়া অ্যাপ থেকে সরানো হলো।') }],
      emptyText: status === 'pending' ? 'অনুমোদনের অপেক্ষায় কোনো ভাড়া নেই — সাবাস' : 'এখানে কিছু নেই।'
    });
    holder.replaceChildren(t, h('p', 'hint', icon('alert'), ' "অ্যাপের রেট" — অ্যাপ নিজে যে নিয়মে ভাড়া দেখায় (বাসে BRTA, সিএনজিতে সরকারি মিটার), সোজা দূরত্ব × অ্যাপের রাস্তা-গুণক দিয়ে। ঘরের উপর মাউস রাখলে নিয়মটা দেখা যায়।'), table);
  }
  draw();
  return { key: e => table.keyHandler(e) };
}
