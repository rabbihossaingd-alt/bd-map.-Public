// A district's cover is the picture at the top of its Wikipedia article. For some that is a map, a collage,
// an office or a street; for those, the cover becomes the photo of one of the district's own best-known places.
// Run: node tools/cover-picks.mjs   (rewrites data/district-guide.json in place)
import { readFileSync, writeFileSync } from 'node:fs';

const PICKS = {
  chattogram: 'পতেঙ্গা সমুদ্র সৈকত', sylhet: 'রাতারগুল', naogaon: 'পাহাড়পুর বৌদ্ধ বিহার', chapainawabganj: 'ছোট সোনা মসজিদ',
  lakshmipur: 'দালাল বাজার জমিদার বাড়ি', netrokona: 'বিরিশিরি ও চীনামাটির পাহাড়', mymensingh: 'শশী লজ', faridpur: 'পল্লীকবি জসীমউদ্দীনের বাড়ি',
  jashore: 'কপোতাক্ষ নদ', narail: 'চিত্রা নদী', meherpur: 'মুজিবনগর স্মৃতিসৌধ', joypurhat: 'লকমা জমিদার বাড়ি', rangpur: 'তাজহাট রাজবাড়ী',
  gazipur: 'গাজীপুর সাফারি পার্ক', narsingdi: 'লক্ষণ সাহার জমিদার বাড়ি', jhenaidah: 'মিয়ার দালান', pirojpur: 'মমিন মসজিদ'
};
const isMap = f => /map|locator|মানচিত্র|\.svg$/i.test(f || '');
const path = new URL('../data/district-guide.json', import.meta.url);
const data = JSON.parse(readFileSync(path, 'utf8'));
for (const [id, name] of Object.entries(PICKS)) {
  const g = data.guide[id], s = g && (g.sights || []).find(x => x.name === name);
  if (!s || !s.img || isMap(s.file)) { console.log('skip', id, name); continue; }
  g.img = s.img; g.file = s.file;
  console.log(id.padEnd(16), name);
}
// a place whose only picture is a location map shows its drawing instead
let maps = 0;
for (const g of Object.values(data.guide)) for (const s of g.sights || []) if (s.img && isMap(s.file)) { delete s.img; delete s.file; maps++; }
console.log('map pictures removed from places:', maps);
writeFileSync(path, JSON.stringify(data));
