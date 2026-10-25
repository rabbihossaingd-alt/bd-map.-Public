// স্ট্রাইক ও আপিল: appeals sent from the app (someone other than the one who decided reviews them — the owner may,
// and it is written down), the strikes in force and before, taking one back, and the policy: what the 1st, 2nd and
// 3rd strike do and when a strike ends.
import { api, errText, session } from '../api.js';
import { avatar, badge, button, confirmAction, empty, errorBox, field, h, icon, modal, select, skeleton, tabs, toast, when, attrs, REASONS } from '../ui.js';
import { dataTable } from '../table.js';
import { full, num } from '../fmt.js';

const REASON = r => (REASONS.find(x => x[0] === r) || [0, r])[1];
const OUT = o => o === 'ban' ? 'অ্যাকাউন্ট বন্ধ' : String(o).startsWith('restrict:') ? `${num(Number(o.split(':')[1]))} দিন পোস্ট বন্ধ` : 'সতর্কবার্তা';
const ORD = i => ['১ম', '২য়', '৩য়', '৪র্থ', '৫ম', '৬ষ্ঠ'][i] || num(i + 1);

export async function render(box, { go }) {
  let tab = 'appeals', d = null, table = null;
  const top = h('div'), holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'স্ট্রাইক ও আপিল'), h('p', 'muted', 'স্ট্রাইক দেওয়া যায় রিপোর্ট, মডারেশন কিউ, কনটেন্ট সরানো বা ব্যবহারকারী ৩৬০ থেকে। মানুষ অ্যাপের নোটিফিকেশন থেকে কারণ দেখেন আর ৩০ দিনের মধ্যে আপিল করতে পারেন।'))), top, holder);
  async function load() {
    holder.replaceChildren(skeleton(5));
    try { d = await api('strikes?tab=' + tab); paint(); } catch (e) { holder.replaceChildren(errorBox(e, load)); }
  }
  function paint() {
    const p = d.policy, me = session.me;
    top.replaceChildren(h('div', 'card policy', h('div', 't', h('b', null, 'স্ট্রাইক নীতি'), h('span', 'muted', p.steps.map((s, i) => `${ORD(i)}: ${OUT(s)}`).join(' · ') + ` · ${num(p.expireDays)} দিন পরে মেয়াদ শেষ`)),
      ['owner', 'admin'].includes(me.role) ? button('নীতি বদলান', { small: true, ic: 'cog', onClick: editPolicy }) : null));
    const t = tabs([['appeals', 'আপিল দেখা বাকি', d.tally.appeals], ['active', 'চালু স্ট্রাইক', d.tally.active], ['decided', 'সিদ্ধান্ত হয়েছে', d.tally.decided], ['all', 'সব স্ট্রাইক']], tab, v => { tab = v; load(); });
    if (tab === 'appeals' || tab === 'decided') {
      holder.replaceChildren(t, d.rows.length ? h('div', 'stack', ...d.rows.map(appealCard)) : empty(tab === 'appeals' ? 'কোনো আপিল অপেক্ষায় নেই।' : 'এখনো কোনো সিদ্ধান্ত নেই।'));
      return;
    }
    table = dataTable({
      page: 'strikes', search: 'নাম',
      columns: [
        { key: 'who', label: 'মানুষ', render: s => s.user ? h('div', 'person', avatar(s.user, 'sm'), h('div', 't', h('b', null, s.user.name), h('span', null, '@' + s.user.username))) : '—', sort: s => s.user ? s.user.name : '' },
        { key: 'reason', label: 'কারণ', render: s => h('div', 'cell-t', h('b', null, REASON(s.reason)), s.note ? h('span', 'muted wrap', s.note.slice(0, 90)) : null), sort: s => s.reason },
        { key: 'outcome', label: 'ফল', render: s => badge(OUT(s.outcome), s.outcome === 'ban' ? 'danger' : s.outcome === 'warn' ? '' : 'warn'), sortable: false },
        { key: 'by', label: 'কে দিয়েছেন', render: s => s.by.name || 'টিম', sort: s => s.by.name },
        { key: 'state', label: 'অবস্থা', render: s => s.revoked ? attrs(badge('বাতিল', ''), { title: `${s.revoked.by} · ${s.revoked.note}` }) : s.active ? attrs(badge('চালু', 'danger'), { title: 'মেয়াদ ' + full(s.expires) }) : badge('মেয়াদ শেষ', ''), sortable: false },
        { key: 'appeal', label: 'আপিল', render: s => s.appeal ? badge({ open: 'অপেক্ষায়', upheld: 'বহাল', overturned: 'মেনে নেওয়া' }[s.appeal.status], s.appeal.status === 'open' ? 'warn' : '') : h('span', 'muted', '—'), sortable: false },
        { key: 'made', label: 'কখন', render: s => when(s.made), sort: s => s.made }
      ],
      load: async ({ q }) => { const rows = q ? d.rows.filter(s => s.user && (s.user.name + ' ' + s.user.username).toLowerCase().includes(q.toLowerCase())) : d.rows; return { rows, total: rows.length, next: 0 }; },
      onOpen: s => s.user && go('#/users/' + s.user.id),
      actions: s => s.active ? [button('বাতিল করুন', { small: true, kind: 'ghost', onClick: () => revoke(s) })] : [],
      emptyText: 'কোনো স্ট্রাইক নেই।'
    });
    holder.replaceChildren(t, table);
  }
  function appealCard(a) {
    const me = session.me, self = a.decider.id === me.user.id, tg = a.target || {};
    const what = a.type === 'strike' ? `স্ট্রাইক · ${REASON(tg.reason)} · ${OUT(tg.outcome)}${tg.revoked ? ' (এখন বাতিল)' : ''}` : `${tg.what === 'comment' ? 'মন্তব্য' : 'পোস্ট'} সরানো · ${REASON(tg.reason)}`;
    const acts = a.status === 'open' ? h('div', 'row-acts',
      self && !me.owner ? h('span', 'muted small', icon('lock'), ' এই সিদ্ধান্ত আপনার — অন্য কেউ আপিল দেখবেন।') : null,
      button(a.type === 'strike' ? 'আপিল মেনে নিন (স্ট্রাইক বাতিল)' : 'আপিল মেনে নিন', { kind: 'primary', small: true, onClick: () => decide(a, 'overturn') }),
      button('সিদ্ধান্ত বহাল', { small: true, onClick: () => decide(a, 'uphold') }))
      : h('div', 'row-acts', badge(a.status === 'overturned' ? 'মেনে নেওয়া হয়েছে' : 'বহাল', a.status === 'overturned' ? 'ok' : ''), h('span', 'muted small', `${a.decidedBy} · `, when(a.decidedAt), a.note ? ' · ' + a.note : ''));
    if (a.status === 'open' && self && !me.owner) for (const b of acts.querySelectorAll('button')) b.disabled = true;
    const card = h('div', 'card appeal',
      h('div', 'row-acts', a.user ? h('div', 'person click', avatar(a.user, 'sm'), h('div', 't', h('b', null, a.user.name), h('span', null, `@${a.user.username} · চালু স্ট্রাইক ${num(a.strikes)}`))) : null, h('span', 'grow'), when(a.made)),
      h('div', 'kv', h('span', null, 'যা নিয়ে'), h('b', null, what)), h('div', 'kv', h('span', null, 'সিদ্ধান্ত নিয়েছিলেন'), h('b', null, a.decider.name || 'টিম'), when(tg.made)),
      tg.snippet ? h('blockquote', 'quote', tg.snippet) : null, tg.note ? h('p', 'muted small', 'টিমের নোট: ' + tg.note) : null,
      h('div', 'appeal-body', h('small', 'muted', 'তাঁর আপিল'), h('p', null, a.body)), acts);
    const who = card.querySelector('.person'); if (who && a.user) who.addEventListener('click', () => go('#/users/' + a.user.id));
    return card;
  }
  async function decide(a, what) {
    const ok = await confirmAction({ tier: 2, danger: false, title: what === 'overturn' ? 'আপিল মেনে নেবেন?' : 'সিদ্ধান্ত বহাল রাখবেন?',
      text: what === 'overturn' ? (a.type === 'strike' || (a.target && a.target.outcome) ? 'স্ট্রাইক বাতিল হবে, আর তার কারণে যা হয়েছিল (সীমা বা বন্ধ) তুলে নেওয়া হবে।' : 'সরানো কনটেন্ট ফেরানো যায় না (মিডিয়া মুছে গেছে); এর সাথে স্ট্রাইক থাকলে তা বাতিল হবে।') : 'তিনি নোটিফিকেশনে সিদ্ধান্ত আর আপনার নোট দেখবেন।',
      reasons: null, noteRequired: true, preview: 'আপনার আপিলের সিদ্ধান্ত হয়েছে — নোট: …', confirmText: what === 'overturn' ? 'মেনে নিন' : 'বহাল রাখুন' });
    if (!ok) return;
    try { await api('appeals/decide', { id: a.id, do: what, note: ok.note }); toast(what === 'overturn' ? 'আপিল মেনে নেওয়া হলো — তাঁকে জানানো হয়েছে।' : 'সিদ্ধান্ত বহাল — তাঁকে জানানো হয়েছে।'); load(); }
    catch (e) { toast(errText(e), { bad: true }); }
  }
  async function revoke(s) {
    const ok = await confirmAction({ tier: 2, danger: false, title: 'স্ট্রাইক বাতিল করবেন?', text: `এর কারণে যা হয়েছিল (${OUT(s.outcome)}) তা-ও তুলে নেওয়া হবে।`, reasons: [['mistake', 'ভুল করে দেওয়া'], ['appeal', 'আপিল ছাড়াই মেনে নেওয়া'], ['other', 'অন্য']], confirmText: 'বাতিল করুন' });
    if (!ok) return;
    try { await api('strikes/revoke', { id: s.id, ...ok }); toast('স্ট্রাইক বাতিল হলো।'); load(); } catch (e) { toast(errText(e), { bad: true }); }
  }
  function editPolicy() {
    const p = d.policy, list = h('div', 'stack');
    const OPTIONS = [['warn', 'সতর্কবার্তা'], ['restrict:3', '৩ দিন পোস্ট বন্ধ'], ['restrict:7', '৭ দিন পোস্ট বন্ধ'], ['restrict:14', '১৪ দিন পোস্ট বন্ধ'], ['restrict:30', '৩০ দিন পোস্ট বন্ধ'], ['ban', 'অ্যাকাউন্ট বন্ধ']];
    const rows = [];
    const addRow = v => { const s = select(OPTIONS, OPTIONS.some(o => o[0] === v) ? v : 'warn'); const r = h('div', 'two', h('span', 'muted', `${ORD(rows.length)} স্ট্রাইক`), s); rows.push(s); list.append(r); };
    for (const s of p.steps) addRow(s);
    const exp = attrs(h('input', 'input'), { type: 'number', min: '7', max: '730', value: String(p.expireDays) });
    const err = h('p', 'form-err');
    const body = h('div', 'confirm', list, button('আরেকটি ধাপ', { small: true, kind: 'ghost', ic: 'plus', onClick: () => { if (rows.length < 6) addRow('ban'); } }), field('কত দিন পরে স্ট্রাইকের মেয়াদ শেষ', exp), h('p', 'hint', 'শেষ ধাপের পরে আরও স্ট্রাইক হলে শেষ ধাপটাই আবার হয়। নতুন নীতি শুধু পরের স্ট্রাইক থেকে।'), err);
    const ok = button('সেভ করুন', { kind: 'primary', onClick: async () => {
      try { await api('strikes/policy', { steps: rows.map(s => s.value), expireDays: Number(exp.value) }); m.close(); toast('নীতি সেভ হলো — খতিয়ানে আগে → পরে লেখা।'); load(); } catch (e) { err.textContent = errText(e); }
    } });
    const m = modal({ title: 'স্ট্রাইক নীতি', body, actions: [button('বাতিল', { kind: 'ghost', onClick: () => m.close() }), ok] });
  }
  await load();
  return { key: e => table && table.keyHandler && table.keyHandler(e) };
}
