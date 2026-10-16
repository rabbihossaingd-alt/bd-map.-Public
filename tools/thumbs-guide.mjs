// Gives every picture in data/district-guide.json its real thumbnail address on Wikimedia's CDN
// (upload.wikimedia.org), as Bangla Wikipedia's API reports it: it knows Commons files and the wiki's own, and gives
// the original when a file is smaller than the width asked for. Run after build-guide.mjs and clean-guide.mjs.
import fs from 'node:fs';

const OUT = new URL('../data/district-guide.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const UA = { 'User-Agent': 'BDMap/1.0 (district guide build; contact via github.com/rabbihossaingd-alt)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(q) {
  for (let i = 0; i < 6; i++) {
    try { const r = await fetch('https://bn.wikipedia.org/w/api.php?format=json&formatversion=2&' + q, { headers: UA }); if (r.ok) return r.json(); } catch { /* retry */ }
    await sleep(4000 * (i + 1));
  }
  throw new Error('wiki');
}
const want = new Map();                                       // file -> width
for (const g of Object.values(data.guide)) {
  if (g.file) want.set(g.file, 1200);
  for (const s of g.sights || []) if (s.file && !want.has(s.file)) want.set(s.file, 900);
}
const urls = new Map();
for (const width of [1200, 900]) {
  const files = [...want].filter(([, w]) => w === width).map(([f]) => f);
  for (let i = 0; i < files.length; i += 50) {
    const q = await get(`action=query&prop=imageinfo&iiprop=url&iiurlwidth=${width}&titles=${encodeURIComponent(files.slice(i, i + 50).map(f => 'File:' + f).join('|'))}`);
    const norm = new Map((q.query.normalized || []).map(n => [n.to, n.from]));
    for (const p of q.query.pages || []) {
      const info = p.imageinfo && p.imageinfo[0];
      const asked = (norm.get(p.title) || p.title).replace(/^(File|ফাইল|চিত্র):/, '');
      if (info) urls.set(asked, info.thumburl || info.url);
    }
    await sleep(800);
  }
}
let set = 0, missing = 0;
const pick = file => { const u = urls.get(file) || urls.get(file.replace(/_/g, ' ')); if (u) set++; else missing++; return u || ''; };
for (const g of Object.values(data.guide)) {
  if (g.file) g.img = pick(g.file);
  for (const s of g.sights || []) if (s.file) s.img = pick(s.file);
}
fs.writeFileSync(OUT, JSON.stringify(data));
console.log('pictures', set, 'without a file found', missing);
