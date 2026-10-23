// ---- Words, emoji and stickers on a photo, a video or a story, the way Instagram's editor does it ----
// A layer is { t: 'text'|'emoji'|'tag', s, x, y (0-1, its centre in the picture), sc (size), r (turn, radians),
// c (colour), bg (0 none, 1 a box in the colour, 2 a dark box), f (text style), a (alignment), k (tag kind) }.
// On a photo the layers are drawn into the picture when it is shared; on a video they are kept with the post and
// drawn over it wherever it plays. One unit is a hundredth of the picture's width, so a layer keeps its size on
// every screen; the DOM and the canvas use the same measurements, so what was placed is what is shared.

const LYR_FONTS = {
  classic: { bn: 'ক্লাসিক', en: 'Classic', css: '700 {px}px "Anek Bangla", system-ui, sans-serif' },
  modern: { bn: 'মডার্ন', en: 'Modern', css: 'italic 600 {px}px Georgia, "Times New Roman", "Anek Bangla", serif' },
  neon: { bn: 'নিয়ন', en: 'Neon', css: '700 {px}px "Anek Bangla", system-ui, sans-serif' },
  type: { bn: 'টাইপরাইটার', en: 'Typewriter', css: '600 {px}px "Courier New", ui-monospace, "Anek Bangla", monospace' },
  strong: { bn: 'স্ট্রং', en: 'Strong', css: '900 {px}px Impact, "Arial Black", "Anek Bangla", sans-serif' }
};
const LYR_TAG_FONT = '800 {px}px "Anek Bangla", system-ui, sans-serif';
const LYR_EMOJI_FONT = '{px}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const LYR_COLORS = ['#ffffff', '#000000', '#3897f0', '#70c050', '#fdcb5c', '#fd8d32', '#ed4956', '#d10869', '#a307ba', '#262626', '#ffd1dc', '#00d4c5'];
// sizes in units (a hundredth of the width): text, emoji, tag
const LYR_SIZE = { text: 7, emoji: 16, tag: 5.4 };
const LYR_WRAP = 84;                                   // a line of text is at most this wide (units), before turning
const LYR_LINE = 1.28;
const lyrFont = (l, px) => (l.t === 'emoji' ? LYR_EMOJI_FONT : l.t === 'tag' ? LYR_TAG_FONT : (LYR_FONTS[l.f] || LYR_FONTS.classic).css).replace('{px}', px);
const lyrText = l => (l.t === 'text' && l.f === 'strong' ? l.s.toUpperCase() : l.s);
const tagText = l => ({ place: '📍 ', time: '🕐 ', mention: '@', hash: '#', bd: '' })[l.k] + l.s;

// The lines of a layer, measured at 10 px per unit (the same on screen and in the picture).
let lyrMeasure = null;
function lyrLines(l) {
  if (!lyrMeasure) lyrMeasure = document.createElement('canvas').getContext('2d');
  const size = LYR_SIZE[l.t] * 10, text = l.t === 'tag' ? tagText(l) : lyrText(l);
  lyrMeasure.font = lyrFont(l, size);
  if (l.t !== 'text') return [text];
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const tryLine = line + word;
      if (line && lyrMeasure.measureText(tryLine.trimEnd()).width > LYR_WRAP * 10) { out.push(line.trimEnd()); line = word.trimStart(); }
      else line = tryLine;
    }
    out.push(line);
  }
  return out;
}
// Colours for a text: on a box in its own colour the words are black or white, whichever reads.
// A sticker is a pill: white with coloured words, in its colour, or dark.
function lyrInk(l) {
  if (l.t === 'tag' && l.bg !== 1) return l.bg === 2 ? '#ffffff' : l.c;
  if (l.bg !== 1) return l.c;
  const n = parseInt(l.c.slice(1), 16), lum = (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
  return lum > .62 ? '#000000' : '#ffffff';
}
const lyrBox = l => (l.bg === 1 ? l.c : l.bg === 2 ? 'rgba(0,0,0,.55)' : l.t === 'tag' ? '#ffffff' : '');

// ---- on screen ----
function layerEl(l) {
  const d = el('div', `ly ly-${l.t}` + (l.t === 'text' ? ' f-' + (l.f || 'classic') + ' a-' + (l.a || 'c') : '') + (l.t === 'tag' ? ' k-' + l.k : '') + (l.bg ? ' bg' + l.bg : ''));
  d.classList.add('no-tr');
  d.style.left = l.x * 100 + '%';
  d.style.top = l.y * 100 + '%';
  d.style.transform = `translate(-50%, -50%) rotate(${l.r || 0}rad) scale(${l.sc || 1})`;
  d.style.fontSize = LYR_SIZE[l.t] + 'cqw';
  if (l.t !== 'emoji') {
    d.style.setProperty('--c', lyrInk(l));
    d.style.setProperty('--glow', l.c);
    if (lyrBox(l)) d.style.setProperty('--box', lyrBox(l));
  }
  for (const line of lyrLines(l)) d.appendChild(el('span', 'ln', line || ' '));
  return d;
}
function paintLayers(box, layers) { box.replaceChildren(...(layers || []).map(layerEl)); }

// A box over the visible picture of `media` (an <img> or <video> filling its frame with its object-fit — or `fit`), so
// layers sit on the picture itself, whatever the screen's shape. It is put in media's parent (which is positioned).
function layerBox(media, layers, fit) {
  const box = el('div', 'lyr');
  const place = () => {
    const w = media.videoWidth || media.naturalWidth, h = media.videoHeight || media.naturalHeight;
    const W = media.clientWidth, H = media.clientHeight;
    if (!w || !h || !W || !H) return;
    const how = fit || getComputedStyle(media).objectFit;
    const s = how === 'cover' ? Math.max(W / w, H / h) : Math.min(W / w, H / h);
    const bw = w * s, bh = h * s;
    Object.assign(box.style, { left: media.offsetLeft + (W - bw) / 2 + 'px', top: media.offsetTop + (H - bh) / 2 + 'px', width: bw + 'px', height: bh + 'px' });
  };
  box.place = place;
  if (layers) paintLayers(box, layers);
  media.addEventListener('loadedmetadata', place);
  media.addEventListener('load', place);
  if ('ResizeObserver' in window) new ResizeObserver(place).observe(media);
  media.after(box);
  requestAnimationFrame(place);
  return box;
}

// ---- in the picture: the same layers drawn on a canvas region (x0, y0, w, h) ----
function drawLayers(g, layers, x0, y0, w, h) {
  const u = w / 100;
  for (const l of layers || []) {
    const size = LYR_SIZE[l.t] * u, lines = lyrLines(l), lh = size * (l.t === 'emoji' ? 1.15 : LYR_LINE);
    g.save();
    g.translate(x0 + l.x * w, y0 + l.y * h);
    g.rotate(l.r || 0);
    g.scale(l.sc || 1, l.sc || 1);
    g.font = lyrFont(l, size);
    g.textBaseline = 'middle';
    const widths = lines.map(t => g.measureText(t).width);
    const padX = l.t === 'tag' ? size * .55 : size * .32, padY = l.t === 'tag' ? size * .32 : size * .1;
    const maxW = Math.max(...widths), total = lh * lines.length;
    const align = l.t === 'text' ? l.a || 'c' : 'c';
    const xOf = i => (align === 'l' ? -maxW / 2 : align === 'r' ? maxW / 2 - widths[i] : -widths[i] / 2);
    lines.forEach((t, i) => {
      const y = -total / 2 + lh * (i + .5);
      const fill = l.t === 'emoji' ? '#000' : lyrInk(l), boxColor = l.t === 'emoji' ? '' : lyrBox(l);
      if (boxColor && t.trim()) {
        g.fillStyle = boxColor;
        const r = l.t === 'tag' ? (lh / 2 + padY) : size * .28;
        roundRect(g, xOf(i) - padX, y - lh / 2 - padY / 2, widths[i] + padX * 2, lh + padY, r);
        g.fill();
      }
      g.fillStyle = fill;
      if (l.t === 'text' && l.f === 'neon') { g.shadowColor = l.c; g.shadowBlur = size * .55; g.fillStyle = '#fff'; }
      else if (l.t !== 'emoji' && !boxColor) { g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = size * .18; }
      g.fillText(t, xOf(i), y);
      g.shadowBlur = 0;
    });
    g.restore();
  }
}
function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---- the editor: move with a finger, two fingers to size and turn, drag to the bin to remove, tap words to change them ----
function layerEditor(box, layers, { onChange, onEditText, bin, frame }) {
  box.classList.add('editing');
  const fingers = new Map();
  let grab = null;                                      // { l, el, start: {x, y, sc, r}, p0: [points], over }
  const redraw = () => { paintLayers(box, layers); onChange && onChange(); };
  const pts = () => [...fingers.values()];
  const rect = () => box.getBoundingClientRect();
  const begin = () => {
    const p = pts();
    grab.start = { x: grab.l.x, y: grab.l.y, sc: grab.l.sc || 1, r: grab.l.r || 0 };
    grab.p0 = p.map(q => ({ ...q }));
  };
  box.addEventListener('pointerdown', e => {
    const hit = e.target.closest('.ly');
    if (!grab && !hit) return;
    e.preventDefault();
    try { box.setPointerCapture(e.pointerId); } catch { /* old browser */ }
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!grab) {
      const i = [...box.children].indexOf(hit);
      const l = layers[i];
      layers.splice(i, 1); layers.push(l);              // the one in hand comes to the top
      box.appendChild(hit);
      grab = { l, el: hit, t0: performance.now(), moved: false };
      frame.classList.add('moving');
    }
    begin();
  });
  box.addEventListener('pointermove', e => {
    if (!grab || !fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pts(), r = rect(), l = grab.l, a = grab.start;
    if (p.length === 1) {
      const dx = p[0].x - grab.p0[0].x, dy = p[0].y - grab.p0[0].y;
      if (Math.hypot(dx, dy) > 5) grab.moved = true;
      l.x = Math.max(0, Math.min(1, a.x + dx / r.width));
      l.y = Math.max(0, Math.min(1, a.y + dy / r.height));
    } else if (p.length >= 2 && grab.p0.length >= 2) {
      grab.moved = true;
      const [p1, p2] = p, [q1, q2] = grab.p0;
      const d0 = Math.hypot(q2.x - q1.x, q2.y - q1.y) || 1, d1 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      l.sc = Math.max(.2, Math.min(8, a.sc * d1 / d0));
      l.r = a.r + Math.atan2(p2.y - p1.y, p2.x - p1.x) - Math.atan2(q2.y - q1.y, q2.x - q1.x);
      l.x = Math.max(0, Math.min(1, a.x + ((p1.x + p2.x) - (q1.x + q2.x)) / 2 / r.width));
      l.y = Math.max(0, Math.min(1, a.y + ((p1.y + p2.y) - (q1.y + q2.y)) / 2 / r.height));
    }
    grab.el.style.left = l.x * 100 + '%';
    grab.el.style.top = l.y * 100 + '%';
    grab.el.style.transform = `translate(-50%, -50%) rotate(${l.r}rad) scale(${l.sc})`;
    if (bin) {
      const b = bin.getBoundingClientRect(), f = p[0];
      grab.over = f.x > b.left - 20 && f.x < b.right + 20 && f.y > b.top - 20 && f.y < b.bottom + 20;
      bin.classList.toggle('hot', grab.over);
      grab.el.classList.toggle('dying', grab.over);
    }
  });
  const end = e => {
    if (!fingers.delete(e.pointerId) || !grab) return;
    if (fingers.size) { begin(); return; }            // one finger lifted, the other carries on
    const g = grab;
    grab = null;
    frame.classList.remove('moving');
    if (bin) bin.classList.remove('hot');
    if (g.over) { layers.splice(layers.indexOf(g.l), 1); redraw(); return; }
    if (!g.moved && performance.now() - g.t0 < 350) {
      if (g.l.t === 'text') { onEditText(g.l); return; }
      if (g.l.t === 'tag') { g.l.bg = (g.l.bg + 1) % 3; redraw(); return; }     // a tap changes the sticker's look
    }
    redraw();
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  // a mouse: the wheel sizes the layer under it, with Shift it turns it
  box.addEventListener('wheel', e => {
    const hit = e.target.closest('.ly');
    if (!hit) return;
    e.preventDefault();
    const l = layers[[...box.children].indexOf(hit)];
    if (e.shiftKey) l.r = (l.r || 0) + e.deltaY * .003;
    else l.sc = Math.max(.2, Math.min(8, (l.sc || 1) * Math.exp(-e.deltaY * .0015)));
    hit.style.transform = `translate(-50%, -50%) rotate(${l.r || 0}rad) scale(${l.sc})`;
    clearTimeout(box._wheel);
    box._wheel = setTimeout(() => onChange && onChange(), 300);
  }, { passive: false });
  paintLayers(box, layers);
  return { redraw };
}

// ---- the words tool: type over the picture, pick a style and a colour ----
function openTextTool(host, layer, done, unit = Math.min(innerWidth, 520) / 100) {   // unit: px per unit, as in the frame
  const fresh = !layer;
  const l = layer ? { ...layer } : { t: 'text', s: '', x: .5, y: .42, sc: 1, r: 0, c: '#ffffff', bg: 0, f: 'classic', a: 'c' };
  const tool = el('div', 'tx-tool');
  const top = el('div', 'tx-top');
  const alignBtn = el('button', 'tx-ic'), bgBtn = el('button', 'tx-ic tx-a'), ok = el('button', 'tx-done', LANG === 'en' ? 'Done' : 'সম্পন্ন');
  alignBtn.setAttribute('aria-label', LANG === 'en' ? 'Alignment' : 'লাইন সাজানো');
  bgBtn.setAttribute('aria-label', LANG === 'en' ? 'Background' : 'পেছনের রং');
  bgBtn.textContent = 'A';
  top.append(alignBtn, bgBtn, el('span', 'grow'), ok);
  const stage = el('div', 'tx-stage');
  const input = Object.assign(el('textarea', 'tx-input no-tr'), { rows: 1, maxLength: 300, value: l.s, spellcheck: false });
  input.setAttribute('aria-label', LANG === 'en' ? 'Your words' : 'আপনার লেখা');
  stage.appendChild(input);
  const size = Object.assign(el('input', 'tx-size'), { type: 'range', min: .5, max: 3, step: .05, value: l.sc });
  size.setAttribute('aria-label', LANG === 'en' ? 'Size' : 'আকার');
  const fonts = el('div', 'tx-fonts'), colors = el('div', 'tx-colors');
  for (const [k, f] of Object.entries(LYR_FONTS)) {
    const b = el('button', 'f-' + k, LANG === 'en' ? f.en : f.bn);
    b.dataset.f = k;
    b.addEventListener('click', () => { l.f = k; paint(); input.focus(); });
    fonts.appendChild(b);
  }
  for (const c of LYR_COLORS) {
    const b = el('button');
    b.style.background = c;
    b.dataset.c = c;
    b.setAttribute('aria-label', c);
    b.addEventListener('click', () => { l.c = c; paint(); input.focus(); });
    colors.appendChild(b);
  }
  const bottom = el('div', 'tx-bottom');
  bottom.append(fonts, colors);
  tool.append(top, size, stage, bottom);
  function paint() {
    alignBtn.innerHTML = { l: '<i class="al l"></i>', c: '<i class="al c"></i>', r: '<i class="al r"></i>' }[l.a];
    bgBtn.className = 'tx-ic tx-a bg' + l.bg;
    for (const b of fonts.children) b.classList.toggle('on', b.dataset.f === l.f);
    for (const b of colors.children) b.classList.toggle('on', b.dataset.c === l.c);
    input.className = `tx-input no-tr f-${l.f} a-${l.a} bg${l.bg}`;
    input.style.setProperty('--c', lyrInk(l));
    input.style.setProperty('--glow', l.c);
    input.style.setProperty('--box', lyrBox(l) || 'transparent');
    input.style.fontSize = LYR_SIZE.text * l.sc * unit + 'px';
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  }
  alignBtn.addEventListener('click', () => { l.a = { c: 'l', l: 'r', r: 'c' }[l.a]; paint(); input.focus(); });
  bgBtn.addEventListener('click', () => { l.bg = (l.bg + 1) % 3; paint(); input.focus(); });
  size.addEventListener('input', () => { l.sc = Number(size.value); paint(); });
  input.addEventListener('input', paint);
  // The phone's keyboard takes the bottom of the screen; the tool fits in what is left.
  const vv = window.visualViewport;
  const fit = () => { if (vv) { tool.style.height = vv.height + 'px'; tool.style.top = vv.offsetTop + 'px'; } };
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
  const finish = () => {
    if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }
    l.s = input.value.replace(/\s+$/, '');
    tool.remove();
    done(l.s.trim() ? l : null, fresh);
  };
  ok.addEventListener('click', finish);
  stage.addEventListener('click', e => { if (e.target === stage) finish(); });
  host.appendChild(tool);
  fit();
  paint();
  setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 60);
}

// ---- stickers and emoji: a sheet like Instagram's ----
const EMOJI_SETS = [
  ['😀', 'smile', '😀😃😄😁😆😅🤣😂🙂😉😊😇🥰😍🤩😘😋😜🤪😎🥳🤗🤔🤭😴🥹😢😭😤😡🤯😱🥶🥵😬🙄😏😌🤤😷🤠👻💀🤖👽'],
  ['❤️', 'love', '❤️🧡💛💚💙💜🖤🤍🤎💖💗💓💞💕💘💝❣️💔🔥✨⭐🌟💫💥💯✅❌‼️❓💤🎉🎊🎈🎁🏆🥇👑💎'],
  ['👍', 'hands', '👍👎👏🙌🤝🙏✌️🤞🤟🤘👌🤌👋💪🫶👀👄💋🧠🫡🤙☝️👉👈👆👇'],
  ['🌴', 'nature', '🌴🌳🌲🌵🌾🌿🍀🍁🍂🌸🌺🌻🌼🌷🌹🪷🌊🌅🌄🌈☀️🌤️⛅🌧️⛈️🌙⭐❄️🐅🐘🦜🐟🐄🐐🐈🐕🦋🐝'],
  ['🍛', 'food', '🍛🍚🍜🥘🍲🍢🍤🍗🍖🥩🌶️🥭🍌🍍🍉🍊🍋🍓🍒🥥🍞🥐🍰🧁🍦🍩🍪🍫🍬☕🍵🧋🥤🍹'],
  ['✈️', 'travel', '✈️🚀🚁🚂🚆🚇🚌🚎🚕🚗🛺🏍️🚲⛵🚤🛳️⛴️🚢🗺️🧭⛰️🏔️🏕️🏖️🏝️🏞️🏙️🌆🌉🕌🛕⛪🏛️🏰🎒📸🎥🎧🎶📍']
];
function openStickerSheet(host, ctx, pick) {
  const sheet = el('div', 'st-sheet sk-sheet');
  const grab = el('div', 'grab');
  const tags = el('div', 'sk-tags');
  const ask = el('div', 'sk-ask');
  ask.hidden = true;
  const now = new Date();
  const time = now.toLocaleTimeString(LANG === 'en' ? 'en-GB' : 'bn-BD', { hour: 'numeric', minute: '2-digit' });
  const close = () => { sheet.classList.add('out'); setTimeout(() => sheet.remove(), 250); };
  const give = l => { close(); pick({ x: .5, y: .5, sc: 1, r: 0, ...l }); };
  // a sticker that needs a word first (a place, a name, a hashtag): a small field in the sheet
  const askFor = (k, label, preset) => {
    const input = Object.assign(el('input'), { placeholder: label, maxLength: 40, autocomplete: 'off', value: preset || '' });
    const sug = el('div', 'suggest');
    sug.hidden = true;
    const go2 = el('button', 'sk-go', LANG === 'en' ? 'Add' : 'যোগ করুন');
    const add = () => { const v = input.value.trim().replace(/^[@#]/, ''); if (v) give({ t: 'tag', k, s: v, c: k === 'place' ? '#a307ba' : k === 'mention' ? '#d10869' : '#3897f0', bg: 0 }); };
    go2.addEventListener('click', add);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    if (k === 'place' && typeof wireSuggest === 'function') wireSuggest(input, sug, p => { input.value = p.label; add(); }, () => {});
    ask.replaceChildren(input, go2, sug);
    ask.hidden = false;
    setTimeout(() => input.focus(), 50);
  };
  const tag = (icon, label, fn, cls) => { const b = el('button', 'sk-tag ' + (cls || '')); b.append(el('span', null, icon), el('b', null, label)); b.addEventListener('click', fn); tags.appendChild(b); };
  tag('📍', LANG === 'en' ? 'LOCATION' : 'জায়গা', () => askFor('place', LANG === 'en' ? 'Search a place' : 'জায়গার নাম লিখুন', ctx.place ? ctx.place.label : ''), 'place');
  tag('@', LANG === 'en' ? 'MENTION' : 'মেনশন', () => askFor('mention', LANG === 'en' ? 'Their username' : 'ইউজারনেম লিখুন'), 'mention');
  tag('#', LANG === 'en' ? 'HASHTAG' : 'হ্যাশট্যাগ', () => askFor('hash', LANG === 'en' ? 'hashtag' : 'হ্যাশট্যাগ লিখুন'), 'hash');
  tag('🕐', time, () => give({ t: 'tag', k: 'time', s: time, c: '#262626', bg: 0 }), 'time');
  tag('🗺️', 'Manzeela', () => give({ t: 'tag', k: 'bd', s: '🗺️ Manzeela', c: '#006a4e', bg: 0 }), 'bd');
  tag('Aa', LANG === 'en' ? 'TEXT' : 'লেখা', () => { close(); ctx.text(); }, 'text');
  const tabs = el('div', 'fx-tabs sk-cats');
  const grid = el('div', 'sk-grid');
  let cat = 0;
  const draw = () => {
    [...tabs.children].forEach((b, i) => b.classList.toggle('on', i === cat));
    grid.replaceChildren(...(window.Intl && Intl.Segmenter ? [...new Intl.Segmenter().segment(EMOJI_SETS[cat][2])].map(x => x.segment) : Array.from(EMOJI_SETS[cat][2])).filter(s => s.trim()).map(e => {
      const b = el('button', 'sk-emoji', e);
      b.addEventListener('click', () => give({ t: 'emoji', s: e }));
      return b;
    }));
  };
  EMOJI_SETS.forEach(([icon], i) => { const b = el('button', null, icon); b.addEventListener('click', () => { cat = i; draw(); }); tabs.appendChild(b); });
  sheet.append(grab, tags, ask, tabs, grid);
  host.appendChild(sheet);
  dragSheet(sheet, grab, { snaps: [.55, .92], onClose: close, onTap: close, box: () => host.clientHeight }).snap(0, false);
  draw();
}
