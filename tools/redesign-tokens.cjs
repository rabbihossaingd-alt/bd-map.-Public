// Redesign phase 1: moves css/app.css onto the design tokens of the redesign brief.
// - colours: saturated ones collapse by hue onto the few meaningful tokens (one brand green; danger, warning, gold for
//   meaning), neutral ones onto the light/dark tokens by lightness and by what they colour; black and white that sit
//   over photos and video (always the same in both themes) become --black / --white;
// - font sizes snap to the 7-step scale, radii to 8/12/16/24/full, elevation shadows to the two levels,
//   padding/margin/gap to the 4px grid (the scale's tokens where they match);
// - old token names become the new ones.
// Run once: node tools/redesign-tokens.cjs  (prints what it changed and what it left as it was)
'use strict';
const fs = require('fs');
const FILE = require('path').join(__dirname, '..', 'css', 'app.css');
let css = fs.readFileSync(FILE, 'utf8');

const TOKENS = `/* ---- Design tokens (redesign brief) ----
   The UI is black and white; colour comes from photos and video and from one brand green. Red, amber and gold only
   carry meaning (danger, a warning, points). --white / --black stay the same in both themes: they sit on photos,
   video and the brand colour. */
:root {
  --bg: #ffffff; --surface: #f4f5f4; --surface-2: #eceeec;
  --ink: #0b0f0e; --ink-2: #3a423f; --muted: #5e6763; --line: rgba(11, 15, 14, .08);
  --brand: #00875a; --brand-soft: #e3f4ec; --on-brand: #ffffff;
  --ring: linear-gradient(135deg, #00a86b, #0e7c86);
  --danger: #d92d20; --danger-soft: #fdecea; --warning: #b25e00; --success: #0f7a4f; --gold: #f5a524; --gold-soft: #fff3e2;
  --white: #ffffff; --black: #000000; --night: #0b0f0e; --night-2: #1c201e;
  --brand-rgb: 0 135 90; --danger-rgb: 217 45 32; --gold-rgb: 245 165 36; --white-rgb: 255 255 255; --black-rgb: 0 0 0; --shadow-rgb: 11 15 14;
  --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 24px; --r-full: 999px;
  --shadow-1: 0 1px 2px rgba(11, 15, 14, .06), 0 4px 12px rgba(11, 15, 14, .06);
  --shadow-2: 0 8px 32px rgba(11, 15, 14, .14);
  --fs-xs: 12px; --fs-sm: 14px; --fs-md: 16px; --fs-lg: 18px; --fs-xl: 22px; --fs-2xl: 28px; --fs-3xl: 36px;
  --fw-regular: 400; --fw-medium: 500; --fw-semibold: 600; --fw-bold: 700;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px; --space-6: 32px; --space-7: 48px;
  --ease: cubic-bezier(.2, .8, .2, 1); --dur-fast: 150ms; --dur-med: 220ms;
  --glass: rgba(255, 255, 255, .72);
  --nav-h: 60px; --tab-h: 66px;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #000000; --surface: #121514; --surface-2: #1c201e;
  --ink: #f2f4f3; --ink-2: #c9cfcc; --muted: #9aa39f; --line: rgba(242, 244, 243, .10);
  --brand: #2bd08f; --brand-soft: #0f2a1f; --on-brand: #00140c; --brand-rgb: 43 208 143;
  --danger: #ff6b5e; --danger-soft: #3a1915; --warning: #ffb35c; --success: #5fe0a6; --gold-soft: #36250f; --danger-rgb: 255 107 94;
  --glass: rgba(18, 21, 20, .72);
  --shadow-1: 0 1px 2px rgba(0, 0, 0, .5); --shadow-2: 0 18px 48px rgba(0, 0, 0, .6);
  color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #000000; --surface: #121514; --surface-2: #1c201e;
  --ink: #f2f4f3; --ink-2: #c9cfcc; --muted: #9aa39f; --line: rgba(242, 244, 243, .10);
  --brand: #2bd08f; --brand-soft: #0f2a1f; --on-brand: #00140c; --brand-rgb: 43 208 143;
  --danger: #ff6b5e; --danger-soft: #3a1915; --warning: #ffb35c; --success: #5fe0a6; --gold-soft: #36250f; --danger-rgb: 255 107 94;
  --glass: rgba(18, 21, 20, .72);
  --shadow-1: 0 1px 2px rgba(0, 0, 0, .5); --shadow-2: 0 18px 48px rgba(0, 0, 0, .6);
  color-scheme: dark }
`;

// ---- the old token block goes ----
const oldStart = css.indexOf('/* ---- Design tokens ---- */'), oldEnd = css.indexOf('/* ---- Base ---- */');
if (oldStart !== 0 || oldEnd < 0) throw new Error('token block not where expected');
css = css.slice(oldEnd);
// the Instagram tokens and their line
css = css.replace(/:root \{ --ig-grad:[^}]*--bubble-them: #efefef; \}/, ':root { --bubble-them: var(--surface-2); }');
css = css.replace(':root[data-theme=dark] { --bubble-them: #262626; }', '');

// ---- colour helpers ----
const hexRgb = h => { h = h.slice(1); if (h.length <= 4) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? [parseInt(h.slice(6, 8), 16) / 255] : []); };
function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let s = 0, h = 0;
  if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, s * 100, l * 100];
}
// which token a saturated colour belongs to
function family(h, s, l) {
  if (h >= 345 || h < 15) return 'danger';
  if (h < 55) return l < 38 ? 'warning' : 'gold';
  if (h < 75) return 'gold';
  return 'brand';                          // greens, teals, blues, purples, pinks: the one brand colour
}
const IG = ['#feda75', '#fa7e1e', '#d62976', '#962fbf', '#4f5bd5', '#833ab4', '#fd1d1d', '#fcb045', '#f58529', '#dd2a7b', '#8134af', '#515bd4', '#e1306c', '#c13584'];
const stats = { colours: 0, kept: new Map(), fs: 0, fsKept: new Map(), radius: 0, radiusKept: new Map(), shadow: 0, space: 0 };
const keep = (map, k) => map.set(k, (map.get(k) || 0) + 1);

// one colour value in one declaration
function mapColour(value, ctx) {
  stats.colours++;
  const { prop, dark, light, onBrand } = ctx;
  let r, g, b, a = 1;
  if (value[0] === '#') { [r, g, b, a = 1] = hexRgb(value); }
  else { const p = value.match(/[\d.]+%?/g).map(Number); [r, g, b] = p; if (p.length > 3) a = p[3]; }
  const [h, s, l] = hsl(r, g, b);
  const alpha = a < 1 ? ' / ' + (+a.toFixed(3)) : '';
  const neutral = s < 15 || l > 96 || l < 6;
  const isText = /^(color|fill|stroke|caret-color|-webkit-text-fill-color|text-decoration-color)$/.test(prop);
  if (neutral) {
    if (l >= 97) {                                                    // white
      if (alpha) return `rgb(var(--white-rgb)${alpha})`;
      if (isText) return onBrand ? 'var(--on-brand)' : 'var(--white)';
      return light ? 'var(--bg)' : 'var(--white)';
    }
    if (l <= 3) return alpha ? `rgb(var(--black-rgb)${alpha})` : 'var(--black)';   // black
    if (alpha) return `rgb(var(--shadow-rgb)${alpha})`;
    if (isText) {
      if (dark) return l > 85 ? 'var(--ink)' : l > 60 ? 'var(--ink-2)' : 'var(--muted)';
      if (l <= 14) return 'var(--ink)';
      if (l <= 40) return 'var(--ink-2)';
      if (l <= 72) return 'var(--muted)';
      return 'rgb(var(--white-rgb) / .8)';                          // light grey text: on a dark photo or panel
    }
    if (dark) return l <= 9 ? 'var(--bg)' : l <= 16 ? 'var(--surface)' : l <= 40 ? 'var(--surface-2)' : 'var(--muted)';
    if (l >= 93) return 'var(--surface)';
    if (l >= 86) return 'var(--surface-2)';
    if (l >= 72) return 'var(--line)';
    if (l >= 40) return 'var(--muted)';
    if (l >= 16) return 'var(--night-2)';
    return 'var(--night)';
  }
  const fam = family(h, s, l);
  if (alpha) return fam === 'brand' || fam === 'danger' || fam === 'gold' ? `rgb(var(--${fam}-rgb)${alpha})` : `rgb(var(--gold-rgb)${alpha})`;
  if (l >= 85) return `var(--${fam === 'warning' ? 'gold' : fam}-soft)`;
  if (l <= 22) return 'var(--night)';
  return `var(--${fam})`;
}

// ---- walk the stylesheet: each declaration with the selector it belongs to ----
function snapFont(v) {
  const m = /^([\d.]+)px(\s*!important)?$/.exec(v.trim());
  if (!m) { if (!/var\(--fs|inherit|em$|%$/.test(v)) keep(stats.fsKept, v.trim()); return v; }
  const n = +m[1], imp = m[2] || '';
  let t;
  if (n < 10.5 || n > 40) { keep(stats.fsKept, v.trim()); return v; }
  else if (n < 13) t = 'xs'; else if (n < 15) t = 'sm'; else if (n < 17) t = 'md'; else if (n < 20) t = 'lg'; else if (n < 25) t = 'xl'; else if (n < 32) t = '2xl'; else t = '3xl';
  stats.fs++;
  return ` var(--fs-${t})${imp}`;
}
function snapRadius(v) {
  return v.replace(/(\d*\.?\d+)px/g, (all, n) => {
    n = +n;
    if (n < 6) { keep(stats.radiusKept, all); return all; }
    stats.radius++;
    return n < 10 ? 'var(--r-sm)' : n < 14 ? 'var(--r-md)' : n < 20 ? 'var(--r-lg)' : n < 32 ? 'var(--r-xl)' : 'var(--r-full)';
  });
}
const SPACE = { 4: 'var(--space-1)', 8: 'var(--space-2)', 12: 'var(--space-3)', 16: 'var(--space-4)', 24: 'var(--space-5)', 32: 'var(--space-6)', 48: 'var(--space-7)' };
function snapSpace(v) {
  return v.replace(/(-?)(\d*\.?\d+)px/g, (all, neg, n) => {
    n = +n;
    if (n < 4 || all.includes('calc')) return all;
    const q = Math.round(n / 4 + 1e-9) * 4 || 4;
    stats.space++;
    return SPACE[q] && !neg ? SPACE[q] : `${neg}${q}px`;
  });
}
function snapShadow(v) {
  const t = v.trim();
  if (/^(none|inherit|initial|unset)$/.test(t) || /inset|var\(--shadow/.test(t)) return v;
  // a ring (0 0 0 Npx) is an outline, not an elevation
  if (/(^|,)\s*0\s+0\s+0\s+[\d.]+px/.test(t)) return v;
  const blurs = [...t.matchAll(/(?:^|,)\s*-?[\d.]+(?:px)?\s+-?[\d.]+(?:px)?\s+([\d.]+)px/g)].map(m => +m[1]);
  if (!blurs.length) return v;
  stats.shadow++;
  return ' ' + (Math.max(...blurs) > 24 ? 'var(--shadow-2)' : 'var(--shadow-1)');
}
const COLOR_RE = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\([^)]*\)/g;

function transformDecls(block, selector) {
  const dark = /data-theme=["']?dark/.test(selector), light = /data-theme=["']?light/.test(selector);
  const onBrand = /background(-color)?\s*:\s*[^;]*(var\(--(accent|brand)\b|#0a8f62|#10b981|#059669|#00875a)/.test(block);
  return block.replace(/([a-z-]+)\s*:\s*([^;]+)(;?)/gi, (all, prop, value, semi) => {
    const p = prop.toLowerCase();
    if (p.startsWith('--') || /^(src|content|font-family|grid-template-areas)$/.test(p)) {
      // custom properties keep their own colour mapping (the tokens they refer to are mapped where they are used)
      if (!p.startsWith('--')) return all;
    }
    let v = value;
    // a whole Instagram gradient becomes the ring
    if (/gradient\(/.test(v) && IG.filter(c => v.toLowerCase().includes(c)).length >= 3) v = v.replace(/(repeating-)?(linear|radial|conic)-gradient\((?:[^()]|\([^()]*\))*\)/g, m => IG.filter(c => m.toLowerCase().includes(c)).length >= 3 ? 'var(--ring)' : m);
    v = v.replace(COLOR_RE, c => mapColour(c, { prop: p.startsWith('--') ? 'background' : p, dark, light, onBrand }));
    if (p === 'font-size') v = snapFont(v);
    if (p === 'border-radius' || /^border-(top|bottom)-(left|right)-radius$/.test(p)) v = snapRadius(v);
    if (p === 'box-shadow') v = snapShadow(v);
    if (/^(padding|margin|gap|row-gap|column-gap)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$/.test(p)) v = snapSpace(v);
    return `${prop}:${v.startsWith(' ') ? '' : ' '}${v.trimStart()}${semi}`;
  });
}

// split into top-level pieces, keeping comments and at-rules
let out = '', i = 0;
const stack = [];                // selectors of the blocks we are inside
let buf = '';
while (i < css.length) {
  if (css.startsWith('/*', i)) { const e = css.indexOf('*/', i) + 2; buf += css.slice(i, e); i = e; continue; }
  const c = css[i];
  if (c === '{') {
    const sel = buf.trim();
    out += buf + '{'; buf = ''; stack.push(sel); i++; continue;
  }
  if (c === '}') {
    const sel = stack.pop() || '';
    if (sel.startsWith('@')) out += buf;                         // nested rules were written as they closed
    else out += transformDecls(buf, [...stack, sel].join(' '));
    out += '}'; buf = ''; i++; continue;
  }
  buf += c; i++;
  // inside an at-rule block, a nested rule's selector starts after ; or } — flush declarations-free text as is
  if (stack.length && stack[stack.length - 1].startsWith('@') && (c === ';')) { out += buf; buf = ''; }
}
out += buf;
css = TOKENS + '\n' + out;

// ---- old token names ----
const RENAME = [['--accent-soft', '--brand-soft'], ['--on-accent', '--on-brand'], ['--accent-2', '--brand'], ['--accent', '--brand'], ['--violet-soft', '--brand-soft'], ['--violet', '--brand'],
  ['--ig-blue', '--brand'], ['--ig-grad', '--ring'], ['--raised', '--surface-2']];
for (const [a, b] of RENAME) css = css.split(`var(${a})`).join(`var(${b})`).split(`var(${a},`).join(`var(${b},`);
// radii: the old names meant other sizes (--r-lg 28 → --r-xl, --r 20 → --r-lg, --r-sm 14 → --r-md); the new block defines the new names
css = css.split('var(--r-lg)').join('var(--R-XL)').split('var(--r)').join('var(--r-lg)').split('var(--r-sm)').join('var(--r-md)').split('var(--R-XL)').join('var(--r-xl)');
fs.writeFileSync(FILE, css);

const top = m => [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(', ');
console.log(`colours mapped: ${stats.colours}\nfont sizes snapped: ${stats.fs}; left: ${top(stats.fsKept)}\nradii snapped: ${stats.radius}; left: ${top(stats.radiusKept)}\nshadows to the two levels: ${stats.shadow}\nspacing values on the 4px grid: ${stats.space}`);
