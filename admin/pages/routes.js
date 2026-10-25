// ঢাকার বাস রুট ও স্টপ: the routes as the app shows them, with the team's edits. Change a route's names and its stops
// (drag to reorder, add from the stop list, remove), hide it, see it drawn, look back through its versions and return
// to the original. Stops can be corrected or added. Edits reach the app at once: the server writes them into the
// bus data file the app downloads (one entry per route — buses run both ways).
import { api, errText } from '../api.js';
import { attrs, badge, button, closeDrawer, confirmAction, field, h, icon, modal, openDrawer, select, tabs, toast, when } from '../ui.js';
import { dataTable } from '../table.js';
import { full, num } from '../fmt.js';

export async function render(box, { params, go }) {
  let data = null, tab = 'routes';
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'ঢাকার বাস রুট ও স্টপ'), h('p', 'muted', 'বদল সঙ্গে সঙ্গে অ্যাপে যায় — সার্ভার বাসের ডেটা ফাইলে বসিয়ে দেয়। প্রতিটা বদলের ভার্সন থাকে, মূলটায় ফেরা যায়।')),
    button('নতুন রুট', { kind: 'primary', ic: 'plus', onClick: () => edit(null) })), holder);
  const load = async () => { data = await api('routes'); return data; };
  let table;
  function draw() {
    const t = tabs([['routes', 'রুট'], ['stops', 'স্টপ']], tab, v => { tab = v; draw(); });
    table = tab === 'routes' ? dataTable({
      page: 'routes', search: 'বাসের নাম বা স্টপ', rowKey: r => r.key,
      filters: [{ key: 'state', label: 'অবস্থা', options: [['edited', 'বদলানো'], ['new', 'নতুন'], ['hidden', 'লুকানো'], ['missing', 'অজানা স্টপ আছে']] }],
      columns: [
        { key: 'name', label: 'বাস', render: r => h('div', 'cell-t', h('b', null, r.bn), h('span', 'muted', r.en)), sort: r => r.bn },
        { key: 'ends', label: 'কোথা থেকে কোথায়', render: r => `${stopName(r.stops[0])} ↔ ${stopName(r.stops[r.stops.length - 1])}`, sortable: false },
        { key: 'stops', label: 'স্টপ', render: r => num(r.stops.length), sort: r => r.stops.length, cls: 'num' },
        { key: 'km', label: 'দৈর্ঘ্য', render: r => `${num(r.km, 1)} কিমি`, sort: r => r.km, cls: 'num' },
        { key: 'state', label: 'অবস্থা', render: r => h('span', 'badges', r.hidden ? badge('লুকানো', 'danger') : null, r.isNew ? badge('নতুন', 'info') : r.edited ? badge('বদলানো', 'warn') : null, r.missing.length ? badge('অজানা স্টপ', 'danger') : null), sortable: false }
      ],
      load: async ({ q, filters }) => {
        await load();
        let rows = data.routes;
        if (filters.state === 'edited') rows = rows.filter(r => r.edited && !r.isNew); if (filters.state === 'new') rows = rows.filter(r => r.isNew);
        if (filters.state === 'hidden') rows = rows.filter(r => r.hidden); if (filters.state === 'missing') rows = rows.filter(r => r.missing.length);
        if (q) { const l = q.toLowerCase(); rows = rows.filter(r => r.bn.includes(q) || r.en.toLowerCase().includes(l) || r.stops.some(id => id.includes(l) || stopName(id).includes(q))); }
        return { rows, total: rows.length, next: 0 };
      },
      onOpen: r => go('#/routes/' + r.key), emptyText: 'কোনো রুট নেই।'
    }) : dataTable({
      page: 'stops', search: 'স্টপের নাম', rowKey: s => s.id,
      columns: [
        { key: 'bn', label: 'স্টপ', render: s => h('div', 'cell-t', h('b', null, s.bn), h('span', 'muted', `${s.en} · ${s.id}`)), sort: s => s.bn },
        { key: 'pos', label: 'অবস্থান', render: s => attrs(h('a', 'link mono', `${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`), { href: `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=16/${s.lat}/${s.lon}`, target: '_blank' }), sortable: false },
        { key: 'uses', label: 'কতগুলো বাস', render: s => num(s.uses), sort: s => s.uses, cls: 'num' },
        { key: 'state', label: '', render: s => s.isNew ? badge('নতুন', 'info') : s.edited ? badge('বদলানো', 'warn') : '', sortable: false }
      ],
      load: async ({ q }) => { await load(); let rows = Object.entries(data.stops).map(([id, s]) => ({ id, ...s })); if (q) rows = rows.filter(s => s.bn.includes(q) || s.en.toLowerCase().includes(q.toLowerCase()) || s.id.includes(q)); return { rows, total: rows.length, next: 0 }; },
      actions: s => [button('বদলান', { small: true, kind: 'ghost', onClick: () => stopForm(s) })],
      toolbarExtra: [button('নতুন স্টপ', { small: true, ic: 'plus', onClick: () => stopForm(null) })], emptyText: 'কোনো স্টপ নেই।'
    });
    holder.replaceChildren(t, table);
  }
  const stopName = id => (data && data.stops[id] && data.stops[id].bn) || id;

  // a route drawn as a line through its stops (north up), so a stop in the wrong place stands out
  function sketch(ids) {
    const pts = ids.map(id => data.stops[id]).filter(Boolean);
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 400 260'); svg.setAttribute('class', 'route-sketch');
    if (pts.length < 2) return svg;
    const lats = pts.map(p => p.lat), lons = pts.map(p => p.lon), minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const sc = Math.min(360 / Math.max(maxLon - minLon, 1e-3), 220 / Math.max(maxLat - minLat, 1e-3));
    const xy = p => [20 + (p.lon - minLon) * sc, 240 - (p.lat - minLat) * sc];
    const line = document.createElementNS(NS, 'path'); line.setAttribute('d', pts.map((p, i) => (i ? 'L' : 'M') + xy(p).map(v => v.toFixed(1)).join(',')).join(' ')); line.setAttribute('class', 'rs-line'); svg.append(line);
    pts.forEach((p, i) => { const [x, y] = xy(p); const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', i === 0 || i === pts.length - 1 ? 5 : 3); c.setAttribute('class', 'rs-dot'); const t = document.createElementNS(NS, 'title'); t.textContent = p.bn; c.append(t); svg.append(c); });
    return svg;
  }

  // the editor
  async function edit(key) {
    if (!data) await load();
    const r = key ? data.routes.find(x => x.key === key) : { key: '', bn: '', en: '', stops: [], hidden: false, isNew: true };
    if (!r) return;
    let stops = [...r.stops];
    const bn = attrs(h('input', 'input'), { value: r.bn, maxlength: '80' }), en = attrs(h('input', 'input'), { value: r.en, maxlength: '80', ...(key ? { readonly: '' } : {}) });
    const hidden = attrs(h('input'), { type: 'checkbox' }); hidden.checked = r.hidden;
    const list = h('ol', 'stop-list'), sk = h('div', 'sketch-box');
    const paintList = () => {
      list.replaceChildren(...stops.map((id, i) => {
        const li = attrs(h('li', data.stops[id] ? '' : 'missing', h('span', 'grip', icon('menu')), h('span', 'grow', stopName(id), h('small', 'muted', ' ' + id)),
          button('', { small: true, kind: 'ghost', ic: 'chevd', title: 'নিচে', onClick: () => move(i, 1) }), button('', { small: true, kind: 'ghost', ic: 'x', title: 'বাদ দিন', onClick: () => { stops.splice(i, 1); paintList(); } })), { draggable: 'true' });
        li.querySelectorAll('.btn')[0].querySelector('svg').style.transform = 'rotate(0deg)';
        li.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', String(i)); li.classList.add('dragging'); });
        li.addEventListener('dragend', () => li.classList.remove('dragging'));
        li.addEventListener('dragover', e => e.preventDefault());
        li.addEventListener('drop', e => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); const [m] = stops.splice(from, 1); stops.splice(i, 0, m); paintList(); });
        return li;
      }));
      sk.replaceChildren(sketch(stops), h('small', 'muted', `${num(stops.length)}টি স্টপ`));
    };
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= stops.length) return; [stops[i], stops[j]] = [stops[j], stops[i]]; paintList(); };
    const add = select([['', 'স্টপ যোগ করুন…'], ...Object.entries(data.stops).sort((a, b) => a[1].bn.localeCompare(b[1].bn, 'bn')).map(([id, s]) => [id, `${s.bn} (${s.en})`])], '');
    add.addEventListener('change', () => { if (add.value) { stops.push(add.value); add.value = ''; paintList(); } });
    paintList();
    const versions = h('div', 'stack');
    if (key) api('routes/versions?key=' + key).then(v => versions.replaceChildren(h('h3', null, `ভার্সন (${num(v.versions.length)})`), ...v.versions.map(x => h('div', 'feed-row', h('div', 't', h('b', null, x.by || 'টিম'), h('span', 'muted', x.after ? `${x.after.bn} · ${num(x.after.stops.length)} স্টপ${x.after.hidden ? ' · লুকানো' : ''}` : 'মূলে ফেরা')), when(x.at))))).catch(() => {});
    const body = h('div', 'route-edit', h('div', 'stack', field('বাংলা নাম', bn), field('ইংরেজি নাম', en, key ? 'ইংরেজি নামই রুটের পরিচয় — বদলানো যায় না।' : ''), h('label', 'check', hidden, ' অ্যাপে লুকান'),
      h('h3', null, 'স্টপ (টেনে ক্রম বদলান)'), list, add), h('div', 'stack', sk, r.original && r.edited ? h('p', 'hint', `মূলে: ${r.original.bn} · ${num(r.original.stops.length)} স্টপ`) : null, versions));
    const foot = [button('সেভ', { kind: 'primary', onClick: save }), key && r.edited && !r.isNew ? button('মূলে ফিরুন', { kind: 'ghost', onClick: revert }) : null].filter(Boolean);
    openDrawer({ title: key ? r.bn : 'নতুন রুট', body, foot, wide: true, ref: 'route:' + (key || 'new') });
    async function save() {
      if (!bn.value.trim() || !en.value.trim() || stops.length < 2) { toast('দুটো নাম আর অন্তত দুটো স্টপ লাগবে।', { bad: true }); return; }
      const ok = await confirmAction({ tier: 2, title: key ? 'রুটের বদল সেভ করবেন?' : 'নতুন রুট যোগ করবেন?', danger: false, text: 'সঙ্গে সঙ্গে অ্যাপে যাবে।', reasons: [['wrong_data', 'ভুল তথ্য (ভাড়া/রুট)'], ['new_route', 'নতুন রুট'], ['user_report', 'ব্যবহারকারীর জানানো'], ['other', 'অন্য']], confirmText: 'সেভ' });
      if (!ok) return;
      try { await api('routes/save', { key: key || undefined, bn: bn.value, en: en.value, stops, hidden: hidden.checked, ...ok }); toast('সেভ হলো — অ্যাপে চলে গেছে।'); data = null; table.reload(); history.back(); }
      catch (e) { toast(e.message === 'stops' ? `অজানা স্টপ: ${e.data.missing.join(', ')}` : e.message === 'exists' ? 'এই নামে রুট আগে থেকেই আছে।' : errText(e), { bad: true }); }
    }
    async function revert() {
      const ok = await confirmAction({ tier: 2, title: 'মূল রুটে ফিরবেন?', text: 'সব বদল মুছে tools/build-buses.py-এর রুটে ফিরবে। ভার্সনে থাকবে।', reasons: null, confirmText: 'ফিরুন' });
      if (!ok) return;
      try { await api('routes/revert', { key }); toast('মূলে ফেরানো হলো।'); data = null; table.reload(); history.back(); } catch (e) { toast(errText(e), { bad: true }); }
    }
  }
  function stopForm(s) {
    const bn = attrs(h('input', 'input'), { value: s ? s.bn : '' }), en = attrs(h('input', 'input'), { value: s ? s.en : '' }), lat = attrs(h('input', 'input'), { value: s ? s.lat : '', inputmode: 'decimal' }), lon = attrs(h('input', 'input'), { value: s ? s.lon : '', inputmode: 'decimal' });
    const m = modal({ title: s ? `${s.bn} — স্টপ` : 'নতুন স্টপ', body: h('div', 'confirm', field('বাংলা নাম', bn), field('ইংরেজি নাম', en), h('div', 'two', field('অক্ষাংশ (lat)', lat), field('দ্রাঘিমা (lon)', lon)), h('p', 'hint', 'অবস্থান: OpenStreetMap-এ জায়গাটায় ডান-ক্লিক → "Show address" থেকে দুটো সংখ্যা।')),
      actions: [button('বাতিল', { kind: 'ghost', onClick: () => m.close() }), button('সেভ', { kind: 'primary', onClick: async () => {
        try { await api('stops/save', { id: s && s.id, bn: bn.value, en: en.value, lat: Number(lat.value), lon: Number(lon.value) }); m.close(); toast('স্টপ সেভ হলো।'); data = null; table.reload(); }
        catch (e) { toast(e.message === 'exists' ? 'এই নামে স্টপ আগে থেকেই আছে।' : errText(e), { bad: true }); }
      } })] });
  }
  draw();
  if (params[0]) setTimeout(() => edit(params[0]), 500);
  return { onParams: p => { if (p[0]) edit(p[0]); else closeDrawer(); }, key: e => table.keyHandler(e) };
}
