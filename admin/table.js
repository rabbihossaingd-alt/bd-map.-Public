// One data table for every list in the panel: search, filter chips, sort, columns to show or hide, saved views,
// page by page (cursor) loading, select and act on many, quick actions on a row, keyboard (j/k, Enter, x), and on a
// phone every row becomes a card.
import { api, errText } from './api.js';
import { attrs, button, empty, errorBox, h, icon, menu, modal, select, skeleton, toast, field } from './ui.js';
import { num, prefs } from './fmt.js';

// opts: { page, columns: [{ key, label, render(row), sort(row), hide, cls }], load({ cursor, limit, q, filters }) -> { rows, next, total },
//         filters: [{ key, label, options: [[value, text]] }], search: placeholder, rowKey(row), onOpen(row, i, rows), actions(row) -> [buttons],
//         bulk: [{ text, ic, danger, run(rows) }], exportUrl(state) -> url, emptyText, toolbarExtra: [nodes] }
export function dataTable(opts) {
  const st = { q: '', filters: {}, sort: null, hidden: new Set(opts.columns.filter(c => c.hide).map(c => c.key)), limit: 25, ...(opts.initial || {}) };
  const root = h('div', 'dt' + (prefs.density === 'dense' ? ' dense' : ''));
  let rows = [], next = 0, total = 0, focus = -1, loading = false, seq = 0;
  const selected = new Set();
  const keyOf = opts.rowKey || (r => r.id);

  // ---- toolbar ----
  const bar = h('div', 'dt-bar'), chips = h('div', 'dt-chips'), bulkBar = h('div', 'dt-bulk'), body = h('div', 'dt-body'), foot = h('div', 'dt-foot');
  let search = null;
  if (opts.search) {
    search = attrs(h('input', 'input dt-search'), { type: 'search', placeholder: opts.search, 'aria-label': opts.search, spellcheck: 'false' });
    search.value = st.q || '';
    let t; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = search.value.trim(); reload(); }, 250); });
    bar.append(h('div', 'dt-searchwrap', icon('search'), search));
  }
  for (const f of opts.filters || []) {
    const s = select([['', f.label + ': সব'], ...f.options], st.filters[f.key] || '');
    s.classList.add('dt-filter'); s.setAttribute('aria-label', f.label);
    s.addEventListener('change', () => { if (s.value) st.filters[f.key] = s.value; else delete st.filters[f.key]; reload(); });
    f.el = s; bar.append(s);
  }
  const tools = h('div', 'dt-tools');
  tools.append(button('', { kind: 'ghost', ic: 'save', title: 'সেভ করা ভিউ', onClick: e => viewsMenu(e.currentTarget) }),
               button('', { kind: 'ghost', ic: 'columns', title: 'কলাম দেখানো/লুকানো', onClick: e => columnsMenu(e.currentTarget) }),
               button('', { kind: 'ghost', ic: 'list', title: 'ঘনত্ব: আরামদায়ক / ঘন', onClick: () => { prefs.density = prefs.density === 'dense' ? 'comfy' : 'dense'; root.classList.toggle('dense', prefs.density === 'dense'); } }));
  if (opts.exportUrl) tools.append(button('', { kind: 'ghost', ic: 'download', title: 'CSV ডাউনলোড (এখনকার ফিল্টার অনুযায়ী)', onClick: () => { location.href = opts.exportUrl(st); toast('ডাউনলোড শুরু হচ্ছে — খতিয়ানে লেখা থাকবে।'); } }));
  bar.append(...(opts.toolbarExtra || []), tools);

  function paintChips() {
    chips.replaceChildren();
    for (const f of opts.filters || []) {
      const v = st.filters[f.key];
      if (!v) continue;
      const label = (f.options.find(o => String(o[0]) === String(v)) || [v, v])[1];
      const c = h('span', 'chip', `${f.label}: ${label}`, button('', { kind: 'ghost', small: true, ic: 'x', title: 'সরান', onClick: () => { delete st.filters[f.key]; f.el.value = ''; reload(); } }));
      chips.append(c);
    }
    if (st.q) chips.append(h('span', 'chip', `খোঁজ: ${st.q}`, button('', { kind: 'ghost', small: true, ic: 'x', title: 'সরান', onClick: () => { st.q = ''; if (search) search.value = ''; reload(); } })));
    chips.hidden = !chips.children.length;
  }

  // ---- views and columns ----
  async function viewsMenu(anchor) {
    let views = [];
    try { views = (await api('views?page=' + encodeURIComponent(opts.page))).views; } catch { /* the menu still offers to save */ }
    const items = [{ label: 'সেভ করা ভিউ' }];
    for (const v of views) items.push({ text: v.name + (v.shared && !v.mine ? ` · ${v.by}` : v.shared ? ' · টিমের' : ''), ic: 'filter', run: () => applyView(v.state) });
    if (!views.length) items.push({ label: 'এখনো কোনো ভিউ নেই' });
    items.push('-', { text: 'এখনকার ভিউ সেভ করুন…', ic: 'plus', run: saveView });
    for (const v of views.filter(x => x.mine)) items.push({ text: `"${v.name}" মুছুন`, ic: 'x', danger: true, run: async () => { await api('views/delete', { id: v.id }); toast('ভিউ মুছে ফেলা হলো।'); } });
    menu(anchor, items);
  }
  function saveView() {
    const name = attrs(h('input', 'input'), { maxlength: '60', placeholder: 'যেমন: এই সপ্তাহের ব্যান' }), share = attrs(h('input'), { type: 'checkbox' });
    const m = modal({ title: 'ভিউ সেভ করুন', body: h('div', 'confirm', field('নাম', name), h('label', 'check', share, ' টিমের সবার সাথে শেয়ার করুন')),
      actions: [button('বাতিল', { kind: 'ghost', onClick: () => m.close() }), button('সেভ', { kind: 'primary', onClick: async () => {
        if (!name.value.trim()) { name.focus(); return; }
        try { await api('views/save', { page: opts.page, name: name.value.trim(), shared: share.checked, state: { q: st.q, filters: st.filters, sort: st.sort, hidden: [...st.hidden], limit: st.limit } }); m.close(); toast('ভিউ সেভ হলো।'); }
        catch (e) { toast(errText(e), { bad: true }); }
      } })] });
  }
  function applyView(s) {
    Object.assign(st, { q: s.q || '', filters: { ...(s.filters || {}) }, sort: s.sort || null, hidden: new Set(s.hidden || []), limit: s.limit || 25 });
    if (search) search.value = st.q;
    for (const f of opts.filters || []) f.el.value = st.filters[f.key] || '';
    reload();
  }
  function columnsMenu(anchor) {
    menu(anchor, [{ label: 'কলাম' }, ...opts.columns.filter(c => c.label).map(c => ({ text: (st.hidden.has(c.key) ? '☐ ' : '☑ ') + c.label, run: () => { if (st.hidden.has(c.key)) st.hidden.delete(c.key); else st.hidden.add(c.key); paint(); } }))]);
  }

  // ---- loading ----
  async function load(more) {
    if (loading) return;
    loading = true;
    const mine = ++seq;
    if (!more) body.replaceChildren(skeleton(Math.min(st.limit, 8)));
    try {
      const r = await opts.load({ cursor: more ? next : 0, limit: st.limit, q: st.q, filters: st.filters });
      if (mine !== seq) return;
      rows = more ? rows.concat(r.rows) : r.rows; next = r.next || 0; total = r.total ?? rows.length;
      if (!more) { selected.clear(); focus = -1; }
      paint();
    } catch (e) {
      if (mine === seq) body.replaceChildren(errorBox(e, () => load(more)));
    } finally { if (mine === seq) loading = false; }
  }
  function reload() { paintChips(); load(false); }

  // ---- drawing ----
  const visible = () => opts.columns.filter(c => !st.hidden.has(c.key));
  function sorted() {
    if (!st.sort) return rows;
    const c = opts.columns.find(x => x.key === st.sort.key);
    if (!c) return rows;
    const val = c.sort || (r => r[c.key]);
    return [...rows].sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * (st.sort.dir === 'asc' ? 1 : -1); });
  }
  function paint() {
    const list = sorted(), cols = visible();
    if (!list.length) { body.replaceChildren(empty(opts.emptyText || 'এখানে কিছু নেই।', st.q || Object.keys(st.filters).length ? 'ফিল্টার বদলে দেখুন।' : '')); paintFoot(); paintBulk(); return; }
    const table = attrs(h('table', 'tbl'), { role: 'grid' });
    const head = h('tr');
    if (opts.bulk) {
      const all = attrs(h('input'), { type: 'checkbox', 'aria-label': 'সব বেছে নিন' });
      all.checked = list.length > 0 && list.every(r => selected.has(keyOf(r)));
      all.addEventListener('change', () => { for (const r of list) all.checked ? selected.add(keyOf(r)) : selected.delete(keyOf(r)); paint(); });
      head.append(h('th', 'sel', all));
    }
    for (const c of cols) {
      const th = h('th', c.cls || '', c.label || '');
      if (c.label && c.sortable !== false) {
        th.classList.add('sortable');
        const on = st.sort && st.sort.key === c.key;
        if (on) th.append(icon(st.sort.dir === 'asc' ? 'chevd' : 'chevd', st.sort.dir === 'asc' ? 'up' : ''));
        th.setAttribute('aria-sort', on ? (st.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
        th.addEventListener('click', () => { st.sort = on && st.sort.dir === 'desc' ? { key: c.key, dir: 'asc' } : on ? null : { key: c.key, dir: 'desc' }; paint(); });
      }
      head.append(th);
    }
    if (opts.actions) head.append(h('th', 'acts'));
    const thead = h('thead', null, head), tbody = h('tbody');
    list.forEach((r, i) => {
      const tr = h('tr');
      tr.tabIndex = -1;
      if (i === focus) tr.classList.add('focus');
      if (selected.has(keyOf(r))) tr.classList.add('picked');
      if (opts.bulk) {
        const cb = attrs(h('input'), { type: 'checkbox', 'aria-label': 'বেছে নিন' });
        cb.checked = selected.has(keyOf(r));
        cb.addEventListener('click', e => e.stopPropagation());
        cb.addEventListener('change', () => { cb.checked ? selected.add(keyOf(r)) : selected.delete(keyOf(r)); tr.classList.toggle('picked', cb.checked); paintBulk(); });
        tr.append(h('td', 'sel', cb));
      }
      for (const c of cols) {
        const v = c.render ? c.render(r) : r[c.key];
        tr.append(attrs(h('td', c.cls || '', v instanceof Node ? v : (v ?? '—')), { 'data-label': c.label || '' }));
      }
      if (opts.actions) { const a = h('td', 'acts'); a.append(...opts.actions(r)); a.addEventListener('click', e => e.stopPropagation()); tr.append(a); }
      if (opts.onOpen) { tr.classList.add('click'); tr.addEventListener('click', () => { focus = i; opts.onOpen(r, i, list); }); }
      tbody.append(tr);
    });
    table.append(thead, tbody);
    body.replaceChildren(h('div', 'tbl-wrap', table));
    paintFoot(); paintBulk();
  }
  function paintFoot() {
    foot.replaceChildren(h('span', 'muted', `মোট ${num(total)} · দেখানো ${num(rows.length)}`));
    const size = select([['25', '২৫'], ['50', '৫০'], ['100', '১০০']], String(st.limit));
    size.setAttribute('aria-label', 'প্রতি পাতায়');
    size.addEventListener('change', () => { st.limit = Number(size.value); reload(); });
    foot.append(h('span', 'grow'), h('label', 'muted small', 'প্রতি পাতায় ', size));
    if (next) foot.append(button('আরও দেখুন', { ic: 'chevd', onClick: () => load(true) }));
  }
  function paintBulk() {
    bulkBar.replaceChildren();
    bulkBar.hidden = !(opts.bulk && selected.size);
    if (bulkBar.hidden) return;
    const picked = rows.filter(r => selected.has(keyOf(r)));
    bulkBar.append(h('b', null, `${num(picked.length)}টি বেছে নেওয়া`));
    for (const b of opts.bulk) bulkBar.append(button(`${b.text} (${num(picked.length)})`, { kind: b.danger ? 'danger' : 'secondary', ic: b.ic, small: true, onClick: async () => { await b.run(picked); } }));
    bulkBar.append(button('বাদ দিন', { kind: 'ghost', small: true, onClick: () => { selected.clear(); paint(); } }));
  }

  // ---- keyboard: j/k move, Enter opens, x picks (not while typing) ----
  root.keyHandler = e => {
    const list = sorted();
    if (!list.length) return false;
    if (e.key === 'j' || e.key === 'k') { focus = Math.max(0, Math.min(list.length - 1, focus + (e.key === 'j' ? 1 : -1))); paint(); const tr = body.querySelectorAll('tbody tr')[focus]; if (tr) tr.scrollIntoView({ block: 'nearest' }); return true; }
    if (e.key === 'Enter' && focus >= 0 && opts.onOpen) { opts.onOpen(list[focus], focus, list); return true; }
    if (e.key === 'x' && focus >= 0 && opts.bulk) { const k = keyOf(list[focus]); selected.has(k) ? selected.delete(k) : selected.add(k); paint(); return true; }
    return false;
  };

  root.append(bar, chips, bulkBar, body, foot);
  root.reload = reload;
  root.rows = () => sorted();
  root.prepend = row => { rows.unshift(row); total++; paint(); };
  reload();
  return root;
}
