// From tools/.cache/ub-match.json (made by ub-commons.mjs):
//  - places we already have get a gallery of the extra Commons photos;
//  - places we do not have are added: the name, the Commons photos, coordinates, and the opening of the Bangla
//    Wikipedia article when there is one about that very place (else no text). Pageviews rank them like the rest.
// Author and licence of every photo are read from Commons itself (extmetadata), not from the other site.
// Run: node tools/add-ub-places.mjs
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
const strip = s => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const GUIDE = new URL('../data/district-guide.json', import.meta.url);
const all = JSON.parse(fs.readFileSync(GUIDE, 'utf8')), guide = all.guide;
const { out, unmatched } = JSON.parse(fs.readFileSync(new URL('./.cache/ub-match.json', import.meta.url), 'utf8'));

// Commons: thumbnail, author, licence for many files at once
const info = {};
async function commons(files) {
  const need = [...new Set(files)].filter(f => !info[f]);
  for (let i = 0; i < need.length; i += 25) {
    const r = await api('commons.wikimedia.org', `action=query&prop=imageinfo&iiprop=url|size|extmetadata&iiextmetadatafilter=Artist|LicenseShortName&iiurlwidth=960&titles=${encodeURIComponent(need.slice(i, i + 25).map(f => 'File:' + f).join('|'))}`);
    const norm = {}; for (const n of r.query.normalized || []) norm[n.to] = n.from;
    for (const p of r.query.pages || []) {
      const ii = p.imageinfo && p.imageinfo[0];
      if (!ii || !ii.thumburl) continue;
      const m = ii.extmetadata || {}, name = (norm[p.title] || p.title).replace(/^File:/, '');
      info[name] = { img: ii.thumburl, w: ii.width, h: ii.height, by: strip((m.Artist || {}).value).slice(0, 80), lic: strip((m.LicenseShortName || {}).value) };
    }
    await sleep(2500);
  }
}
const OK_LIC = /^(CC BY(-SA)? [\d.]+|CC0|Public domain|PD|CC BY-SA [\d.]+ .*|GFDL.*)/i;
const shot = f => info[f] && OK_LIC.test(info[f].lic) ? { img: info[f].img, file: f, by: info[f].by, lic: info[f].lic } : null;

// 1) galleries for the places we have
const matched = Object.entries(out).flatMap(([d, xs]) => xs.map(x => ({ d, ...x })));
const unm = Object.entries(unmatched).flatMap(([d, xs]) => xs.map(x => ({ d, ...x })));
await commons([...matched, ...unm].flatMap(x => x.imgs.map(i => i.file)));
let galleries = 0, photos = 0;
for (const m of matched) {
  const s = guide[m.d].sights.find(x => x.name === m.ours);
  if (!s) continue;
  const g = m.imgs.map(i => shot(i.file)).filter(Boolean).filter(x => x.file !== s.file);
  if (!g.length) continue;
  s.gallery = g.slice(0, 8); galleries++; photos += s.gallery.length;
}
console.log('galleries', galleries, 'photos', photos);

// 2) new places: English title -> Bangla article (if it is about this place), coordinates, pageviews
const norm = s => (s || '').replace(/\(.*?\)/g, '').replace(/[\s\-–,।‌‍']/g, '').replace(/ী/g, 'ি').replace(/ূ/g, 'ু');
const words = s => (s || '').replace(/\(.*?\)/g, '').split(/[\s\-–,।()]+/).map(norm).filter(w => w.length >= 3 && !/জমিদার|বাড়ি|মসজিদ|মন্দির|সমুদ্র|সৈকত|জাতীয়|উদ্যান|পার্ক/.test(w));
const en = {};
for (let i = 0; i < unm.length; i += 40) {
  const part = unm.slice(i, i + 40).map(x => x.w);
  const r = await api('en.wikipedia.org', `action=query&redirects=1&prop=langlinks|coordinates&lllang=bn&titles=${encodeURIComponent(part.join('|'))}`);
  const back = {}; for (const x of [...(r.query.normalized || []), ...(r.query.redirects || [])]) back[x.to] = x.from;
  for (const p of r.query.pages || []) {
    let t = p.title; const keys = [t]; while (back[t]) { t = back[t]; keys.push(t); }
    for (const k of keys) en[k] = { bn: p.langlinks && p.langlinks[0].title, lat: p.coordinates && p.coordinates[0].lat, lon: p.coordinates && p.coordinates[0].lon };
  }
  await sleep(1500);
}
let added = 0, withText = 0;
for (const u of unm) {
  const g = guide[u.d] = guide[u.d] || { sights: [] };
  g.sights = g.sights || [];
  if (g.sights.some(s => norm(s.name) === norm(u.theirs))) continue;
  const shots = u.imgs.map(i => shot(i.file)).filter(Boolean);
  if (!shots.length) continue;
  const e = en[u.w] || {};
  const s = { name: u.theirs.replace(/\s*\(.*?\)\s*/g, ' ').trim(), page: null, text: '', views: 0, img: shots[0].img, file: shots[0].file, imgBy: shots[0].by, imgLic: shots[0].lic, gallery: shots.slice(1, 9), added: 'commons' };
  if (e.lat != null) { s.lat = e.lat; s.lon = e.lon; }
  // the Bangla article counts only if its title shares a distinctive word with the place's name
  if (e.bn && words(u.theirs).some(w => norm(e.bn).includes(w))) {
    const q = await api('bn.wikipedia.org', `action=query&redirects=1&prop=extracts|coordinates&exintro=1&explaintext=1&exchars=700&titles=${encodeURIComponent(e.bn)}`);
    const p = q.query.pages[0];
    if (p && !p.missing && p.extract) { s.page = p.title; s.text = p.extract.replace(/\s*\([^)]*\)/g, '').replace(/\n+/g, ' ').trim(); withText++; if (s.lat == null && p.coordinates) { s.lat = p.coordinates[0].lat; s.lon = p.coordinates[0].lon; } }
    await sleep(1200);
    if (s.page) {
      try {
        const end = new Date(), start = new Date(Date.now() - 60 * 864e5), f = d => d.toISOString().slice(0, 10).replace(/-/g, '');
        const v = await (await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/bn.wikipedia/all-access/user/${encodeURIComponent(s.page.replace(/ /g, '_'))}/daily/${f(start)}/${f(end)}`, { headers: UA })).json();
        s.views = (v.items || []).reduce((n, x) => n + x.views, 0);
      } catch { /* no views */ }
      await sleep(400);
    }
  }
  g.sights.push(s); added++;
  console.log('  +', u.d, s.name, s.page ? '(text)' : '', shots.length + ' photos', s.lat != null ? 'pin' : '');
}
for (const g of Object.values(guide)) if (g.sights) g.sights.sort((a, b) => (b.views || 0) - (a.views || 0));
fs.writeFileSync(GUIDE, JSON.stringify(all));
console.log('added', added, 'with text', withText);
