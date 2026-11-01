// OpenStreetMap's places (tools/.cache/osm-pois.json, from tools/osm-pois.py) added to the map's places
// (data/places-bd.tsv.gz, written by tools/overture-places.mjs from Overture). Overture is thin on some kinds in
// Bangladesh — in Oct 2026 it had 1,425 mosques and 184 filling stations, OSM 11,042 and 1,782 — so the "nearby"
// chips found little. A place OSM has is added unless the list already holds one of the same kind within 40 m, or
// with the same name within 150 m. Run after tools/overture-places.mjs (which rewrites the file from Overture alone).
//   node tools/add-osm-pois.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const FILE = 'data/places-bd.tsv.gz';
// OSM kind -> the map's badge kind and a category the chips understand (see CHIP_CATS in server.js)
const MAP = {
  mosque: ['worship', 'muslim_place_of_worship'], fuel: ['fuel', 'gas_station'], atm: ['bank', 'atm'], bank: ['bank', 'bank'],
  pharmacy: ['health', 'pharmacy'], hospital: ['health', 'hospital'], clinic: ['health', 'clinic'],
  school: ['learn', 'school'], college: ['learn', 'college'], university: ['learn', 'university'],
  restaurant: ['food', 'restaurant'], fast_food: ['food', 'fast_food_restaurant'], cafe: ['food', 'cafe'],
  market: ['shop', 'market'], supermarket: ['shop', 'supermarket'], mall: ['shop', 'shopping_mall'], hotel: ['stay', 'hotel'],
  bus_station: ['bus', 'bus_station'], police: ['civic', 'police_station'], fire_station: ['civic', 'fire_station'], post_office: ['civic', 'post_office']
};
const WORSHIP = { hindu: 'hindu_place_of_worship', christian: 'church', buddhist: 'buddhist_temple' };

const lines = gunzipSync(readFileSync(FILE)).toString('utf8').split('\n');
const head = lines.shift();
const rows = lines.filter(Boolean).map(l => l.split('\t'));
const before = rows.length;

const CELL = 250;                                        // ~400 m cells, to look only at neighbours
const cells = new Map();
const key = (la, lo) => Math.floor(la * CELL) + ':' + Math.floor(lo * CELL);
const add = r => { const k = key(+r[0], +r[1]); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(r); };
rows.forEach(add);
const km = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.hypot(x, y) * 6371; };
const simple = s => String(s || '').toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g, '');
const near = (la, lo) => { const out = [], cy = Math.floor(la * CELL), cx = Math.floor(lo * CELL); for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) out.push(...(cells.get(y + ':' + x) || [])); return out; };

const isBn = s => /[ঀ-৿]/.test(s || '');
const added = {}, skipped = {};
for (const [osm, name, en, bn, lat, lon, religion] of JSON.parse(readFileSync('tools/.cache/osm-pois.json', 'utf8'))) {
  const m = osm === 'worship' ? ['worship', WORSHIP[religion] || 'place_of_worship'] : MAP[osm];
  if (!m) continue;
  const [kind, cat] = m;
  const shown = en || (isBn(name) ? '' : name) || name;
  const bangla = bn || (isBn(name) ? name : '');
  const names = [simple(shown), simple(bangla)].filter(Boolean);
  const twin = near(lat, lon).find(r => {
    const d = km(lat, lon, +r[0], +r[1]);
    if (r[2] === kind && d < 0.04) return true;
    return d < 0.15 && names.some(n => n.length > 3 && (simple(r[3]) === n || simple(r[4]) === n));
  });
  if (twin) { skipped[osm] = (skipped[osm] || 0) + 1; continue; }
  const r = [lat.toFixed(5), lon.toFixed(5), kind, shown.replace(/[\t\n]/g, ' '), bangla.replace(/[\t\n]/g, ' '), cat];
  rows.push(r); add(r);
  added[osm] = (added[osm] || 0) + 1;
}
writeFileSync(FILE, gzipSync([head, ...rows.map(r => r.join('\t'))].join('\n') + '\n', { level: 9 }));
console.log(`${before} -> ${rows.length} places`);
console.log('added  ', JSON.stringify(added));
console.log('already', JSON.stringify(skipped));
