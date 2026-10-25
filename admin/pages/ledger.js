// লেজার: every earning, adjustment and payout as two equal lines (what the program cost or the wallet paid on one
// side, what we owe the creator on the other), never changed. The months in short, a check that the books balance
// and match the payouts, the lines themselves, and a CSV for the accounts (the download is written in the audit log).
import { api } from '../api.js';
import { badge, button, errorBox, h, icon, skeleton, toast, when, attrs } from '../ui.js';
import { dataTable } from '../table.js';
import { num, taka } from '../fmt.js';

const MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const monthName = m => { const [y, mo] = m.split('-').map(Number); return `${MONTHS[mo - 1]} ${num(y).replace(/[,،]/g, '')}`; };
const ACCOUNT = a => a === 'cash:wallet' ? 'বিজনেস ওয়ালেট' : a === 'expense:creators' ? 'ক্রিয়েটর খরচ' : a.startsWith('creator:') ? 'ক্রিয়েটরের পাওনা' : a;

export async function render(box) {
  let month = '', d = null, table = null;
  const top = h('div'), holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'লেজার'), h('p', 'muted', 'প্রতিটি আয়, সমন্বয় আর পেআউট দুই লাইনে — একদিকে ডেবিট, অন্যদিকে সমান ক্রেডিট। কেউ বদলাতে বা মুছতে পারে না (ডাটাবেস নিজেই আটকায়)।')),
    button('CSV ডাউনলোড', { ic: 'download', onClick: () => { location.href = 'api/admin/v2/ledger.csv' + (month ? '?month=' + month : ''); toast('ডাউনলোড শুরু হচ্ছে — খতিয়ানে লেখা থাকবে।'); } })), top, holder);
  async function load() {
    holder.replaceChildren(skeleton(6));
    try { d = await api('ledger' + (month ? '?month=' + month : '')); paint(); } catch (e) { holder.replaceChildren(errorBox(e, load)); }
  }
  function paint() {
    const r = d.reconcile;
    top.replaceChildren(...[h('div', 'kpi-grid',
      h('div', 'kpi ' + (r.balanced ? 'ok' : 'danger'), h('span', 'k-label', 'ডেবিট = ক্রেডিট'), h('b', 'k-val', r.balanced ? 'মিলেছে' : 'মেলেনি'), h('small', 'muted', `${taka(r.debit)} · ${taka(r.credit)}`)),
      h('div', 'kpi ' + (r.matches ? 'ok' : 'danger'), h('span', 'k-label', 'ক্রিয়েটরদের পাওনা'), h('b', 'k-val', taka(r.owedLedger)), h('small', 'muted', r.matches ? 'আয় − পাঠানোর সাথে মিলেছে' : `আয় − পাঠানো = ${taka(r.owedTables)} — মেলেনি`)),
      h('div', 'kpi', h('span', 'k-label', 'ওয়ালেট থেকে গেছে'), h('b', 'k-val', taka(r.cashOut))),
      h('div', 'kpi ' + (r.reserved ? 'warn' : ''), h('span', 'k-label', 'পেআউটের অপেক্ষায়'), h('b', 'k-val', taka(r.reserved)), h('small', 'muted', 'এখনো লেজারে নয় — পাঠানোর পর আসবে'))),
      r.deletedAccounts ? h('p', 'hint', icon('alert'), ` মুছে ফেলা অ্যাকাউন্টের হিসাব ${taka(r.deletedAccounts)} — লেজারে থেকে গেছে, পাওনার যোগফলে ধরা হয়নি।`) : null,
      h('section', 'section', h('h2', null, 'মাস অনুযায়ী'),
        d.months.length ? h('div', 'tbl-wrap', h('table', 'tbl', h('thead', null, h('tr', null, ...['মাস', 'আয় যোগ', 'কাটা', 'পাঠানো', 'মাস শেষে পাওনা', ''].map(t => h('th', t && t !== 'মাস' ? 'num' : null, t)))),
          h('tbody', null, ...d.months.map(m => h('tr', m.month === month ? 'on' : null, h('td', null, h('b', null, monthName(m.month))), h('td', 'num', taka(m.earned)), h('td', 'num', m.takenBack ? '−' + taka(m.takenBack) : '—'), h('td', 'num', taka(m.paid)), h('td', 'num', h('b', null, taka(m.owedEnd))),
            h('td', 'num', button(m.month === month ? 'সব মাস' : 'লাইনগুলো', { small: true, kind: 'ghost', onClick: () => { month = m.month === month ? '' : m.month; load(); } }))))))) : h('p', 'muted', 'এখনো কোনো লেনদেন নেই।'))].filter(Boolean));
    table = dataTable({
      page: 'ledger', search: 'নাম বা বিবরণ',
      columns: [
        { key: 'at', label: 'তারিখ', render: e => when(e.at), sort: e => e.at },
        { key: 'txn', label: 'লেনদেন', render: e => h('span', 'mono small', e.txn), sort: e => e.txn },
        { key: 'account', label: 'খাতা', render: e => h('div', 'cell-t', h('b', null, ACCOUNT(e.account)), e.user ? h('span', 'muted', e.user.name) : null), sort: e => e.account },
        { key: 'debit', label: 'ডেবিট', render: e => e.debit ? taka(e.debit) : h('span', 'muted', '—'), sort: e => e.debit, cls: 'num' },
        { key: 'credit', label: 'ক্রেডিট', render: e => e.credit ? taka(e.credit) : h('span', 'muted', '—'), sort: e => e.credit, cls: 'num' },
        { key: 'memo', label: 'বিবরণ', render: e => h('span', 'wrap', e.memo || '—'), sortable: false }
      ],
      load: async ({ q }) => { const rows = q ? d.entries.filter(e => ((e.user ? e.user.name : '') + ' ' + e.memo).toLowerCase().includes(q.toLowerCase())) : d.entries; return { rows, total: rows.length, next: 0 }; },
      emptyText: 'এই সময়ে কোনো লাইন নেই।'
    });
    holder.replaceChildren(h('section', 'section', h('h2', null, month ? monthName(month) + ' — সব লাইন' : 'সাম্প্রতিক লাইন', ' ', month ? badge('ফিল্টার', 'info') : null), table));
    void attrs;
  }
  await load();
  return { key: e => table && table.keyHandler && table.keyHandler(e) };
}
