// ঘোষণা ও নোটিফিকেশন: the banner at the top of the app (up to 240 characters; info, warning or urgent; a start and
// an end; a live preview) and broadcasts — a notification in the app and a phone push, to everyone, to creators or by
// the app's language, with the number of people shown before sending (tier 2).
import { api, errText } from '../api.js';
import { badge, button, confirmAction, empty, errorBox, field, h, icon, select, skeleton, tabs, toast, when, attrs } from '../ui.js';
import { full, num } from '../fmt.js';

const KIND = { info: ['তথ্য', 'info'], warn: ['সতর্কতা', 'warn'], urgent: ['জরুরি', 'danger'] };
const STATE = { live: ['এখন দেখাচ্ছে', 'ok'], scheduled: ['সময়ের অপেক্ষায়', 'info'], over: ['সময় শেষ', ''], ended: ['বন্ধ করা', ''] };
const TARGET = { all: 'সবাই', creators: 'ক্রিয়েটর', bn: 'বাংলায় অ্যাপ', en: 'ইংরেজিতে অ্যাপ' };
const local = ts => { const d = new Date(ts - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

export async function render(box) {
  let tab = 'banner', d = null;
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'ঘোষণা ও নোটিফিকেশন'), h('p', 'muted', 'অ্যাপের উপরের ব্যানার, আর সবার কাছে নোটিফিকেশন ও ফোনে পুশ।'))), holder);
  async function load() {
    holder.replaceChildren(skeleton(5));
    try { d = await api('notices2'); paint(); } catch (e) { holder.replaceChildren(errorBox(e, load)); }
  }
  function paint() {
    const t = tabs([['banner', 'ব্যানার'], ['broadcast', 'নোটিফিকেশন পাঠান']], tab, v => { tab = v; paint(); });
    holder.replaceChildren(t, ...(tab === 'banner' ? banner() : broadcast()));
  }
  // ---- the banner ----
  function banner(edit) {
    const a = edit || {};
    const text = attrs(h('textarea', 'input'), { rows: '3', maxlength: '240', placeholder: 'যেমন: ঈদের ছুটিতে দূরপাল্লার বাসের ভাড়া বদলেছে — যাওয়ার আগে কাউন্টারে দেখে নিন।' });
    text.value = a.text || '';
    const kind = select(Object.entries(KIND).map(([k, v]) => [k, v[0]]), a.kind || 'info');
    const starts = attrs(h('input', 'input'), { type: 'datetime-local', value: local(a.starts || Date.now()) });
    const ends = attrs(h('input', 'input'), { type: 'datetime-local', value: a.ends ? local(a.ends) : '' });
    const left = h('small', 'muted'), prev = h('div', 'app-notice');
    const paintPrev = () => { left.textContent = `${num(240 - text.value.length)} অক্ষর বাকি`; prev.className = 'app-notice ' + kind.value; prev.replaceChildren(icon(kind.value === 'info' ? 'bell' : 'alert'), h('span', null, text.value || 'এখানে ঘোষণা দেখাবে'), icon('x')); };
    text.addEventListener('input', paintPrev); kind.addEventListener('change', paintPrev); paintPrev();
    const err = h('p', 'form-err');
    const form = h('div', 'card notice-form', h('h3', null, a.id ? 'ঘোষণা বদলান' : 'নতুন ঘোষণা'), field('লেখা', text, left), h('div', 'two', field('ধরন', kind), h('span')),
      h('div', 'two', field('শুরু', starts), field('শেষ (ফাঁকা = নিজে বন্ধ না করা পর্যন্ত)', ends)),
      h('div', 'preview-box', h('small', 'muted', 'অ্যাপে যেমন দেখাবে'), prev), err,
      h('div', 'row-acts', button(a.id ? 'সেভ করুন' : 'প্রকাশ করুন', { kind: 'primary', ic: 'megaphone', onClick: async () => {
        if (!text.value.trim()) { err.textContent = 'লেখা দিন।'; return; }
        const s = starts.value ? new Date(starts.value).getTime() : Date.now(), e = ends.value ? new Date(ends.value).getTime() : 0;
        if (e && e <= s) { err.textContent = 'শেষের সময় শুরুর পরে হতে হবে।'; return; }
        try { await api('notices2/save', { id: a.id, text: text.value.trim(), kind: kind.value, starts: s, ends: e }); toast(s > Date.now() ? 'সময় হলে দেখাবে।' : 'প্রকাশ হলো — অ্যাপে দেখাচ্ছে।'); load(); } catch (er) { err.textContent = errText(er); }
      } }), a.id ? button('বাতিল', { kind: 'ghost', onClick: paint }) : null));
    const cur = d.current;
    return [
      cur.readonly && cur.readonly.on ? h('div', 'banner danger flat', icon('lock'), h('span', null, 'অ্যাপ এখন রিড-অনলি — সেই বার্তা সব ঘোষণার উপরে দেখায়।')) : null,
      form,
      h('section', 'section', h('h2', null, 'সব ঘোষণা'), d.announcements.length ? h('div', 'stack', ...d.announcements.map(x => h('div', 'card ann-row',
        h('div', 'row-acts', badge(...KIND[x.kind]), badge(...STATE[x.state]), h('span', 'grow'), h('small', 'muted', `${full(x.starts)}${x.ends ? ' → ' + full(x.ends) : ''}${x.by ? ' · ' + x.by : ''}`)),
        h('p', 'no-tr', x.text),
        h('div', 'row-acts', button('বদলান', { small: true, kind: 'ghost', onClick: () => holder.replaceChildren(tabs([['banner', 'ব্যানার'], ['broadcast', 'নোটিফিকেশন পাঠান']], 'banner', v => { tab = v; paint(); }), ...banner(x)) }),
          x.state === 'live' || x.state === 'scheduled' ? button('বন্ধ করুন', { small: true, kind: 'ghost', onClick: () => end(x) }) : null)))) : empty('এখনো কোনো ঘোষণা নেই।'))
    ].filter(Boolean);
  }
  async function end(x) {
    try { await api('notices2/end', { id: x.id }); toast('ঘোষণা বন্ধ হলো।', { undo: async () => { await api('notices2/end', { id: x.id, undo: true }); load(); } }); load(); } catch (e) { toast(errText(e), { bad: true }); }
  }
  // ---- broadcast ----
  function broadcast() {
    const title = attrs(h('input', 'input'), { maxlength: '60', value: 'Manzeela' });
    const body = attrs(h('textarea', 'input'), { rows: '3', maxlength: '240', placeholder: 'বাংলায় বার্তা' });
    const bodyEn = attrs(h('textarea', 'input'), { rows: '2', maxlength: '240', placeholder: 'English (optional — devices set to English get this)' });
    const target = select(Object.entries(TARGET), 'all');
    const reach = h('div', 'reach muted', 'গোনা হচ্ছে…');
    let people = null;
    const count = async () => { reach.textContent = 'গোনা হচ্ছে…'; try { const c = await api('broadcast/count?target=' + target.value); people = c.people; reach.replaceChildren(icon('users'), h('b', null, `${num(c.people)} জন`), h('span', null, ` পাবেন — এর মধ্যে ${num(c.phones)} জনের ফোনে পুশও যাবে`)); } catch (e) { reach.textContent = errText(e); } };
    target.addEventListener('change', count); count();
    const err = h('p', 'form-err');
    const send = button('পাঠান', { kind: 'primary', ic: 'megaphone', onClick: async () => {
      if (!body.value.trim()) { err.textContent = 'বার্তা লিখুন।'; return; }
      if (people == null) return;
      const ok = await confirmAction({ tier: 2, danger: false, title: `${num(people)} জনকে পাঠাবেন?`, text: `${TARGET[target.value]} — অ্যাপে নোটিফিকেশন আর ফোনে পুশ। পাঠানোর পর ফেরানো যায় না।`, preview: body.value.trim(),
        reasons: [['update', 'অ্যাপের খবর'], ['safety', 'নিরাপত্তা'], ['event', 'উৎসব/বিশেষ দিন'], ['outage', 'সমস্যার খবর'], ['other', 'অন্য']], confirmText: 'পাঠান' });
      if (!ok) return;
      const go = async again => api('broadcast/send', { title: title.value.trim(), body: body.value.trim(), bodyEn: bodyEn.value.trim(), target: target.value, expect: people, again, ...ok });
      try { const r = await go(false); toast(`${num(r.people)} জনকে পাঠানো হলো।`); load(); }
      catch (e) {
        if (e.message === 'count') { err.textContent = `সংখ্যা বদলেছে — এখন ${num(e.data.people)} জন। আবার দেখে পাঠান।`; count(); }
        else if (e.message === 'recent') { const sure = await confirmAction({ tier: 2, danger: false, title: '১০ মিনিটের মধ্যে আরেকটি পাঠানো হয়েছে', text: 'খুব ঘন ঘন পুশ মানুষ বিরক্ত হন। তবুও পাঠাবেন?', reasons: null, confirmText: 'তবুও পাঠান' }); if (sure) { try { const r = await go(true); toast(`${num(r.people)} জনকে পাঠানো হলো।`); load(); } catch (e2) { err.textContent = errText(e2); } } }
        else err.textContent = errText(e);
      }
    } });
    return [
      h('div', 'card notice-form', h('h3', null, 'নোটিফিকেশন পাঠান'), h('div', 'two', field('কাদের', target), field('শিরোনাম (পুশে দেখাবে)', title)), field('বার্তা', body), field('ইংরেজিতে (ঐচ্ছিক)', bodyEn),
        reach, h('p', 'hint', icon('alert'), ' জেলা অনুযায়ী পাঠানো যায় না — কারও জেলা রাখা হয় না। ভাষা ধরা হয় ফোনের পুশ যে ভাষায় চালু আছে, তা দিয়ে।'), err, h('div', 'row-acts', send)),
      h('section', 'section', h('h2', null, 'আগে পাঠানো'), d.broadcasts.length ? h('div', 'stack', ...d.broadcasts.map(b => h('div', 'card ann-row', h('div', 'row-acts', badge(TARGET[b.target] || b.target, 'info'), h('b', null, `${num(b.count)} জন`), h('span', 'grow'), h('small', 'muted', `${b.by || ''} · `), when(b.at)),
        h('p', 'no-tr', h('b', null, b.title + ': '), b.body)))) : empty('এখনো কিছু পাঠানো হয়নি।'))
    ];
  }
  await load();
  return {};
}
