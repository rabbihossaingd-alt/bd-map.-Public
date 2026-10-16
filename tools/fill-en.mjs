// Third pass: places whose Bangla article has no English counterpart are searched on Commons by an English spelling of
// their name (hand-written below). A file counts only when its name holds the place's own word (the "must" part, e.g.
// "ramgopalpur"), so a search for one zamindar house never returns another. Every pick is printed for review.
// Run: node tools/fill-en.mjs
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
const BAD_FILE = /map|locator|logo|flag|emblem|seal|diagram|chart|icon|minister|certificate|ceremony|signing|geograph\.org\.uk|kalimpong|india|\.svg$|\.pdf$|\.tif|\.gif$/i;
// name -> [search words, the word the file name must hold (several with |)]
const EN = {
  'দত্তপাড়া জমিদার বাড়ি': ['Dattapara Zamindar Bari', 'dattapara|duttapara'],
  'নাগরী গির্জা': ['Nagori church Gazipur', 'nagori|nagari'],
  'মনু মিয়ার জমিদার বাড়ি': ['Monu Mia Zamindar Bari', 'monu mia|manu mia|monumia'],
  'বালাপুর জমিদার বাড়ি': ['Balapur Zamindar Bari', 'balapur'],
  'আমিরগঞ্জ জমিদার বাড়ি': ['Amirganj Zamindar Bari', 'amirganj'],
  'বীরশ্রেষ্ঠ মতিউর রহমান স্মৃতি জাদুঘর': ['Matiur Rahman memorial museum', 'matiur'],
  'মাধবদী গুপ্তরায় জমিদার বাড়ি': ['Madhabdi Zamindar Bari', 'madhabdi|madhobdi'],
  'সাটিরপাড়া রায় চৌধুরী জমিদার বাড়ি': ['Satirpara Zamindar Bari', 'satirpara'],
  'ধানকোড়া জমিদার বাড়ি': ['Dhankora Zamindar Bari', 'dhankora'],
  'ভারতেশ্বরী হোমস': ['Bharateswari Homes', 'bharateswari|bharateshwari'],
  'হরিনাহাটি জমিদার বাড়ি': ['Harinahati Zamindar Bari', 'harinahati'],
  'বাটিকামারী জমিদার বাড়ি': ['Batikamari Zamindar Bari', 'batikamari'],
  'খালিয়া জমিদার বাড়ি': ['Khalia Zamindar Bari Madaripur', 'khalia'],
  'প্রণব মঠ': ['Pranab Math Bajitpur', 'pranab'],
  'মিঠাপুর জমিদার বাড়ি': ['Mithapur Zamindar Bari', 'mithapur'],
  'সেনাপতি দিঘি': ['Senapati Dighi Madaripur', 'senapati'],
  'মঠের বাজার মঠ': ['Mather Bazar Math Madaripur', 'mather bazar|mather bazaar|matherbazar'],
  'ছয়গাঁও জমিদার বাড়ি': ['Chhoygaon Zamindar Bari', 'choygaon|chhoygaon|chaygaon'],
  'হাটুরিয়া জমিদার বাড়ি': ['Haturia Zamindar Bari', 'haturia'],
  'রুদ্রকর জমিদার বাড়ি': ['Rudrakar Zamindar Bari', 'rudrakar|rudrokor'],
  'রামগোপালপুর জমিদার বাড়ি': ['Ramgopalpur Zamindar Bari', 'ramgopalpur'],
  'গৌরীপুর জমিদার বাড়ি': ['Gouripur Zamindar Bari Mymensingh', 'gouripur zamindar|gauripur zamindar|gouripur rajbari'],
  'নারায়ণডহর জমিদার বাড়ি': ['Narayandahar Zamindar Bari', 'narayandahar|narayandohor'],
  'সাত শহীদের মাজার': ['Seven martyrs tomb Netrokona', 'netrokona|netrakona'],
  'বাঘবেড় জমিদার বাড়ি': ['Baghber Zamindar Bari', 'baghber'],
  'বাঁশপাড়া জমিদার বাড়ি': ['Banshpara Zamindar Bari Feni', 'banshpara|bashpara'],
  'কালীদহ বরদা বাবু জমিদার বাড়ি': ['Kalidaha Zamindar Bari Feni', 'kalidaha|kalidah'],
  'ভাষা শহীদ আবদুস সালাম গ্রন্থাগার ও স্মৃতি জাদুঘর': ['Abdus Salam memorial museum Feni', 'abdus salam'],
  'চর সোনারামপুরের নান্দনিক দৃশ্য': ['Char Sonarampur', 'sonarampur'],
  'রূপসদী জমিদার বাড়ি': ['Rupshdi Zamindar Bari', 'rupshdi|rupasdi|rupsdi'],
  'হরষপুর জমিদার বাড়ি': ['Harashpur Zamindar Bari', 'harashpur|horoshpur'],
  'জয়কুমার জমিদার বাড়ি': ['Joykumar Zamindar Bari', 'joykumar|jaykumar'],
  'আলমগীরী মসজিদ': ['Alamgiri mosque Chandpur', 'alamgiri'],
  'অঙ্গীকার স্মৃতিসৌধ': ['Angikar monument Chandpur', 'angikar|ongikar'],
  'বড়কুল জমিদার বাড়ি': ['Barakul Zamindar Bari', 'barakul|borokul'],
  'বোয়ালিয়া জমিদার বাড়ি': ['Boalia Zamindar Bari Chandpur', 'boalia'],
  'জিনের মসজিদ': ['Jiner mosque Lakshmipur', 'lakshmipur|laxmipur'],
  'ইসহাক জমিদার বাড়ি': ['Ishaq Zamindar Bari Lakshmipur', 'ishaq|ishak'],
  'শ্রীরামপুর রাজবাড়ী': ['Sreerampur Rajbari Lakshmipur', 'srirampur rajbari|sreerampur rajbari'],
  'কামানখোলা জমিদার বাড়ি': ['Kamankhola Zamindar Bari', 'kamankhola'],
  'স্বর্ণ দ্বীপ': ['Swarna Dweep Noakhali', 'swarna dweep|swarnadweep|shornodip|swarnadwip'],
  'নোয়াখালী জেলা জামে মসজিদ': ['Noakhali district Jame mosque', 'noakhali'],
  'চাকমা রাজবাড়ি': ['Chakma Rajbari Rangamati', 'chakma raj'],
  'মং রাজবাড়ি': ['Mong Rajbari Khagrachari', 'mong raj|mong circle'],
  'পানছড়ি শান্তিপুর অরণ্য কুটির': ['Shantipur Aranya Kutir Panchhari', 'shantipur|aranya kutir'],
  'তৈছামা ঝর্ণা': ['Toichama waterfall', 'toichama|taichama'],
  'তৈদুছড়া ঝর্ণা': ['Toiduchora waterfall', 'toidu|taidu'],
  'মাতাই পুখিরি': ['Matai Pukhiri Khagrachari', 'matai pukhiri|mataipukhiri'],
  'তৈলাফাং ঝর্ণা': ['Toilafang waterfall', 'toilafang|tailafang'],
  'তমা তুঙ্গী': ['Toma Tungi Bandarban', 'tungi'],
  'কমলারানীর সাগর দীঘি': ['Kamalarani Sagar Dighi Habiganj', 'kamalarani|komolarani'],
  'লক্ষ্মী বাওড় জলাবন': ['Lakshmi Baor swamp forest', 'baor'],
  'রাধানন্দ জমিদার বাড়ি': ['Radhananda Zamindar Bari', 'radhananda'],
  'হবিগঞ্জ বাজার-শায়েস্তাগঞ্জ-বাল্লা রেলপথ': ['Shaistaganj railway', 'shaistaganj|shayestaganj'],
  'সুখাইড় জমিদার বাড়ি': ['Sukhair Zamindar Bari', 'sukhair'],
  'গৌরারং জমিদার বাড়ি': ['Gourarang Zamindar Bari', 'gourarang|gaurarang'],
  'রাজা কংস নারায়ণের মন্দির': ['Kangsa Narayan temple Tahirpur', 'kangsa|kongsho|kansa narayan'],
  'হাজারদুয়ারি জমিদার বাড়ি': ['Hazarduari Zamindar Bari Rajshahi', 'hazarduari zamindar'],
  'তামলি রাজার বাড়ি': ['Tamli Rajar Bari', 'tamli'],
  'গোয়ালকান্দি জমিদার বাড়ি': ['Goalkandi Zamindar Bari', 'goalkandi'],
  'শীলাদেবীর ঘাট': ['Shila Devi Ghat Mahasthan', 'shila devi|shiladevi|shiladebi'],
  'শিতলাই জমিদার বাড়ি': ['Shitlai Zamindar Bari Pabna', 'shitlai|sitlai'],
  'ভাঁড়ারা শাহী মসজিদ': ['Bharara Shahi mosque Pabna', 'bharara'],
  'ইকোপার্ক': ['Sirajganj eco park', 'sirajganj'],
  'ইলিয়ট সেতু': ['Elliot bridge Sirajganj', 'sirajganj'],
  'জয়সাগর': ['Joysagar Sirajganj', 'joysagar|jaysagar'],
  'রাউতারা জমিদার বাড়ি': ['Rautara Zamindar Bari', 'rautara'],
  'দয়ারামপুর জমিদার বাড়ি': ['Dayarampur Zamindar Bari Natore', 'dayarampur|doyarampur'],
  'ঘুঘুডাঙ্গা তালতলি': ['Ghughudanga Naogaon palm road', 'ghughudanga'],
  'নীলকুঠি': ['Nilkuthi indigo factory', 'nilkuthi|neelkuthi'],
  'হিন্দা-কসবা শাহী জামে মসজিদ': ['Hinda Kasba mosque Joypurhat', 'hinda'],
  'নান্দাইল দীঘি': ['Nandail Dighi Joypurhat', 'nandail'],
  'আছরাঙ্গা দীঘী': ['Asranga Dighi Joypurhat', 'asranga|achranga'],
  'পাগলা দেওয়ান বধ্যভূমি': ['Pagla Dewan Joypurhat', 'pagla dewan'],
  'চিকলি বিল ও পার্ক': ['Chikli Bill Rangpur', 'chikli'],
  'শ্রী জ্ঞানেন্দ্র নারায়ণ রায়ের জমিদার বাড়ি': ['Tajhat Zamindar Bari Gyanendra Narayan', 'gyanendra|jnanendra'],
  'জাটিভাঙ্গা বধ্যভূমি': ['Jatibhanga Thakurgaon', 'jatibhanga'],
  'রামরাই দিঘি': ['Ramrai Dighi Thakurgaon', 'ramrai'],
  'মহারাজার দিঘী': ['Maharajar Dighi Panchagarh', 'maharaja dighi|maharajar dighi|maharajar dighi'],
  'কাজল দিঘী': ['Kajol Dighi Panchagarh', 'kajol dighi|kajal dighi'],
  'তিস্তা সড়ক সেতু': ['Teesta road bridge Lalmonirhat', 'teesta|tista'],
  'নওদাবাস শালবন': ['Naodabas Lalmonirhat', 'naodabas'],
  'প্রাচীন কাজির মসজিদ': ['Kazir mosque Kurigram', 'kurigram'],
  'পাঙ্গা জমিদার বাড়ি': ['Panga Zamindar Bari Kurigram', 'panga'],
  'নাওডাঙ্গা জমিদার বাড়ি': ['Naodanga Zamindar Bari', 'naodanga'],
  'বামনডাঙ্গা জমিদার বাড়ি': ['Bamondanga Zamindar Bari Gaibandha', 'bamondanga|bamandanga'],
  'ধামালিয়া জমিদার বাড়ি': ['Dhamalia Zamindar Bari Khulna', 'dhamalia'],
  'চাঁচড়া জমিদার বাড়ি': ['Chanchra Rajbari Jessore', 'chanchra|chachra'],
  'কোঠাবাড়ির থান': ['Kothabari Than Satkhira', 'kothabari'],
  'ডিসি ইকোপার্ক, সাতক্ষীরা': ['Satkhira DC eco park', 'satkhira'],
  'দেবহাটা জমিদার বাড়ি': ['Debhata Zamindar Bari', 'debhata'],
  'গোবিন্দ দেবের মন্দির ঢিবি': ['Gobinda Dev temple mound Satkhira', 'gobinda dev|govinda dev'],
  'মাঝের চর': ['Majher Char Bagerhat', 'majher char'],
  'মীর মশাররফ হোসেনের বাস্তুভিটা': ['Mir Mosharraf Hossain house Kushtia', 'mosharraf|mosharaf'],
  'নলডাঙ্গা জমিদার বাড়ি': ['Naldanga Zamindar Bari Jhenaidah', 'naldanga'],
  'শৈলকুপা জমিদার বাড়ি': ['Shailkupa Zamindar Bari', 'shailkupa|sailkupa'],
  'শ্রীপুর জমিদার বাড়ি': ['Sreepur Zamindar Bari Magura', 'sreepur zamindar|sripur zamindar'],
  'ছান্দড়া জমিদার বাড়ি': ['Chhandra Zamindar Bari Magura', 'chhandra|chandra zamindar'],
  'সিদ্ধেশ্বরী মঠ': ['Siddheshwari Math Magura', 'siddheshwari|siddheswari'],
  'নড়াইল জমিদার বাড়ি': ['Narail Zamindar Bari', 'narail'],
  'নাটুদহের আট কবর': ['Aat Kobor Natudah Chuadanga', 'aat kobor|at kobor|natudah'],
  'ঘোলদাড়ী শাহী মসজিদ': ['Gholdari mosque Chuadanga', 'gholdari'],
  'কুমারী সাহা জমিদার বাড়ি': ['Kumari Saha Zamindar Bari', 'kumari saha'],
  'গড়াইটুপি অমরাবতী মেলা': ['Garaitupi Amrabati Mela', 'garaitupi|amrabati'],
  '৩০ গোডাউন বধ্যভূমি': ['30 Godown Barishal', 'godown'],
  'মাধবপাশা জমিদার বাড়ি': ['Madhabpasha Zamindar Bari', 'madhabpasha'],
  'বরিশাল মহাশ্মশান': ['Barishal Mahashmashan', 'mahashmashan|mahasmashan|crematorium'],
  'পায়রা বন্দর': ['Payra port', 'payra port|payra sea port'],
  'কুয়াকাটা রাখাইন পল্লী': ['Kuakata Rakhine village', 'rakhine'],
  'বোরহানউদ্দিন চৌধুরীর জমিদার বাড়ি': ['Borhanuddin Zamindar Bari Bhola', 'borhanuddin'],
  'লালমোহন ডিজিটাল পার্ক': ['Lalmohan Digital Park', 'lalmohan'],
  'লালদিয়া সমুদ্রসৈকত': ['Laldia sea beach Barguna', 'laldia'],
  'চৌধুরী বাড়ি': ['Chowdhury Bari Chandpur', 'chandpur']
};

const GUIDE = new URL('../data/district-guide.json', import.meta.url);
const guide = JSON.parse(fs.readFileSync(GUIDE, 'utf8'));
let found = 0, tried = 0;
for (const [id, g] of Object.entries(guide.guide)) for (const s of g.sights) {
  if (s.img || !EN[s.name]) continue;
  tried++;
  const [q, must] = EN[s.name], re = new RegExp(must, 'i');
  const r = await api(`action=query&list=search&srnamespace=6&srlimit=20&srsearch=${encodeURIComponent(q)}`);
  await sleep(2500);
  const f = (r.query.search || []).map(x => x.title.replace(/^File:/, '')).find(f => re.test(f) && !BAD_FILE.test(f) && /\.(jpe?g|png|webp)$/i.test(f));
  if (!f) { console.log('  none ', id, s.name); continue; }
  const ii = await api(`action=query&prop=imageinfo&iiprop=url|size&iiurlwidth=960&titles=${encodeURIComponent('File:' + f)}`);
  await sleep(2000);
  const info = ii.query.pages[0].imageinfo && ii.query.pages[0].imageinfo[0];
  if (!info || info.width < 500) { console.log('  small', id, s.name, f); continue; }
  Object.assign(s, { file: f, img: info.thumburl || info.url, imgFrom: 'commons-en' });
  found++; console.log('  pick ', id, s.name, '->', f);
  fs.writeFileSync(GUIDE, JSON.stringify(guide));
}
console.log('en:', found, 'of', tried);
