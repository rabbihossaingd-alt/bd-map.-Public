// মডারেশন কিউ: what the app's own checks flagged in the last 14 days — words from the list (Bangla, Banglish,
// English), links, and new accounts posting a lot in a day. Remove (with or without a strike), or mark fine (undo).
// The word list is edited here (owner and admin).
import { api, errText, session } from '../api.js';
import { avatar, badge, button, confirmAction, empty, errorBox, field, h, icon, modal, skeleton, tabs, toast, when, attrs } from '../ui.js';
import { num } from '../fmt.js';

const TYPE = { comment: ['মন্তব্য', 'comment'], post: ['পোস্ট', 'image'], burst: ['নতুন অ্যাকাউন্ট', 'users'] };
const WHY = { words: 'চিহ্নিত শব্দ', link: 'লিংক', new: '৭ দিনের কম পুরনো অ্যাকাউন্টে অনেক পোস্ট/মন্তব্য' };
const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mark = (text, hits) => { if (!hits.length) return text; const re = new RegExp('(' + hits.map(esc).join('|') + ')', 'gi'); return h('span', null, ...String(text).split(re).map((part, i) => i % 2 ? h('mark', null, part) : part)); };

export async function render(box, { go }) {
  let tab = 'open', d = null;
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'মডারেশন কিউ'), h('p', 'muted', 'অ্যাপ নিজে যা চিহ্নিত করেছে (গত ১৪ দিন)। চিহ্নিত মানেই নিয়ম ভাঙা নয় — দেখে সিদ্ধান্ত নিন।')),
    ['owner', 'admin'].includes(session.me.role) ? button('শব্দ-তালিকা', { ic: 'list', onClick: editWords }) : null), holder);
  async function load() {
    holder.replaceChildren(skeleton(4, 'cards'));
    try { d = await api('modqueue?tab=' + tab); paint(); } catch (e) { holder.replaceChildren(errorBox(e, load)); }
  }
  function paint() {
    const t = tabs([['open', 'দেখা বাকি', d.tally.open], ['reviewed', 'দেখা হয়েছে', d.tally.reviewed]], tab, v => { tab = v; load(); });
    holder.replaceChildren(t, d.rows.length ? h('div', 'stack', ...d.rows.map(card)) : empty(tab === 'open' ? 'কিছু বাকি নেই — সাবাস' : 'এখনো কিছু দেখা হয়নি।'));
  }
  function card(it) {
    const [label, ic] = TYPE[it.type], u = it.user, newAcct = u.created && Date.now() - u.created < 7 * 864e5;
    const acts = h('div', 'row-acts');
    if (tab === 'open') {
      if (it.type !== 'burst') acts.append(button('সরান', { small: true, kind: 'danger', onClick: () => remove(it, false) }), button('সরান + স্ট্রাইক', { small: true, kind: 'danger', onClick: () => remove(it, true) }));
      else acts.append(button('ব্যবহারকারী দেখুন', { small: true, ic: 'chevr', onClick: () => go('#/users/' + u.id) }));
      acts.append(button('ঠিক আছে', { small: true, kind: 'ghost', ic: 'check', onClick: () => decide(it, 'ok') }));
    } else acts.append(button('আবার খুলুন', { small: true, kind: 'ghost', onClick: () => decide(it, 'reopen') }));
    const media = it.type === 'post' && it.kind !== 'text' && it.src ? blurred(it) : null;
    return h('div', 'card mq-card',
      h('div', 'row-acts', badge(label, it.why === 'link' ? 'danger' : 'warn'), h('span', 'muted small', icon(ic), ' ', WHY[it.why]), h('span', 'grow'), when(it.created)),
      h('div', 'mq-body', media, h('p', 'wrap', mark(it.text || '', it.hits))),
      it.hits.length ? h('div', 'badges', ...it.hits.map(w => badge(w, ''))) : null,
      h('div', 'row-acts', h('div', 'person click', avatar(u, 'sm'), h('div', 't', h('b', null, u.name), h('span', null, `@${u.username}`))), newAcct ? badge('নতুন অ্যাকাউন্ট', 'warn') : null, h('span', 'grow'), acts));
  }
  function blurred(p) {
    const m = p.kind === 'video' ? attrs(h('video'), { src: p.src, poster: p.poster || null, muted: '', preload: 'none', playsinline: '' }) : attrs(h('img'), { src: p.src, alt: '', loading: 'lazy' });
    const wrap = h('div', 'blur thumb', m, h('span', 'blur-hint', icon('eye')));
    wrap.addEventListener('click', () => { wrap.classList.add('shown'); if (m.tagName === 'VIDEO') { m.muted = true; m.controls = true; m.play().catch(() => {}); } }, { once: true });
    return wrap;
  }
  async function decide(it, what) {
    try {
      await api('modqueue/decide', { type: it.type, ref: it.ref, do: what });
      toast(what === 'ok' ? 'ঠিক আছে চিহ্নিত।' : 'আবার খোলা হলো।', what === 'ok' ? { undo: async () => { await api('modqueue/decide', { type: it.type, ref: it.ref, do: 'reopen' }); load(); } } : {});
      load();
    } catch (e) { toast(errText(e), { bad: true }); }
  }
  async function remove(it, strike) {
    let next = null;
    if (strike) { try { next = await api('strikes/next?user=' + it.user.id); } catch { /* the server decides anyway */ } }
    const what = next ? (next.step === 'ban' ? 'অ্যাকাউন্ট বন্ধ হবে' : next.step.startsWith('restrict:') ? `${num(Number(next.step.split(':')[1]))} দিন পোস্ট বন্ধ থাকবে` : 'সতর্কবার্তা যাবে') : '';
    const ok = await confirmAction({ tier: 2, title: `এই ${TYPE[it.type][0]} সরাবেন?`, text: strike && next ? `সাথে স্ট্রাইক: এটা হবে ${it.user.name}-এর ${num(next.number)}ম চালু স্ট্রাইক — ${what}।` : 'লেখক নোটিফিকেশনে কারণ দেখবেন আর আপিল করতে পারবেন।',
      preview: 'টিম আপনার একটি পোস্ট/মন্তব্য নিয়ম ভাঙার জন্য সরিয়েছে — কারণ: …', confirmText: strike ? 'সরান + স্ট্রাইক' : 'সরান' });
    if (!ok) return;
    try { const r = await api('modqueue/decide', { type: it.type, ref: it.ref, do: 'remove', strike, ...ok }); toast(r.strike ? `সরানো হলো, স্ট্রাইক দেওয়া হলো (${num(r.strike.number)}ম)।` : 'সরানো হলো — লেখককে জানানো হয়েছে।'); load(); }
    catch (e) { toast(errText(e), { bad: true }); }
  }
  function editWords() {
    const ta = attrs(h('textarea', 'input mono'), { rows: '14', spellcheck: 'false' });
    ta.value = d.words.join('\n');
    const err = h('p', 'form-err');
    const body = h('div', 'confirm', h('p', 'lead', 'প্রতি লাইনে একটি শব্দ বা অংশ — বাংলা, বাংলিশ বা ইংরেজি। বড়-ছোট হাতের অক্ষরে পার্থক্য নেই। লিংক ধরতে "http://", "wa.me" ইত্যাদিও রাখা যায়।'), ta,
      h('p', 'hint', 'মন্তব্যের তালিকা আর এই কিউ দুটোই এই তালিকা দেখে। বদল খতিয়ানে থাকে।'), err);
    const ok = button('সেভ করুন', { kind: 'primary', onClick: async () => {
      const words = ta.value.split('\n').map(w => w.trim()).filter(w => w.length >= 2);
      try { await api('modqueue/words', { words }); m.close(); toast(`${num(words.length)}টি শব্দ সেভ হলো।`); load(); } catch (e) { err.textContent = errText(e); }
    } });
    const m = modal({ title: 'চিহ্নিত শব্দের তালিকা', body, wide: true, actions: [button('বাতিল', { kind: 'ghost', onClick: () => m.close() }), ok] });
  }
  holder.addEventListener('click', e => { const p = e.target.closest('.person.click'); if (!p) return; const c = p.closest('.mq-card'); const i = [...holder.querySelectorAll('.mq-card')].indexOf(c); if (d.rows[i]) go('#/users/' + d.rows[i].user.id); });
  await load();
  return {};
}
