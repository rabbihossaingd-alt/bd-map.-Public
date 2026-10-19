// tools/.cache/overture-places.parquet (from tools/overture-places.py) → data/places-bd.tsv.gz, the map's second
// layer of places. Keeps places inside Bangladesh that Overture is fairly sure of, sorts each into one of the map's
// badge kinds, and writes one line per place: lat, lon, kind, name, Bangla name, category.
// Run: node tools/overture-places.mjs   (asks DuckDB for a CSV of the parquet first, if there is none)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const csv = 'tools/.cache/overture-places.csv';
if (!existsSync(csv)) execFileSync('python', ['-c', `import duckdb; duckdb.sql("COPY (SELECT lat, lon, cat, basic, confidence, country, name, common['bn'] AS bn FROM 'tools/.cache/overture-places.parquet') TO '${csv}' (HEADER, DELIMITER '\\t', QUOTE '')")`], { stdio: 'inherit' });

const ring = JSON.parse(readFileSync('data/bd-outline.js', 'utf8').match(/=\s*(\[[\s\S]*\]);?/)[1]);
const inside = (x, y) => ring.some(r => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; });

// Overture category → the map's badge kinds (the same names as POI_KINDS in js/app.js)
const KINDS = [
  ['learn', /school|college|university|education|kindergarten|academy|library|madrasa|coaching|tutor|training/],
  ['health', /hospital|clinic|pharmacy|drugstore|doctor|dentist|medical|health|diagnostic|physician|optometrist|veterinar/],
  ['worship', /mosque|temple|church|religious|pagoda|shrine|place_of_worship|buddhist|hindu|islam/],
  ['food', /restaurant|cafe|coffee|tea|bakery|food|sweet|dessert|ice_cream|bar$|pub|juice|pizza|burger|biryani|kebab|catering/],
  ['stay', /hotel|resort|motel|guest_house|hostel|lodging|accommodation|cottage/],
  ['bank', /bank|atm|financial|insurance|money|mobile_banking|credit_union/],
  ['fuel', /gas_station|fuel|petrol|cng_station|ev_charging/],
  ['bus', /bus_station|bus_stop|transit|ferry|launch|boat_terminal/],
  ['rail', /train|railway|metro_station/],
  ['civic', /police|post_office|government|fire_station|courthouse|embassy|city_hall|public_service|community_center|ngo|non_profit/],
  ['sight', /museum|landmark|tourist|monument|historic|attraction|cinema|theatre|art_gallery|zoo|amusement/],
  ['green', /park|playground|stadium|sports|gym|fitness|field|garden|swimming|golf|lake|beach|recreation/],
  ['shop', /store|shop|market|mall|supermarket|grocery|retail|boutique|tailor|salon|barber|beauty|laundry|electronics|mobile_phone|hardware|furniture|clothing|jewelry|pharmacy|book|stationery|wholesale|bazaar/]
];
const kindOf = cat => (KINDS.find(([, re]) => re.test(cat || '')) || ['other'])[0];

// ---- Bangla names, learnt from OpenStreetMap (tools/.cache/osm-bn.tsv: type, name, name:bn, name:en from Overpass) ----
// A place gets a Bangla name only from evidence: the same name in OSM with its name:bn, or, word by word, from
// words OSM's own name pairs agree on (seen at least 3 times, one Bangla word ≥ 70% of the time). Numbers become
// Bangla digits. A name with any word not learnt this way stays in English — nothing is guessed.
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const norm = s => s.toLowerCase().replace(/[’'`.,()]/g, '').replace(/\s+/g, ' ').trim();
const latin = s => /^[\x20-\x7e]+$/.test(s);
const exact = new Map(), words = new Map();
if (existsSync('tools/.cache/osm-bn.tsv')) {
  const tally = (m, k, v) => { let c = m.get(k); if (!c) m.set(k, c = new Map()); c.set(v, (c.get(v) || 0) + 1); };
  for (const row of readFileSync('tools/.cache/osm-bn.tsv', 'utf8').split('\n').slice(1)) {
    const [, name, bn, en] = row.split('\t');
    const eng = latin(en || '') && en ? en : latin(name || '') ? name : '';
    if (!eng || !bn || !/[ঀ-৿]/.test(bn)) continue;
    tally(exact, norm(eng), bn.trim());
    const ew = norm(eng).split(' '), bw = bn.trim().replace(/[,()]/g, '').split(/\s+/);
    if (ew.length === bw.length) ew.forEach((w, i) => { if (/[a-z]/.test(w)) tally(words, w, bw[i]); });
  }
  const best = (c, min, share) => { const [[v, n]] = [...c].sort((a, b) => b[1] - a[1]); const all = [...c.values()].reduce((a, b) => a + b, 0); return n >= min && n / all >= share ? v : ''; };
  for (const [k, c] of exact) { const v = best(c, 1, 0.6); if (v) exact.set(k, v); else exact.delete(k); }
  for (const [k, c] of words) { const v = best(c, 3, 0.7); if (v) words.set(k, v); else words.delete(k); }
  console.log('learnt from OSM:', exact.size, 'names,', words.size, 'words');
}
function banglaName(name) {
  if (!latin(name)) return '';
  const n = norm(name);
  if (exact.has(n) && n.length >= 6 && n.includes(' ')) return exact.get(n);   // a short code like 'NFC' names many different places
  const out = [];
  for (const w of n.split(' ')) {
    if (/^\d+$/.test(w)) out.push(w.replace(/\d/g, d => BN_DIGITS[d]));
    else if (words.has(w)) out.push(words.get(w));
    else return '';
  }
  return out.join(' ');
}

const lines = readFileSync(csv, 'utf8').split('\n');
const head = lines.shift().split('\t'), col = n => head.indexOf(n);
const [iLat, iLon, iCat, iBasic, iConf, iCountry, iName, iBn] = ['lat', 'lon', 'cat', 'basic', 'confidence', 'country', 'name', 'bn'].map(col);
const clean = s => (s || '').replace(/[\t\n\r]+/g, ' ').trim();
const out = [], seen = new Set(), tally = {};
for (const line of lines) {
  if (!line) continue;
  const f = line.split('\t');
  const lat = +f[iLat], lon = +f[iLon], conf = +f[iConf], name = clean(f[iName]);
  if (!name || conf < 0.6) continue;                                        // Overture's own measure; below this many are junk or closed
  if (f[iCountry] && f[iCountry] !== 'BD') continue;
  if (!f[iCountry] && !inside(lon, lat)) continue;
  const key = name.toLowerCase() + '|' + lat.toFixed(4) + '|' + lon.toFixed(4);
  if (seen.has(key)) continue;
  seen.add(key);
  const kind = kindOf((f[iCat] || '') + ' ' + (f[iBasic] || ''));
  tally[kind] = (tally[kind] || 0) + 1;
  const bn = clean(f[iBn]) || banglaName(name);
  if (bn) tally.bangla = (tally.bangla || 0) + 1;
  out.push([lat.toFixed(5), lon.toFixed(5), kind, name.slice(0, 80), bn.slice(0, 80), clean(f[iCat])].join('\t'));
}
out.sort();                                                                   // by latitude, so the server can bucket quickly
const body = 'lat\tlon\tkind\tname\tbn\tcat\n' + out.join('\n') + '\n';
writeFileSync('data/places-bd.tsv.gz', gzipSync(body, { level: 9 }));
console.log(out.length, 'places', tally, (gzipSync(body).length / 1e6).toFixed(1) + ' MB gz');
