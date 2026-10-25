// ডেটার মান: checks that run over the app's data and list what looks wrong — two buses that are one, one route entered
// for each direction, names without Bangla, stops far apart, two places on top of each other, odd fares. Each can be
// merged (for duplicate buses: one is hidden, the other stays) or marked fine.
import { api, errText } from '../api.js';
import { badge, button, confirmAction, empty, errorBox, h, icon, select, skeleton, tabs, toast, attrs } from '../ui.js';
import { num } from '../fmt.js';

const KIND = { 'bus-name': ['প্রায় একই নামের বাস', 'bus'], 'bus-reverse': ['দুই দিকের আলাদা এন্ট্রি', 'bus'], bangla: ['বাংলা নাম নেই', 'alert'], gap: ['স্টপ অনেক দূরে', 'pin'], missing: ['অজানা স্টপ', 'pin'], poi: ['একই জায়গা দুবার?', 'pin'], fare: ['অস্বাভাবিক ভাড়া', 'tag'] };

export async function render(box, { go }) {
  let status = 'open';
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'ডেটার মান'), h('p', 'muted', 'অ্যাপের ডেটায় যা ভুল মনে হয় — নিজে থেকে খুঁজে বের করা। প্রতিটা ঠিক করুন, বা "ঠিক আছে" চিহ্নিত করুন।'))), holder);
  async function load() {
    holder.replaceChildren(skeleton(5));
    let d;
    try { d = await api('quality?status=' + status); } catch (e) { holder.replaceChildren(errorBox(e, load)); return; }
    const t = tabs([['open', 'দেখা বাকি', d.tally.open], ['fixed', 'ঠিক করা', d.tally.fixed], ['ok', 'ঠিক আছে চিহ্নিত', d.tally.ok], ['all', 'সব']], status, v => { status = v; load(); });
    const groups = new Map();
    for (const i of d.issues) { if (!groups.has(i.kind)) groups.set(i.kind, []); groups.get(i.kind).push(i); }
    const body = d.issues.length ? [...groups].map(([k, list]) => h('section', 'section', h('h2', null, (KIND[k] || [k])[0], h('small', 'muted', ` (${num(list.length)})`)), h('div', 'q-list', ...list.map(row))))
      : [empty(status === 'open' ? 'কিছু বাকি নেই — ডেটা পরিষ্কার' : 'এখানে কিছু নেই।')];
    holder.replaceChildren(t, ...body, h('p', 'hint', icon('alert'), ' এখনো যা দেখা হয় না: ', d.notChecked.join(' · ')));
  }
  function row(i) {
    const acts = h('div', 'q-acts');
    if (i.status === 'open') {
      if (i.merge && i.routes) acts.append(button('মার্জ করুন', { small: true, kind: 'primary', onClick: () => merge(i) }));
      if (i.refs.length && (i.kind === 'bangla' || i.kind === 'gap' || i.kind === 'missing') && !i.refs[0].includes(' ')) acts.append(button('খুলুন', { small: true, kind: 'ghost', ic: 'chevr', onClick: () => go('#/routes/' + i.refs[0]) }));
      acts.append(button('ঠিক আছে', { small: true, kind: 'ghost', onClick: () => resolve(i, 'ok') }));
    } else acts.append(badge(i.status === 'fixed' ? 'ঠিক করা' : 'ঠিক আছে', 'ok'), button('আবার খুলুন', { small: true, kind: 'ghost', onClick: () => resolve(i, 'reopen') }));
    return h('div', 'q-row', h('span', 'q-ic', icon((KIND[i.kind] || [0, 'alert'])[1])), h('div', 'q-main', h('div', 'q-title', h('b', null, i.title)), h('span', 'muted', i.detail)), h('span'), acts);
  }
  async function merge(i) {
    const keep = select(i.routes.map(r => [r.key, `${r.bn} (${r.en}) · ${num(r.stops)} স্টপ`]), [...i.routes].sort((a, b) => b.stops - a.stops)[0].key);
    const ok = await confirmAction({ tier: 2, danger: false, title: 'কোনটা থাকবে?', text: 'অন্যটা অ্যাপ থেকে লুকানো হবে (মুছবে না — রুট পাতা থেকে ফেরানো যায়)। সাধারণত বেশি স্টপের রুটটা রাখা ভালো।', reasons: null, confirmText: 'মার্জ করুন' });
    if (!ok) return;
    void keep;
    const drop = i.routes.find(r => r.key !== keep.value) || i.routes[1];
    try { await api('quality/resolve', { key: i.key, do: 'merge', drop: drop.key }); toast(`${drop.bn} লুকানো হলো।`); load(); } catch (e) { toast(errText(e), { bad: true }); }
  }
  async function resolve(i, what) {
    try { await api('quality/resolve', { key: i.key, do: what }); toast(what === 'ok' ? 'ঠিক আছে চিহ্নিত।' : 'আবার খোলা হলো।', what === 'ok' ? { undo: async () => { await api('quality/resolve', { key: i.key, do: 'reopen' }); load(); } } : {}); load(); }
    catch (e) { toast(errText(e), { bad: true }); }
  }
  await load();
  return {};
}
