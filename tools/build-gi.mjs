// Builds data/gi-guide.json: for each GI product in data/district-famous.js, its Bangla Wikipedia article — a picture
// and the story (the article's opening, a few paragraphs). An article is taken only when its title carries the
// product's own word ("দই", "কাঁচাগোল্লা", "শাড়ি"), so a search never hands one product another's page.
// Text: Bangla Wikipedia (CC BY-SA); pictures: Wikimedia Commons. Run: node tools/build-gi.mjs
import fs from 'node:fs';

const UA = { 'User-Agent': 'BDMap/1.0 (GI guide build; contact via github.com/rabbihossaingd-alt)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(q) {
  for (let i = 0; i < 6; i++) {
    try { const r = await fetch('https://bn.wikipedia.org/w/api.php?format=json&formatversion=2&' + q, { headers: UA }); if (r.ok) return r.json(); } catch { /* retry */ }
    await sleep(4000 * (i + 1));
  }
  throw new Error('wiki');
}
const src = fs.readFileSync(new URL('../data/district-famous.js', import.meta.url), 'utf8');
const names = [...new Set([...src.matchAll(/\['[a-z]+', '([^']+)', '[^']+', '[fp]', \d+\]/g), ...src.matchAll(/\['([^']+)', '[^']+', '[fp]', \d+\]/g)].map(m => m[1]))];
// the product's own words: without the place it is named after ("বগুড়ার দই" -> "দই")
const core = n => { const w = n.split(' '); const rest = w.filter((x, i) => !(i < w.length - 1 && /(র|ের|এর)$/.test(x))); return rest.join(' '); };
const norm = s => s.replace(/[\s‌‍]/g, '').replace(/ী/g, 'ি').replace(/ূ/g, 'ু');
// Where the search finds the right article under another spelling or name (each seen in its results), and where it
// lands on the wrong one: Uppada jamdani is an Indian sari; the paneer article is not Austagram's cheese.
const OVERRIDE = {
  'ঢাকাই মসলিন': 'মসলিন', 'ঢাকাই ফুটি কার্পাস তুলা': 'ফুটি কার্পাস', 'ব্রাহ্মণবাড়িয়ার ছানামুখী মিষ্টি': 'ছানামুখী', 'রাজশাহী সিল্ক': 'রাজশাহী রেশম',
  'চাঁপাইনবাবগঞ্জের ল্যাংড়া আম': 'ল্যাংড়া', 'নওগাঁর নাক ফজলি আম': 'নাক ফজলি', 'রংপুরের হাঁড়িভাঙ্গা আম': 'হাড়িভাঙ্গা আম', 'দিনাজপুরের বেদানা লিচু': 'দিনাজপুরের লিচু',
  'মেহেরপুরের হিমসাগর আম': 'হিমসাগর', 'মেহেরপুরের সাবিত্রী মিষ্টি': 'সাবিত্রী (মিষ্টি)', 'বাংলাদেশ কালিজিরা চাল': 'কালিজিরা ধান', 'জামদানি শাড়ি': 'জামদানি',
  'অষ্টগ্রামের পনির': null
};
// the words a story must contain to be about the product (checked in its text, not only its title)
const MUST = { 'ল্যাংড়া': 'আম', 'হিমসাগর': 'আম', 'জামদানি': 'শাড়ি|বস্ত্র|কাপড়', 'রাজশাহী রেশম': 'রেশম|সিল্ক', 'ছানামুখী': 'মিষ্টি|ছানা' };
const OUT = new URL('../data/gi-guide.json', import.meta.url);
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
for (const name of names) {
  if (out[name] && !process.argv.includes('--all')) continue;
  try {
    const c = core(name);
    const sr = await get(`action=query&list=search&srlimit=8&srnamespace=0&srsearch=${encodeURIComponent(name)}`);
    const titles = (sr.query.search || []).map(x => x.title);
    // the exact name first, then any title with the product's own word in it
    let pick = titles.find(t => norm(t) === norm(name)) || titles.find(t => norm(t).includes(norm(c)) && c.length >= 2);
    if (name in OVERRIDE) pick = OVERRIDE[name];
    if (!pick) { out[name] = null; console.log('none', name, '|', titles.slice(0, 4).join(', ')); await sleep(800); continue; }
    const q = await get(`action=query&redirects=1&prop=extracts|pageimages&exintro=1&explaintext=1&exchars=1400&piprop=thumbnail|name&pithumbsize=960&titles=${encodeURIComponent(pick)}`);
    const p = q.query.pages[0];
    const text = (p.extract || '').replace(/\s*\([^)]*\)/g, '').replace(/\n{2,}/g, '\n').trim();
    if (p.missing || (MUST[pick] && !new RegExp(MUST[pick]).test(text))) { out[name] = null; console.log('wrong', name, '->', pick); await sleep(800); continue; }
    // a general article (সন্দেশ for Jamurki's sandesh) is said to be one
    const place = name.split(' ')[0].replace(/(র|ের|এর)$/, '');
    const general = !norm(p.title).includes(norm(place));
    out[name] = { page: p.title, text, img: p.thumbnail ? p.thumbnail.source : '', file: p.pageimage || '', general };
    console.log('ok  ', name, '->', p.title, p.thumbnail ? '(picture)' : '');
  } catch (e) { console.log('fail', name, e.message); }
  fs.writeFileSync(OUT, JSON.stringify(out));
  await sleep(1200);
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('done', Object.values(out).filter(Boolean).length, 'of', names.length);
