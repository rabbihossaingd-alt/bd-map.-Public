// ফিচার ফ্ল্যাগ: each switch on or off for everyone, or on for a share of people (the same people each time) and for
// named people (a test group). Every change needs a reason. Below, the emergency switch: the whole app read-only, with
// a message people see — tier 3 (a word to type and a fresh code).
import { api, can, errText } from '../api.js';
import { avatar, badge, button, confirmAction, errorBox, field, h, icon, modal, skeleton, toast, when, attrs } from '../ui.js';
import { full, num } from '../fmt.js';

const REASONS = [['incident', 'সমস্যা চলছে'], ['spam', 'স্প্যামের ঢল'], ['test', 'কিছু মানুষকে দিয়ে পরীক্ষা'], ['rollout', 'ধাপে ধাপে চালু'], ['maintenance', 'রক্ষণাবেক্ষণ'], ['resolved', 'সমস্যা মিটেছে'], ['other', 'অন্য']];

export async function render(box) {
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'ফিচার ফ্ল্যাগ'), h('p', 'muted', 'বন্ধ মানে সবার জন্য বন্ধ (টিম ছাড়া)। চালু রেখে শতকরা কমালে শুধু ততজন পান — প্রতিবার একই মানুষ। নাম দেওয়া মানুষ সবসময় পান।'))), holder);
  let d;
  async function load() {
    holder.replaceChildren(skeleton(5));
    try { d = await api('flags2'); paint(); } catch (e) { holder.replaceChildren(errorBox(e, load)); }
  }
  function paint() {
    const ro = d.readonly;
    holder.replaceChildren(...[
      ro.on ? h('div', 'banner danger flat', icon('alert'), h('span', null, h('b', null, 'অ্যাপ এখন রিড-অনলি। '), `${ro.since ? 'চালু হয়েছে ' + full(ro.since) + ' · ' : ''}মানুষ দেখছেন: "${ro.message}"`)) : null,
      h('div', 'stack', ...d.flags.map(card)),
      h('section', 'section', h('h2', null, 'জরুরি কিল-সুইচ'), h('div', 'card kill' + (ro.on ? ' on' : ''),
        h('div', 't', h('b', null, ro.on ? 'অ্যাপ রিড-অনলি' : 'অ্যাপ স্বাভাবিক'), h('span', 'muted', 'চালু করলে কেউ নতুন কিছু পাঠাতে পারবেন না — পোস্ট, মেসেজ, ভাড়া, রেটিং, টাকা তোলা সব বন্ধ। দেখা, খোঁজা আর লগইন চলবে; অ্যাডমিন প্যানেল চলবে। অ্যাপের উপরে একটা বার্তা দেখাবে।')),
        can('killswitch') ? button(ro.on ? 'স্বাভাবিক করুন' : 'রিড-অনলি চালু করুন', { kind: ro.on ? 'primary' : 'danger', ic: 'lock', onClick: () => kill(!ro.on) }) : badge('অনুমতি নেই', '')))].filter(Boolean));
  }
  function card(f) {
    const sw = attrs(h('button', 'switch' + (f.on ? ' on' : ''), h('i')), { role: 'switch', 'aria-checked': String(f.on), 'aria-label': f.label, type: 'button' });
    sw.addEventListener('click', () => save(f, { on: !f.on }, f.on ? `${f.label} সবার জন্য বন্ধ করবেন?` : `${f.label} চালু করবেন?`));
    const who = f.rollable ? (f.rollout >= 100 ? 'সবাই' : `${num(f.rollout)}% মানুষ (আনুমানিক ${num(Math.round(d.people * f.rollout / 100))} জন)`) : 'সবাই';
    return h('div', 'card flag-card' + (f.on ? '' : ' off'),
      h('div', 'flag-head', h('div', 't', h('b', null, f.label), h('span', 'muted', f.on ? `চালু · পাচ্ছেন: ${who}${f.users.length ? ` + ${num(f.users.length)} জন নাম ধরে` : ''}` : 'বন্ধ — সবার জন্য (টিম ছাড়া)')), sw),
      f.on && f.rollable ? h('div', 'flag-more', button('শতকরা ও মানুষ…', { small: true, kind: 'ghost', ic: 'users', onClick: () => edit(f) }),
        f.users.length ? h('div', 'badges', ...f.users.slice(0, 8).map(u => h('span', 'chip-p', avatar(u, 'xs'), u.name))) : null) : null,
      f.updated ? h('small', 'muted', 'শেষ বদল ', when(f.updated), f.by ? ` · ${f.by}` : '') : null);
  }
  async function save(f, change, title) {
    const ok = await confirmAction({ tier: 2, danger: change.on === false, title, text: change.on === false ? 'সঙ্গে সঙ্গে সবার জন্য বন্ধ হবে (টিম ছাড়া)। অ্যাপ "এখন বন্ধ আছে" জানাবে।' : 'খতিয়ানে আগে → পরে লেখা থাকবে।', reasons: REASONS, confirmText: 'নিশ্চিত করুন' });
    if (!ok) return;
    try { await api('flags2/set', { key: f.key, ...change, ...ok }); toast('সেভ হলো।'); load(); } catch (e) { toast(errText(e) + (e.data && e.data.who ? ` (${e.data.who})` : ''), { bad: true }); }
  }
  function edit(f) {
    const range = attrs(h('input', 'range'), { type: 'range', min: '0', max: '100', step: '5', value: String(f.rollout) });
    const out = h('b', null, num(f.rollout) + '%');
    const est = h('small', 'muted');
    const paint = () => { out.textContent = num(Number(range.value)) + '%'; est.textContent = `আনুমানিক ${num(Math.round(d.people * Number(range.value) / 100))} জন — প্রতিবার একই মানুষ`; };
    range.addEventListener('input', paint); paint();
    const users = attrs(h('textarea', 'input'), { rows: '4', placeholder: '@username বা ই-মেইল — প্রতি লাইনে একজন' });
    users.value = f.users.map(u => '@' + u.username).join('\n');
    const err = h('p', 'form-err');
    const body = h('div', 'confirm', h('div', 'kv', h('span', null, 'কত % মানুষ পাবেন'), out), range, est, field('সবসময় পাবেন (টেস্ট গ্রুপ)', users), err);
    const ok = button('পরের ধাপ', { kind: 'primary', onClick: () => { m.close(); save(f, { rollout: Number(range.value), users: users.value.split('\n').map(x => x.trim()).filter(Boolean) }, `${f.label}: ${num(Number(range.value))}% মানুষ`); } });
    const m = modal({ title: f.label, body, actions: [button('বাতিল', { kind: 'ghost', onClick: () => m.close() }), ok] });
  }
  async function kill(on) {
    let message = '';
    if (on) {
      const ta = attrs(h('textarea', 'input'), { rows: '3', maxlength: '240' });
      ta.value = 'রক্ষণাবেক্ষণ চলছে — কিছুক্ষণের জন্য নতুন কিছু পাঠানো যাবে না। দেখা আর খোঁজা চলবে।';
      const go = await new Promise(res => { const m = modal({ title: 'মানুষ কী দেখবেন', body: h('div', 'confirm', field('বার্তা (২৪০ অক্ষর)', ta)), actions: [button('বাতিল', { kind: 'ghost', onClick: () => { m.close(); res(false); } }), button('পরের ধাপ', { kind: 'danger', onClick: () => { m.close(); res(true); } })] }); });
      if (!go) return; message = ta.value.trim();
    }
    const ok = await confirmAction({ tier: 3, word: on ? 'READONLY' : 'NORMAL', title: on ? 'পুরো অ্যাপ রিড-অনলি করবেন?' : 'অ্যাপ স্বাভাবিক করবেন?', text: on ? 'সবার সব নতুন কাজ সঙ্গে সঙ্গে বন্ধ হবে।' : 'সবাই আবার সব কাজ করতে পারবেন।', reasons: REASONS, confirmText: on ? 'রিড-অনলি চালু' : 'স্বাভাবিক করুন' });
    if (!ok) return;
    try { await api('readonly/set', { on, message, ...ok }); toast(on ? 'অ্যাপ এখন রিড-অনলি।' : 'অ্যাপ আবার স্বাভাবিক।'); load(); } catch (e) { toast(errText(e), { bad: true }); }
  }
  await load();
  return {};
}
