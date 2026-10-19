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
  out.push([lat.toFixed(5), lon.toFixed(5), kind, name.slice(0, 80), clean(f[iBn]).slice(0, 80), clean(f[iCat])].join('\t'));
}
out.sort();                                                                   // by latitude, so the server can bucket quickly
const body = 'lat\tlon\tkind\tname\tbn\tcat\n' + out.join('\n') + '\n';
writeFileSync('data/places-bd.tsv.gz', gzipSync(body, { level: 9 }));
console.log(out.length, 'places', tally, (gzipSync(body).length / 1e6).toFixed(1) + ' MB gz');
