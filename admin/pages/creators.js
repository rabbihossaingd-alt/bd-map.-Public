// ক্রিয়েটর: applications with what matters for deciding (followers, posts, how many react, risk, strikes), the
// approved creators with their balance, adding to or taking from earnings (a reason always; over the limit, a fresh
// code), ending someone's place in the program, and the rules — including closing the program for a while.
import { api, can, errText } from '../api.js';
import { avatar, badge, button, confirmAction, errorBox, field, h, icon, modal, select, skeleton, tabs, toast, when, attrs } from '../ui.js';
import { dataTable } from '../table.js';
import { num, taka } from '../fmt.js';

const STATE = { applied: ['আবেদন করেছেন', 'warn'], approved: ['ক্রিয়েটর', 'ok'], rejected: ['বাতিল', ''] };
const idem = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export async function render(box, { go }) {
  let tab = 'applied', data = null;
  const head = h('div'), holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'ক্রিয়েটর'), h('p', 'muted', 'অ্যাপ কারও কাছ থেকে টাকা নেয় না। আয় যোগ করে টিম, আর টাকা যায় বিজনেস ওয়ালেট থেকে — পেআউট পাতায়, দুজনের দুই ধাপে।'))), head, holder);
  let table;
  function paintHead() {
    const r = data.rules, t = data.totals;
    head.replaceChildren(h('div', 'kpi-grid',
      h('div', 'kpi', h('span', 'k-label', 'মোট আয় যোগ হয়েছে'), h('b', 'k-val', taka(t.earned))),
      h('div', 'kpi', h('span', 'k-label', 'পাঠানো হয়েছে'), h('b', 'k-val', taka(t.paid))),
      h('div', 'kpi ' + (t.waiting ? 'warn' : ''), h('span', 'k-label', 'পেআউটের অপেক্ষায়'), h('b', 'k-val', taka(t.waiting))),
      h('div', 'kpi ' + (r.program ? '' : 'danger'), h('span', 'k-label', 'প্রোগ্রাম'), h('b', 'k-val', r.program ? 'চালু' : 'বন্ধ'),
        h('small', 'muted', `ন্যূনতম ${num(r.followers)} ফলোয়ার · ${num(r.posts)} পোস্ট · তোলা ${taka(r.payoutMin)}+`))),
      h('div', 'row-acts', button('নিয়ম বদলান', { ic: 'cog', onClick: rules }), h('span', 'grow'), h('span', 'muted small', `৳${num(r.stepup)}-এর বেশি সমন্বয় বা পেআউটে নতুন কোড লাগে`)));
  }
  function draw() {
    const t = tabs([['applied', 'আবেদন', data.tally.applied], ['approved', 'ক্রিয়েটর', data.tally.approved], ['rejected', 'বাতিল', data.tally.rejected], ['all', 'সব']], tab, v => { tab = v; load(); });
    table = dataTable({
      page: 'creators', search: 'নাম বা @username',
      columns: [
        { key: 'who', label: 'মানুষ', render: u => h('div', 'person', avatar(u, 'sm'), h('div', 't', h('b', null, u.name, u.verified ? icon('checkc', 'vbadge') : null), h('span', null, '@' + u.username))), sort: u => u.name },
        { key: 'followers', label: 'ফলোয়ার', render: u => num(u.followers), sort: u => u.followers, cls: 'num' },
        { key: 'posts', label: 'পোস্ট', render: u => num(u.posts), sort: u => u.posts, cls: 'num' },
        { key: 'eng', label: 'এনগেজমেন্ট', render: u => attrs(h('span', null, num(u.engagement, 1) + '%'), { title: 'শেষ ৩০টি পোস্টে গড়ে লাইক + মন্তব্য, ফলোয়ারের তুলনায়' }), sort: u => u.engagement, cls: 'num' },
        { key: 'risk', label: 'ঝুঁকি', render: u => u.risk ? attrs(badge(num(u.risk), u.risk >= 60 ? 'danger' : u.risk >= 30 ? 'warn' : ''), { title: u.riskWhy.join(' · ') }) : h('span', 'muted', '০'), sort: u => u.risk },
        { key: 'record', label: 'রেকর্ড', render: u => h('span', null, u.strikes ? badge(`${num(u.strikes)} স্ট্রাইক`, 'danger') : null, u.openReports ? badge(`${num(u.openReports)} খোলা রিপোর্ট`, 'warn') : null, !u.strikes && !u.openReports ? h('span', 'muted', 'পরিষ্কার') : null), sortable: false },
        { key: 'balance', label: 'ব্যালান্স', render: u => u.creator === 'approved' ? h('div', 'cell-t', h('b', null, taka(u.money.balance)), u.money.pending ? h('span', 'muted', `${taka(u.money.pending)} অপেক্ষায়`) : null) : h('span', 'muted', '—'), sort: u => u.money.balance, cls: 'num' },
        { key: 'state', label: 'অবস্থা', render: u => h('span', null, badge(...(STATE[u.creator] || [u.creator, ''])), u.creator === 'applied' && !u.eligible ? badge('শর্ত এখন পূরণ হয় না', 'danger') : null, u.banned ? badge('অ্যাকাউন্ট বন্ধ', 'danger') : null), sortable: false }
      ],
      load: async ({ q }) => { const rows = q ? data.rows.filter(u => (u.name + ' ' + u.username).toLowerCase().includes(q.toLowerCase())) : data.rows; return { rows, total: rows.length, next: 0 }; },
      onOpen: u => go('#/users/' + u.id),
      actions: u => [
        u.creator !== 'approved' ? button('অনুমোদন দিন', { small: true, kind: 'primary', onClick: () => decide(u, 'approve') }) : null,
        u.creator === 'applied' ? button('বাতিল', { small: true, kind: 'ghost', onClick: () => decide(u, 'reject') }) : null,
        u.creator === 'approved' ? button('আয় সমন্বয়', { small: true, onClick: () => adjust(u) }) : null,
        u.creator === 'approved' ? button('প্রোগ্রাম থেকে বাদ', { small: true, kind: 'ghost', onClick: () => decide(u, 'revoke') }) : null
      ].filter(Boolean),
      emptyText: tab === 'applied' ? 'নতুন কোনো আবেদন নেই।' : 'এখানে কেউ নেই।'
    });
    holder.replaceChildren(t, table.el || table);
  }
  async function load() {
    holder.replaceChildren(skeleton(6));
    try { data = await api('creators2?tab=' + tab); paintHead(); draw(); } catch (e) { holder.replaceChildren(errorBox(e, load)); }
  }
  async function decide(u, what) {
    let extra = {};
    if (what === 'approve') {
      if (!u.eligible || u.risk >= 60 || u.strikes) {
        const ok = await confirmAction({ tier: 2, danger: false, title: `${u.name}-কে অনুমোদন দেবেন?`, text: [!u.eligible ? 'নিয়মের শর্ত এখন পূরণ হয় না।' : '', u.strikes ? `${num(u.strikes)}টি চালু স্ট্রাইক আছে।` : '', u.risk >= 60 ? `ঝুঁকি স্কোর ${num(u.risk)}।` : ''].filter(Boolean).join(' ') + ' তবুও অনুমোদন দিতে কারণ লিখুন।',
          reasons: [['reviewed', 'দেখে নিয়েছি — ঠিক আছে'], ['other', 'অন্য']], confirmText: 'অনুমোদন দিন' });
        if (!ok) return; extra = ok;
      }
    } else {
      const ok = await confirmAction({ tier: 2, title: what === 'reject' ? `${u.name}-এর আবেদন বাতিল করবেন?` : `${u.name}-কে প্রোগ্রাম থেকে বাদ দেবেন?`,
        text: what === 'revoke' ? 'নতুন আয় যোগ হবে না, টাকা তোলার অনুরোধও করা যাবে না। এখনকার ব্যালান্স হিসাবে থেকে যাবে।' : 'তিনি পরে আবার আবেদন করতে পারবেন।',
        reasons: [['rules', 'শর্ত পূরণ হয় না'], ['quality', 'কনটেন্টের মান'], ['fake', 'ভুয়া ফলোয়ার/এনগেজমেন্ট'], ['strikes', 'নিয়ম ভাঙা'], ['request', 'তাঁর অনুরোধে'], ['other', 'অন্য']], confirmText: what === 'reject' ? 'বাতিল করুন' : 'বাদ দিন' });
      if (!ok) return; extra = ok;
    }
    try { await api('creators2/decide', { id: u.id, do: what, ...extra }); toast(what === 'approve' ? `${u.name} এখন ক্রিয়েটর।` : what === 'reject' ? 'আবেদন বাতিল হলো।' : 'প্রোগ্রাম থেকে বাদ দেওয়া হলো।'); load(); }
    catch (e) { toast(errText(e), { bad: true }); }
  }
  function adjust(u) {
    const sign = select([['+', 'যোগ (+)'], ['-', 'কাটা (−)']], '+');
    const amount = attrs(h('input', 'input'), { type: 'number', min: '1', step: '1', inputmode: 'numeric', placeholder: '০' });
    const note = attrs(h('input', 'input'), { maxlength: '120', placeholder: 'যেমন: অক্টোবরের ক্রিয়েটর বোনাস' });
    const err = h('p', 'form-err'), key = idem();
    const body = h('div', 'confirm', h('p', 'lead', `এখনকার ব্যালান্স ${taka(u.money.balance)}। কারণটি ক্রিয়েটর নিজের লেনদেনের তালিকায় দেখবেন।`),
      h('div', 'two', field('ধরন', sign), field('টাকা', amount)), field('কারণ (বাধ্যতামূলক)', note), err);
    const ok = button('সমন্বয় করুন', { kind: 'primary', onClick: async () => {
      const n = Math.round(Number(amount.value));
      if (!n || n < 1) { err.textContent = 'টাকার পরিমাণ লিখুন।'; amount.focus(); return; }
      if (!note.value.trim()) { err.textContent = 'কারণ লিখতে হবে।'; note.focus(); return; }
      try {
        const r = await api('creators2/adjust', { id: u.id, amount: sign.value === '-' ? -n : n, note: note.value.trim(), idem: key });
        m.close(); toast(`সমন্বয় হলো — নতুন ব্যালান্স ${taka(r.money.balance)}। লেজারে লেখা থাকল।`); load();
      } catch (e) { err.textContent = errText(e); }
    } });
    const m = modal({ title: `${u.name} — আয় সমন্বয়`, body, actions: [button('বাতিল', { kind: 'ghost', onClick: () => m.close() }), ok] });
  }
  function rules() {
    const r = data.rules;
    const inp = (v) => attrs(h('input', 'input'), { type: 'number', min: '0', step: '1', inputmode: 'numeric', value: String(v) });
    const f = inp(r.followers), p = inp(r.posts), min = inp(r.payoutMin), su = inp(r.stepup);
    const prog = select([['on', 'চালু — আবেদন ও টাকা তোলা যায়'], ['off', 'বন্ধ — নতুন আবেদন ও টাকা তোলার অনুরোধ বন্ধ']], r.program ? 'on' : 'off');
    const err = h('p', 'form-err');
    const body = h('div', 'confirm', h('div', 'two', field('ন্যূনতম ফলোয়ার', f), field('ন্যূনতম পোস্ট', p)), h('div', 'two', field('সর্বনিম্ন উত্তোলন (৳)', min), field('এর বেশি হলে নতুন কোড (৳)', su)),
      field('প্রোগ্রাম', prog, 'বন্ধ করলে এখনকার ব্যালান্স থেকে যায়; চালু করলে আবার আবেদন ও তোলা যায়।'), err);
    const ok = button('সেভ করুন', { kind: 'primary', onClick: async () => {
      if (!can('creators.manage')) return;
      try { await api('creators2/rules', { followers: Number(f.value), posts: Number(p.value), min: Number(min.value), stepup: Number(su.value), program: prog.value === 'on' }); m.close(); toast('নিয়ম সেভ হলো — খতিয়ানে আগে → পরে লেখা থাকল।'); load(); }
      catch (e) { err.textContent = errText(e); }
    } });
    const m = modal({ title: 'ক্রিয়েটর প্রোগ্রামের নিয়ম', body, actions: [button('বাতিল', { kind: 'ghost', onClick: () => m.close() }), ok] });
  }
  await load();
  return { key: e => table && table.keyHandler && table.keyHandler(e) };
}
