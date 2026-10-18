// Second pass for places added by add-ub-places.mjs: coordinates from Wikidata (P625), a short Bangla description
// from Wikidata, and — when there is neither Bangla text nor description — the opening of the English Wikipedia
// article, marked as English. Articles about an upazila, union or district (not the place) are skipped.
// Run: node tools/fill-new-places.mjs
import fs from 'node:fs';
const UA = { 'User-Agent': 'BDMap/1.0 (guide build; contact via github.com/rabbihossaingd-alt)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(host, q) {
  for (let i = 0; i < 8; i++) {
    try { const r = await fetch(`https://${host}/w/api.php?format=json&formatversion=2&${q}`, { headers: UA }); if (r.ok) { const t = await r.text(); if (t.startsWith('{')) return JSON.parse(t); } } catch { /* retry */ }
    await sleep(6000 * (i + 1));
  }
  throw new Error(host);
}
const GUIDE = new URL('../data/district-guide.json', import.meta.url);
const all = JSON.parse(fs.readFileSync(GUIDE, 'utf8'));
const { unmatched } = JSON.parse(fs.readFileSync(new URL('./.cache/ub-match.json', import.meta.url), 'utf8'));
const titleOf = {};
for (const [d, xs] of Object.entries(unmatched)) for (const x of xs) titleOf[d + '|' + x.theirs.replace(/\s*\(.*?\)\s*/g, ' ').trim()] = x.w;
const NOT_PLACE = /\b(Upazila|Union|District|Division|Thana|Municipality|City Corporation|Sadar)\b/i;
const items = [];
for (const [d, g] of Object.entries(all.guide)) for (const s of g.sights || []) if (s.added === 'commons') { const w = titleOf[d + '|' + s.name]; if (w && !NOT_PLACE.test(w)) items.push({ s, w }); }
// English title -> Wikidata item and intro
const meta = {};
for (let i = 0; i < items.length; i += 20) {
  const part = items.slice(i, i + 20).map(x => x.w);
  const r = await api('en.wikipedia.org', `action=query&redirects=1&prop=pageprops|extracts&ppprop=wikibase_item&exintro=1&explaintext=1&exsentences=3&exlimit=20&titles=${encodeURIComponent(part.join('|'))}`);
  const back = {}; for (const x of [...(r.query.normalized || []), ...(r.query.redirects || [])]) back[x.to] = x.from;
  for (const p of r.query.pages || []) {
    if (p.missing) continue;
    let t = p.title; const v = { qid: p.pageprops && p.pageprops.wikibase_item, en: (p.extract || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim() };
    meta[t] = v; while (back[t]) { t = back[t]; meta[t] = v; }
  }
  await sleep(1500);
}
const qids = [...new Set(Object.values(meta).map(m => m.qid).filter(Boolean))], wd = {};
for (let i = 0; i < qids.length; i += 40) {
  const r = await api('www.wikidata.org', `action=wbgetentities&props=claims|descriptions&languages=bn|en&ids=${qids.slice(i, i + 40).join('|')}`);
  for (const [id, e] of Object.entries(r.entities || {})) {
    const c = ((e.claims || {}).P625 || [])[0], v = c && c.mainsnak.datavalue && c.mainsnak.datavalue.value;
    wd[id] = { lat: v && v.latitude, lon: v && v.longitude, bn: e.descriptions && e.descriptions.bn && e.descriptions.bn.value };
  }
  await sleep(1500);
}
let pins = 0, desc = 0, english = 0;
for (const { s, w } of items) {
  const m = meta[w]; if (!m) continue;
  const x = m.qid && wd[m.qid];
  if (s.lat == null && x && x.lat > 20.3 && x.lat < 26.8 && x.lon > 88 && x.lon < 92.8) { s.lat = Math.round(x.lat * 1e5) / 1e5; s.lon = Math.round(x.lon * 1e5) / 1e5; pins++; }
  if (!s.text && x && x.bn && x.bn.length > 8) { s.text = x.bn.replace(/^./, c => c); s.textFrom = 'wikidata'; desc++; }
  if (!s.text && m.en && m.en.length > 40) { s.text = m.en.slice(0, 520); s.textLang = 'en'; s.enPage = w; english++; }
}
fs.writeFileSync(GUIDE, JSON.stringify(all));
const a = Object.values(all.guide).flatMap(g => g.sights).filter(s => s.added === 'commons');
console.log({ checked: items.length, pins, desc, english, nowPinned: a.filter(s => s.lat != null).length, nowText: a.filter(s => s.text).length, of: a.length });
