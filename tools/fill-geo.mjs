// Second pass after fill-images.mjs: a place still without a picture gets a Commons photo taken where the place is —
// a file whose own coordinates lie within 250 m of the place's (or within 1 km when its name carries a word of the place's
// name). Maps, logos and portraits are left out. Every pick is printed for review.  Run: node tools/fill-geo.mjs
import fs from 'node:fs';

const UA = { 'User-Agent': 'BDMap/1.0 (picture search; contact via github.com/rabbihossaingd-alt)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(q) {
  for (let i = 0; i < 6; i++) {
    try { const r = await fetch(`https://commons.wikimedia.org/w/api.php?format=json&formatversion=2&${q}`, { headers: UA }); if (r.ok) return r.json(); } catch { /* retry */ }
    await sleep(4000 * (i + 1));
  }
  throw new Error('commons');
}
const BAD_FILE = /map|locator|logo|flag|emblem|seal|diagram|chart|icon|selfie|portrait|signature|\.svg$|\.pdf$|\.tif|\.gif$/i;
const bnWords = s => (s || '').split(/[\s,()\-–]+/).filter(w => w.length >= 3 && !/জমিদার|বাড়ি|মসজিদ|মন্দির|নদী|সেতু/.test(w));

const GUIDE = new URL('../data/district-guide.json', import.meta.url);
const guide = JSON.parse(fs.readFileSync(GUIDE, 'utf8'));
// coordinates for places that have an article but no pin: the article's own (prop=coordinates), used for the search only
const need = [];
for (const g of Object.values(guide.guide)) for (const s of g.sights) if (!s.img && s.lat == null && s.page) need.push(s);
for (let i = 0; i < need.length; i += 40) {
  const part = need.slice(i, i + 40);
  let r;
  for (let k = 0; k < 6 && !r; k++) { try { const x = await fetch(`https://bn.wikipedia.org/w/api.php?format=json&formatversion=2&action=query&redirects=1&prop=coordinates&titles=${encodeURIComponent(part.map(s => s.page).join('|'))}`, { headers: UA }); if (x.ok) r = await x.json(); } catch { /* retry */ } if (!r) await sleep(4000); }
  const back = {}; for (const x of [...(r.query.redirects || []), ...(r.query.normalized || [])]) back[x.to] = x.from;
  const at = {}; for (const p of r.query.pages || []) if (p.coordinates) { at[p.title] = p.coordinates[0]; if (back[p.title]) at[back[p.title]] = p.coordinates[0]; }
  for (const s of part) if (at[s.page]) { s._lat = at[s.page].lat; s._lon = at[s.page].lon; }
  await sleep(700);
}
console.log('coordinates found for', need.filter(s => s._lat != null).length, 'of', need.length);
let found = 0, tried = 0;
for (const [id, g] of Object.entries(guide.guide)) for (const s of g.sights) {
  const lat = s.lat ?? s._lat, lon = s.lon ?? s._lon; delete s._lat; delete s._lon;
  if (s.img || lat == null) continue;
  tried++;
  const r = await api(`action=query&list=geosearch&gsnamespace=6&gslimit=40&gsradius=1000&gscoord=${lat}|${lon}`);
  await sleep(600);
  const files = (r.query.geosearch || []).map(x => ({ f: x.title.replace(/^File:/, ''), d: x.dist })).filter(x => !BAD_FILE.test(x.f) && /\.(jpe?g|png|webp)$/i.test(x.f));
  const keys = bnWords(s.name);
  const named = files.find(x => keys.some(k => x.f.includes(k)));
  const near = files.filter(x => x.d <= 250).sort((a, b) => a.d - b.d)[0];
  const pick = named || near;
  if (!pick) { console.log('  none ', id, s.name); continue; }
  const ii = await api(`action=query&prop=imageinfo&iiprop=url|size&iiurlwidth=960&titles=${encodeURIComponent('File:' + pick.f)}`);
  await sleep(500);
  const info = ii.query.pages[0].imageinfo && ii.query.pages[0].imageinfo[0];
  if (!info || info.width < 500) { console.log('  small', id, s.name, pick.f); continue; }
  s.file = pick.f; s.img = info.thumburl || info.url; s.imgFrom = 'commons-geo';
  found++; console.log('  geo  ', id, s.name, '->', pick.f, Math.round(pick.d) + 'm', named ? '(named)' : '');
  fs.writeFileSync(GUIDE, JSON.stringify(guide));
}
console.log('geo:', found, 'of', tried);
for (const g of Object.values(guide.guide)) for (const s of g.sights) { delete s._lat; delete s._lon; }
fs.writeFileSync(GUIDE, JSON.stringify(guide));
