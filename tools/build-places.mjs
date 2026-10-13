// Builds data/osm-places.json: named hospitals, parks, stations, campuses, sights, markets, airports and
// town/neighbourhood names for all of Bangladesh, from OpenStreetMap (via the Overpass API).
// Run from the project folder:  node tools/build-places.mjs
// Data © OpenStreetMap contributors (ODbL). Re-run now and then to pick up new places.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

// kind code -> Overpass filter
const KINDS = {
  h: '["amenity"="hospital"]',
  p: '["leisure"="park"]',
  r: '["railway"="station"]',
  b: '["amenity"="bus_station"]',
  u: '["amenity"="university"]',
  c: '["amenity"="college"]',
  a: '["tourism"~"^(attraction|museum|zoo|theme_park)$"]',
  m: '["amenity"="marketplace"]',
  l: '["shop"="mall"]',
  f: '["aeroway"="aerodrome"]',
  t: '["place"~"^(city|town|suburb|neighbourhood|quarter)$"]',
  o: '["tourism"~"^(hotel|guest_house|motel|resort)$"]'
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Each kind is cached after it downloads, so a failed run can simply be started again.
const CACHE_DIR = 'tools/.cache';
mkdirSync(CACHE_DIR, { recursive: true });

async function overpass(filter) {
  const query = `[out:json][timeout:180];area["ISO3166-1"="BD"][admin_level=2]->.bd;nwr${filter}["name"](area.bd);out center tags;`;
  for (let attempt = 0; attempt < 12; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'bd-map-build/1.0' },
        body: 'data=' + encodeURIComponent(query)
      });
      if (res.ok) {
        const data = await res.json();
        // A server-side timeout still answers 200, with a `remark` and no elements.
        if (!data.remark) return data.elements;
        console.log(`  ${url} -> ${data.remark.slice(0, 80)}, retrying`);
      } else console.log(`  ${url} -> HTTP ${res.status}, retrying`);
    } catch (e) {
      console.log(`  ${url} -> ${e.message}, retrying`);
    }
    await sleep(15000);
  }
  throw new Error('all Overpass servers failed for ' + filter);
}

const hasBangla = s => /[ঀ-৿]/.test(s);
const clean = s => (s || '').replace(/\s+/g, ' ').trim();

const rows = [], seen = new Set(), counts = {};
for (const [kind, filter] of Object.entries(KINDS)) {
  console.log('fetching', kind, filter);
  const cacheFile = `${CACHE_DIR}/${kind}.json`;
  let elements;
  if (existsSync(cacheFile)) elements = JSON.parse(readFileSync(cacheFile, 'utf8'));
  else {
    elements = await overpass(filter);
    writeFileSync(cacheFile, JSON.stringify(elements));
    await sleep(5000);
  }
  counts[kind] = 0;
  for (const e of elements) {
    const t = e.tags, lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    const name = clean(t.name);
    if (!name || lat == null) continue;
    const key = kind + '|' + name.toLowerCase() + '|' + lat.toFixed(2) + '|' + lon.toFixed(2);
    if (seen.has(key)) continue;
    seen.add(key);
    const bn = clean(t['name:bn']) || (hasBangla(name) ? name : '');
    const en = clean(t['name:en']) || (hasBangla(name) ? '' : name);
    // Optional details, mostly for hospitals: phone, emergency department, government/private, beds.
    const extra = {};
    const phone = clean(t.phone || t['contact:phone']);
    if (phone) extra.ph = phone.split(/[;,]/)[0].trim();
    if (t.emergency === 'yes') extra.em = 1;
    if (/government|public/.test(t['operator:type'] || '')) extra.gov = 1;
    if (/private/.test(t['operator:type'] || '')) extra.pvt = 1;
    if (/^\d+$/.test(t.beds || '')) extra.beds = +t.beds;
    // Hotels: star rating and website, when the map has them.
    if (/^[1-5]/.test(t.stars || '')) extra.st = +t.stars[0];
    const web = clean(t.website || t['contact:website']);
    if (kind === 'o' && /^https?:\/\//.test(web)) extra.web = web;
    const row = [kind, bn, en, +lat.toFixed(5), +lon.toFixed(5)];
    if (Object.keys(extra).length) row.push(extra);
    rows.push(row);
    counts[kind]++;
  }
  console.log('  kept', counts[kind]);
}

writeFileSync('data/osm-places.json', JSON.stringify(rows));
console.log('wrote data/osm-places.json', rows.length, 'places', counts);
