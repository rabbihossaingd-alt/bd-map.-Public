// A picture tied to the place itself, for places and GI products still without one: the Wikidata item's image (P18),
// else the English Wikipedia article's lead picture, else the first photo in the item's Commons category (P373).
// Each is the place's own, not a search hit. Every pick is printed for review.  Run: node tools/fill-wd.mjs
import fs from 'node:fs';

const UA = { 'User-Agent': 'BDMap/1.0 (picture fill; contact via github.com/rabbihossaingd-alt)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(host, q) {
  for (let i = 0; i < 6; i++) {
    try { const r = await fetch(`https://${host}/w/api.php?format=json&formatversion=2&${q}`, { headers: UA }); if (r.ok) return r.json(); } catch { /* retry */ }
    await sleep(4000 * (i + 1));
  }
  throw new Error(host);
}
const BAD_FILE = /map|locator|logo|flag|emblem|seal|diagram|chart|icon|signature|\.svg$|\.pdf$|\.tif|\.gif$/i;
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// bn title -> { qid, en }
async function itemsOf(titles) {
  const out = {};
  for (const part of chunk(titles, 40)) {
    const r = await api('bn.wikipedia.org', `action=query&redirects=1&prop=pageprops|langlinks&ppprop=wikibase_item&lllang=en&titles=${encodeURIComponent(part.join('|'))}`);
    const back = {};
    for (const x of [...(r.query.redirects || []), ...(r.query.normalized || [])]) back[x.to] = x.from;
    for (const p of r.query.pages || []) {
      const v = { qid: p.pageprops && p.pageprops.wikibase_item, en: p.langlinks && p.langlinks[0].title };
      out[p.title] = v; if (back[p.title]) out[back[p.title]] = v;
    }
    await sleep(700);
  }
  return out;
}
async function pictureOf({ qid, en }) {
  if (qid) {
    const r = await api('www.wikidata.org', `action=wbgetclaims&entity=${qid}`);
    await sleep(500);
    const c = r.claims || {};
    const p18 = (c.P18 || []).map(x => x.mainsnak.datavalue && x.mainsnak.datavalue.value).find(f => f && !BAD_FILE.test(f));
    if (p18) return { file: p18, how: 'wikidata' };
    if (en) {
      const e = await api('en.wikipedia.org', `action=query&redirects=1&prop=pageimages&piprop=name&titles=${encodeURIComponent(en)}`);
      await sleep(500);
      const f = e.query.pages[0] && e.query.pages[0].pageimage;
      if (f && !BAD_FILE.test(f)) return { file: f, how: 'enwiki' };
    }
    const cat = (c.P373 || []).map(x => x.mainsnak.datavalue && x.mainsnak.datavalue.value)[0];
    if (cat) {
      const m = await api('commons.wikimedia.org', `action=query&list=categorymembers&cmtype=file&cmlimit=30&cmtitle=${encodeURIComponent('Category:' + cat)}`);
      await sleep(500);
      const f = (m.query.categorymembers || []).map(x => x.title.replace(/^File:/, '')).find(f => !BAD_FILE.test(f) && /\.(jpe?g|png|webp)$/i.test(f));
      if (f) return { file: f, how: 'category' };
    }
  }
  return null;
}
async function thumbOf(file) {
  const r = await api('commons.wikimedia.org', `action=query&prop=imageinfo&iiprop=url|size&iiurlwidth=960&titles=${encodeURIComponent('File:' + file)}`);
  await sleep(500);
  const p = r.query.pages[0], i = p && p.imageinfo && p.imageinfo[0];
  return i && i.width >= 400 ? i.thumburl || i.url : '';
}

const only = process.argv[2];   // 'places' or 'products' to run one half
const GUIDE = new URL('../data/district-guide.json', import.meta.url), GI = new URL('../data/gi-guide.json', import.meta.url);
if (only !== 'products') {
  const guide = JSON.parse(fs.readFileSync(GUIDE, 'utf8'));
  const missing = [];
  for (const [id, g] of Object.entries(guide.guide)) for (const s of g.sights) if (!s.img && s.page) missing.push({ id, s });
  const items = await itemsOf([...new Set(missing.map(m => m.s.page))]);
  let n = 0;
  for (const { id, s } of missing) {
    const pic = items[s.page] && await pictureOf(items[s.page]);
    const img = pic && await thumbOf(pic.file);
    if (!img) { console.log('  none   ', id, s.name); continue; }
    Object.assign(s, { img, file: pic.file, imgFrom: pic.how }); n++;
    console.log('  place  ', id, s.name, '->', pic.file, `(${pic.how})`);
    fs.writeFileSync(GUIDE, JSON.stringify(guide));
  }
  console.log('places:', n, 'of', missing.length);
}
if (only !== 'places') {
  const gi = JSON.parse(fs.readFileSync(GI, 'utf8'));
  const missing = Object.entries(gi).filter(([, st]) => st && st.page && !st.img);
  const items = await itemsOf(missing.map(([, st]) => st.page));
  let n = 0;
  for (const [bn, st] of missing) {
    const pic = items[st.page] && await pictureOf(items[st.page]);
    const img = pic && await thumbOf(pic.file);
    if (!img) { console.log('  none   ', bn); continue; }
    Object.assign(st, { img, file: pic.file, imgFrom: pic.how }); n++;
    console.log('  product', bn, '->', pic.file, `(${pic.how})`);
    fs.writeFileSync(GI, JSON.stringify(gi));
  }
  console.log('products:', n, 'of', missing.length);
}
