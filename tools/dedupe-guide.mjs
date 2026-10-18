// Places added from Commons that the guide already had under another spelling (লালবাগ কেল্লা / লালবাগের কেল্লা):
// the same article, the same name once possessive endings and spaces are ignored, or pins within 300 m.
// Their photos join the older entry's gallery, and the copy is removed. Run: node tools/dedupe-guide.mjs
import fs from 'node:fs';
const GUIDE = new URL('../data/district-guide.json', import.meta.url);
const all = JSON.parse(fs.readFileSync(GUIDE, 'utf8'));
const hav = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dl = r(b.lat - a.lat), dn = r(b.lon - a.lon); const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const key = s => (s || '').replace(/\(.*?\)/g, '').split(/[\s,\-–]+/).map(w => w.replace(/(ের|এর|র)$/, '')).join('').replace(/[‌‍']/g, '').replace(/ী/g, 'ি').replace(/ূ/g, 'ু').replace(/বাড়ী/g, 'বাড়ি');
const words = s => (s || '').replace(/\(.*?\)/g, '').split(/[\s,\-–]+/).map(w => w.replace(/(ের|এর|র)$/, '')).filter(w => w.length >= 3);
const shares = (a, b) => words(a).some(w => words(b).includes(w));
// the same place under names with no word in common (checked by hand)
const SAME = [['স্বর্ণমন্দির', 'বুদ্ধ ধাতু জাদি'], ['নওয়াব প্যালেস', 'নবাব বাড়ি']];
const same = (a, b) => SAME.some(([x, y]) => (a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x)));
let merged = 0;
for (const [id, g] of Object.entries(all.guide)) {
  const old = (g.sights || []).filter(s => s.added !== 'commons');
  g.sights = (g.sights || []).filter(s => {
    if (s.added !== 'commons') return true;
    const twin = old.find(o => (o.page && s.page && o.page === s.page) || key(o.name) === key(s.name) || key(o.page) === key(s.name) ||
      (o.lat != null && s.lat != null && hav(o, s) < 0.3 && shares(o.name, s.name)) || same(o.name, s.name));   // near each other AND sharing a word (a museum beside a park is not the park)
    if (!twin) return true;
    const have = new Set([twin.file, ...(twin.gallery || []).map(x => x.file)]);
    const extra = [{ img: s.img, file: s.file, by: s.imgBy, lic: s.imgLic }, ...(s.gallery || [])].filter(x => x.file && !have.has(x.file));
    if (!twin.img && extra.length) { const f = extra.shift(); Object.assign(twin, { img: f.img, file: f.file, imgBy: f.by, imgLic: f.lic, imgFrom: 'commons' }); }
    twin.gallery = [...(twin.gallery || []), ...extra].slice(0, 10);
    if (twin.lat == null && s.lat != null) { twin.lat = s.lat; twin.lon = s.lon; }
    console.log('  merged', id, s.name, '->', twin.name, `(+${extra.length} photos)`);
    merged++;
    return false;
  });
}
fs.writeFileSync(GUIDE, JSON.stringify(all));
const a = Object.values(all.guide).flatMap(g => g.sights);
console.log('merged', merged, '· places now', a.length, '· with photo', a.filter(s => s.img).length, '· new kept', a.filter(s => s.added === 'commons').length);
