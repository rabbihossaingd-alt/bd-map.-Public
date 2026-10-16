// Tidies data/district-guide.json after tools/build-guide.mjs, without fetching anything:
//  - a place over 150 km from its district town has a wrong position in Wikidata/Wikipedia (Kherua mosque came out
//    14,509 km from Bogura): it stays, without its map pin. Countries an article links (Yemen) are left out by the
//    build, through Wikidata.
// (Distance from the town cannot say which district a place is in — Madhabkunda is in Moulvibazar but nearer
// Sylhet's town — so nothing else is decided by it.)
// Run: node tools/clean-guide.mjs
import fs from 'node:fs';

const OUT = new URL('../data/district-guide.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const src = fs.readFileSync(new URL('../data/bangladesh.js', import.meta.url), 'utf8');
const towns = [...src.matchAll(/\['([a-z]+)', '([^']+)', (?:'[^']+'|"[^"]+"), ([\d.]+), ([\d.]+), '[^']+'\]/g)].map(m => ({ id: m[1], lat: +m[3], lon: +m[4] }));
const km = (a, b) => { const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
let dropped = 0, unpinned = 0;
for (const t of towns) {
  const g = data.guide[t.id];
  if (!g) continue;
  g.sights = (g.sights || []).filter(s => {
    if (s.lat == null) return true;
    const own = km(t, s);
    if (own > 150) { unpinned++; console.log('no pin (position wrong)', t.id, s.name, Math.round(own) + ' km'); s.lat = s.lon = null; }
    return true;
  });
}
// Not places to go and see, as the lists also name them: airports, export zones, power plants, gas fields, mines,
// land ports, offices and schools, a script, a crop; a word cut from a sentence ("…নদের", "…পুরের"); and town or
// upazila names that are not a sight in themselves.
const NOT_SIGHT = /বিমান ?বন্দর|স্থল ?বন্দর|ইপিজেড|রপ্তানি প্রক্রিয়াকরণ|বিদ্যুৎ কেন্দ্র|গ্যাসক্ষেত্র|কয়লাখনি|জুট মিল|মিল্‌স|আইটি পার্ক|কালেক্টরেট|পৌর ভবন|সার্কিট হাউজ|একাডেম|সেমিনারী|জামেয়া|মাদ্রাসা|লিপি|সিনেমা হল|^চা$|দের$|পুরের$|ভিত্তিক$/;
const TOWN_NAMES = new Set(['গুরুদাসপুর', 'লালপুর', 'কমলগঞ্জ', 'মাইজদী', 'দর্শনা', 'মসজিদের শহর', 'বাহাদুরপুর', 'পাথরঘাটা', 'ধর্মপুর', 'সিন্দুরমতি লালমনিরহাট']);
const districtNames = new Set([...src.matchAll(/\['[a-z]+', '([^']+)'/g)].map(m => m[1]));
let cut = 0;
for (const g of Object.values(data.guide)) {
  const seenName = new Set();
  g.sights = (g.sights || []).filter(s => {
    const key = s.name.replace(/[\s‌‍]/g, '');
    const bad = NOT_SIGHT.test(s.name) || NOT_SIGHT.test(s.page) || TOWN_NAMES.has(s.name) || districtNames.has(s.name) || seenName.has(key);
    seenName.add(key);
    if (bad) cut++;
    return !bad;
  });
}
console.log('not sights cut', cut);
// Pictures through Bangla Wikipedia's Special:FilePath: it serves both Commons files and the wiki's own, at any width.
const filePath = (file, w) => `https://bn.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=${w}`;
for (const g of Object.values(data.guide)) {
  if (g.file) g.img = filePath(g.file, 1200);
  for (const s of g.sights || []) if (s.file) s.img = filePath(s.file, 900);
}
fs.writeFileSync(OUT, JSON.stringify(data));
console.log('dropped', dropped, 'unpinned', unpinned, 'sights left', Object.values(data.guide).reduce((n, g) => n + g.sights.length, 0));
