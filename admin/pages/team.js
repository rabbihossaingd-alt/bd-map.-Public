// টিম ও অনুমতি: who is on the team and with which role, two-step status, and what each role may do. Only the
// owner changes roles; giving the Admin role needs a fresh code, every change needs a reason, and all of it is logged.
import { api, errText, session } from '../api.js';
import { attrs, avatar, badge, button, confirmAction, dot, empty, errorBox, field, h, icon, modal, select, skeleton, tabs, toast, when } from '../ui.js';
import { dataTable } from '../table.js';
import { num, full } from '../fmt.js';

const ROLE_TONE = { owner: 'brand', admin: 'danger', moderator: 'warn', support: 'info', data_editor: 'info', finance: 'warn', viewer: '' };
const ROLE_NOTE = { owner: 'সব ক্ষমতা; ADMIN_EMAILS দিয়ে ঠিক হয়', admin: 'প্রায় সব (টাকা পাঠানো ও টিম বদল ছাড়া)', moderator: 'রিপোর্ট, কনটেন্ট সরানো, অ্যাকাউন্ট সীমিত/বন্ধ', support: 'সাপোর্ট টিকিট',
  data_editor: 'ভাড়া, রুট, জায়গা', finance: 'ক্রিয়েটর ও পেআউট', viewer: 'শুধু দেখা' };

export async function render(box) {
  let tab = 'members', data = null;
  const body = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'টিম ও অনুমতি'), h('p', 'muted', 'কে কোন ভূমিকায়, আর প্রতিটি ভূমিকা কী করতে পারে। ভূমিকা বদলালে খতিয়ানে আগে → পরে লেখা থাকে।')),
    button('সদস্য যোগ করুন', { kind: 'primary', ic: 'plus', onClick: () => addMember() })), body);
  async function load() {
    body.replaceChildren(skeleton(5));
    try { data = await api('team'); paint(); } catch (e) { body.replaceChildren(errorBox(e, load)); }
  }
  function paint() {
    const t = tabs([['members', 'সদস্য', data.members.length], ['roles', 'ভূমিকা ও অনুমতি']], tab, v => { tab = v; paint(); });
    body.replaceChildren(t, tab === 'members' ? members() : matrix());
  }
  function members() {
    const roleName = k => (data.roles.find(r => r.key === k) || {}).name || k;
    return dataTable({
      page: 'team', search: 'নাম বা @username',
      columns: [
        { key: 'name', label: 'সদস্য', render: m => h('div', 'person', avatar(m), h('div', 't', h('b', null, m.name), h('span', null, `@${m.username} · ${m.email}`))), sort: m => m.name },
        { key: 'role', label: 'ভূমিকা', render: m => badge(roleName(m.role), ROLE_TONE[m.role] || ''), sort: m => m.role },
        { key: 'twofa', label: 'টু-স্টেপ', render: m => m.twofa ? h('span', 'hp', dot('ok'), 'চালু') : h('span', 'hp', dot(m.owner || m.graceUntil > Date.now() ? 'warn' : 'danger'), m.owner ? 'চালু নেই' : m.graceUntil > Date.now() ? `বাকি ${num(Math.ceil((m.graceUntil - Date.now()) / 864e5))} দিন` : 'সময় শেষ — ঢুকতে পারবেন না'), sort: m => m.twofa ? 1 : 0 },
        { key: 'seen', label: 'শেষ সক্রিয়', render: m => when(m.seen), sort: m => m.seen || 0 },
        { key: 'since', label: 'টিমে যোগ', render: m => m.since ? when(m.since) : '—', sort: m => m.since || 0, hide: true }
      ],
      load: async ({ q }) => { const rows = data.members.filter(m => !q || m.name.toLowerCase().includes(q.toLowerCase()) || m.username.includes(q.replace(/^@/, ''))); return { rows, total: rows.length, next: 0 }; },
      rowKey: m => m.id,
      actions: m => m.owner || m.id === session.me.user.id ? [h('span', 'muted small', m.owner ? 'Owner' : 'আপনি')] : [button('ভূমিকা বদলান', { small: true, onClick: () => changeRole(m) })],
      emptyText: 'টিমে কেউ নেই।'
    });
  }
  function matrix() {
    const roles = data.roles.filter(r => r.key !== 'owner').concat(data.roles.filter(r => r.key === 'owner'));
    const t = h('table', 'tbl matrix');
    t.append(h('thead', null, h('tr', null, h('th', null, 'ক্ষমতা'), ...roles.map(r => h('th', 'c', r.name, h('small', 'muted', ` (${num(r.members)})`))))));
    const tb = h('tbody');
    for (const [p, label] of Object.entries(data.perms)) tb.append(h('tr', null, h('td', null, label, h('small', 'mono muted', ' ' + p)), ...roles.map(r => h('td', 'c', r.perms.includes(p) ? icon('check', 'yes') : h('span', 'muted', '–')))));
    t.append(tb);
    return h('div', 'stack', h('div', 'role-notes', ...roles.map(r => h('div', 'role-note', badge(r.name, ROLE_TONE[r.key] || ''), h('span', 'muted', ROLE_NOTE[r.key] || '')))), h('div', 'card flush', h('div', 'tbl-wrap', t)),
      h('p', 'hint', 'কাস্টম ভূমিকা (নিজের মতো অনুমতি বেছে) ফেজ ২-এ আসছে।'));
  }
  async function setRole(who, role, label) {
    const tier = role === 'admin' ? 3 : 2;
    const ok = await confirmAction({ tier, title: role === 'none' ? 'টিম থেকে সরাবেন?' : `${label} ভূমিকা দেবেন?`, danger: role === 'admin' || role === 'none',
      text: role === 'admin' ? 'Admin প্রায় সবকিছু করতে পারেন: অ্যাকাউন্ট বন্ধ ও মোছা, কনটেন্ট সরানো, গোপন তথ্য দেখা।' : role === 'none' ? 'তিনি আর প্যানেলে ঢুকতে পারবেন না; খোলা প্যানেল সেশন এখনই বন্ধ হবে।' : `তিনি এই ভূমিকার অনুমতিগুলো পাবেন।`,
      word: role === 'admin' ? 'ADMIN' : null, reasons: null, noteRequired: true, confirmText: 'বদলান' });
    if (!ok) return false;
    try { await api('team/set', { user: who, role, reason: ok.note }); toast('ভূমিকা বদলানো হলো — খতিয়ানে লেখা থাকল।'); await load(); return true; }
    catch (e) { toast(errText(e), { bad: true }); return false; }
  }
  function roleOptions() { return [...data.roles.filter(r => r.key !== 'owner').map(r => [r.key, r.name]), ['none', 'টিম থেকে সরান']]; }
  function changeRole(m) {
    const s = select(roleOptions(), m.role);
    const mm = modal({ title: `${m.name} — ভূমিকা`, body: h('div', 'confirm', field('নতুন ভূমিকা', s), h('p', 'hint', 'Admin দিতে আপনার কোড লাগবে।')),
      actions: [button('বাতিল', { kind: 'ghost', onClick: () => mm.close() }), button('পরের ধাপ', { kind: 'primary', onClick: async () => { if (s.value === m.role) { mm.close(); return; } mm.close(); await setRole(m.id, s.value, s.selectedOptions[0].textContent); } })] });
  }
  function addMember() {
    const who = attrs(h('input', 'input'), { placeholder: 'ই-মেইল বা @username', autocomplete: 'off', spellcheck: 'false' }), s = select(roleOptions().filter(r => r[0] !== 'none'), 'support');
    const mm = modal({ title: 'টিমে যোগ করুন', body: h('div', 'confirm', field('কাকে', who, 'তাঁর আগে থেকেই অ্যাপে অ্যাকাউন্ট থাকতে হবে।'), field('ভূমিকা', s), h('p', 'hint', 'যোগ হওয়ার পর টু-স্টেপ চালু করতে ৭ দিন সময় পাবেন।')),
      actions: [button('বাতিল', { kind: 'ghost', onClick: () => mm.close() }), button('পরের ধাপ', { kind: 'primary', onClick: async () => { if (!who.value.trim()) { who.focus(); return; } mm.close(); await setRole(who.value.trim(), s.value, s.selectedOptions[0].textContent); } })] });
  }
  await load();
  return {};
}
