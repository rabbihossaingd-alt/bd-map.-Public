// ফর ইউ নিয়ন্ত্রণ: how For You decides which posts reach more people, what viewers did this week, the posts at each
// stage, and the controls — lift a post to the top for some days, keep one out of For You, change the weights,
// the stage limits and the scores they need, or turn the whole thing off. Every change needs a reason (audit log).
import { api, can, errText } from '../api.js';
import { attrs, avatar, badge, button, confirmAction, errorBox, field, h, icon, modal, skeleton, tabs, toast, when } from '../ui.js';
import { num } from '../fmt.js';

const REASONS = [['quality', 'ভালো কনটেন্ট'], ['travel', 'যাতায়াতের কাজের তথ্য'], ['event', 'চলতি ঘটনা'], ['policy', 'নিয়মের বাইরে / সন্দেহজনক'],
  ['spam', 'স্প্যাম বা ভুয়া দেখা'], ['test', 'পরীক্ষা'], ['other', 'অন্য কারণ']];
const WEIGHTS = [['watch', 'কতটা দেখা হয়', 'ভিডিওর কত অংশ দেখা হলো (ঘুরে আবার দেখলে বেশি)'], ['complete', 'শেষ পর্যন্ত দেখা', 'যত জন শেষ পর্যন্ত দেখলেন'],
  ['skip', 'স্কিপ (কমায়)', '২ সেকেন্ডের আগে সরে গেলে স্কোর কমে'], ['like', 'লাইক', ''], ['comment', 'মন্তব্য', 'কতজন মন্তব্য করলেন'],
  ['save', 'সেভ', ''], ['share', 'শেয়ার', ''], ['place', 'এখানে যান', 'জায়গায় যেতে চাপ দেওয়া — যাতায়াতের অ্যাপে সবচেয়ে দামি']];
const pct = x => num(Math.round((x || 0) * 100)) + '%';

export async function render(box) {
  let list = 'top', d = null;
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'ফর ইউ নিয়ন্ত্রণ'),
    h('p', 'muted', 'কোন পোস্ট কত মানুষের কাছে যাবে — দর্শকেরা যা করেছেন তা থেকে প্রতিটি পোস্টের ০–১০০ স্কোর। নতুন পোস্ট আগে অল্প কিছু মানুষ দেখেন; ভালো করলে ধাপে ধাপে বেশি মানুষের কাছে যায়।'))), holder);

  async function load() {
    holder.replaceChildren(skeleton(6));
    try { d = await api('foryou?list=' + list); paint(); } catch (e) { holder.replaceChildren(errorBox(e, load)); }
  }
  function paint() {
    const s = d.settings, sig = d.signals, f = d.funnel;
    const k = (label, val, sub, tone) => h('div', 'kpi ' + (tone || ''), h('span', 'k-label', label), h('b', 'k-val', val), sub ? h('small', 'muted', sub) : null);
    const sg = x => sig[x] || { week: 0, people: 0, today: 0 };
    const kpis = h('div', 'kpi-grid',
      k('অবস্থা', s.on ? 'চালু' : 'বন্ধ', s.on ? 'স্কোর দিয়ে সাজানো' : 'ফিড এলোমেলো, আগের মতো', s.on ? '' : 'warn'),
      k('ভিডিও দেখা (৭ দিন)', num(sg('watch').week + sg('skip').week), `${num(sg('watch').people + sg('skip').people)} জন · আজ ${num(sg('watch').today + sg('skip').today)}`),
      k('শেষ পর্যন্ত দেখা', pct(d.watch.complete), `গড়ে ভিডিওর ${pct(d.watch.ratio)} দেখা হয়`),
      k('স্কিপ (৭ দিন)', num(sg('skip').week), '২ সেকেন্ডের আগে সরে গেছেন'),
      k('শেয়ার · এখানে যান', `${num(sg('share').week)} · ${num(sg('place').week)}`, '৭ দিনে'));
    const step = (label, n, sub, tone) => h('div', 'kpi ' + (tone || ''), h('span', 'k-label', label), h('b', 'k-val', num(n)), h('small', 'muted', sub));
    const funnel = h('section', 'section', h('div', 'section-head', h('h2', null, 'ধাপ'), h('span', 'muted small', d.lastRun ? ['স্কোর হিসাব হয়েছে ', when(d.lastRun), ' · প্রতি ১০ মিনিটে'] : 'এখনো হিসাব হয়নি')),
      h('div', 'kpi-grid',
        step('০ · পরীক্ষা', f.test, `${num(s.caps[0])} জন পর্যন্ত দেখেন`),
        step('১ · বাড়ছে', f.s1, `${num(s.caps[1])} জন পর্যন্ত · স্কোর ${num(s.need[0])}+`),
        step('২ · বড়', f.s2, `${num(s.caps[2])} জন পর্যন্ত · স্কোর ${num(s.need[1])}+`),
        step('৩ · সবার জন্য', f.s3, `সীমা নেই · স্কোর ${num(s.need[2])}+`, 'ok'),
        step('আটকে আছে', f.held, 'সীমায় পৌঁছেছে, পরের ধাপের স্কোর হয়নি — নিচের দিকে দেখায়', f.held ? 'warn' : '')));
    const acts = can('foryou.manage') ? h('div', 'row-acts',
      button('ওজন ও ধাপ বদলান', { ic: 'cog', onClick: editSettings }),
      button(s.on ? 'ফর ইউ বন্ধ করুন' : 'ফর ইউ চালু করুন', { kind: s.on ? 'ghost' : 'primary', ic: 'toggle', onClick: () => saveSettings({ ...s, on: !s.on }, s.on ? 'ফর ইউ বন্ধ করবেন? ফিড আবার এলোমেলো হবে।' : 'ফর ইউ চালু করবেন?') }),
      button('এখনই হিসাব করুন', { kind: 'ghost', ic: 'refresh', onClick: async () => { try { const r = await api('foryou/recompute', {}); toast(`${num(r.posts)}টি পোস্টের স্কোর হলো।`); load(); } catch (e) { toast(errText(e), { bad: true }); } } }),
      h('span', 'grow'),
      attrs(h('input', 'input'), { type: 'search', placeholder: 'পোস্ট নম্বর দিয়ে খুঁজুন', id: 'fy-find', style: null })) : null;
    if (acts) acts.lastChild.addEventListener('keydown', e => { if (e.key === 'Enter' && Number(e.target.value)) openPost(Number(e.target.value)); });
    const t = tabs([['top', 'সবচেয়ে ভালো'], ['rising', 'উঠছে'], ['held', 'আটকে আছে'], ['picked', 'হাতে বাছাই']], list, v => { list = v; load(); });
    const rows = d.rows.length ? h('div', 'tbl-wrap', h('table', 'tbl',
      h('thead', null, h('tr', null, ...['পোস্ট', 'ধাপ', 'স্কোর', 'দেখেছেন', 'শেষ পর্যন্ত', 'স্কিপ', 'লাইক · শেয়ার · এখানে যান', ''].map(x => h('th', null, x)))),
      h('tbody', null, ...d.rows.map(row)))) : h('div', 'empty', icon('radar'), h('b', null, 'এখানে এখনো কোনো পোস্ট নেই'), h('span', null, list === 'picked' ? 'উপরে তোলা বা লুকানো পোস্ট এখানে দেখাবে।' : 'দর্শকেরা দেখতে থাকলে স্কোর তৈরি হবে।'));
    holder.replaceChildren(kpis, funnel, acts || h('span'), h('section', 'section', t, rows));
  }
  function stageBadge(p) {
    if (p.mode === 'suppress') return badge('ফর ইউ থেকে বাদ', 'danger');
    if (p.mode === 'boost') return badge('উপরে তোলা', 'ok');
    if (p.score == null) return badge('হিসাব হয়নি');
    if (p.held) return badge('আটকে আছে', 'warn');
    return badge(`${num(p.stage)} · ${d.stages[p.stage]}`, p.stage >= 3 ? 'ok' : '');
  }
  function row(p) {
    const tr = h('tr', null,
      h('td', null, h('div', 'person', p.thumb ? attrs(h('img', 'thumb'), { src: '../' + p.thumb, alt: '', loading: 'lazy', width: '40', height: '40' }) : avatar(p.user, 'sm'),
        h('div', 't', h('b', null, `#${num(p.id)} · ${p.kind === 'video' ? 'ভিডিও' : p.kind === 'text' ? 'লেখা' : 'ছবি'}`), h('span', null, `${p.user.name}${p.caption ? ' — ' + p.caption.slice(0, 50) : ''}`)))),
      h('td', null, stageBadge(p)),
      h('td', 'num', p.score == null ? '—' : num(p.score, 1)),
      h('td', 'num', num(p.seen)),
      h('td', 'num', p.kind === 'video' ? pct(p.complete) : '—'),
      h('td', 'num', p.kind === 'video' ? pct(p.skip) : '—'),
      h('td', 'num', `${num(p.likes)} · ${num(p.shares)} · ${num(p.places)}`),
      h('td', null, button('খুলুন', { small: true, kind: 'ghost', onClick: () => openPost(p.id) })));
    return tr;
  }
  async function openPost(id) {
    let r;
    try { r = await api('foryou/post?id=' + id); } catch (e) { toast(errText(e), { bad: true }); return; }
    const p = r.post, s = r.settings;
    const kv = (a, b) => h('div', 'kv', h('span', null, a), h('b', null, b));
    const next = p.held ? `পরের ধাপের জন্য স্কোর ${num(s.need[p.stage])} দরকার` : p.stage < 3 ? `${num(s.caps[p.stage])} জন দেখলে পরের ধাপ বিবেচনা হবে (স্কোর ${num(s.need[p.stage])}+)` : 'সবচেয়ে বড় ধাপে';
    const body = h('div', 'stack',
      p.thumb ? attrs(h('img', 'rv-media'), { src: '../' + p.thumb, alt: '' }) : null,
      h('p', null, h('b', null, p.user.name), ` @${p.user.username} · `, when(p.created), p.place ? ` · ${p.place}` : ''),
      p.caption ? h('p', 'muted', p.caption) : null,
      kv('ধাপ', p.score == null ? 'হিসাব হয়নি' : p.held ? `${d.stages[p.stage]} — আটকে আছে` : d.stages[p.stage]), kv('স্কোর', p.score == null ? '—' : `${num(p.score, 1)} / ১০০`), h('small', 'muted', next),
      kv('দেখেছেন', num(p.seen)), p.kind === 'video' ? kv('ভিডিওর কতটা দেখা হয় (গড়, আবার দেখাসহ — তাই ১০০%-এর বেশি হতে পারে)', pct(p.ratio)) : null, p.kind === 'video' ? kv('শেষ পর্যন্ত দেখা', pct(p.complete)) : null,
      p.kind === 'video' ? kv('স্কিপ', pct(p.skip)) : null, kv('লাইক · মন্তব্য · সেভ', `${num(p.likes)} · ${num(p.comments)} · ${num(p.saves)}`),
      kv('শেয়ার · এখানে যান', `${num(p.shares)} · ${num(p.places)}`),
      p.mode ? h('div', 'banner flat', icon(p.mode === 'boost' ? 'chevr' : 'eye'), h('span', null, p.mode === 'boost' ? 'উপরে তোলা' : 'ফর ইউ থেকে বাদ', p.until ? [' — ', when(p.until), ' পর্যন্ত'] : ' — যতদিন না বদলানো হয়')) : null);
    const act = (mode, title, text, danger) => async () => {
      let days = 0;
      if (mode === 'boost') {
        const sel = h('select', 'input');
        for (const [v, t] of [['1', '১ দিন'], ['3', '৩ দিন'], ['7', '৭ দিন'], ['0', 'যতদিন না বদলাই']]) sel.append(attrs(h('option', null, t), { value: v }));
        sel.value = '3';
        const go = await new Promise(res => { const m = modal({ title: 'কতদিন উপরে থাকবে', body: h('div', 'confirm', field('সময়', sel)), actions: [button('বাতিল', { kind: 'ghost', onClick: () => { m.close(); res(false); } }), button('পরের ধাপ', { kind: 'primary', onClick: () => { m.close(); res(true); } })] }); });
        if (!go) return; days = Number(sel.value);
      }
      const ok = await confirmAction({ tier: 2, danger, title, text, reasons: REASONS, confirmText: 'নিশ্চিত করুন' });
      if (!ok) return;
      try { await api('foryou/post', { id: p.id, mode, days, ...ok }); toast('সেভ হলো।'); m.close(); load(); } catch (e) { toast(errText(e), { bad: true }); }
    };
    const actions = [button('বন্ধ', { kind: 'ghost', onClick: () => m.close() })];
    if (can('foryou.manage')) {
      if (p.mode) actions.unshift(button('স্বাভাবিক করুন', { kind: 'secondary', onClick: act('clear', 'স্বাভাবিক করবেন?', 'পোস্টটি আবার স্কোর অনুযায়ী দেখাবে।', false) }));
      if (p.mode !== 'suppress') actions.unshift(button('ফর ইউ থেকে বাদ দিন', { kind: 'danger', ic: 'eye', onClick: act('suppress', 'ফর ইউ থেকে বাদ দেবেন?', 'পোস্টটি মুছবে না — প্রোফাইলে থাকবে, শুধু ফর ইউ-তে আর দেখাবে না।', true) }));
      if (p.mode !== 'boost') actions.unshift(button('উপরে তুলুন', { kind: 'primary', ic: 'chevr', onClick: act('boost', 'পোস্টটি উপরে তুলবেন?', 'সবার ফর ইউ-তে উপরের দিকে দেখাবে।', false) }));
    }
    const m = modal({ title: `পোস্ট #${num(p.id)}`, body, actions, wide: true });
  }
  function editSettings() {
    const s = JSON.parse(JSON.stringify(d.settings)), def = d.defaults;
    const rng = (v, min, max, stepv) => attrs(h('input', 'range'), { type: 'range', min: String(min), max: String(max), step: String(stepv), value: String(v) });
    const nb = (v, min, max) => attrs(h('input', 'input'), { type: 'number', min: String(min), max: String(max), value: String(v) });
    const ws = WEIGHTS.map(([key, label, hint]) => {
      const r = rng(s.weights[key], 0, 10, 1), out = h('b', null, num(s.weights[key]));
      r.addEventListener('input', () => { s.weights[key] = Number(r.value); out.textContent = num(Number(r.value)); });
      return h('div', 'field', h('div', 'kv', h('span', null, label), out), r, hint ? h('small', 'muted', hint) : null);
    });
    const caps = s.caps.map((v, i) => { const x = nb(v, 10, 10000000); x.addEventListener('input', () => { s.caps[i] = Number(x.value); }); return x; });
    const need = s.need.map((v, i) => { const x = nb(v, 0, 100); x.addEventListener('input', () => { s.need[i] = Number(x.value); }); return x; });
    const fresh = nb(s.freshHours, 1, 720); fresh.addEventListener('input', () => { s.freshHours = Number(fresh.value); });
    const explore = rng(s.explore, 0, 1, 0.05), chance = rng(s.chance, 0, 1, 0.05);
    explore.addEventListener('input', () => { s.explore = Number(explore.value); }); chance.addEventListener('input', () => { s.chance = Number(chance.value); });
    const body = h('div', 'stack',
      h('h3', null, 'কোন জিনিস কতটা গুরুত্ব পাবে (০–১০)'), ...ws,
      h('h3', null, 'ধাপ'),
      h('div', 'two', field('ধাপ ০ (পরীক্ষা) — কত জন পর্যন্ত', caps[0]), field('এরপর ধাপ ১-এর জন্য স্কোর', need[0])),
      h('div', 'two', field('ধাপ ১ (বাড়ছে) — কত জন পর্যন্ত', caps[1]), field('এরপর ধাপ ২-এর জন্য স্কোর', need[1])),
      h('div', 'two', field('ধাপ ২ (বড়) — কত জন পর্যন্ত', caps[2]), field('এরপর সবার জন্য — স্কোর', need[2])),
      h('h3', null, 'অন্যান্য'),
      field('নতুনত্ব কত ঘণ্টা ধরে গোনা হবে', fresh, 'নতুন পোস্ট এই সময়ের প্রায় তিন গুণ পর্যন্ত একটু উপরে থাকে'),
      field('নতুন পোস্টকে কতটা সামনে আনা হবে', explore, 'বেশি হলে নতুন পোস্ট বেশি দেখা যায়'),
      field('এলোমেলোভাবে মেশানো', chance, 'বেশি হলে প্রতিবার ফিড বেশি আলাদা দেখায়'),
      button('শুরুর মান ফিরিয়ে আনুন', { kind: 'ghost', small: true, onClick: () => { m.close(); saveSettings({ ...def, on: s.on }, 'শুরুর মান ফিরিয়ে আনবেন?'); } }));
    const m = modal({ title: 'ওজন ও ধাপ', body, wide: true, actions: [button('বাতিল', { kind: 'ghost', onClick: () => m.close() }), button('পরের ধাপ', { kind: 'primary', onClick: () => {
      if (!(s.caps[0] < s.caps[1] && s.caps[1] < s.caps[2])) { toast('ধাপের সীমা ছোট থেকে বড় হতে হবে।', { bad: true }); return; }
      m.close(); saveSettings(s, 'নতুন ওজন ও ধাপ সেভ করবেন?');
    } })] });
  }
  async function saveSettings(next, title) {
    const ok = await confirmAction({ tier: 2, danger: false, title, text: 'সঙ্গে সঙ্গে সবার ফর ইউ-তে কাজ করবে। খতিয়ানে আগের ও নতুন মান থাকবে।', reasons: REASONS });
    if (!ok) return;
    try { await api('foryou/settings', { settings: next, ...ok }); toast('সেভ হলো।'); load(); } catch (e) { toast(e.message === 'caps' ? 'ধাপের সীমা ছোট থেকে বড় হতে হবে।' : errText(e), { bad: true }); }
  }
  await load();
  return {};
}
