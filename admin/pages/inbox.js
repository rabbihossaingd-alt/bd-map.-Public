// ইনবক্স: every waiting item this role handles, in one queue — late first, then by priority, then by when it is due.
// Take one ("আমি নিচ্ছি") so no one else works on it; "পরেরটা নাও" takes the most urgent unclaimed item and opens it.
import { api, errText, session } from '../api.js';
import { attrs, badge, button, empty, errorBox, h, icon, select, skeleton, tabs, toast } from '../ui.js';
import { num, waited } from '../fmt.js';

const TYPES = [['ticket', 'সাপোর্ট', 'life'], ['report', 'রিপোর্ট', 'flag'], ['fare', 'ভাড়া', 'tag'], ['stopfare', 'স্টপের ভাড়া', 'bus'], ['photo', 'জায়গার ছবি', 'pin'], ['gem', 'মেঠোপথ', 'leaf'],
  ['payout', 'পেআউট', 'wallet'], ['creator', 'ক্রিয়েটর', 'coins'], ['verify', 'ব্যাজ', 'checkc']];
const typeInfo = t => TYPES.find(x => x[0] === t) || [t, t, 'dot'];

export async function render(box, { params, go }) {
  let view = (() => { try { return sessionStorage.getItem('mzadm.inbox') || 'all'; } catch { return 'all'; } })(), type = params[0] && params[0] !== 'next' ? params[0] : '', data = null;
  const list = h('div', 'inbox');
  const typeSel = select([['', 'সব ধরন'], ...TYPES.map(([v, t]) => [v, t])], type);
  typeSel.addEventListener('change', () => { type = typeSel.value; load(); });
  const next = button('পরেরটা নাও', { kind: 'primary', ic: 'inbox', onClick: takeNext });
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'ইনবক্স'), h('p', 'muted', 'যা যা অপেক্ষায় — দেরি হওয়াগুলো আগে, তারপর প্রায়োরিটি অনুযায়ী।')), next), list);
  async function load() {
    list.replaceChildren(skeleton(6));
    try { data = await api(`inbox?view=${view}${type ? '&type=' + type : ''}`); paint(); } catch (e) { list.replaceChildren(errorBox(e, load)); }
  }
  function paint() {
    const t = tabs([['all', 'সব', data.tally.all], ['mine', 'আমাকে দেওয়া', data.tally.mine], ['unassigned', 'অ্যাসাইন হয়নি', data.tally.unassigned], ['overdue', 'SLA পার', data.tally.overdue]], view,
      v => { view = v; try { sessionStorage.setItem('mzadm.inbox', v); } catch { /* storage off */ } load(); });
    const bar = h('div', 'dt-bar', typeSel, h('span', 'muted small', `SLA: P1 ${num(data.sla.p1)} ঘণ্টা · সাপোর্ট ${num(data.sla.support)} · রিপোর্ট ${num(data.sla.reports)} · ডেটা ${num(data.sla.data)} · পেআউট ${num(data.sla.payouts)} ঘণ্টা`));
    const rows = h('div', 'q-list');
    if (!data.items.length) rows.append(empty(view === 'mine' ? 'আপনাকে দেওয়া কোনো কাজ নেই।' : 'সব কাজ শেষ — সাবাস', 'নতুন কিছু এলে এখানে সঙ্গে সঙ্গে দেখাবে।'));
    data.items.forEach((it, i) => rows.append(row(it, i)));
    list.replaceChildren(t, bar, rows);
  }
  function row(it, i) {
    const [, label, ic] = typeInfo(it.type), left = it.due - Date.now();
    const mineNow = it.assignee && it.assignee.id === session.me.user.id;
    const r = attrs(h('div', 'q-row' + (it.overdue ? ' late' : ''), h('span', 'q-ic', icon(ic)),
      h('div', 'q-main', h('div', 'q-title', badge(it.priority, it.priority === 'P1' ? 'danger' : it.priority === 'P2' ? 'warn' : ''), h('b', null, it.title)), h('span', 'muted', `${label} · ${it.sub}`)),
      h('div', 'q-meta', h('span', it.overdue ? 'sla late' : left < 3 * 3600e3 ? 'sla near' : 'sla', icon('clock'), it.overdue ? `${waited(-left)} দেরি` : `${waited(left)} বাকি`),
        it.assignee ? badge(mineNow ? 'আপনার কাছে' : it.assignee.name + '-এর কাছে', mineNow ? 'brand' : 'info') : h('span', 'muted small', 'কেউ নেননি')),
      h('div', 'q-acts', !it.assignee ? button('আমি নিচ্ছি', { small: true, onClick: () => take(it) }) : mineNow ? button('ছেড়ে দিন', { small: true, kind: 'ghost', onClick: () => release(it) }) : null,
        button('খুলুন', { small: true, kind: 'ghost', ic: 'chevr', onClick: () => go(it.link) }))), { tabindex: '-1', 'data-i': i });
    r.addEventListener('dblclick', () => go(it.link));
    return r;
  }
  async function take(it, force) {
    try { await api('inbox/assign', { type: it.type, ref: it.ref, to: 'me', force }); toast('কাজটি এখন আপনার।'); load(); }
    catch (e) {
      if (e.message === 'taken') { if (confirm(`${e.data.assignee.name} এটা নিয়েছেন। তবুও নেবেন?`)) take(it, true); return; }
      toast(errText(e), { bad: true });
    }
  }
  async function release(it) { try { await api('inbox/assign', { type: it.type, ref: it.ref, to: 'none' }); load(); } catch (e) { toast(errText(e), { bad: true }); } }
  async function takeNext() {
    try {
      const r = await api('inbox/next', { type });
      if (!r.item) { toast('নেওয়ার মতো কোনো কাজ নেই — সাবাস'); return; }
      toast(`${typeInfo(r.item.type)[1]}: ${r.item.title}`);
      go(r.item.link);
    } catch (e) { toast(errText(e), { bad: true }); }
  }
  // keyboard: j/k to move, Enter to open
  let focus = -1;
  const key = e => {
    if (!data || !data.items.length) return false;
    if (e.key === 'j' || e.key === 'k') { focus = Math.max(0, Math.min(data.items.length - 1, focus + (e.key === 'j' ? 1 : -1))); list.querySelectorAll('.q-row').forEach((r, i) => r.classList.toggle('focus', i === focus)); const r = list.querySelectorAll('.q-row')[focus]; if (r) r.scrollIntoView({ block: 'nearest' }); return true; }
    if (e.key === 'Enter' && focus >= 0) { go(data.items[focus].link); return true; }
    return false;
  };
  const onAssign = () => load(), onCounts = () => { if (document.visibilityState === 'visible') load(); };
  document.addEventListener('mz:assign', onAssign);
  let last = '';
  const countsChanged = e => { const s = JSON.stringify([e.detail.support, e.detail.reports, e.detail.fares, e.detail.photos, e.detail.gems, e.detail.payouts]); if (last && s !== last) onCounts(); last = s; };
  document.addEventListener('mz:counts', countsChanged);
  if (params[0] === 'next') { await load(); takeNext(); } else await load();
  return { key, destroy: () => { document.removeEventListener('mz:assign', onAssign); document.removeEventListener('mz:counts', countsChanged); }, onParams: p => { type = p[0] && p[0] !== 'next' ? p[0] : ''; typeSel.value = type; load(); } };
}
