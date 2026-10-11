// ---- Shared logic: formatting, geography, fares, bus finding, network lookups. No UI state here. ----

const $ = id => document.getElementById(id);
// Numbers follow the chosen language: Bangla digits (১২৩) or English (123).
const NUM_LOCALE = LANG === 'en' ? 'en-US' : 'bn-BD';
const num = (n, digits = 0) => n.toLocaleString(NUM_LOCALE, { maximumFractionDigits: digits });
const taka = n => '৳' + num(Math.ceil(n));

function fmtMin(min) {
  min = Math.round(min);
  if (min < 60) return `${num(min)} মিনিট`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${num(h)} ঘণ্টা ${num(m)} মিনিট` : `${num(h)} ঘণ্টা`;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Line icons (24px grid, stroked). Static markup only — never interpolate user data here.
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="4.5" r="2.5"/><path d="M8.5 18H15a3.5 3.5 0 000-7H9a3.5 3.5 0 01-.5-6.5h7"/>',
  bus: '<rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 11h16M8 17v3M16 17v3M8 14h.01M16 14h.01"/>',
  send: '<path d="M3 11l18-8-8 18-2-8-8-2z"/>',
  tag: '<path d="M20 12l-8 8-9-9V3h8l9 9z"/><path d="M7.5 7.5h.01"/>',
  locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  swap: '<path d="M7 4v16M7 4l-3 3M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/>',
  'swap-h': '<path d="M4 8h16M20 8l-3-3M20 8l-3 3M20 16H4M4 16l3-3M4 16l3 3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  city: '<path d="M4 21V8l6-3v16M10 21V11l10-2v12M3 21h18M14 13h2M14 17h2M6.500 10h.01M6.500 14h.01"/>',
  car: '<path d="M4 16l2-6a2 2 0 012-1.400h8a2 2 0 012 1.400l2 6v3H4v-3z"/><path d="M7.500 16h.01M16.500 16h.01M6 19v1.500M18 19v1.500"/>',
  bike: '<circle cx="5.500" cy="16.500" r="3"/><circle cx="18.500" cy="16.500" r="3"/><path d="M5.500 16.500l4-7h5l4 7M9.500 9.500L8 7H6M14.500 9.500l1-2.500h2"/>',
  cng: '<path d="M4 16v-6a4 4 0 014-4h5l5 5v5"/><path d="M4 12h9V6"/><circle cx="7" cy="17" r="2"/><circle cx="16" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.5 3 3.5 15 0 18M12 3c-3.5 3-3.5 15 0 18"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
  cross: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>',
  pill: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l2-4M15 21l-2-4M9 14h.01M15 14h.01"/>',
  fuel: '<path d="M5 21V5a2 2 0 012-2h6a2 2 0 012 2v16M4 21h12M7 8h6M15 10h2a2 2 0 012 2v5a1.5 1.5 0 003 0V9l-3-3"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  tree: '<path d="M12 22v-7"/><path d="M12 3l5 7H7l5-7z"/><path d="M8.5 10L6 15h12l-2.5-5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.500l6.1-.9L12 3z"/>',
  bed: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 00-3-3h-7v5"/><circle cx="7" cy="11" r="1.5"/>',
  fork: '<path d="M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M17 3c-2 2-3 4-3 7h3v11"/>',
  bag: '<path d="M6 8h12l1 12H5L6 8z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
  moon: '<path d="M20 14.5A8 8 0 119.500 4a6.5 6.5 0 0010.5 10.5z"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5-10-5z"/><path d="M6 11.5V16c2 2 10 2 12 0v-4.5"/>',
  flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>'
};
const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
function ic(name) {
  const s = el('span', 'ic');
  s.innerHTML = svg(name);
  return s;
}

// ---- Geography ----
function haversineKm(a, b) {
  const rad = d => d * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
            Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const inZone = (pt, zone) => haversineKm(pt, zone) <= zone.r;

// District whose town is closest to the point (approximation of "which district is this").
function nearestDistrict(pt) {
  let best = null, bestKm = Infinity;
  for (const d of DISTRICTS) {
    const km = haversineKm(pt, d);
    if (km < bestKm) { best = d; bestKm = km; }
  }
  return best;
}

// ---- Spelling-tolerant matching: Bangla, English and Banglish all reduce to a consonant "key" ----
// Banglish has no fixed spelling (romna/ramna, sahabag/shahbag, medecel/medical), so words are compared by
// a key that keeps the consonant sounds and drops vowels, h, w, y and doubled letters.
function latinKey(w) {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '')
    .replace(/ph/g, 'f').replace(/sh/g, 's').replace(/ch/g, 'C').replace(/kh/g, 'k').replace(/gh/g, 'g')
    .replace(/th/g, 't').replace(/dh/g, 'd').replace(/bh/g, 'b').replace(/jh/g, 'j').replace(/ck/g, 'k')
    .replace(/g(?=[ei])/g, 'j').replace(/c/g, 'k').replace(/C/g, 'c').replace(/q/g, 'k').replace(/z/g, 'j')
    .replace(/v/g, 'b').replace(/x/g, 'ks').replace(/[aeiouwyh]/g, '').replace(/(.)\1+/g, '$1');
}

// Same idea for Bangla script: drop vowels and signs, fold letters people mix up (শ/ষ/স, ণ/ন, জ/য, aspirates).
const BN_FOLD = { 'শ': 'স', 'ষ': 'স', 'ণ': 'ন', 'ঞ': 'ন', 'য': 'জ', 'ড়': 'র', 'ঢ়': 'র', 'খ': 'ক', 'ঘ': 'গ', 'ছ': 'চ', 'ঝ': 'জ',
                  'ঠ': 'ট', 'ঢ': 'ড', 'থ': 'ত', 'ধ': 'দ', 'ভ': 'ব' };
function bnKey(w) {
  return w.normalize('NFC').replace(/[^ক-হড়-য়০-৯]/g, '').replace(/য়/g, '')
    .replace(/./g, ch => BN_FOLD[ch] || ch).replace(/(.)\1+/g, '$1');
}

const isBangla = s => /[ঀ-৿]/.test(s);
const splitWords = s => s.split(/[\s,()\/–-]+/).filter(Boolean);

// Cache the keys of a searchable item ({ bn, en }) on the item itself.
function keysOf(it) {
  if (!it._k) {
    const lat = splitWords(it.en).map(latinKey).filter(Boolean), bn = splitWords(it.bn).map(bnKey).filter(Boolean);
    it._k = { raw: (it.en + ' ' + it.bn).toLowerCase(), lat, bn, latJoin: lat.join(''), bnJoin: bn.join('') };
  }
  return it._k;
}

// 0 = no match, 3 = literal match, 2 = every typed word matches by key, 1 = matches when words are run together.
function matchScore(it, q) {
  const k = keysOf(it);
  if (k.raw.includes(q.toLowerCase())) return 3;
  const bangla = isBangla(q);
  const keys = bangla ? k.bn : k.lat, joined = bangla ? k.bnJoin : k.latJoin;
  const qk = splitWords(q).map(bangla ? bnKey : latinKey).filter(x => x.length >= 2);
  if (!qk.length || qk.join('').length < 3) return 0;
  if (qk.every(x => keys.some(c => c.startsWith(x)))) return 2;
  return qk.join('').length >= 4 && joined.includes(qk.join('')) ? 1 : 0;
}
const matches = (it, q) => matchScore(it, q) > 0;

// Instant suggestions from the app's own data: districts, bus stops, known places. Best matches first.
function searchLocal(q, limit = 8) {
  const out = [];
  const scan = (list, icon, sub) => {
    for (const it of list) {
      const score = matchScore(it, q);
      if (score) out.push({ score, icon, title: it.bn, sub: sub(it), lat: it.lat, lon: it.lon });
    }
  };
  scan(DISTRICTS, 'city', d => `জেলা · ${d.division} বিভাগ`);
  scan(Object.values(STOPS), 'bus', () => 'বাস স্টপ · ঢাকা');
  scan(PLACES, 'pin', p => p.kind);
  const own = out.length;
  // The nationwide index is searched last and ranks below the app's own entries at equal score.
  scan(OSM_INDEX, 'pin', p => `${KIND_LABELS[p.kind]} · ${nearestDistrict(p).bn}`);
  out.forEach((p, i) => { p.pri = i < own ? 0 : 1; });
  return out.sort((a, b) => b.score - a.score || a.pri - b.pri).slice(0, limit);
}

// ---- Nationwide place index (data/osm-places.json, built by tools/build-places.mjs from OpenStreetMap) ----
const KIND_LABELS = { h: 'হাসপাতাল', p: 'পার্ক', r: 'রেলস্টেশন', b: 'বাস স্ট্যান্ড', u: 'বিশ্ববিদ্যালয়', c: 'কলেজ',
                      a: 'দর্শনীয় স্থান', m: 'বাজার', l: 'শপিং মল', f: 'বিমানবন্দর', t: 'এলাকা' };
const TAG_KIND = { 'amenity:hospital': 'h', 'leisure:park': 'p', 'railway:station': 'r', 'amenity:bus_station': 'b',
                   'amenity:university': 'u', 'amenity:college': 'c', 'tourism:attraction': 'a', 'amenity:marketplace': 'm' };
let OSM_INDEX = [];
async function loadIndex() {
  try {
    const rows = await (await fetch('data/osm-places.json')).json();
    // row: [kind, Bangla name, English name, lat, lon, optional details]
    OSM_INDEX = rows.map(([kind, bn, en, lat, lon, x]) => ({ kind, bn: bn || en, en, lat, lon, x: x || {} }));
    addIndexNames(OSM_INDEX);
  } catch { /* the app works without it, through the online search */ }
  return OSM_INDEX.length;
}

// ---- Ratings ----
// Everyone's stars are kept by the server (see server.js). This device remembers its own choice so the
// stars stay filled in, and identifies itself with a random id — there are no accounts.
// Without the server (plain file hosting) ratings still work, but stay on this device only.
const RATE_KEY = 'bdmap.ratings', DEVICE_KEY = 'bdmap.device';
let SHARED = {};            // key -> [average, count] from the server
let RATINGS_ONLINE = false;

function getRatings() {
  try { return JSON.parse(localStorage.getItem(RATE_KEY)) || {}; } catch { return {}; }
}
const getRating = key => getRatings()[key] || 0;

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch { return 'anon-' + Math.random().toString(36).slice(2, 12); }
}

async function loadRatings() {
  try {
    const res = await fetch('api/ratings');
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) throw new Error('no api');
    SHARED = await res.json();
    RATINGS_ONLINE = true;
  } catch { RATINGS_ONLINE = false; }
  return RATINGS_ONLINE;
}

async function setRating(key, n) {
  const all = getRatings();
  if (n) all[key] = n; else delete all[key];
  try { localStorage.setItem(RATE_KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
  if (!RATINGS_ONLINE) return;
  try {
    const res = await fetch('api/ratings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                             body: JSON.stringify({ key, stars: n, device: deviceId() }) });
    if (!res.ok) return;
    const { avg, n: count } = await res.json();
    if (count) SHARED[key] = [avg, count]; else delete SHARED[key];
  } catch { /* offline: the device copy is kept, the shared average is unchanged */ }
}

// Average to sort and show by: everyone's when the server has it, otherwise this device's own stars.
const ratingScore = key => SHARED[key] ? SHARED[key][0] : getRating(key);
function ratingText(key) {
  if (SHARED[key]) return `★ ${num(SHARED[key][0], 1)} · ${num(SHARED[key][1])} জন`;
  return getRating(key) ? `★ ${num(getRating(key))} · আপনার` : '';
}
const placeKey = p => `place:${p.title}@${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;

// Five tappable stars (this device's rating) plus the shared average. Tapping the current value clears it.
function ratingStars(key, onChange) {
  const box = el('div', 'rate'), stars = el('div', 'stars'), info = el('span', 'rate-info');
  const paint = () => {
    [...stars.children].forEach((b, i) => b.classList.toggle('on', i < getRating(key)));
    info.textContent = ratingText(key) || 'এখনো রেটিং নেই';
  };
  for (let n = 1; n <= 5; n++) {
    const b = el('button');
    b.innerHTML = svg('star');
    b.setAttribute('aria-label', `${n} তারা`);
    b.addEventListener('click', async e => {
      e.stopPropagation();
      const done = setRating(key, getRating(key) === n ? 0 : n);
      paint();              // the stars respond at once; the average follows when the server answers
      await done;
      paint();
      if (onChange) onChange();
    });
    stars.appendChild(b);
  }
  box.append(stars, info);
  box.addEventListener('refresh', paint);
  paint();
  return box;
}

// Known spellings by key, so a Banglish query can be repaired before it goes to the online search
// ("dhaka medecel" -> "dhaka medical"). Earlier entries win, so list the standard spelling first.
let VOCAB = null;
function repairQuery(q) {
  if (!VOCAB) {
    VOCAB = { words: new Set(), byKey: new Map() };
    const names = [...DISTRICTS, ...Object.values(STOPS), ...PLACES].flatMap(it => splitWords(it.en));
    for (const w of [...COMMON_WORDS, ...names]) {
      const key = latinKey(w);
      VOCAB.words.add(w.toLowerCase());
      if (key.length >= 2 && !VOCAB.byKey.has(key)) VOCAB.byKey.set(key, w);
    }
  }
  return splitWords(q).map(w => {
    if (isBangla(w) || VOCAB.words.has(w.toLowerCase())) return w;
    return VOCAB.byKey.get(latinKey(w)) || w;
  }).join(' ');
}

// ---- Fares ----
// Which BRTA per-km rate applies to a trip between two points.
function busRule(a, b) {
  const { zones, bus } = FARES;
  if ((inZone(a, zones.dhakaMetro) && inZone(b, zones.dhakaMetro)) ||
      (inZone(a, zones.ctgMetro) && inZone(b, zones.ctgMetro))) return bus.metro;
  if (inZone(a, zones.dtca) && inZone(b, zones.dtca)) return bus.dtca;
  return bus.intercity;
}
const busFare = (rule, km) => Math.max(rule.min, km * rule.perKm);
const cngFare = km => FARES.cng.base + Math.max(0, km - FARES.cng.baseKm) * FARES.cng.perKm;
const rideFare = (r, km, min) => Math.max(r.min, r.base + km * r.perKm + min * r.perMin);
const operatorsBetween = (a, b) => OPERATORS.filter(o => o.districts.includes(a.id) && o.districts.includes(b.id));

// ---- Network lookups ----
async function searchNominatim(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&countrycodes=bd&limit=6&q=' + encodeURIComponent(q);
  const res = await fetch(url, { headers: { 'Accept-Language': 'bn,en' } });
  if (!res.ok) throw new Error('search failed');
  return (await res.json()).map(p => {
    const parts = p.display_name.split(',').map(s => s.trim());
    return { title: parts[0], sub: parts.slice(1, 4).join(', '), lat: +p.lat, lon: +p.lon };
  });
}

// Photon tolerates typos better than Nominatim; results are limited to Bangladesh.
async function searchPhoton(q) {
  const res = await fetch('https://photon.komoot.io/api/?limit=6&bbox=88.0,20.5,92.7,26.7&q=' + encodeURIComponent(q));
  if (!res.ok) throw new Error('search failed');
  const skip = ['toilets', 'bench', 'waste_basket', 'atm'];
  return (await res.json()).features
    .filter(f => f.properties.name && f.properties.countrycode === 'BD' && !skip.includes(f.properties.osm_value))
    .map(f => {
      const p = f.properties;
      const where = [p.street, p.district || p.locality, p.city || p.county, p.state].filter(Boolean);
      return { title: p.name, sub: [...new Set(where)].slice(0, 2).join(', '), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
    });
}

// Online place search: the repaired spelling first, then the text as typed; Nominatim as a fallback.
async function searchOnline(q) {
  const seen = new Set(), out = [];
  const add = list => {
    for (const p of list) {
      const key = p.title + '|' + p.lat.toFixed(3) + '|' + p.lon.toFixed(3);
      if (!seen.has(key)) { seen.add(key); out.push(p); }
    }
  };
  for (const variant of new Set([repairQuery(q), q])) {
    try { add(await searchPhoton(variant)); } catch { /* try the next source */ }
  }
  if (!out.length) {
    try { add(await searchNominatim(repairQuery(q))); } catch { /* offline or rate limited */ }
  }
  return out.slice(0, 6);
}

// Named places of one kind around a point (hospitals, parks, ATMs…), nearest first. Uses OpenStreetMap
// data through Photon, so it works anywhere in the country. Widens the radius once if little is found.
async function searchNearby(center, tag, radiusKm = 8) {
  // Kinds held in the nationwide index answer instantly and carry extra details (phone, emergency…).
  const kind = TAG_KIND[tag];
  if (kind && OSM_INDEX.length) {
    const local = OSM_INDEX.filter(p => p.kind === kind)
      .map(p => ({ title: p.bn, sub: '', lat: p.lat, lon: p.lon, x: p.x, km: haversineKm(center, p) }))
      .filter(p => p.km <= 30).sort((a, b) => a.km - b.km);
    if (local.length >= 5) return local.slice(0, 60);
  }
  const url = `https://photon.komoot.io/reverse?lat=${center.lat}&lon=${center.lon}&radius=${radiusKm}&limit=50&osm_tag=${encodeURIComponent(tag)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('nearby failed');
  const seen = new Set(), out = [];
  for (const f of (await res.json()).features) {
    const p = f.properties;
    if (!p.name || seen.has(p.name)) continue;
    seen.add(p.name);
    const lat = f.geometry.coordinates[1], lon = f.geometry.coordinates[0];
    const where = [...new Set([p.street, p.district || p.locality, p.city || p.county].filter(Boolean))].slice(0, 2).join(', ');
    out.push({ title: p.name, sub: where, lat, lon, x: {}, km: haversineKm(center, { lat, lon }) });
  }
  out.sort((a, b) => a.km - b.km);
  if (out.length < 5 && radiusKm < 30) return searchNearby(center, tag, 30);
  return out;
}

// ---- Photos: freely licensed pictures taken near a place, from Wikimedia Commons ----
// Commons only knows where a photo was taken, not what it shows, so photos whose file name mentions
// the place come first and the rest are capped. Each photo links to its Commons page for credit.
const photoCache = new Map();
// `radius` in metres: tight for a single place, wider for a whole town.
async function placePhotos(place, radius = 500, max = 6) {
  const key = place.lat.toFixed(4) + ',' + place.lon.toFixed(4);
  if (photoCache.has(key)) return photoCache.get(key);
  let photos = [];
  try {
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggsnamespace=6' +
      `&ggscoord=${place.lat}|${place.lon}&ggsradius=${radius}&ggslimit=20&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=500`;
    const pages = Object.values(((await (await fetch(url)).json()).query || {}).pages || {});
    // File names on Commons are mostly English, so a Bangla label also brings its English spelling when we know it.
    const known = [...DISTRICTS, ...Object.values(STOPS), ...PLACES].find(x => x.bn === place.label);
    const words = splitWords(place.label + (known ? ' ' + known.en : ''))
      .filter(w => (isBangla(w) ? bnKey(w) : latinKey(w)).length >= 3);
    photos = pages.sort((a, b) => a.index - b.index)
      .filter(p => /\.(jpe?g|png|webp)$/i.test(p.title) && p.imageinfo && p.imageinfo[0].thumburl)
      .map(p => {
        const info = p.imageinfo[0], name = p.title.replace(/^File:|\.\w+$/g, '');
        const file = { en: name, bn: name };
        // Small thumbnail for the strip; the viewer asks for the next standard size up.
        return { src: info.thumburl, big: info.thumburl.replace(/\/\d+px-/, '/960px-'), page: info.descriptionurl, name,
                 license: (info.extmetadata.LicenseShortName || {}).value || '',
                 named: words.some(w => matchScore(file, w) > 0) };
      });
    const named = photos.filter(p => p.named);
    photos = [...named, ...photos.filter(p => !p.named).slice(0, named.length ? 2 : 3)].slice(0, max);
  } catch { return []; }   // not cached, so a network hiccup does not hide the photos for good
  photoCache.set(key, photos);
  return photos;
}

const distText = km => km < 1 ? `${num(Math.round(km * 100) * 10)} মিটার` : `${num(km, 1)} কিমি`;
const fareRange = (lo, hi) => lo === hi ? taka(lo) : `${taka(lo)}–${num(hi)}`;

async function reverseName(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&lat=${lat}&lon=${lon}`,
      { headers: { 'Accept-Language': 'bn,en' } });
    const data = await res.json();
    return data.display_name ? data.display_name.split(',').slice(0, 2).join(',') : null;
  } catch { return null; }
}

async function getRoute(pts) {
  const coords = pts.map(p => `${p.lon},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes.length) throw new Error('no route');
  return data.routes[0];
}

// ---- Dhaka local buses ----
// Stop ids within walking range of a point, nearest first.
function nearStops(pt) {
  return Object.entries(STOPS)
    .map(([id, s]) => ({ id, d: haversineKm(pt, s) }))
    .filter(x => x.d <= FARES.bus.nearStopKm)
    .sort((a, b) => a.d - b.d)
    .map(x => x.id);
}

// Index on the route of the nearest of the given stops, or -1.
function boardIndex(route, nearIds) {
  for (const id of nearIds) {
    const k = route.stops.indexOf(id);
    if (k >= 0) return k;
  }
  return -1;
}

const segment = (route, i, j) => i < j ? route.stops.slice(i, j + 1) : route.stops.slice(j, i + 1).reverse();

// Distance is stop-to-stop straight lines scaled by a road factor; the stop coordinates are too
// approximate to route through on real roads without detours that would inflate the fare.
function legInfo(seg) {
  let km = 0;
  for (let k = 1; k < seg.length; k++) km += haversineKm(STOPS[seg[k - 1]], STOPS[seg[k]]);
  km *= FARES.bus.roadFactor;
  const rule = busRule(STOPS[seg[0]], STOPS[seg[seg.length - 1]]);
  const [slow, fast] = FARES.bus.localSpeedKmh;
  return { km, fare: busFare(rule, km), minFast: km / fast * 60, minSlow: km / slow * 60 };
}

function findDirect(nf, nt) {
  const out = [];
  for (const r of LOCAL_ROUTES) {
    const i = boardIndex(r, nf), j = boardIndex(r, nt);
    if (i < 0 || j < 0 || i === j) continue;
    const seg = segment(r, i, j);
    out.push({ legs: [{ r, seg, ...legInfo(seg) }] });
  }
  return out;
}

// One change of bus: route A from the start, route B to the destination, sharing a stop.
function findTransfer(nf, nt) {
  const out = [];
  for (const a of LOCAL_ROUTES) {
    const i = boardIndex(a, nf);
    if (i < 0) continue;
    for (const b of LOCAL_ROUTES) {
      const j = boardIndex(b, nt);
      if (j < 0 || a === b) continue;
      let best = null;
      a.stops.forEach((id, x) => {
        const y = b.stops.indexOf(id);
        if (y < 0 || x === i || y === j) return;
        const s1 = segment(a, i, x), s2 = segment(b, y, j);
        const l1 = legInfo(s1), l2 = legInfo(s2);
        if (!best || l1.km + l2.km < best.km) {
          best = { km: l1.km + l2.km, legs: [{ r: a, seg: s1, ...l1 }, { r: b, seg: s2, ...l2 }] };
        }
      });
      if (best) out.push(best);
    }
  }
  return out;
}

// Local bus options between two points inside the Dhaka area, shortest first. Empty when none.
function localTrips(from, to) {
  const dtca = FARES.zones.dtca;
  if (!inZone(from, dtca) || !inZone(to, dtca)) return [];
  const nf = nearStops(from), nt = nearStops(to);
  if (!nf.length || !nt.length) return [];
  let trips = findDirect(nf, nt);
  if (!trips.length) trips = findTransfer(nf, nt);
  const total = (t, key) => t.legs.reduce((sum, l) => sum + l[key], 0);
  for (const t of trips) {
    t.km = total(t, 'km');
    t.fare = total(t, 'fare');
    // One typical time: midpoint of the clear-road and jam estimates, to the nearest 5 minutes.
    t.min = Math.round((total(t, 'minFast') + total(t, 'minSlow')) / 10) * 5;
  }
  return trips.sort((a, b) => a.km - b.km);
}
