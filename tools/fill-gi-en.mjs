// GI products still without a picture: a Commons photo of the product itself, searched by an English name written by
// hand, taken only when the file's name holds the product's own word. Every pick is printed for review.
// Run: node tools/fill-gi-en.mjs
import fs from 'node:fs';

const UA = { 'User-Agent': 'BDMap/1.0 (picture search; contact via github.com/rabbihossaingd-alt)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(q) {
  for (let i = 0; i < 8; i++) {
    try { const r = await fetch(`https://commons.wikimedia.org/w/api.php?format=json&formatversion=2&${q}`, { headers: UA }); if (r.ok) { const t = await r.text(); if (t.startsWith('{')) return JSON.parse(t); } } catch { /* retry */ }
    await sleep(8000 * (i + 1));
  }
  throw new Error('commons');
}
const BAD_FILE = /map|locator|logo|flag|emblem|seal|diagram|chart|icon|minister|certificate|ceremony|signing|stamp|roshogolla|rasgulla|syrup|\.svg$|\.pdf$|\.tif|\.gif$/i;
// product -> [[search words, the word the file name must hold], ...] tried in order
const EN = {
  'মিরপুরের কাতান শাড়ি': [['Katan saree', 'katan']],
  'ঢাকাই ফুটি কার্পাস তুলা': [['Phuti karpas cotton', 'phuti|karpas'], ['Gossypium arboreum', 'gossypium']],
  'নরসিংদীর অমৃত সাগর কলা': [['Amritasagar banana', 'amrita ?sagar'], ['Sabri banana Bangladesh', 'banana']],
  'মানিকগঞ্জের হাজারী গুড়': [['Hajari gur', 'hajari'], ['Date palm jaggery Bangladesh', 'jaggery|gur']],
  'অষ্টগ্রামের পনির': [['Austagram cheese', 'austagram|ashtagram'], ['Bangladeshi paneer cheese', 'paneer|panir']],
  'কিশোরগঞ্জের রাতা বোরো ধান': [['Boro rice paddy Kishoreganj', 'kishoreganj'], ['Boro rice Bangladesh', 'boro']],
  'রাজবাড়ীর ক্ষীর চমচম': [['Chomchom', 'chomchom|chamcham|cham cham|chom chom']],
  'গোপালগঞ্জের ব্রোঞ্জের গহনা': [['Bronze jewellery Bangladesh', 'bronze']],
  'ফুলবাড়ীয়ার লাল চিনি': [['Lal chini Fulbaria', 'lal chini|fulbaria'], ['Sugarcane jaggery Bangladesh', 'jaggery|gur']],
  'শেরপুরের তুলশিমালা ধান': [['Tulshimala rice', 'tulshimala|tulsimala'], ['Aromatic rice Bangladesh', 'rice']],
  'কুমিল্লার রসমালাই': [['Rasmalai Comilla', 'rasmalai|ras malai|rossomalai'], ['Rasmalai', 'rasmalai|ras malai']],
  'কুমিল্লার খাদি': [['Comilla khadi', 'khadi|khaddar']],
  'সিলেটের মণিপুরি শাড়ি': [['Manipuri saree', 'manipuri'], ['Manipuri weaving Sylhet', 'manipuri']],
  'মৌলভীবাজারের আগর': [['Agarwood Bangladesh', 'agar'], ['Aquilaria malaccensis', 'aquilaria']],
  'মৌলভীবাজারের আগর আতর': [['Agarwood oil attar', 'agar|oud'], ['Aquilaria', 'aquilaria']],
  'রাজশাহীর মিষ্টি পান': [['Betel leaf Rajshahi', 'betel'], ['Betel leaves Bangladesh', 'betel']],
  'চাঁপাইনবাবগঞ্জের আশ্বিনা আম': [['Ashwina mango', 'ashwina|ashina'], ['Mango Chapainawabganj', 'mango']],
  'চাঁপাইনবাবগঞ্জের গোপালভোগ আম': [['Gopalbhog mango', 'gopalbhog'], ['Mango Chapai Nawabganj', 'mango']],
  'জয়পুরহাটের লতিরাজ কচু': [['Latiraj kochu', 'latiraj|loti'], ['Colocasia esculenta Bangladesh', 'colocasia']],
  'দিনাজপুরের কাটারীভোগ চাল': [['Kataribhog rice', 'kataribhog|katari'], ['Aromatic rice Dinajpur', 'rice']],
  'দিনাজপুরের বেদানা লিচু': [['Litchi Dinajpur', 'litchi|lychee|lichu'], ['Litchi Bangladesh', 'litchi|lychee']],
  'যশোরের খেজুরের গুড়': [['Khejur gur', 'khejur|date palm'], ['Date palm jaggery', 'jaggery|gur']],
  'মাগুরার হাজরাপুরী লিচু': [['Litchi Magura', 'litchi|lychee'], ['Litchi Bangladesh', 'litchi|lychee']],
  'মেহেরপুরের মেহেরসাগর কলা': [['Mehersagar banana', 'mehersagar|meher sagar'], ['Banana bunch Bangladesh', 'banana']],
  'মেহেরপুরের সাবিত্রী মিষ্টি': [['Sabitri sweet Meherpur', 'sabitri'], ['Bengali sweets Meherpur', 'meherpur']],
  'সাতক্ষীরার মাটির টালি': [['Terracotta tiles Satkhira', 'satkhira|terracotta tile'], ['Terracotta tiles Bangladesh', 'terracotta']],
  'ভোলার মহিষের দুধের কাঁচা দই': [['Buffalo curd Bhola', 'bhola|buffalo'], ['Buffalo milk curd', 'buffalo|curd|doi']]
};
const GI = new URL('../data/gi-guide.json', import.meta.url);
const gi = JSON.parse(fs.readFileSync(GI, 'utf8'));
let found = 0;
for (const [bn, tries] of Object.entries(EN)) {
  const st = gi[bn];
  if (st && st.img) continue;
  let pick = '', generic = false;
  for (const [i, [q, must]] of tries.entries()) {
    generic = i > 0;   // the later tries are the product in general, not this district's
    const re = new RegExp(must, 'i');
    const r = await api(`action=query&list=search&srnamespace=6&srlimit=20&srsearch=${encodeURIComponent(q)}`);
    await sleep(2500);
    pick = ((r.query && r.query.search) || []).map(x => x.title.replace(/^File:/, '')).find(f => re.test(f) && !BAD_FILE.test(f) && /\.(jpe?g|png|webp)$/i.test(f)) || '';
    if (pick) break;
  }
  if (!pick) { console.log('  none ', bn); continue; }
  const ii = await api(`action=query&prop=imageinfo&iiprop=url|size&iiurlwidth=960&titles=${encodeURIComponent('File:' + pick)}`);
  await sleep(2000);
  const info = ii.query.pages[0].imageinfo && ii.query.pages[0].imageinfo[0];
  if (!info || info.width < 500) { console.log('  small', bn, pick); continue; }
  gi[bn] = { ...(st || { page: '', text: '', general: false }), img: info.thumburl || info.url, file: pick, imgFrom: 'commons-en', ...(generic ? { imgGeneric: true } : {}) };
  found++; console.log('  pick ', bn, '->', pick);
  fs.writeFileSync(GI, JSON.stringify(gi));
}
console.log('products:', found);
