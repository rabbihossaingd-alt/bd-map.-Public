// ঝুঁকি সংকেত: patterns worked out from what the app already stores, each with a score and why. They are signs, not
// proof (one Wi-Fi is shared by many). Open the people, act from their page, or mark a signal as a false alarm.
import { api, errText } from '../api.js';
import { avatar, badge, button, confirmAction, empty, errorBox, h, icon, skeleton, tabs, toast, when } from '../ui.js';
import { num } from '../fmt.js';

const KIND = { device: ['একই ডিভাইসে অনেক অ্যাকাউন্ট', 'users'], reborn: ['বন্ধ অ্যাকাউন্টের জায়গায় নতুন', 'alert'], follows: ['অল্প সময়ে অনেক ফলো', 'activity'],
  reports: ['অল্প সময়ে অনেক রিপোর্ট', 'flag'], messages: ['অল্প সময়ে অনেককে মেসেজ', 'comment'], wallet: ['একই ওয়ালেট, একাধিক ক্রিয়েটর', 'wallet'], fares: ['একই ভাড়া বারবার', 'tag'] };

export async function render(box, { go }) {
  let tab = 'open', d = null;
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'ঝুঁকি সংকেত'), h('p', 'muted', 'অ্যাপের নিজের তথ্য থেকে খুঁজে পাওয়া ধরন — সংকেত, প্রমাণ নয়। মানুষের নামে চাপলে তাঁর পাতা খোলে, সেখান থেকে ব্যবস্থা নিন।'))), holder);
  async function load() {
    holder.replaceChildren(skeleton(4, 'cards'));
    try { d = await api('risk?tab=' + tab); paint(); } catch (e) { holder.replaceChildren(errorBox(e, load)); }
  }
  function paint() {
    const t = tabs([['open', 'দেখা বাকি', d.tally.open], ['cleared', 'মিথ্যা সংকেত চিহ্নিত', d.tally.cleared]], tab, v => { tab = v; load(); });
    holder.replaceChildren(t, d.rows.length ? h('div', 'stack', ...d.rows.map(card)) : empty(tab === 'open' ? 'কোনো সংকেত নেই।' : 'কিছু চিহ্নিত হয়নি।'),
      h('p', 'hint', icon('alert'), ' খোঁজা হয়: একই ডিভাইস ও নেটওয়ার্কে ৩+ অ্যাকাউন্ট (৩০ দিন), বন্ধ অ্যাকাউন্টের ডিভাইসে নতুন অ্যাকাউন্ট, এক ঘণ্টায় ৪০+ ফলো / ৮+ রিপোর্ট / ২৫+ জনকে মেসেজ (৭ দিন), একই ওয়ালেট নম্বর একাধিক ক্রিয়েটরের, ৩০ দিনে একই ভাড়া ৫+ বার।'));
  }
  function card(s) {
    const [label, ic] = KIND[s.kind] || [s.kind, 'alert'];
    const people = h('div', 'risk-people', ...s.users.map(u => { const p = h('div', 'person click', avatar(u, 'sm'), h('div', 't', h('b', null, u.name), h('span', null, u.username ? '@' + u.username : '')), u.banned ? badge('বন্ধ', 'danger') : null); if (u.id) p.addEventListener('click', () => go('#/users/' + u.id)); return p; }));
    return h('div', 'card risk-card',
      h('div', 'row-acts', h('span', 'q-ic', icon(ic)), h('b', null, label), badge(`স্কোর ${num(s.score)}`, s.score >= 60 ? 'danger' : s.score >= 30 ? 'warn' : ''), h('span', 'grow'), s.at ? when(s.at) : null),
      h('p', null, s.why), people,
      h('div', 'row-acts', s.cleared ? h('span', 'muted small', `মিথ্যা সংকেত — ${s.cleared.by || 'টিম'}: ${s.cleared.note} · `, when(s.cleared.at)) : null, h('span', 'grow'),
        s.cleared ? button('আবার খুলুন', { small: true, kind: 'ghost', onClick: () => reopen(s) }) : button('মিথ্যা সংকেত', { small: true, kind: 'ghost', ic: 'check', onClick: () => clear(s) })));
  }
  async function clear(s) {
    const ok = await confirmAction({ tier: 2, danger: false, title: 'মিথ্যা সংকেত হিসেবে চিহ্নিত করবেন?', text: 'একই ধরন একই মানুষদের জন্য আর দেখাবে না। কেন, তা লিখুন — খতিয়ানে থাকবে।', reasons: null, noteRequired: true, confirmText: 'চিহ্নিত করুন' });
    if (!ok) return;
    try { await api('risk/clear', { key: s.key, note: ok.note }); toast('চিহ্নিত হলো।', { undo: async () => { await api('risk/reopen', { key: s.key }); load(); } }); load(); } catch (e) { toast(errText(e), { bad: true }); }
  }
  async function reopen(s) { try { await api('risk/reopen', { key: s.key }); toast('আবার খোলা হলো।'); load(); } catch (e) { toast(errText(e), { bad: true }); } }
  await load();
  return {};
}
