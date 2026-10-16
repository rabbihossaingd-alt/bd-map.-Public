// Finds a picture on Wikimedia Commons (free licences only) for places and GI products that have none.
// A file is taken only when its name carries a distinctive word of the place's or product's name (not a word like
// "mango" or "mosque" alone), and it is not a map, logo, flag or diagram. Every pick is printed for review.
// Run after build-guide.mjs / clean-guide.mjs / thumbs-guide.mjs and build-gi.mjs:  node tools/fill-images.mjs
import fs from 'node:fs';

const UA = { 'User-Agent': 'BDMap/1.0 (picture search; contact via github.com/rabbihossaingd-alt)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(host, q) {
  for (let i = 0; i < 6; i++) {
    try { const r = await fetch(`https://${host}/w/api.php?format=json&formatversion=2&${q}`, { headers: UA }); if (r.ok) return r.json(); } catch { /* retry */ }
    await sleep(4000 * (i + 1));
  }
  throw new Error(host);
}
const GENERIC = new Set(['mango', 'banana', 'rice', 'sweet', 'sweets', 'mishti', 'mosque', 'masjid', 'temple', 'mandir', 'bari', 'zamindar', 'house', 'palace', 'river', 'lake', 'park',
  'bangladesh', 'district', 'the', 'and', 'of', 'in', 'at', 'jame', 'shahi', 'national', 'museum', 'bridge', 'beach', 'sea', 'hill', 'falls', 'waterfall', 'tomb', 'mazar', 'shrine', 'fort', 'dighi',
  'saree', 'sari', 'gur', 'doi', 'cheese', 'honey', 'litchi', 'lichi', 'goods', 'clay', 'tiles', 'jackfruit', 'rajbari', 'memorial', 'monument', 'eco', 'garden', 'monastery', 'vihara', 'bihar']);
const BAD_FILE = /map|locator|logo|flag|emblem|seal|diagram|chart|icon|minister|certificate|ceremony|signing|geograph\.org\.uk|\.svg$|\.pdf$|\.tif/i;
const words = s => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !GENERIC.has(w));
const bnWords = s => (s || '').split(/[\s,()\-–]+/).filter(w => w.length >= 3);

async function commonsFor(names) {
  for (const name of names.filter(Boolean)) {
    const latin = /[a-z]/i.test(name), keys = latin ? words(name) : bnWords(name);
    if (!keys.length) continue;
    const r = await api('commons.wikimedia.org', `action=query&list=search&srnamespace=6&srlimit=15&srsearch=${encodeURIComponent(name)}`);
    await sleep(700);
    const files = (r.query.search || []).map(x => x.title.replace(/^File:/, '')).filter(f => !BAD_FILE.test(f) && /\.(jpe?g|png|webp)$/i.test(f));
    const hit = files.find(f => { const low = f.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, ''); return latin ? keys.some(k => low.includes(k)) : keys.some(k => f.includes(k)); });
    if (hit) return hit;
  }
  return '';
}
async function thumbOf(file, w) {
  const r = await api('commons.wikimedia.org', `action=query&prop=imageinfo&iiprop=url&iiurlwidth=${w}&titles=${encodeURIComponent('File:' + file)}`);
  await sleep(500);
  const p = r.query.pages[0];
  return p && p.imageinfo ? p.imageinfo[0].thumburl || p.imageinfo[0].url : '';
}
// The English name of a Bangla article (from its interlanguage link), the better word to search Commons with.
async function englishOf(bnTitles) {
  const out = {};
  for (let i = 0; i < bnTitles.length; i += 40) {
    const r = await api('bn.wikipedia.org', `action=query&redirects=1&prop=langlinks&lllang=en&titles=${encodeURIComponent(bnTitles.slice(i, i + 40).join('|'))}`);
    for (const p of r.query.pages || []) if (p.langlinks) out[p.title] = p.langlinks[0].title;
    await sleep(700);
  }
  return out;
}

const GUIDE = new URL('../data/district-guide.json', import.meta.url), GI = new URL('../data/gi-guide.json', import.meta.url);
const guide = JSON.parse(fs.readFileSync(GUIDE, 'utf8')), gi = JSON.parse(fs.readFileSync(GI, 'utf8'));
const famous = fs.readFileSync(new URL('../data/district-famous.js', import.meta.url), 'utf8');
const giEn = Object.fromEntries([...famous.matchAll(/\['[a-z]+', '([^']+)', '([^']+)', '[fp]', \d+\]/g), ...famous.matchAll(/\['([^']+)', '([^']+)', '[fp]', \d+\]/g)].map(m => [m[1], m[2]]));

// places
const missing = [];
if (process.argv[2] !== 'products') for (const [id, g] of Object.entries(guide.guide)) for (const s of g.sights) if (!s.img) missing.push({ id, s });
const en = await englishOf([...new Set(missing.map(m => m.s.page).filter(Boolean))]);
let found = 0;
for (const { id, s } of missing) {
  const file = await commonsFor([en[s.page], s.name, s.page]);
  if (!file) { console.log('  none   ', id, s.name); continue; }
  s.file = file; s.img = await thumbOf(file, 960); s.imgFrom = 'commons-search';
  found++; console.log('  place  ', id, s.name, '->', file);
  fs.writeFileSync(GUIDE, JSON.stringify(guide));
}
console.log('places:', found, 'of', missing.length);

// GI products (a product without an article gets an entry holding just its picture)
let gfound = 0, gmiss = 0;
for (const [bn, enName] of Object.entries(giEn)) {
  const st = gi[bn];
  if (st && st.img) continue;
  gmiss++;
  const file = await commonsFor([enName, bn, st && st.page]);
  if (!file) { console.log('  none   ', bn); continue; }
  const img = await thumbOf(file, 960);
  gi[bn] = { ...(st || { page: '', text: '', general: false }), img, file, imgFrom: 'commons-search' };
  gfound++; console.log('  product', bn, '->', file);
  fs.writeFileSync(GI, JSON.stringify(gi));
}
console.log('products:', gfound, 'of', gmiss);
