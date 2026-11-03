// Adds the photographer and the licence of every district cover and sight photo in data/district-guide.json,
// read from Commons itself (extmetadata): the tour poster prints them, as CC BY and CC BY-SA ask.
// Writes g.fileBy / g.fileLic on a district (its cover) and s.imgBy / s.imgLic on a sight that lacks them.
// Run: node tools/add-photo-credits.mjs
import fs from 'node:fs';
const UA = { 'User-Agent': 'Manzeela/1.0 (photo credits; help@manzeela.com)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(q) {
  for (let i = 0; i < 8; i++) {
    try { const r = await fetch(`https://commons.wikimedia.org/w/api.php?format=json&formatversion=2&${q}`, { headers: UA }); if (r.ok) { const t = await r.text(); if (t.startsWith('{')) return JSON.parse(t); } } catch { /* again */ }
    await sleep(5000 * (i + 1));
  }
  throw new Error('commons');
}
const strip = s => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const GUIDE = new URL('../data/district-guide.json', import.meta.url);
const all = JSON.parse(fs.readFileSync(GUIDE, 'utf8')), guide = all.guide;

const want = new Set();
for (const g of Object.values(guide)) {
  if (g.file) want.add(g.file);
  for (const s of g.sights || []) if (s.file && !s.imgBy) want.add(s.file);
}
const info = {}, files = [...want];
for (let i = 0; i < files.length; i += 40) {
  const r = await api(`action=query&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=Artist|LicenseShortName&titles=${encodeURIComponent(files.slice(i, i + 40).map(f => 'File:' + f).join('|'))}`);
  const norm = {}; for (const n of r.query.normalized || []) norm[n.to] = n.from;
  for (const p of r.query.pages || []) {
    const ii = p.imageinfo && p.imageinfo[0];
    if (!ii) continue;
    const m = ii.extmetadata || {}, name = (norm[p.title] || p.title).replace(/^File:/, '');
    info[name] = { by: strip((m.Artist || {}).value).slice(0, 80), lic: strip((m.LicenseShortName || {}).value).slice(0, 40) };
  }
  process.stdout.write(`\r${Math.min(i + 40, files.length)}/${files.length}`);
  await sleep(1500);
}
let covers = 0, sights = 0;
for (const g of Object.values(guide)) {
  const c = g.file && info[g.file];
  if (c) { g.fileBy = c.by; g.fileLic = c.lic; covers++; }
  for (const s of g.sights || []) {
    const x = s.file && !s.imgBy && info[s.file];
    if (x) { s.imgBy = x.by; s.imgLic = x.lic; sights++; }
  }
}
fs.writeFileSync(GUIDE, JSON.stringify(all));
console.log(`\ncovers credited: ${covers}/${Object.keys(guide).length}, sights credited: ${sights}`);
