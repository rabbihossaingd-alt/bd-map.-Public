// কাজের খতিয়ান: every change made from the panel — who, what, when, on whom, before → after, the reason, from
// where. Read only: the database refuses to change or delete a line. New lines arrive live.
import { api, session } from '../api.js';
import { badge, closeDrawer, h, icon, openDrawer, person, when, attrs } from '../ui.js';
import { dataTable } from '../table.js';
import { full, num, dhakaDayStart } from '../fmt.js';
import { actionText, ACTIONS } from './command.js';

export async function render(box, { params, go }) {
  let actors = [];
  const tone = a => a === 'denied' || a.endsWith('.failed') ? 'danger' : a.startsWith('pii') || a === 'export' ? 'warn' : a.startsWith('admin.') || a === 'stepup' ? '' : 'info';
  const table = dataTable({
    page: 'audit', search: 'নোট, লক্ষ্য বা কাজ দিয়ে খুঁজুন',
    filters: [
      { key: 'action', label: 'কাজ', options: [['admin.', 'প্যানেলে ঢোকা/লক'], ['team.', 'টিম ও ভূমিকা'], ['pii.', 'গোপন তথ্য দেখা'], ['denied', 'অনুমতি ছাড়া চেষ্টা'], ['export', 'ডাউনলোড'], ['stepup', 'পুনরায় নিশ্চিতকরণ'],
        ['ban', 'ব্যান'], ['verify', 'ব্যাজ'], ['fare', 'ভাড়া'], ['payout', 'পেআউট'], ['creator', 'ক্রিয়েটর'], ['report', 'রিপোর্ট']] },
      { key: 'when', label: 'সময়', options: [['0', 'আজ'], ['7', '৭ দিন'], ['30', '৩০ দিন'], ['90', '৯০ দিন']] },
      { key: 'actor', label: 'কে', options: [] }
    ],
    columns: [
      { key: 'at', label: 'কখন', render: r => when(r.at), sort: r => r.at },
      { key: 'actor', label: 'কে', render: r => h('span', 'strong', r.name || 'মুছে ফেলা অ্যাকাউন্ট'), sort: r => r.name || '' },
      { key: 'action', label: 'কী', render: r => badge(actionText(r.action), tone(r.action)) },
      { key: 'target', label: 'কার/কীসের', render: r => r.target_type ? h('span', 'mono', `${r.target_type}${r.target_id ? ' · ' + r.target_id : ''}`) : '—', sortable: false },
      { key: 'change', label: 'বদল', render: r => change(r), sortable: false },
      { key: 'note', label: 'কারণ/নোট', render: r => r.reason_code || r.note ? h('span', 'clip', [r.reason_code, r.note].filter(Boolean).join(' · ')) : '—', sortable: false },
      { key: 'ip', label: 'কোথা থেকে', hide: true, render: r => r.ip ? h('span', 'mono', `${r.ip} · ${r.ua}`) : '—', sortable: false }
    ],
    load: async ({ cursor, limit, q, filters }) => {
      const p = new URLSearchParams({ limit, ...(cursor ? { cursor } : {}), ...(q ? { q } : {}) });
      if (filters.action) p.set('action', filters.action);
      if (filters.actor) p.set('actor', filters.actor);
      if (filters.when) p.set('from', dhakaDayStart(Number(filters.when)));
      const r = await api('audit?' + p);
      if (!actors.length && r.actors) { actors = r.actors; fillActors(); }
      return r;
    },
    onOpen: (r, i, list) => go(`#/audit/${r.id}`),
    exportUrl: st => { const p = new URLSearchParams(); if (st.filters.action) p.set('action', st.filters.action); if (st.filters.actor) p.set('actor', st.filters.actor); if (st.filters.when) p.set('from', dhakaDayStart(Number(st.filters.when))); if (st.q) p.set('q', st.q); return 'api/admin/v2/audit.csv?' + p; },
    emptyText: 'এই ফিল্টারে কোনো কাজ নেই।'
  });
  function fillActors() {
    const s = table.querySelector('select[aria-label="কে"]');
    if (!s) return;
    for (const a of actors) s.append(attrs(h('option', null, a.name || `#${a.id}`), { value: a.id }));
  }
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'কাজের খতিয়ান'), h('p', 'muted', 'প্যানেল থেকে করা প্রতিটি কাজ — কে, কখন, কোথা থেকে, কী বদলেছে। এই তালিকা বদলানো বা মোছা যায় না।'))), table);

  // a line in full: before → after, side by side
  function show(id) {
    const list = table.rows(), i = list.findIndex(r => String(r.id) === String(id));
    const r = list[i];
    if (!r) { api(`audit?limit=1&cursor=${Number(id) + 1}`).then(x => { if (x.rows[0] && String(x.rows[0].id) === String(id)) paint(x.rows[0], -1, []); }).catch(() => {}); return; }
    paint(r, i, list);
  }
  function paint(r, i, list) {
    const body = h('div', 'stack',
      h('div', 'kv', h('span', null, 'কী'), badge(actionText(r.action), tone(r.action))),
      h('div', 'kv', h('span', null, 'কে'), h('b', null, r.name || 'মুছে ফেলা অ্যাকাউন্ট')),
      h('div', 'kv', h('span', null, 'কখন'), h('b', null, full(r.at))),
      h('div', 'kv', h('span', null, 'কার/কীসের'), h('b', 'mono', r.target_type ? `${r.target_type} ${r.target_id}` : '—')),
      r.reason_code ? h('div', 'kv', h('span', null, 'কারণ'), h('b', null, r.reason_code)) : null,
      r.note ? h('div', 'kv', h('span', null, 'নোট'), h('b', null, r.note)) : null,
      h('div', 'kv', h('span', null, 'কোথা থেকে'), h('b', 'mono', r.ip ? `${r.ip} · ${r.ua}` : 'জানা নেই (পুরনো লাইন)')),
      diff(r));
    openDrawer({ title: `খতিয়ান #${num(r.id)}`, body, ref: 'audit:' + r.id,
      prev: i > 0 ? () => go(`#/audit/${list[i - 1].id}`) : null, next: i >= 0 && i < list.length - 1 ? () => go(`#/audit/${list[i + 1].id}`) : null });
  }
  const onParams = p => { if (p[0]) show(p[0]); else closeDrawer(); };
  // new lines while the page is open: at the top
  const onAudit = e => table.prepend({ ...e.detail });
  document.addEventListener('mz:audit', onAudit);
  if (params[0]) setTimeout(() => show(params[0]), 400);
  return { onParams, key: e => table.keyHandler(e), destroy: () => document.removeEventListener('mz:audit', onAudit) };
}

const parse = s => { try { return s ? JSON.parse(s) : null; } catch { return s; } };
function change(r) {
  const b = parse(r.before_json), a = parse(r.after_json);
  if (!b && !a) return '—';
  const keys = [...new Set([...Object.keys(b || {}), ...Object.keys(a || {})])];
  return h('span', 'diff-inline', ...keys.slice(0, 2).map(k => h('span', null, h('s', null, fmt(b && b[k])), ' → ', h('b', null, fmt(a && a[k])))));
}
function diff(r) {
  const b = parse(r.before_json), a = parse(r.after_json);
  if (!b && !a) return h('p', 'hint', 'এই কাজে আগে/পরের কোনো তথ্য নেই।');
  const keys = [...new Set([...Object.keys(b || {}), ...Object.keys(a || {})])];
  const t = h('table', 'tbl diff', h('thead', null, h('tr', null, h('th', null, 'ঘর'), h('th', null, 'আগে'), h('th', null, 'পরে'))));
  const tb = h('tbody');
  for (const k of keys) tb.append(h('tr', (b && b[k]) !== (a && a[k]) ? 'changed' : '', h('td', 'mono', k), h('td', 'old', fmt(b && b[k])), h('td', 'new', fmt(a && a[k]))));
  t.append(tb);
  return h('div', null, h('h3', null, 'আগে → পরে'), h('div', 'tbl-wrap', t));
}
const fmt = v => v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
