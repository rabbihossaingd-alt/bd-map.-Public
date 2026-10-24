// Small SVG charts, drawn by hand: a sparkline for the KPI cards, a line chart with values on hover, a bar chart.
import { day, num } from './fmt.js';
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, a = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };

export function sparkline(data, { w = 96, h = 28 } = {}) {
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, class: 'spark', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  if (!data || data.length < 2) return svg;
  const max = Math.max(1, ...data), min = Math.min(0, ...data), step = w / (data.length - 1);
  const y = v => h - 2 - (v - min) / (max - min || 1) * (h - 4);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
  svg.append(el('path', { d: `M0,${h} L${pts.join(' L')} L${w},${h} Z`, class: 'spark-fill' }), el('path', { d: 'M' + pts.join(' L'), class: 'spark-line' }));
  return svg;
}

// series: [{ name, data: [...], tone }], one value per day ending today
export function lineChart(series, { h = 180, days } = {}) {
  const box = document.createElement('div'); box.className = 'linechart';
  const n = Math.max(...series.map(s => s.data.length)), W = 600, H = h, padL = 34, padB = 22, padT = 10;
  const max = Math.max(1, ...series.flatMap(s => s.data));
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': series.map(s => s.name).join(', ') });
  const x = i => padL + i * (W - padL - 8) / Math.max(1, n - 1), y = v => padT + (H - padT - padB) * (1 - v / max);
  for (const f of [0, 0.5, 1]) { const yy = y(max * f); svg.append(el('line', { x1: padL, x2: W - 8, y1: yy, y2: yy, class: 'grid' })); const t = el('text', { x: padL - 6, y: yy + 4, class: 'axis', 'text-anchor': 'end' }); t.textContent = num(Math.round(max * f)); svg.append(t); }
  const dayOf = i => Date.now() - (n - 1 - i) * 864e5;
  for (const i of [0, Math.floor((n - 1) / 2), n - 1]) { const t = el('text', { x: x(i), y: H - 6, class: 'axis', 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }); t.textContent = day(days ? days[i] : dayOf(i)); svg.append(t); }
  for (const s of series) svg.append(el('path', { d: s.data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '), class: 'ln ' + (s.tone || '') }));
  const guide = el('line', { class: 'guide', y1: padT, y2: H - padB, x1: -10, x2: -10 }); svg.append(guide);
  const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true;
  svg.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(n - 1, Math.round((px - padL) / ((W - padL - 8) / Math.max(1, n - 1)))));
    guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i));
    tip.hidden = false; tip.replaceChildren();
    const d = document.createElement('b'); d.textContent = day(days ? days[i] : dayOf(i)); tip.append(d);
    for (const s of series) { const l = document.createElement('span'); l.className = 'k ' + (s.tone || ''); l.textContent = `${s.name}: ${num(s.data[i] || 0)}`; tip.append(l); }
    tip.style.left = Math.min(r.width - 140, Math.max(0, x(i) / W * r.width + 8)) + 'px';
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; guide.setAttribute('x1', -10); guide.setAttribute('x2', -10); });
  box.append(svg, tip);
  return box;
}

export function barChart(items, { tone = '' } = {}) {   // items: [[label, value]]
  const box = document.createElement('div'); box.className = 'barchart';
  const max = Math.max(1, ...items.map(i => i[1]));
  for (const [label, v] of items) {
    const row = document.createElement('div'); row.className = 'bar-row';
    const l = document.createElement('span'); l.textContent = label;
    const t = document.createElement('i'); t.className = tone; t.style.width = Math.max(2, v / max * 100) + '%';
    const n = document.createElement('b'); n.textContent = num(v);
    row.append(l, t, n); box.append(row);
  }
  return box;
}
