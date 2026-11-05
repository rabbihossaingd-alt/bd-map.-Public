// A place's details for the map's place card: opening hours, phone, website and address of every named place in
// OpenStreetMap's Bangladesh extract that has any of them. Reads the .osm.pbf Planetiler downloads
// (tools/build-tiles.mjs) with no extra packages and writes data/place-details.tsv.gz:
//   lat  lon  name  name:bn  name:en  opening_hours  phone  website  address
// Ways (buildings, campuses) are placed at the middle of their outline. Data © OpenStreetMap contributors, ODbL.
//   node tools/osm-details.mjs [path/to/bangladesh.osm.pbf]
import { openSync, readSync, fstatSync, writeFileSync } from 'node:fs';
import { inflateSync, gzipSync } from 'node:zlib';

const SRC = process.argv[2] || 'tools/.cache/tiles/data/sources/bangladesh.osm.pbf';
const OUT = 'data/place-details.tsv.gz';

// ---- protobuf, just what the format needs ----
function varint(buf, p) {                     // [value, next position]; Numbers are exact up to 2^53
  let v = 0, mul = 1, b;
  do { b = buf[p++]; v += (b & 0x7f) * mul; mul *= 128; } while (b & 0x80);
  return [v, p];
}
const zz = n => (n % 2 ? -(n + 1) / 2 : n / 2);          // zigzag (sint64)
function* fields(buf, start = 0, end = buf.length) {
  let p = start;
  while (p < end) {
    let key; [key, p] = varint(buf, p);
    const no = Math.floor(key / 8), wt = key & 7;
    if (wt === 0) { let v; [v, p] = varint(buf, p); yield [no, v]; }
    else if (wt === 2) { let len; [len, p] = varint(buf, p); yield [no, buf.subarray(p, p + len)]; p += len; }
    else if (wt === 1) { p += 8; } else if (wt === 5) { p += 4; } else throw new Error('wire type ' + wt);
  }
}
function packed(buf) { const out = []; let p = 0; while (p < buf.length) { let v; [v, p] = varint(buf, p); out.push(v); } return out; }

// ---- the file: blob after blob ----
function* blocks(file) {
  const fd = openSync(file, 'r'), size = fstatSync(fd).size, head = Buffer.alloc(4);
  let pos = 0;
  while (pos < size) {
    readSync(fd, head, 0, 4, pos); pos += 4;
    const hl = head.readUInt32BE(0), hb = Buffer.alloc(hl);
    readSync(fd, hb, 0, hl, pos); pos += hl;
    let type = '', dsize = 0;
    for (const [no, v] of fields(hb)) { if (no === 1) type = v.toString(); if (no === 3) dsize = v; }
    const blob = Buffer.alloc(dsize);
    readSync(fd, blob, 0, dsize, pos); pos += dsize;
    if (type !== 'OSMData') continue;
    let data = null;
    for (const [no, v] of fields(blob)) { if (no === 1) data = v; if (no === 3) data = inflateSync(v); }
    if (data) yield data;
  }
}
function parseBlock(data) {
  let strings = [], gran = 100, latOff = 0, lonOff = 0; const groups = [];
  for (const [no, v] of fields(data)) {
    if (no === 1) strings = [...fields(v)].filter(([n]) => n === 1).map(([, s]) => s.toString('utf8'));
    else if (no === 2) groups.push(v);
    else if (no === 17) gran = v; else if (no === 19) latOff = v; else if (no === 20) lonOff = v;
  }
  return { strings, gran, latOff, lonOff, groups };
}

const WANT = ['opening_hours', 'phone', 'contact:phone', 'contact:mobile', 'website', 'contact:website'];
const useful = t => t.name && WANT.some(k => t[k]);
const clean = s => String(s || '').replace(/[\t\n\r]+/g, ' ').trim();
const row = (lat, lon, t) => [lat.toFixed(6), lon.toFixed(6), clean(t.name), clean(t['name:bn']), clean(t['name:en']), clean(t.opening_hours).slice(0, 200),
  clean(t.phone || t['contact:phone'] || t['contact:mobile']).split(/[;,]/)[0].trim(), clean(t.website || t['contact:website']).slice(0, 200),
  [...new Set([[t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '), t['addr:suburb'] || t['addr:city']].filter(Boolean))].map(clean).join(', ').slice(0, 160)].join('\t');

// pass 1: tagged nodes straight away; ways remembered with their node ids
const out = [], ways = [], need = new Set();
let nNodes = 0;
for (const data of blocks(SRC)) {
  const { strings, gran, latOff, lonOff, groups } = parseBlock(data);
  for (const g of groups) for (const [no, v] of fields(g)) {
    if (no === 2) {                                         // dense nodes
      let ids = [], lats = [], lons = [], kv = [];
      for (const [n, x] of fields(v)) { if (n === 1) ids = packed(x); else if (n === 8) lats = packed(x); else if (n === 9) lons = packed(x); else if (n === 10) kv = packed(x); }
      let lat = 0, lon = 0, k = 0;
      for (let i = 0; i < ids.length; i++) {
        lat += zz(lats[i]); lon += zz(lons[i]); nNodes++;
        const t = {};
        while (k < kv.length && kv[k] !== 0) { t[strings[kv[k]]] = strings[kv[k + 1]]; k += 2; }
        k++;
        if (useful(t)) out.push(row(1e-9 * (latOff + gran * lat), 1e-9 * (lonOff + gran * lon), t));
      }
    } else if (no === 3) {                                  // a way
      let keys = [], vals = [], refs = [];
      for (const [n, x] of fields(v)) { if (n === 2) keys = packed(x); else if (n === 3) vals = packed(x); else if (n === 8) refs = packed(x); }
      const t = {};
      keys.forEach((kk, i) => { t[strings[kk]] = strings[vals[i]]; });
      if (!useful(t)) continue;
      let id = 0; const ids = refs.map(r => (id += zz(r)));
      const pick = ids.length > 12 ? ids.filter((_, i) => i % Math.ceil(ids.length / 12) === 0) : ids;
      for (const x of pick) need.add(x);
      ways.push([pick, t]);
    }
  }
}
console.log(`pass 1: ${nNodes} nodes, ${out.length} places as points, ${ways.length} as outlines`);
// pass 2: where the outlines' nodes are
const at = new Map();
for (const data of blocks(SRC)) {
  const { gran, latOff, lonOff, groups } = parseBlock(data);
  for (const g of groups) for (const [no, v] of fields(g)) {
    if (no !== 2) continue;
    let ids = [], lats = [], lons = [];
    for (const [n, x] of fields(v)) { if (n === 1) ids = packed(x); else if (n === 8) lats = packed(x); else if (n === 9) lons = packed(x); }
    let id = 0, lat = 0, lon = 0;
    for (let i = 0; i < ids.length; i++) {
      id += zz(ids[i]); lat += zz(lats[i]); lon += zz(lons[i]);
      if (need.has(id)) at.set(id, [1e-9 * (latOff + gran * lat), 1e-9 * (lonOff + gran * lon)]);
    }
  }
}
for (const [ids, t] of ways) {
  const pts = ids.map(i => at.get(i)).filter(Boolean);
  if (!pts.length) continue;
  out.push(row(pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length, t));
}
const text = 'lat\tlon\tname\tname_bn\tname_en\thours\tphone\twebsite\taddress\n' + out.join('\n') + '\n';
writeFileSync(OUT, gzipSync(text, { level: 9 }));
console.log(`${out.length} places with details → ${OUT} (${(gzipSync(text).length / 1024).toFixed(0)} KB)`);
