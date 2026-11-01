// ভেরিফায়েড সাবস্ক্রিপশন: payments for the blue badge. A bKash, Nagad or bank payment comes in with the sender and
// the transaction ID the person typed; check it against the business account's statement, then approve (the badge
// turns on for the month or year) or reject with a note the person sees. Card payments through SSLCommerz are
// checked with SSLCommerz and turn on by themselves; they show here as paid. Below: the business numbers, the bank
// account, the taka rate and the rules.
import { api, can, errText } from '../api.js';
import { avatar, badge, button, confirmAction, errorBox, field, h, modal, skeleton, tabs, toast, when, attrs } from '../ui.js';
import { dataTable } from '../table.js';
import { num, taka } from '../fmt.js';

const STATE = { pending: ['যাচাই বাকি', 'warn'], paid: ['চালু হয়েছে', 'ok'], rejected: ['বাতিল', ''], cancelled: ['ফেরত নেওয়া', ''] };
const PLAN = { month: 'মাসিক', year: 'বাৎসরিক' };

export async function render(box, { params }) {
  let tab = ['pending', 'paid', 'rejected', 'all'].includes(params[0]) ? params[0] : 'pending', data = null, table = null;
  const head = h('div'), holder = h('div'), conf = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'ভেরিফায়েড সাবস্ক্রিপশন'),
    h('p', 'muted', 'বিকাশ, নগদ বা ব্যাংকের স্টেটমেন্টে TrxID আর টাকা মিলিয়ে অনুমোদন দিন। কার্ডের পেমেন্ট SSLCommerz যাচাই করে নিজেই চালু হয়।'))), head, holder, conf);
  async function load() {
    holder.replaceChildren(skeleton(6));
    try { data = await api('verify2?tab=' + tab); paint(); } catch (e) { holder.replaceChildren(errorBox(e, load)); }
  }
  function paint() {
    const s = data.settings;
    head.replaceChildren(h('div', 'kpi-grid',
      h('div', 'kpi ' + (data.tally.pending ? 'warn' : ''), h('span', 'k-label', 'যাচাই বাকি'), h('b', 'k-val', num(data.tally.pending)), h('small', 'muted', 'বিকাশ · নগদ · ব্যাংক')),
      h('div', 'kpi', h('span', 'k-label', 'চালু সাবস্ক্রিপশন'), h('b', 'k-val', num(data.active)), h('small', 'muted', 'এখন ব্যাজ আছে')),
      h('div', 'kpi', h('span', 'k-label', 'আয় (টাকায়)'), h('b', 'k-val', taka(data.income.bdt)), h('small', 'muted', 'অনুমোদিত')),
      h('div', 'kpi', h('span', 'k-label', 'আয় (কার্ডে)'), h('b', 'k-val', '$' + num(data.income.usd)), h('small', 'muted', s.card ? 'SSLCommerz চালু' : 'SSLCommerz বন্ধ'))));
    const t = tabs([['pending', 'যাচাই বাকি', data.tally.pending], ['paid', 'চালু হয়েছে'], ['rejected', 'বাতিল'], ['all', 'সব']], tab, v => { tab = v; history.replaceState(null, '', '#/verified/' + v); load(); });
    table = dataTable({
      page: 'verified', search: 'নাম বা TrxID',
      columns: [
        { key: 'who', label: 'মানুষ', render: o => o.user ? h('div', 'person', avatar(o.user, 'sm'), h('div', 't', h('b', null, o.user.name), h('span', null, '@' + o.user.username))) : h('span', 'muted', 'মুছে ফেলা অ্যাকাউন্ট'), sort: o => o.user ? o.user.name : '' },
        { key: 'plan', label: 'প্ল্যান', render: o => h('div', 'cell-t', h('b', null, PLAN[o.plan]), h('span', 'muted', `$${num(o.usd)} · ${taka(o.bdt)}`)), sort: o => o.usd },
        { key: 'pay', label: 'পেমেন্ট', render: o => h('div', 'cell-t', h('b', null, o.methodBn), h('span', 'mono', o.sender || '—'), h('span', 'mono', o.ref || '—')), sortable: false },
        { key: 'check', label: 'যাচাই', render: o => o.warnings.length ? h('div', 'stack tight', ...o.warnings.map(w => badge(w.text, w.tone))) : badge('সব ঠিক', 'ok'), sortable: false },
        { key: 'state', label: 'অবস্থা', render: o => h('div', 'cell-t', badge(...(STATE[o.status] || [o.status, ''])), o.byName ? h('span', 'muted', o.byName) : null, o.status === 'rejected' && o.note ? h('span', 'muted', o.note) : null), sortable: false },
        { key: 'created', label: 'এসেছে', render: o => when(o.created), sort: o => o.created }
      ],
      load: async ({ q }) => { const rows = q ? data.rows.filter(o => ((o.user ? o.user.name : '') + ' ' + o.ref + ' ' + o.sender).toLowerCase().includes(q.toLowerCase())) : data.rows; return { rows, total: rows.length, next: 0 }; },
      actions: o => o.status === 'pending' && o.method !== 'card' ? [
        button('মিলেছে, চালু করুন', { small: true, kind: 'primary', onClick: () => approve(o) }),
        button('বাতিল', { small: true, kind: 'ghost', onClick: () => reject(o) })] : [],
      emptyText: tab === 'pending' ? 'যাচাইয়ের অপেক্ষায় কিছু নেই।' : 'এখানে কিছু নেই।'
    });
    holder.replaceChildren(t, table);
    paintSettings(s);
  }
  async function approve(o) {
    const ok = await confirmAction({ tier: 2, danger: false, title: `${o.user ? o.user.name : ''} — ${PLAN[o.plan]} চালু করবেন?`,
      text: `${o.methodBn}-এর স্টেটমেন্টে ${o.ref} নম্বরে ${taka(o.bdt)} এসেছে কিনা দেখে নিন। চালু করলে ব্যাজ সঙ্গে সঙ্গে দেখাবে।`, reasons: null, confirmText: 'চালু করুন' });
    if (!ok) return;
    try { await api('verify2/act', { id: o.id, do: 'approve', note: ok.note }); toast('ব্যাজ চালু হলো।'); load(); }
    catch (e) { toast(errText(e), { bad: true }); }
  }
  async function reject(o) {
    const ok = await confirmAction({ tier: 2, title: 'পেমেন্টটি বাতিল করবেন?', text: 'নোটটি মানুষটি নিজের ভেরিফায়েড পাতায় দেখবেন।',
      reasons: [['nomatch', 'TrxID মেলেনি'], ['amount', 'টাকা কম এসেছে'], ['dup', 'আগেই ব্যবহার হয়েছে'], ['other', 'অন্য']], noteRequired: true, confirmText: 'বাতিল করুন' });
    if (!ok) return;
    try { await api('verify2/act', { id: o.id, do: 'reject', reason: ok.reason, note: ok.note }); toast('বাতিল হলো।'); load(); }
    catch (e) { toast(errText(e), { bad: true }); }
  }
  function paintSettings(s) {
    if (!can('verify.manage')) return;
    const inp = (v, extra) => attrs(h('input', 'input'), { value: v ?? '', ...extra });
    const bkash = inp(s.bkash, { placeholder: '01XXXXXXXXX', inputmode: 'tel' }), nagad = inp(s.nagad, { placeholder: '01XXXXXXXXX', inputmode: 'tel' });
    const bank = attrs(h('textarea', 'input'), { rows: '4', placeholder: 'ব্যাংক, অ্যাকাউন্টের নাম, নম্বর, শাখা, রাউটিং নম্বর' }); bank.value = s.bank || '';
    const rate = inp(s.rate, { type: 'number', step: '0.01', min: '1' }), days = inp(s.minDays, { type: 'number', min: '0' });
    const open = attrs(h('input'), { type: 'checkbox' }); open.checked = s.open;
    const save = button('সংরক্ষণ', { kind: 'primary', onClick: async () => {
      try { await api('verify2/settings', { bkash: bkash.value, nagad: nagad.value, bank: bank.value, rate: Number(rate.value), minDays: Number(days.value), open: open.checked }); toast('সংরক্ষণ হলো।'); load(); }
      catch (e) { toast(errText(e), { bad: true }); }
    } });
    conf.replaceChildren(h('div', 'card pad stack', h('h2', null, 'পেমেন্ট ও নিয়ম'),
      h('p', 'muted', `দাম: মাসিক $${num(s.plans.month.usd)} (${taka(s.plans.month.bdt)}), বাৎসরিক $${num(s.plans.year.usd)} (${taka(s.plans.year.bdt)})। যে ঘর খালি, সেই পদ্ধতি অ্যাপে দেখাবে না।`),
      field('বিকাশ মার্চেন্ট/পার্সোনাল নম্বর', bkash), field('নগদ নম্বর', nagad), field('ব্যাংক অ্যাকাউন্ট', bank),
      field('১ ডলার = কত টাকা', rate, 'বিকাশ, নগদ ও ব্যাংকে টাকার অঙ্ক এটা দিয়ে হিসাব হয়'), field('অ্যাকাউন্ট কত দিনের পুরোনো হলে কেনা যাবে', days),
      h('label', 'check', open, h('span', null, 'নতুন সাবস্ক্রিপশন চালু')),
      h('p', 'muted', s.card ? 'কার্ড: SSLCommerz চালু।' : 'কার্ড: SSLCommerz-এর স্টোর আইডি ও পাসওয়ার্ড সার্ভারে (Render-এর Environment-এ SSLCOMMERZ_STORE_ID, SSLCOMMERZ_STORE_PASS) দিলে চালু হবে।'),
      save));
  }
  await load();
  return { key: e => table && table.keyHandler && table.keyHandler(e), onParams: ps => { if (ps[0] && ps[0] !== tab) { tab = ps[0]; load(); } } };
}
