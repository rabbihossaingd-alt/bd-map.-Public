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
  chev: '<path d="M9 5l7 7-7 7"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 010 6M18.500 6.500a8 8 0 010 11"/>',
  clip: '<path d="M20 11.500l-8 8a5 5 0 01-7-7l8.500-8.500a3.300 3.300 0 014.700 4.700L9.800 17a1.700 1.700 0 01-2.400-2.400L15 7"/>',
  file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
  share: '<path d="M4 12l16-8-6 16-3-7-7-1z"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
  text: '<path d="M5 6h14M12 6v13M9 19h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.500 1.500M17.500 17.500L19 19M19 5l-1.500 1.500M6.500 17.500L5 19"/>',
  moon2: '<path d="M20 14.500A8 8 0 019.500 4a8 8 0 1010.500 10.500z"/>',
  heart: '<path d="M12 20s-7-4.400-7-10a4 4 0 017-2.600A4 4 0 0119 10c0 5.600-7 10-7 10z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.500"/><rect x="13" y="4" width="7" height="7" rx="1.500"/><rect x="4" y="13" width="7" height="7" rx="1.500"/><rect x="13" y="13" width="7" height="7" rx="1.500"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.300l2-1.500-2-3.400-2.300.900a7 7 0 00-2.200-1.300L14 3h-4l-.400 2.400a7 7 0 00-2.200 1.300l-2.300-.900-2 3.400 2 1.500A7 7 0 005 12c0 .400 0 .900.100 1.300l-2 1.500 2 3.400 2.300-.900c.600.600 1.400 1 2.200 1.300L10 21h4l.400-2.400c.800-.300 1.600-.700 2.200-1.300l2.300.900 2-3.400-2-1.500c.100-.400.100-.900.100-1.300z"/>',
  logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
  trash: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  bell: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4l2-2zM10 20a2 2 0 004 0"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01"/>',
  chat: '<path d="M21 12a8 8 0 01-11.8 7L4 20l1.2-4.6A8 8 0 1121 12z"/>',
  send: '<path d="M4 12l16-8-6 16-3-7-7-1z"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
  video: '<rect x="3" y="6" width="12" height="12" rx="3"/><path d="M15 10l6-3v10l-6-3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  userplus: '<circle cx="10" cy="8" r="4"/><path d="M2 21c0-4.4 3.6-7 8-7 1.5 0 2.9.3 4 .9M19 14v6M16 17h6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  more: '<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>',
  ship: '<path d="M3 17l2 4h14l2-4-9-3-9 3z"/><path d="M6 15.5V9h12v6.5M12 3v6M9 9V6h6v3"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
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
  flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  wallet: '<path d="M4 7a2 2 0 012-2h11v4"/><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M16 13.5h2"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M9 9h4.5a2 2 0 010 4H9h5a2 2 0 010 4H9M11 7v2M11 17v-0"/>',
  reply: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 016 6v5"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 007 0M9 9.5h.01M15 9.5h.01"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14a6.5 6.5 0 013.5 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  bellOff: '<path d="M6 16v-5a6 6 0 019.5-4.9M18 11v5l2 2H8M10 20a2 2 0 004 0M3 3l18 18"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  verified: '<path d="M12.00 2.65Q15.43 -0.82 16.67 3.90Q21.38 2.62 20.10 7.33Q24.82 8.57 21.35 12.00Q24.82 15.43 20.10 16.67Q21.38 21.38 16.67 20.10Q15.43 24.82 12.00 21.35Q8.57 24.82 7.33 20.10Q2.62 21.38 3.90 16.68Q-0.82 15.43 2.65 12.00Q-0.82 8.57 3.90 7.32Q2.62 2.62 7.32 3.90Q8.57 -0.82 12.00 2.65Z"/><path d="M8.3 12.3l2.5 2.5 5-5.2"/>'
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
// Among results that match equally well, the better known place comes first. "Known" is worked out from
// the data itself: a district town, then a bus stop by how many routes use it, then a curated place, then
// the nationwide index by the kind of place (an airport or a neighbourhood before a market or a hotel).
function searchLocal(q, limit = 8) {
  const out = [], low = q.toLowerCase();
  const scan = (list, icon, sub, pop) => {
    for (const it of list) {
      const score = matchScore(it, q);
      if (!score) continue;
      // A name that begins with what was typed beats one where a later word does, which beats the rest.
      const en = (it.en || '').toLowerCase();
      const starts = it.bn.startsWith(q) || en.startsWith(low) ? 2
                   : it.bn.split(' ').some(w => w.startsWith(q)) || en.split(' ').some(w => w.startsWith(low)) ? 1 : 0;
      out.push({ score, starts, pop: pop(it), icon, title: it.bn, sub: sub(it), lat: it.lat, lon: it.lon });
    }
  };
  stopUse();
  scan(DISTRICTS, 'city', d => `জেলা · ${d.division} বিভাগ`, d => d.bn === d.division ? 1000 : 900);
  scan(Object.values(STOPS), 'bus', () => 'বাস স্টপ · ঢাকা', s => 300 + 6 * (s.use || 0));
  scan(PLACES, 'pin', p => p.kind, () => 500);
  scan(OSM_INDEX, 'pin', p => `${KIND_LABELS[p.kind]} · ${nearestDistrict(p).bn}`, p => KIND_POP[p.kind] || 100);
  return out.sort((a, b) => b.score - a.score || b.starts - a.starts || b.pop - a.pop).slice(0, limit);
}
const KIND_POP = { f: 450, t: 400, r: 350, u: 330, a: 320, l: 300, h: 280, b: 260, p: 250, m: 200, c: 180, o: 150 };

// How many bus routes call at each stop (kept on the stop as `use`), counted once.
let stopsCounted = false;
function stopUse() {
  if (stopsCounted) return;
  stopsCounted = true;
  for (const r of LOCAL_ROUTES) for (const id of new Set(r.stops)) STOPS[id].use = (STOPS[id].use || 0) + 1;
}
const busiestStops = n => (stopUse(), Object.values(STOPS).sort((a, b) => b.use - a.use).slice(0, n));

// What an empty search box offers: the busiest bus stops in Dhaka and the most travelled-to cities.
function popularPlaces() {
  const stops = busiestStops(5).map(s => ({ icon: 'bus', title: s.bn, sub: `বাস স্টপ · ${num(s.use)} টি বাস`, lat: s.lat, lon: s.lon }));
  const cities = ['chattogram', 'coxsbazar', 'sylhet'].map(districtById).map(d => ({ icon: 'city', title: d.bn, sub: `জেলা · ${d.division} বিভাগ`, lat: d.lat, lon: d.lon }));
  return [...stops, ...cities];
}

// ---- Nationwide place index (data/osm-places.json, built by tools/build-places.mjs from OpenStreetMap) ----
const KIND_LABELS = { o: 'হোটেল', h: 'হাসপাতাল', p: 'পার্ক', r: 'রেলস্টেশন', b: 'বাস স্ট্যান্ড', u: 'বিশ্ববিদ্যালয়', c: 'কলেজ',
                      a: 'দর্শনীয় স্থান', m: 'বাজার', l: 'শপিং মল', f: 'বিমানবন্দর', t: 'এলাকা' };
const TAG_KIND = { 'tourism:hotel': 'o', 'amenity:hospital': 'h', 'leisure:park': 'p', 'railway:station': 'r', 'amenity:bus_station': 'b',
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
// `at` is where the ride starts: some rates differ by city.
function rideFare(r, km, min, at) {
  const city = at && r.cities && Object.keys(r.cities).find(z => inZone(at, FARES.zones[z]));
  const rate = city ? { ...r, ...r.cities[city] } : r;
  return Math.max(rate.min, rate.base + km * rate.perKm + min * rate.perMin);
}
// BRTA's chart fare between Dhaka and a district, when the chart has it.
function officialFare(a, b) {
  const other = a.id === 'dhaka' ? b : b.id === 'dhaka' ? a : null;
  const f = other && BRTA_FARES[other.id];
  return f ? { terminal: TERMINALS[f[0]], km: f[1], f51: f[2], f40: f[3] } : null;
}
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
// What each category really means in OpenStreetMap. One tag is rarely the whole story: an ATM is often a bank
// with atm=yes, a mosque is a place of worship whose religion is muslim, a clinic is tagged apart from a hospital.
const NEARBY_FILTERS = {
  'amenity:hospital': ['[amenity~"^(hospital|clinic)$"]'],
  'amenity:pharmacy': ['[amenity=pharmacy]', '[shop=chemist]'],
  'amenity:atm': ['[amenity=atm]', '[amenity=bank][atm=yes]'],
  'amenity:place_of_worship': ['[amenity=place_of_worship][religion=muslim]'],
  'amenity:restaurant': ['[amenity~"^(restaurant|fast_food|cafe)$"]'],
  'amenity:marketplace': ['[amenity=marketplace]', '[shop~"^(supermarket|mall|department_store)$"]'],
  'railway:station': ['[railway~"^(station|halt)$"]'],
  'tourism:hotel': ['[tourism~"^(hotel|guest_house|motel|resort)$"]'],
  'tourism:attraction': ['[tourism~"^(attraction|museum|viewpoint|zoo|theme_park)$"]', '[historic~"."]'],
  'leisure:park': ['[leisure~"^(park|garden|playground)$"]']
};
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

// Everything of one category within `metres` of a point, straight from OpenStreetMap (Overpass API). The public
// servers are often busy, so both are asked at once and whichever answers first wins; none within 9 s is a failure.
function overpassNear(center, tag, metres) {
  const [k, v] = tag.split(':');
  const filters = NEARBY_FILTERS[tag] || [`[${k}=${v}]`];
  const q = `[out:json][timeout:8];(${filters.map(f => `nwr${f}(around:${metres},${center.lat},${center.lon});`).join('')});out center tags 220;`;
  return Promise.any(OVERPASS.map(async base => {
    const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 9000);
    try {
      const res = await fetch(base, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: stop.signal });
      if (!res.ok) throw new Error('busy');
      return (await res.json()).elements;
    } finally { clearTimeout(timer); }
  }));
}

function placeFromOsm(e, center, tag) {
  const t = e.tags || {}, lat = e.lat ?? (e.center && e.center.lat), lon = e.lon ?? (e.center && e.center.lon);
  let name = LANG === 'en' ? t['name:en'] || t.name : t['name:bn'] || t.name || t['name:en'];
  const who = t.operator || t.brand;
  if (!name && who && tag === 'amenity:atm') name = `${who} এটিএম`;
  if (!name && who && tag === 'amenity:fuel') name = who;
  if (!name || lat == null) return null;
  const x = {};
  const phone = t.phone || t['contact:phone'] || t['contact:mobile'];
  if (phone) x.ph = phone.split(/[;,]/)[0].trim();
  if (t.emergency === 'yes') x.em = 1;
  if (t.opening_hours) x.hours = t.opening_hours;
  if (t.website || t['contact:website']) x.web = t.website || t['contact:website'];
  if (t.amenity === 'clinic') x.kind = 'ক্লিনিক';
  if (t.amenity === 'bank' && tag === 'amenity:atm') x.kind = 'ব্যাংকের ভেতরে';
  if (tag === 'amenity:fuel' && (t['fuel:cng'] === 'yes' || t['fuel:lpg'] === 'yes')) x.kind = t['fuel:cng'] === 'yes' ? 'সিএনজি আছে' : 'এলপিজি আছে';
  if (t['operator:type'] === 'government' || t['operator:type'] === 'public') x.gov = 1;
  if (t.beds > 0) x.beds = +t.beds;
  if (t.stars > 0) x.st = +t.stars;
  const where = [...new Set([t['addr:street'], t['addr:suburb'] || t['addr:city']].filter(Boolean))].join(', ');
  return { title: name, sub: where, lat, lon, x, km: haversineKm(center, { lat, lon }) };
}

// The older, thinner source: used only when Overpass cannot be reached.
async function photonNear(center, tag, radiusKm) {
  const res = await fetch(`https://photon.komoot.io/reverse?lat=${center.lat}&lon=${center.lon}&radius=${radiusKm}&limit=50&osm_tag=${encodeURIComponent(tag)}`);
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
  return out;
}

// The nearest places of one category, in two steps so the list never waits on a slow server:
//  1. at once — the app's own index, or the Photon search, whichever knows this category;
//  2. a little later, if the live OpenStreetMap server answers — everything within 3 km with its details
//     (phone, opening hours, clinic or hospital, mosque rather than any place of worship). `onMore` is then
//     called with the fuller list.
const MOSQUE = /মসজিদ|masjid|mosque|mosjid|jame|জামে/i;
function mergePlaces(lists) {
  // The same building is often mapped twice (a point and an outline): keep one per name within 120 m.
  const out = [];
  for (const p of lists.flat().sort((a, b) => a.km - b.km)) {
    const twin = out.find(o => haversineKm(o, p) < 0.12 && (o.title === p.title || !Object.keys(p.x).length));
    if (twin) twin.x = { ...p.x, ...twin.x }; else out.push(p);
  }
  return out.slice(0, 80);
}
async function searchNearby(center, tag, onMore) {
  const kind = TAG_KIND[tag];
  let quick = kind ? OSM_INDEX.filter(p => p.kind === kind)
    .map(p => ({ title: p.bn, sub: '', lat: p.lat, lon: p.lon, x: p.x, km: haversineKm(center, p) })).filter(p => p.km <= 30).sort((a, b) => a.km - b.km).slice(0, 60) : [];
  if (quick.length < 5) {
    try {
      let found = await photonNear(center, tag, 8);
      if (found.length < 5) found = await photonNear(center, tag, 30);
      if (tag === 'amenity:place_of_worship') found = found.filter(p => MOSQUE.test(p.title));
      quick = mergePlaces([quick, found]);
    } catch { if (!quick.length && !onMore) throw new Error('nearby failed'); }
  }
  if (onMore) {
    overpassNear(center, tag, 3000).then(elements => {
      const live = elements.map(e => placeFromOsm(e, center, tag)).filter(Boolean);
      if (!live.length) return;
      // Beyond the live circle the quick list still has the only answers.
      const reach = Math.max(3, ...live.map(p => p.km));
      onMore(mergePlaces([live, quick.filter(p => p.km > reach || live.some(l => haversineKm(l, p) < 0.12))]));
    }).catch(() => { /* the quick list stands */ });
  }
  return quick;
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

// Fares riders have reported through the app, from the server: "stopA>stopB" (sorted) -> [middle fare, reports].
let REPORTED = {};
async function loadFareReports() {
  try {
    const res = await fetch('api/fares');
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) REPORTED = await res.json();
  } catch { /* no server: only the built-in fares are used */ }
}
async function reportFare(from, to, fare) {
  const res = await fetch('api/fares', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                         body: JSON.stringify({ from, to, fare, device: deviceId() }) });
  if (!res.ok) throw new Error('not saved');
  await loadFareReports();
}
const fareIsConfirmed = (a, b) => !!(KNOWN_FARES[a + '>' + b] || KNOWN_FARES[b + '>' + a] || REPORTED[[a, b].sort().join('>')]);

// What a local bus charges between two stops. A fare someone has confirmed on the road (KNOWN_FARES) wins;
// otherwise it is the government per-km rate, rounded down to the ৳5 step conductors actually charge in.
function localFare(seg, rule, km) {
  const a = seg[0], b = seg[seg.length - 1];
  const known = KNOWN_FARES[a + '>' + b] || KNOWN_FARES[b + '>' + a];
  if (known) return known;
  const told = REPORTED[[a, b].sort().join('>')];          // what riders have reported paying
  if (told) return told[0];
  const step = FARES.bus.roundTo;
  return Math.max(rule.min, Math.floor(km * rule.perKm / step) * step);
}

// Distance is stop-to-stop straight lines scaled by a road factor; the stop coordinates are too
// approximate to route through on real roads without detours that would inflate the fare.
function legInfo(seg) {
  let km = 0;
  for (let k = 1; k < seg.length; k++) km += haversineKm(STOPS[seg[k - 1]], STOPS[seg[k]]);
  km *= FARES.bus.roadFactor;
  const rule = busRule(STOPS[seg[0]], STOPS[seg[seg.length - 1]]);
  const [slow, fast] = FARES.bus.localSpeedKmh;
  return { km, fare: localFare(seg, rule, km), minFast: km / fast * 60, minSlow: km / slow * 60 };
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
