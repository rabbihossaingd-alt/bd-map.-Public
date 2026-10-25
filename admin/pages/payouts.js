// পেআউট: two steps by two people. Step 1 (finance or admin): approve. Step 2 (finance, someone else): send the money
// from the business wallet, then enter its transaction ID — the same TrxID is refused a second time. Over the limit
// both steps ask for a fresh code. A new wallet number, a number shared with other creators, a closed account or a
// high risk score shows in red before anyone decides. Rejecting needs a reason; the money goes back to the balance.
import { api, can, errText, session } from '../api.js';
import { avatar, badge, button, confirmAction, errorBox, field, h, icon, modal, skeleton, tabs, toast, when, attrs } from '../ui.js';
import { dataTable } from '../table.js';
import { num, taka } from '../fmt.js';

const STATE = { pending: ['অনুমোদন বাকি', 'warn'], approved: ['অনুমোদিত · পাঠানো বাকি', 'info'], paid: ['পাঠানো', 'ok'], rejected: ['বাতিল', ''] };
const idem = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export async function render(box, { params }) {
  let tab = ['pending', 'approved', 'paid', 'rejected', 'all'].includes(params[0]) ? params[0] : (can('payouts.approve') ? 'pending' : 'approved'), data = null, table = null;
  const head = h('div'), holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'পেআউট'),
    h('p', 'muted', 'দুই ধাপ, দুজন মানুষ: একজন অনুমোদন দেন, অন্যজন বিজনেস ওয়ালেট থেকে টাকা পাঠিয়ে TrxID দেন। অ্যাপ নিজে কখনো টাকা পাঠায় না।'))), head, holder);
  async function load() {
    holder.replaceChildren(skeleton(6));
    try { data = await api('payouts2?tab=' + tab); paint(); } catch (e) { holder.replaceChildren(errorBox(e, load)); }
  }
  function paint() {
    head.replaceChildren(h('div', 'kpi-grid',
      h('div', 'kpi ' + (data.tally.pending ? 'warn' : ''), h('span', 'k-label', 'ধাপ ১ · অনুমোদন বাকি'), h('b', 'k-val', taka(data.taka.pending)), h('small', 'muted', `${num(data.tally.pending)}টি অনুরোধ`)),
      h('div', 'kpi ' + (data.tally.approved ? 'warn' : ''), h('span', 'k-label', 'ধাপ ২ · পাঠানো বাকি'), h('b', 'k-val', taka(data.taka.approved)), h('small', 'muted', `${num(data.tally.approved)}টি অনুমোদিত`)),
      h('div', 'kpi', h('span', 'k-label', 'পাঠানো হয়েছে'), h('b', 'k-val', num(data.tally.paid)), h('small', 'muted', 'লেজারে লেখা')),
      h('div', 'kpi', h('span', 'k-label', 'নতুন কোড লাগে'), h('b', 'k-val', taka(data.stepup) + '+'), h('small', 'muted', 'দুই ধাপেই'))));
    const t = tabs([['pending', 'অনুমোদন বাকি', data.tally.pending], ['approved', 'পাঠানো বাকি', data.tally.approved], ['paid', 'পাঠানো'], ['rejected', 'বাতিল'], ['all', 'সব']], tab, v => { tab = v; history.replaceState(null, '', '#/payouts/' + v); load(); });
    table = dataTable({
      page: 'payouts', search: 'নাম বা TrxID',
      columns: [
        { key: 'who', label: 'ক্রিয়েটর', render: p => p.user ? h('div', 'person', avatar(p.user, 'sm'), h('div', 't', h('b', null, p.user.name), h('span', null, p.money ? `ব্যালান্স ${taka(p.money.balance)}` : ''))) : h('span', 'muted', 'মুছে ফেলা অ্যাকাউন্ট'), sort: p => p.user ? p.user.name : '' },
        { key: 'amount', label: 'টাকা', render: p => h('b', null, taka(p.amount)), sort: p => p.amount, cls: 'num' },
        { key: 'wallet', label: 'ওয়ালেট', render: p => walletCell(p), sortable: false },
        { key: 'check', label: 'যাচাই', render: p => p.warnings.length ? h('div', 'stack tight', ...p.warnings.map(w => badge(w.text, w.tone))) : badge('সব ঠিক', 'ok'), sortable: false },
        { key: 'steps', label: 'ধাপ', render: p => h('div', 'cell-t', h('span', null, badge(...STATE[p.status])),
          p.approval ? h('span', 'muted', `অনুমোদন: ${p.approval.by.name} · `, when(p.approval.at)) : null, p.sentBy ? h('span', 'muted', `পাঠিয়েছেন: ${p.sentBy.name}${p.ref ? ' · ' + p.ref : ''}`) : null,
          p.status === 'rejected' && p.note ? h('span', 'muted', p.note) : null), sortable: false },
        { key: 'created', label: 'চাওয়া হয়েছে', render: p => when(p.created), sort: p => p.created }
      ],
      load: async ({ q }) => { const rows = q ? data.rows.filter(p => ((p.user ? p.user.name : '') + ' ' + p.ref).toLowerCase().includes(q.toLowerCase())) : data.rows; return { rows, total: rows.length, next: 0 }; },
      actions: p => [
        p.status === 'pending' && can('payouts.approve') ? button('অনুমোদন দিন', { small: true, kind: 'primary', onClick: () => approve(p) }) : null,
        p.status === 'approved' && can('payouts.send') ? button('পাঠানো হয়েছে…', { small: true, kind: 'primary', onClick: () => send(p) }) : null,
        (p.status === 'pending' || p.status === 'approved') && (can('payouts.approve') || can('payouts.send')) ? button('বাতিল', { small: true, kind: 'ghost', onClick: () => reject(p) }) : null
      ].filter(Boolean),
      emptyText: tab === 'pending' ? 'অনুমোদনের অপেক্ষায় কিছু নেই।' : tab === 'approved' ? 'পাঠানোর অপেক্ষায় কিছু নেই।' : 'এখানে কিছু নেই।'
    });
    holder.replaceChildren(t, table);
  }
  // the number stays hidden until asked for; asking is written in the audit log
  function walletCell(p) {
    const n = h('span', 'mono', p.account);
    return h('div', 'cell-t', h('span', null, h('b', null, p.methodBn), ' ', n),
      p.canUnmask && p.user ? button('দেখান', { small: true, kind: 'ghost', ic: 'eye', onClick: async e => { e.stopPropagation(); try { n.textContent = (await api('pii', { user: p.user.id, kind: 'wallet', payout: p.id, reason: 'payout' })).value; toast('নম্বর দেখানো হলো — খতিয়ানে লেখা থাকল।'); } catch (er) { toast(errText(er), { bad: true }); } } }) : null);
  }
  const warnText = p => p.warnings.filter(w => w.tone === 'danger').map(w => w.text).join(' · ');
  async function approve(p) {
    const red = warnText(p);
    const ok = await confirmAction({ tier: 2, danger: false, title: `${taka(p.amount)} — ${p.user.name}: অনুমোদন দেবেন?`,
      text: (red ? `সতর্কতা: ${red}। ` : '') + 'অনুমোদনের পর অন্য একজন টাকা পাঠিয়ে TrxID দেবেন — আপনি নিজে দ্বিতীয় ধাপ করতে পারবেন না।', reasons: null, confirmText: 'অনুমোদন দিন' });
    if (!ok) return;
    try { await api('payouts2/act', { id: p.id, do: 'approve', note: ok.note, idem: idem() }); toast('অনুমোদন হলো — এখন "পাঠানো বাকি" তালিকায়।'); load(); }
    catch (e) { toast(errText(e), { bad: true }); }
  }
  function send(p) {
    const mine = p.approval && p.approval.by.id === session.me.user.id, owner = session.me.owner;
    const num_ = h('b', 'mono', p.account);
    const ref = attrs(h('input', 'input mono upper'), { maxlength: '24', autocomplete: 'off', spellcheck: 'false', placeholder: 'যেমন 9A7B6C5D4E' });
    const err = h('p', 'form-err'), key = idem();
    const steps = h('ol', 'steps',
      h('li', null, `বিজনেস ${p.methodBn} থেকে `, h('b', null, taka(p.amount)), ' পাঠান এই নম্বরে: ', num_, ' ',
        p.canUnmask ? button('নম্বর দেখান', { small: true, kind: 'ghost', ic: 'eye', onClick: async () => { try { num_.textContent = (await api('pii', { user: p.user.id, kind: 'wallet', payout: p.id, reason: 'payout-send' })).value; } catch (e) { err.textContent = errText(e); } } }) : null),
      h('li', null, 'ওয়ালেটের রসিদ থেকে TrxID লিখুন। একই TrxID দুবার দেওয়া যায় না।'));
    const body = h('div', 'confirm',
      warnText(p) ? h('div', 'banner danger', icon('alert'), h('span', null, warnText(p))) : null,
      mine && !owner ? h('div', 'banner warn', icon('lock'), h('span', null, 'আপনি এটি অনুমোদন দিয়েছেন — পাঠানোর ধাপ অন্য কেউ করবেন।')) : null,
      mine && owner ? h('div', 'banner warn', icon('alert'), h('span', null, 'আপনি নিজেই অনুমোদন দিয়েছেন। Owner হিসেবে পাঠাতে পারেন, তবে খতিয়ানে আলাদা করে লেখা থাকবে।')) : null,
      steps, field('TrxID', ref), err);
    const ok = button('পাঠানো হয়েছে', { kind: 'primary', onClick: async () => {
      const v = ref.value.trim().toUpperCase().replace(/\s+/g, '');
      if (!new RegExp(data.trx).test(v)) { err.textContent = errText({ message: 'ref' }); ref.focus(); return; }
      try { await api('payouts2/act', { id: p.id, do: 'send', ref: v, idem: key }); m.close(); toast(`পাঠানো হিসেবে লেখা হলো (${v}) — ক্রিয়েটরকে মেইল ও লেজারে লেখা।`); load(); }
      catch (e) { err.textContent = errText(e) + (e.data && e.data.other ? ` (পেআউট #${num(e.data.other)})` : ''); }
    } });
    if (mine && !owner) ok.disabled = true;
    const m = modal({ title: `${taka(p.amount)} — ${p.user.name}`, body, actions: [button('বাতিল', { kind: 'ghost', onClick: () => m.close() }), ok] });
    setTimeout(() => ref.focus(), 50);
  }
  async function reject(p) {
    const ok = await confirmAction({ tier: 2, title: `${taka(p.amount)}-এর অনুরোধ বাতিল করবেন?`, text: 'টাকা তাঁর ব্যালান্সে ফিরে যাবে। নোটটি ক্রিয়েটর নিজের লেনদেনে দেখবেন।',
      reasons: [['wallet', 'ওয়ালেট নম্বর ভুল/সন্দেহজনক'], ['fraud', 'সন্দেহজনক আয়'], ['rules', 'নিয়ম ভাঙা'], ['request', 'তাঁর অনুরোধে'], ['other', 'অন্য']], noteRequired: true, preview: 'আপনার টাকা তোলার অনুরোধটি বাতিল হয়েছে — নোট: …', confirmText: 'বাতিল করুন' });
    if (!ok) return;
    try { await api('payouts2/act', { id: p.id, do: 'reject', reason: ok.reason, note: ok.note, idem: idem() }); toast('বাতিল হলো — টাকা ব্যালান্সে ফিরেছে।'); load(); }
    catch (e) { toast(errText(e), { bad: true }); }
  }
  await load();
  return { key: e => table && table.keyHandler && table.keyHandler(e), onParams: ps => { if (ps[0] && ps[0] !== tab) { tab = ps[0]; load(); } } };
}
