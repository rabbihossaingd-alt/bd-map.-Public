// The command palette (Ctrl/Cmd+K, or "/"): find a person (name, e-mail, @username, ID), a post, a group, a ticket
// number or a TrxID, or jump to any page. Results grouped by kind, arrow keys to move, Enter to open.
import { api } from './api.js';
import { attrs, h, icon } from './ui.js';
import { num, taka } from './fmt.js';

let open = null;
export function openPalette({ pages, go, openPerson }) {
  if (open) { open.input.focus(); return; }
  const back = h('div', 'pal-back'), box = attrs(h('div', 'pal'), { role: 'dialog', 'aria-label': 'খুঁজুন ও যান' });
  const input = attrs(h('input', 'pal-input'), { placeholder: 'মানুষ, পোস্ট, টিকিট #, TrxID খুঁজুন — বা কোনো পাতায় যান…', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'খুঁজুন' });
  const list = attrs(h('div', 'pal-list'), { role: 'listbox' });
  box.append(h('div', 'pal-head', icon('search'), input, h('kbd', null, 'Esc')), list, h('div', 'pal-foot', h('span', null, h('kbd', null, '↑'), h('kbd', null, '↓'), ' চলুন'), h('span', null, h('kbd', null, 'Enter'), ' খুলুন')));
  back.append(box);
  document.body.append(back);
  let items = [], at = 0, seq = 0, timer;
  const close = () => { back.remove(); open = null; document.removeEventListener('keydown', keys, true); };
  open = { input, close };
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });

  function paint(groups) {
    list.replaceChildren(); items = [];
    for (const [label, rows] of groups) {
      if (!rows.length) continue;
      list.append(h('div', 'pal-group', label));
      for (const r of rows) {
        const i = items.length;
        const el = attrs(h('div', 'pal-item', icon(r.ic), h('div', 't', h('b', null, r.title), r.sub ? h('span', null, r.sub) : null), r.hint ? h('kbd', null, r.hint) : null), { role: 'option', id: 'pal-' + i });
        el.addEventListener('mousemove', () => { at = i; mark(); });
        el.addEventListener('click', () => { close(); r.run(); });
        list.append(el); items.push({ el, run: r.run });
      }
    }
    if (!items.length) list.append(h('div', 'pal-none', 'কিছু পাওয়া যায়নি।'));
    at = 0; mark();
  }
  function mark() { items.forEach((it, i) => it.el.classList.toggle('on', i === at)); if (items[at]) { items[at].el.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', 'pal-' + at); } }
  const pageRows = q => pages.filter(p => !q || p.title.includes(q) || p.key.includes(q.toLowerCase()) || (p.group || '').includes(q)).slice(0, q ? 8 : 12)
    .map(p => ({ ic: p.ic, title: p.title, sub: p.group, run: () => go('#/' + p.key), hint: p.hint }));
  async function run() {
    const q = input.value.trim(), mine = ++seq;
    const pg = pageRows(q);
    if (q.length < 2) { paint([['পাতা', pg]]); return; }
    paint([['পাতা', pg], ['খোঁজা হচ্ছে…', []]]);
    let r;
    try { r = await api('search?q=' + encodeURIComponent(q)); } catch { r = { users: [], posts: [], groups: [], tickets: [], payouts: [] }; }
    if (mine !== seq) return;
    paint([
      ['মানুষ', r.users.map(u => ({ ic: 'users', title: u.name, sub: `@${u.username} · ${u.email} · ID ${num(u.id)}${u.banned ? ' · বন্ধ' : ''}`, run: () => openPerson(u) }))],
      ['টিকিট', r.tickets.map(t => ({ ic: 'life', title: `#${num(t.id)} ${t.subject}`, sub: t.name, run: () => go('#/tickets/' + t.id) }))],
      ['পেআউট', r.payouts.map(p => ({ ic: 'wallet', title: `${p.ref} · ${taka(p.amount)}`, sub: `${p.name} · ${p.method}`, run: () => go('#/payouts') }))],
      ['পোস্ট', r.posts.map(p => ({ ic: 'image', title: p.caption || `পোস্ট #${num(p.id)}`, sub: p.name, run: () => go('#/posts') }))],
      ['গ্রুপ', r.groups.map(g => ({ ic: 'group', title: g.name || `গ্রুপ #${num(g.id)}`, run: () => go('#/groups') }))],
      ['পাতা', pg]
    ]);
  }
  const keys = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(items.length - 1, at + 1); mark(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); mark(); }
    if (e.key === 'Enter' && items[at]) { e.preventDefault(); const f = items[at].run; close(); f(); }
  };
  document.addEventListener('keydown', keys, true);
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 180); });
  run();
  setTimeout(() => input.focus(), 0);
}
export const paletteOpen = () => !!open;
