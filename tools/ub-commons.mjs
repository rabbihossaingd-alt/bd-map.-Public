// Lists the Wikimedia Commons photos another Bangladesh travel site credits for its places (its places.json links
// every image to its Commons file page, with author and licence), and matches them to our places by name.
// Only the Commons files are used — they are free to reuse with credit; the other site's own text is not taken.
// Run: node tools/ub-commons.mjs  (needs tools/.cache/ub-places.json)
import fs from 'node:fs';
const ub = JSON.parse(fs.readFileSync(new URL('./.cache/ub-places.json', import.meta.url), 'utf8'));
const guide = JSON.parse(fs.readFileSync(new URL('../data/district-guide.json', import.meta.url), 'utf8')).guide;
const src = fs.readFileSync(new URL('../data/bangladesh.js', import.meta.url), 'utf8');
const D = [...src.matchAll(/\['([a-z]+)', '([^']+)', '([^']+)',/g)].map(m => ({ id: m[1], bn: m[2], en: m[3] }));
D.push({ id: 'coxsbazar', bn: 'কক্সবাজার', en: "Cox's Bazar" });
const key = v => v.toLowerCase().replace(/[^a-z]/g, '');
const byEn = k => D.find(d => d.en.split(' ').some(w => key(w) === key(k)) || key(d.en) === key(k) || d.id === key(k)) ||
  D.find(d => ({ kishorganj: 'kishoreganj', coxsbazar: 'coxsbazar', chittagong: 'chattogram', coxsbazar: 'coxsbazar', jhalokati: 'jhalokathi', netrokona: 'netrokona', chapainawabganj: 'chapainawabganj', comilla: 'cumilla', bogra: 'bogura', jessore: 'jashore', barisal: 'barishal', khagrachari: 'khagrachhari', maulvibazar: 'moulvibazar', narsingdi: 'narsingdi' })[k.toLowerCase().replace(/[^a-z]/g, '')] === d.id);
const norm = s => (s || '').replace(/\(.*?\)/g, '').replace(/[\s\-–,।‌‍]/g, '').replace(/ী/g, 'ি').replace(/ূ/g, 'ু').replace(/ড়/g, 'ড়').replace(/বাড়ী/g, 'বাড়ি');
const file = u => decodeURIComponent((u || '').split('/wiki/File:')[1] || '').replace(/_/g, ' ');
let spots = 0, withImg = 0;
const out = {}, unmatched = {};
for (const [key, dist] of Object.entries(ub)) {
  const d = byEn(key);
  if (!d) { console.error('no district for', key); continue; }
  const ours = (guide[d.id] || {}).sights || [];
  for (const sp of dist.spots || []) {
    spots++;
    const imgs = [sp.img, ...(sp.gal || [])].filter(x => x && /commons\.wikimedia\.org\/wiki\/File:/.test(x.src)).map(x => ({ file: file(x.src), by: x.by, lic: x.lic }));
    if (!imgs.length) continue;
    withImg++;
    const s = ours.find(o => norm(o.name) === norm(sp.n) || norm(o.page) === norm(sp.n)) ||
      ours.find(o => norm(sp.n).length > 3 && (norm(o.name).includes(norm(sp.n)) || norm(sp.n).includes(norm(o.name))));
    if (s) (out[d.id] = out[d.id] || []).push({ ours: s.name, theirs: sp.n, hadImg: !!s.img, imgs });
    else (unmatched[d.id] = unmatched[d.id] || []).push({ theirs: sp.n, w: sp.w || '', imgs });
  }
}
fs.writeFileSync(new URL('./.cache/ub-match.json', import.meta.url), JSON.stringify({ out, unmatched }, null, 1));
const m = Object.values(out).flat(), u = Object.values(unmatched).flat();
console.log({ spots, withImg, matched: m.length, matchedWithoutOurImg: m.filter(x => !x.hadImg).length, unmatched: u.length, photos: m.reduce((n, x) => n + x.imgs.length, 0) });
