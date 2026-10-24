// The panel's building blocks: one look, one behaviour, on every page.
import { api, errText, session } from './api.js';
import { ago, full, num } from './fmt.js';

// ---- elements ----
export function h(tag, cls, ...kids) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
}
export const attrs = (e, a) => { for (const [k, v] of Object.entries(a)) if (v != null) e.setAttribute(k, v); return e; };

// ---- icons: one stroke set (Lucide style), drawn inline ----
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  life: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.9 4.9l4.3 4.3M14.8 14.8l4.3 4.3M14.8 9.2l4.3-4.3M4.9 19.1l4.3-4.3',
  reply: 'M9 17l-5-5 5-5M4 12h11a5 5 0 0 1 5 5v2', users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  key: 'M15.5 7.5 19 4M21 2l-2 2M11.4 11.6a5 5 0 1 1-7.1 7.1 5 5 0 0 1 7.1-7.1zM11.4 11.6 15.5 7.5l3 3L22 7l-3-3',
  flag: 'M4 22V4M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1', shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', strike: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  radar: 'M19.1 4.9A10 10 0 1 1 12 2M12 6a6 6 0 1 0 6 6M12 12l7-7', image: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  film: 'M3 3h18v18H3zM7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4', story: 'M12 2a10 10 0 1 0 10 10M12 7v10M7 12h10', comment: 'M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.7A8.5 8.5 0 1 1 21 11.5z',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', group: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9',
  cpu: 'M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 9h6v6H9z',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01', bus: 'M8 6v6M16 6v6M2 12h20M7 18v2M17 18v2M5 18h14a1 1 0 0 0 1-1V6a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v11a1 1 0 0 0 1 1z',
  train: 'M4 15V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM4 11h16M8 21l2-3M16 21l-2-3M8 15h.01M16 15h.01', pin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6', check: 'M20 6 9 17l-5-5', checkc: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
  wallet: 'M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z', coins: 'M9 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM18.1 10.4A6 6 0 1 1 10.3 18M7 6h1v4M16.7 13.9l.7.7-2.8 2.8',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5', chart: 'M3 3v18h18M7 15l4-4 3 3 5-6', activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3', toggle: 'M7 6h10a6 6 0 0 1 0 12H7A6 6 0 0 1 7 6zM8 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', megaphone: 'M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 8.5a5 5 0 0 1 0 7M19 5.5a9 9 0 0 1 0 13',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', server: 'M2 4h20v6H2zM2 14h20v6H2zM6 7h.01M6 17h.01', cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0', sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z', lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4', menu: 'M3 6h18M3 12h18M3 18h18', x: 'M18 6 6 18M6 6l12 12', plus: 'M12 5v14M5 12h14',
  chevl: 'M15 18l-6-6 6-6', chevr: 'M9 18l6-6-6-6', chevd: 'M6 9l6 6 6-6', sidebar: 'M3 3h18v18H3zM9 3v18', filter: 'M22 3H2l8 9.5V19l4 2v-8.5z', columns: 'M12 3v18M3 3h18v18H3z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3', eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  undo: 'M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8', ext: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3', keyboard: 'M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2', alert: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01', save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15', more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9', dot: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'
};
export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'i ' + cls);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', P[name] || P.dot); s.appendChild(p);
  return s;
}

// ---- buttons, badges, avatars ----
// kind: primary | secondary | ghost | danger; an async onClick shows a spinner and blocks double taps
export function button(text, { kind = 'secondary', ic, onClick, small, title, label } = {}) {
  const b = h('button', `btn ${kind}${small ? ' sm' : ''}${text ? '' : ' icon-only'}`);
  b.type = 'button';
  if (ic) b.append(icon(ic));
  if (text) b.append(h('span', null, text));
  if (title) b.title = title;
  if (label || (!text && title)) b.setAttribute('aria-label', label || title);
  if (onClick) b.addEventListener('click', async e => {
    if (b.classList.contains('busy')) return;
    b.classList.add('busy'); b.disabled = true;
    try { await onClick(e); } finally { b.classList.remove('busy'); b.disabled = false; }
  });
  return b;
}
export const badge = (text, tone = '') => h('span', 'badge ' + tone, text);
export const dot = (tone = '') => h('span', 'sdot ' + tone);
const HUES = [158, 200, 262, 330, 24, 48, 96, 222];
export function avatar(u, size = '') {
  const a = h('span', 'av ' + size);
  if (u && u.pic) { const img = h('img'); img.src = `api/avatar/${u.id}?v=${u.pic}`; img.alt = ''; img.loading = 'lazy'; a.append(img); }
  else {
    a.textContent = [...String((u && u.name) || '?').trim()][0] || '?';
    const hue = HUES[((u && u.id) || 0) % HUES.length];
    a.style.background = `hsl(${hue} 45% 38%)`;
  }
  return a;
}
export function person(u, sub) {
  const box = h('div', 'person', avatar(u), h('div', 't', h('b', null, (u && u.name) || '—'), h('span', null, sub ?? (u && u.username ? '@' + u.username : ''))));
  return box;
}
// "৫ মিনিট আগে", with the full date when hovered
export const when = ts => attrs(h('time', 'when', ago(ts)), { title: full(ts), datetime: ts ? new Date(ts).toISOString() : null });

// ---- states: loading, empty, error, offline ----
export function skeleton(rows = 6, kind = 'rows') {
  const box = h('div', 'skel ' + kind);
  for (let i = 0; i < rows; i++) box.append(h('i'));
  return box;
}
export const empty = (title, sub, ic = 'checkc') => h('div', 'empty', icon(ic), h('b', null, title), sub ? h('span', null, sub) : null);
export function errorBox(err, retry) {
  return h('div', 'errbox', icon('alert'), h('b', null, 'তথ্য আনা যায়নি'), h('span', null, errText(err)), retry ? button('আবার চেষ্টা', { ic: 'refresh', onClick: retry }) : null);
}

// ---- toasts, with an undo for the first confirmation tier (8 seconds) ----
export function toast(text, { undo, bad, ms } = {}) {
  const host = document.getElementById('toasts');
  const t = h('div', 'toast' + (bad ? ' bad' : ''), h('span', null, text));
  let timer;
  const close = () => { clearTimeout(timer); t.classList.add('out'); setTimeout(() => t.remove(), 200); };
  if (undo) t.append(button('আনডু', { kind: 'ghost', small: true, ic: 'undo', onClick: async () => { close(); try { await undo(); toast('আগের অবস্থায় ফেরানো হলো।'); } catch (e) { toast(errText(e), { bad: true }); } } }));
  t.append(button('', { kind: 'ghost', small: true, ic: 'x', title: 'বন্ধ', onClick: close }));
  host.append(t);
  timer = setTimeout(close, ms || (undo ? 8000 : 3200));
  return close;
}

// ---- modal dialogs ----
let openModals = 0;
export function modal({ title, body, actions, wide, onClose }) {
  const back = h('div', 'modal-back'), box = h('div', 'modal' + (wide ? ' wide' : ''));
  attrs(box, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const close = () => { back.remove(); openModals--; document.removeEventListener('keydown', key); if (onClose) onClose(); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  box.append(h('div', 'modal-head', h('h2', null, title), button('', { kind: 'ghost', ic: 'x', title: 'বন্ধ', onClick: close })), h('div', 'modal-body', body));
  if (actions) box.append(h('div', 'modal-foot', actions));
  back.append(box);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.body.append(back); openModals++;
  document.addEventListener('keydown', key);
  setTimeout(() => { const f = box.querySelector('input, textarea, select, .btn.primary, .btn.danger'); if (f) f.focus(); }, 30);
  return { close, box };
}
export const modalOpen = () => openModals > 0;

// The reason codes every page uses (reports, strikes and analytics share them). Editable in panel settings later.
export const REASONS = [['spam', 'স্প্যাম'], ['harass', 'হয়রানি/গালি'], ['threat', 'হুমকি'], ['scam', 'প্রতারণা/স্ক্যাম'], ['fake', 'ভুয়া অ্যাকাউন্ট'], ['copyright', 'কপিরাইট'],
  ['sexual', 'যৌন কনটেন্ট'], ['violence', 'সহিংস কনটেন্ট'], ['wrong_data', 'ভুল তথ্য (ভাড়া/রুট)'], ['minor', 'নাবালক সুরক্ষা'], ['other', 'অন্য']];

// Confirmation in three tiers. 1: do it at once and offer an undo (the caller shows the toast). 2: a reason code and a
// note, with what the person will be told. 3: that, plus typing a word to be sure, plus a fresh code (step-up).
// Resolves to { reason, note } or null when cancelled.
export function confirmAction({ tier = 2, title, text, danger = true, word, preview, reasons = REASONS, noteRequired = false, confirmText = 'নিশ্চিত করুন' }) {
  return new Promise(resolve => {
    let done = false;
    const body = h('div', 'confirm');
    if (text) body.append(h('p', 'lead', text));
    let reasonSel = null, note = null, typed = null;
    if (tier >= 2) {
      if (reasons && reasons.length) {
        reasonSel = h('select', 'input');
        reasonSel.append(attrs(h('option', null, 'কারণ বেছে নিন…'), { value: '' }), ...reasons.map(([v, t]) => attrs(h('option', null, t), { value: v })));
        body.append(h('label', 'field', h('span', null, 'কারণ'), reasonSel));
      }
      note = attrs(h('textarea', 'input'), { rows: '3', maxlength: '500', placeholder: noteRequired ? 'বিস্তারিত লিখুন (খতিয়ানে থাকবে)' : 'নোট (ঐচ্ছিক, খতিয়ানে থাকবে)' });
      body.append(h('label', 'field', h('span', null, 'নোট'), note));
      if (preview) body.append(h('div', 'preview', h('small', null, 'ব্যবহারকারী যা দেখবেন'), h('p', null, preview)));
    }
    if (tier >= 3 && word) {
      typed = attrs(h('input', 'input'), { autocomplete: 'off', spellcheck: 'false', placeholder: word });
      body.append(h('label', 'field', h('span', null, `নিশ্চিত করতে লিখুন: `, h('b', 'mono', word)), typed));
      body.append(h('p', 'hint', icon('lock'), ' এরপর আপনার কোড চাওয়া হবে (১০ মিনিট কাজ করবে)।'));
    }
    const err = h('p', 'form-err');
    body.append(err);
    const go = button(confirmText, { kind: danger ? 'danger' : 'primary', onClick: async () => {
      if (reasonSel && !reasonSel.value) { err.textContent = 'একটি কারণ বেছে নিন।'; reasonSel.focus(); return; }
      if (noteRequired && note && !note.value.trim()) { err.textContent = 'বিস্তারিত লিখুন।'; note.focus(); return; }
      if (typed && typed.value.trim() !== word) { err.textContent = `ঠিক "${word}" লিখুন।`; typed.focus(); return; }
      if (tier >= 3 && !(await stepUp())) { err.textContent = 'কোড ছাড়া এই কাজ করা যায় না।'; return; }
      done = true; m.close();
      resolve({ reason: reasonSel ? reasonSel.value : '', note: note ? note.value.trim() : '' });
    } });
    const m = modal({ title, body, actions: [button('বাতিল', { kind: 'ghost', onClick: () => m.close() }), go], onClose: () => { if (!done) resolve(null); } });
  });
}

// A fresh code for a high-risk step: valid 10 minutes on the server. Resolves true when given.
export async function stepUp() {
  if (session.me && session.me.stepupUntil > Date.now() + 15_000) return true;
  let start;
  try { start = await api('stepup/start', {}); } catch (e) { toast(errText(e), { bad: true }); return false; }
  return new Promise(resolve => {
    let done = false;
    const input = attrs(h('input', 'input code'), { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: start.method === 'totp' ? '11' : '6', placeholder: '••••••' });
    if (start.devCode) input.value = start.devCode;
    const err = h('p', 'form-err');
    const body = h('div', 'confirm', h('p', 'lead', start.method === 'totp' ? 'অথেন্টিকেটর অ্যাপের ৬ সংখ্যার কোড (বা একটি ব্যাকআপ কোড) দিন।' : 'আপনার ই-মেইলে পাঠানো ৬ সংখ্যার কোড দিন।'), input, err);
    const ok = button('নিশ্চিত করুন', { kind: 'primary', onClick: async () => {
      try {
        const r = await api('stepup/verify', { code: input.value.trim() }, { retry: false });
        session.me.stepupUntil = r.stepupUntil; done = true; m.close(); resolve(true);
      } catch (e) { err.textContent = errText(e); input.select(); }
    } });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); });
    const m = modal({ title: 'আবার নিশ্চিত করুন', body, actions: [button('বাতিল', { kind: 'ghost', onClick: () => m.close() }), ok], onClose: () => { if (!done) resolve(false); } });
  });
}

// ---- the detail drawer: driven by the address (#/page/id), so links and the back button work ----
const drawer = { el: null, onClose: null };
export function openDrawer({ title, body, foot, prev, next, wide, ref }) {
  closeDrawer(true);
  const back = h('div', 'drawer-back'), box = h('aside', 'drawer' + (wide ? ' wide' : ''));
  attrs(box, { role: 'dialog', 'aria-label': title });
  const nav = h('div', 'drawer-nav');
  if (prev) nav.append(button('', { kind: 'ghost', ic: 'chevl', title: 'আগেরটি (k)', onClick: prev }));
  if (next) nav.append(button('', { kind: 'ghost', ic: 'chevr', title: 'পরেরটি (j)', onClick: next }));
  const watch = h('div', 'watching'); watch.dataset.ref = ref || '';
  box.append(h('div', 'drawer-head', h('h2', null, title), nav, button('', { kind: 'ghost', ic: 'x', title: 'বন্ধ (Esc)', onClick: () => history.back() })), watch, h('div', 'drawer-body', body));
  if (foot) box.append(h('div', 'drawer-foot', foot));
  back.addEventListener('click', () => history.back());
  document.body.append(back, box);
  requestAnimationFrame(() => { back.classList.add('on'); box.classList.add('on'); });
  drawer.el = [back, box]; drawer.prev = prev; drawer.next = next;
  if (ref) document.dispatchEvent(new CustomEvent('mz:watch', { detail: ref }));
  return box;
}
export function closeDrawer(quick) {
  if (!drawer.el) return;
  const [back, box] = drawer.el; drawer.el = null;
  back.classList.remove('on'); box.classList.remove('on');
  setTimeout(() => { back.remove(); box.remove(); }, quick ? 0 : 200);
  document.dispatchEvent(new CustomEvent('mz:watch', { detail: '' }));
}
export const drawerOpen = () => !!drawer.el;
export const drawerStep = d => { const f = d > 0 ? drawer.next : drawer.prev; if (f) f(); };

// ---- small pieces ----
export function tabs(items, current, onPick) {
  const box = attrs(h('div', 'tabs'), { role: 'tablist' });
  for (const [value, text, n] of items) {
    const b = attrs(h('button', value === current ? 'on' : '', text, n ? h('em', null, num(n)) : null), { role: 'tab', 'aria-selected': String(value === current), type: 'button' });
    b.addEventListener('click', () => onPick(value));
    box.append(b);
  }
  return box;
}
export function field(label, input, hint) { return h('label', 'field', h('span', null, label), input, hint ? h('small', null, hint) : null); }
export function select(options, value) {
  const s = h('select', 'input');
  for (const [v, t] of options) s.append(attrs(h('option', null, t), { value: v }));
  if (value != null) s.value = value;
  return s;
}
export function menu(anchor, items) {
  document.querySelectorAll('.pop').forEach(p => p.remove());
  const pop = attrs(h('div', 'pop'), { role: 'menu' });
  for (const it of items) {
    if (it === '-') { pop.append(h('hr')); continue; }
    if (it.label) { pop.append(h('div', 'pop-label', it.label)); continue; }
    const b = attrs(h('button', it.danger ? 'danger' : '', it.ic ? icon(it.ic) : null, h('span', null, it.text), it.hint ? h('kbd', null, it.hint) : null), { role: 'menuitem', type: 'button' });
    b.addEventListener('click', () => { pop.remove(); it.run(); });
    pop.append(b);
  }
  document.body.append(pop);
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth;
  pop.style.top = Math.min(innerHeight - pop.offsetHeight - 8, r.bottom + 6) + 'px';
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
  setTimeout(() => document.addEventListener('click', function off(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', off); } }), 0);
  return pop;
}
