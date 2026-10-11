// ---- Language: Bangla (default) or English ----
// The app is written in Bangla. In English mode this file translates what is on the page as it appears:
// whole strings from a dictionary, names from the app's own data, and sentences with numbers or names in
// them through patterns. Switching language reloads the page, so nothing has to be translated back.
// A string with no translation simply stays in Bangla — add it to EXACT or PATTERNS below.

const LANG = (() => { try { return localStorage.getItem('bdmap.lang') === 'en' ? 'en' : 'bn'; } catch { return 'bn'; } })();
document.documentElement.lang = LANG;

function setLang(lang) {
  try { localStorage.setItem('bdmap.lang', lang); } catch { /* storage unavailable */ }
  location.reload();
}

const EXACT = {
  // tour plan
  'ট্যুর': 'Tour', 'ট্যুর প্ল্যান': 'Tour plan', 'ট্যুর প্ল্যান করুন': 'Plan a tour',
  'কোথায় যাবেন, কতজন, কত দিন — খরচের হিসাব আর শেয়ার করার মতো একটি কার্ড।': 'Where, how many people, how many days — a cost estimate and a card worth sharing.',
  'দল নিয়ে ঘুরতে যাচ্ছেন? খরচ হিসাব করুন, সবার ছবি দিয়ে কার্ড বানান।': 'Travelling with a group? Work out the cost and make a card with everyone’s photos.',
  'শুরু করুন': 'Start', 'কোথা থেকে কোথায়': 'From where to where', 'কতজন': 'How many people', 'কত রাত': 'How many nights',
  'আসা-যাওয়া': 'Round trip', 'শুধু যাওয়া': 'One way', 'হোটেল': 'Hotel', 'বাজেট': 'Budget', 'মাঝারি': 'Mid-range', 'প্রিমিয়াম': 'Premium',
  'রুম': 'Rooms', 'প্রতি রুম, প্রতি রাত (৳)': 'Per room, per night (৳)', 'খাবার — জনপ্রতি, প্রতিদিন (৳)': 'Food — per person, per day (৳)',
  'অন্যান্য — জনপ্রতি, প্রতিদিন (৳)': 'Other — per person, per day (৳)', 'খরচের হিসাব': 'Cost estimate',
  'বাস ভাড়া': 'Bus fare', 'খাবার': 'Food', 'অন্যান্য': 'Other', 'ঘোরাঘুরি, টিকিট': 'getting around, tickets', 'মোট': 'Total',
  'জনপ্রতি খরচ': 'Cost per person', 'জনপ্রতি': 'Per person',
  'হোটেল, বিমান, খাবার ও অন্যান্য খরচ আমাদের আনুমানিক ধরা — আসল দাম নয়। নিজের মতো বদলে নিন।': 'Hotel, flight, food and other costs are our rough estimates, not real prices. Change them to suit you.',
  'যাতায়াত': 'Transport', 'বিমান': 'Plane', 'বিমান ভাড়া': 'Air fare', 'বিমান ভাড়া — জনপ্রতি, এক দিকে (৳)': 'Air fare — per person, one way (৳)',
  'এই দুই জেলার মধ্যে সরাসরি বিমান নেই — বাস ধরা হলো।': 'No direct flight between these districts — using the bus instead.',
  'বিমান, হোটেল, খাবার সহ': 'flight, hotel and food included', 'চলো ঘুরে আসি': 'Let’s go!', 'বাসে': 'by bus', 'বিমানে': 'by air',
  'ট্যুর কার্ড': 'Tour card', 'সবার ছবি দিন (৫টি পর্যন্ত), তারপর কার্ড বানান। ছবি আপনার ডিভাইসেই থাকে — কোথাও আপলোড হয় না।': 'Add everyone’s photos (up to 5), then make the card. Photos stay on your device — nothing is uploaded.',
  'ট্যুরের নাম — যেমন: বন্ধুদের কক্সবাজার ট্যুর': 'Tour name — e.g. Cox’s Bazar with friends', 'ট্যুরের নাম': 'Tour name', 'তারিখ': 'Date',
  'কার্ড বানান': 'Make the card', 'আবার চালান': 'Play again', 'ছবি ডাউনলোড': 'Download image', 'শেয়ার': 'Share', 'ভিডিও ডাউনলোড': 'Download video',
  'ভিডিও তৈরি হচ্ছে…': 'Making the video…', 'এই ব্রাউজারে ভিডিও বানানো যায় না — ছবি ডাউনলোড করুন।': 'This browser cannot make the video — download the image instead.',
  'বাস, হোটেল, খাবার সহ': 'bus, hotel and food included', 'ছবি যোগ করুন': 'Add a photo', 'ছবি সরান': 'Remove photo', 'বাড়ান': 'More', 'কমান': 'Less',
  'এক দিকে': 'one way',

  // navigation and home
  'হোম': 'Home', 'ম্যাপ': 'Map', 'ঢাকার বাস': 'Dhaka buses', 'জেলা': 'Districts', 'কাছাকাছি': 'Nearby', 'ভাড়া': 'Fares',
  '৬৪ জেলার যাতায়াত, এক জায়গায়': 'Travel across all 64 districts, in one place',
  'কোথায়': 'Where', 'যাবেন?': 'to?',
  'কোন বাসে যাবেন, ভাড়া কত, কতক্ষণ লাগবে — এক নজরে।': 'Which bus to take, what it costs, how long it takes — at a glance.',
  'কোথা থেকে': 'From', 'কোথায় যাবেন': 'Where to', 'আমার লোকেশন': 'My location', 'অদলবদল': 'Swap',
  'কোন বাস কোথায় যায়': 'Which bus goes where', '৬৪ জেলা': '64 districts',
  'ঢাকা থেকে ভাড়া, বাস ও দর্শনীয় স্থান': 'Fares from Dhaka, buses and sights',
  'হাসপাতাল, থানা, এটিএম, পার্ক…': 'Hospitals, police, ATMs, parks…', 'ভাড়ার হিসাব': 'Fare calculator',
  'কিমি প্রতি কত, মোট কত': 'How much per km, how much in total',
  'দেখুন': 'View', 'খুঁজুন': 'Search', 'হিসাব করুন': 'Calculate',
  'ঢাকার বাস রুট': 'Dhaka bus routes', 'চেনা জায়গা': 'Known places',
  'জরুরি নম্বর — চাপ দিলে কল হবে': 'Emergency numbers — tap to call',
  'জরুরি সেবা': 'Emergency', 'পুলিশ, ফায়ার সার্ভিস, অ্যাম্বুলেন্স': 'Police, fire service, ambulance',
  'স্বাস্থ্য বাতায়ন': 'Health line', 'ডাক্তারের পরামর্শ': 'Advice from a doctor',
  'সরকারি তথ্য ও সেবা': 'Government information', 'যেকোনো সরকারি সেবা': 'Any government service',
  'নারী ও শিশু সহায়তা': 'Women and children helpline', 'নির্যাতন প্রতিরোধ': 'Violence prevention',
  'শিশু সহায়তা': 'Child helpline', 'চাইল্ড হেল্পলাইন': 'Help for children',
  'আইনি সহায়তা': 'Legal aid', 'বিনামূল্যে আইনি পরামর্শ': 'Free legal advice',

  // map page
  'মুছুন': 'Clear', 'বাস': 'Bus', 'রাইড': 'Ride', 'কীভাবে হিসাব হয়': 'How fares are worked out',
  'ভাড়া আনুমানিক — সরকারি তালিকার সাথে কিছু কমবেশি হতে পারে ·': 'Fares are estimates — they may differ a little from the official chart ·',
  'ভাড়া আনুমানিক — সরকারি তালিকার সাথে কিছু কমবেশি হতে পারে': 'Fares are estimates — they may differ a little from the official chart',
  'ম্যাপ লোড হচ্ছে…': 'Loading the map…',
  'ম্যাপ লোড করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।': 'The map could not be loaded. Check your internet connection and try again.',
  '3D ভিউ': '3D view', 'আমি কোথায়': 'Where am I', 'পুরো বাংলাদেশ': 'All of Bangladesh', 'বড় করুন': 'Zoom in', 'ছোট করুন': 'Zoom out',
  'রুট খোঁজা হচ্ছে…': 'Finding the route…', 'রুট পাওয়া যায়নি। অন্য জায়গা দিয়ে চেষ্টা করুন।': 'No route found. Try another place.',
  'কোথা থেকে যাবেন লিখুন, অথবা ম্যাপে চাপ দিয়ে বেছে নিন।': 'Type where you are starting from, or tap the map to choose.',
  'কোথায় যাবেন লিখুন, অথবা ম্যাপে চাপ দিয়ে বেছে নিন।': 'Type where you are going, or tap the map to choose.',
  'বাংলাদেশের ভেতরে বেছে নিন।': 'Choose a place inside Bangladesh.', 'ম্যাপে বাছাই করা জায়গা': 'Place chosen on the map',
  'লোকেশন খোঁজা হচ্ছে…': 'Finding your location…', 'লোকেশনের অনুমতি পাওয়া যায়নি।': 'Location permission was not given.',
  'এই ডিভাইসে লোকেশন পাওয়া যাচ্ছে না।': 'Location is not available on this device.',
  'লোকেশন পাওয়া যায়নি — ব্রাউজারে লোকেশনের অনুমতি দিন।': 'Location not found — allow location in your browser.',
  'কিছু পাওয়া যায়নি — অন্য বানানে লিখে দেখুন, অথবা ম্যাপে চাপ দিয়ে বেছে নিন।': 'Nothing found — try another spelling, or tap the map to choose.',
  'যে বাসে যেতে পারেন': 'Buses you can take', 'বাস ভাড়া · আনুমানিক': 'Bus fare · estimate',
  'এই পথের বাসের নাম এখনো আমাদের কাছে নেই।': 'We do not have bus names for this route yet.',
  'এই রুটের বাস': 'Buses on this route', 'এই রুটের বাস কোম্পানির নাম এখনো যোগ হয়নি।': 'Bus companies for this route have not been added yet.',
  'নন-এসি': 'Non-AC', 'এসি': 'AC', 'শুধু এসি': 'AC only', 'আনুমানিক': 'estimate', 'কাউন্টারে': 'at the counter',
  'নন-এসি · আনুমানিক': 'Non-AC · estimate', 'এসি · আনুমানিক': 'AC · estimate',
  'নন-এসি · কাউন্টারে': 'Non-AC · at the counter', 'এসি · কাউন্টারে': 'AC · at the counter',
  'কোম্পানি ভেদে আলাদা': 'varies by company', 'কাউন্টারে সাধারণত': 'Usually at the counter', 'অনানুষ্ঠানিক তালিকা': 'unofficial list',
  'তথ্য নেই': 'no data', 'জ্যাম ছাড়া': 'without traffic',
  'সিএনজি': 'CNG', 'মিটার রেট': 'meter rate', 'বাইক': 'Bike', 'কার': 'Car', '১ জন': '1 person', '৪ জন, এসি': '4 people, AC',
  'ড্রাইভার (ডেমো)': 'Driver (demo)', 'আপনার': 'yours',
  'ছবি: উইকিমিডিয়া কমন্স': 'Photos: Wikimedia Commons', 'আশপাশে তোলা ছবি · উইকিমিডিয়া কমন্স': 'Photos taken nearby · Wikimedia Commons',
  'আশপাশে তোলা ছবি': 'Photos taken nearby', 'উইকিমিডিয়া কমন্স': 'Wikimedia Commons',
  'উৎস দেখুন': 'View source', 'আগের ছবি': 'Previous photo', 'পরের ছবি': 'Next photo', 'বন্ধ করুন': 'Close',

  // Dhaka buses
  'বাসের নাম বা যেকোনো জায়গা লিখুন — কোন বাস যায় দেখাবে।': 'Type a bus name or any place — see which buses go there.',
  'যেমন: তুরাগ, romna park, ঢাকা মেডিকেল': 'e.g. Turag, Ramna Park, Dhaka Medical', 'বাস বা জায়গা খুঁজুন': 'Search buses or places',
  'কোনো বাস পাওয়া যায়নি।': 'No buses found.', 'জায়গাটি খোঁজা হচ্ছে…': 'Looking up the place…',
  'এই নামে ঢাকায় কোনো বাস বা জায়গা পাওয়া যায়নি — অন্য বানানে লিখে দেখুন।': 'No bus or place in Dhaka by that name — try another spelling.',
  'ম্যাপে দেখুন': 'Show on map',

  // districts
  'জেলায় চাপ দিন — ঢাকা থেকে ভাড়া, বাস আর দর্শনীয় স্থান দেখুন।': 'Tap a district — see fares from Dhaka, buses and sights.',
  'জেলার নাম — যেমন: রংপুর, coxbazar': 'District name — e.g. Rangpur, Cox’s Bazar', 'জেলা খুঁজুন': 'Search districts',
  'জেলা থেকে জেলা': 'District to district', 'যেকোনো দুটি জেলার মধ্যে ভাড়া আর বাস।': 'Fares and buses between any two districts.',
  'কোন জেলা থেকে': 'From which district', 'কোন জেলায়': 'To which district',
  'বাস কোম্পানি — তারায় চাপ দিয়ে রেটিং দিন': 'Bus companies — tap the stars to rate', 'বাস কোম্পানি': 'Bus companies',
  'রাজধানী': 'Capital', 'ভাড়া দেখুন': 'See fares', 'ঢাকা থেকে': 'From Dhaka', 'ঢাকা থেকে বাস': 'Buses from Dhaka',
  'ঢাকা থেকে রুট': 'Route from Dhaka', 'কাছাকাছি খুঁজুন': 'Search nearby',
  'এই জেলার বাস কোম্পানির নাম এখনো যোগ হয়নি।': 'Bus companies for this district have not been added yet.',
  'এই নামে কোনো জেলা পাওয়া যায়নি।': 'No district found by that name.', 'দুটি আলাদা জেলা বেছে নিন।': 'Choose two different districts.',
  'দূরত্ব বের করা হচ্ছে…': 'Working out the distance…', 'দূরত্ব বের করা যায়নি।': 'The distance could not be worked out.',
  'দূরত্ব বের করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।': 'The distance could not be worked out. Check your internet connection and try again.',

  // nearby
  'একটি জায়গা দিন, তারপর কী খুঁজছেন বেছে নিন।': 'Give a place, then choose what you are looking for.',
  'কোন জায়গার কাছে — যেমন: রংপুর, mirpur 10': 'Near which place — e.g. Rangpur, Mirpur 10', 'কোন জায়গার কাছে': 'Near which place',
  'কাছের আগে': 'Nearest first', 'রেটিং আগে': 'Best rated first', 'চাপ দিলে বিস্তারিত': 'tap for details',
  'খোঁজা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।': 'Search failed. Check your internet connection and try again.',
  'রেটিং দিন': 'Rate it', 'এখনো রেটিং নেই': 'No ratings yet', 'রুট দেখুন': 'Show route',
  'আপনার রেটিং সবার রেটিংয়ের সাথে যোগ হয়।': 'Your rating is added to everyone else’s.',
  'সার্ভার ছাড়া চলছে — রেটিং শুধু এই ডিভাইসে থাকছে।': 'Running without the server — ratings stay on this device only.',
  'জরুরি বিভাগ': 'Emergency department', 'সরকারি': 'Government', 'বেসরকারি': 'Private',
  'টেনে সরান, চাপ দিলে বড় হবে': 'drag to scroll, tap to enlarge',

  // kinds of place
  'হাসপাতাল': 'Hospital', 'ফার্মেসি': 'Pharmacy', 'থানা': 'Police station', 'বাস স্ট্যান্ড': 'Bus stand', 'রেলস্টেশন': 'Railway station',
  'পেট্রোল পাম্প': 'Fuel station', 'এটিএম': 'ATM', 'ব্যাংক': 'Bank', 'পার্ক': 'Park', 'দর্শনীয় স্থান': 'Sight', 'হোটেল': 'Hotel',
  'রেস্টুরেন্ট': 'Restaurant', 'মার্কেট': 'Market', 'মসজিদ': 'Mosque', 'স্কুল': 'School', 'কলেজ': 'College', 'বিশ্ববিদ্যালয়': 'University',
  'ফায়ার সার্ভিস': 'Fire service', 'বাজার': 'Market', 'শপিং মল': 'Shopping mall', 'বিমানবন্দর': 'Airport', 'এলাকা': 'Area',
  'বাস স্টপ': 'Bus stop', 'জাদুঘর': 'Museum', 'স্টেশন': 'Station', 'বাস টার্মিনাল': 'Bus terminal', 'স্টেডিয়াম': 'Stadium',
  'ফেরিঘাট': 'Ferry terminal', 'স্থলবন্দর': 'Land port',

  // fares
  'দূরত্ব বদলান, সাথে সাথে ভাড়া দেখুন।': 'Change the distance and see the fares at once.', 'কিমি': 'km', 'দূরত্ব, কিলোমিটার': 'Distance in kilometres',
  'শহরের বাস': 'City bus', 'দূরপাল্লার বাস': 'Long-distance bus', 'বাস (নন-এসি)': 'Bus (non-AC)',
  'ঢাকা ও চট্টগ্রাম শহর': 'Dhaka and Chattogram cities', 'ঢাকার আশপাশের জেলা': 'Districts around Dhaka', 'সারা দেশ, দূরপাল্লা': 'Whole country, long distance',
  'শহরে সর্বনিম্ন': 'Minimum in the city', 'এরপর প্রতি কিমি': 'Each km after that', 'অপেক্ষা, প্রতি মিনিট': 'Waiting, per minute',
  'মহানগর বাস (ঢাকা/চট্টগ্রাম)': 'Metro bus (Dhaka/Chattogram)', 'মহানগর মিনিবাস': 'Metro minibus',
  'ঢাকার আশপাশের জেলা (DTCA এলাকা)': 'Districts around Dhaka (DTCA area)', 'আন্তঃজেলা / দূরপাল্লা (নন-এসি)': 'Inter-district / long distance (non-AC)',
  '২২ সেপ্টেম্বর ২০২৬': '22 September 2026',

  // divisions and a few bus companies that have no English name in the data
  'ঢাকা': 'Dhaka', 'চট্টগ্রাম': 'Chattogram', 'সিলেট': 'Sylhet', 'রাজশাহী': 'Rajshahi', 'রংপুর': 'Rangpur', 'খুলনা': 'Khulna',
  'বরিশাল': 'Barishal', 'ময়মনসিংহ': 'Mymensingh', 'কক্সবাজার': 'Cox’s Bazar', 'মৌলভীবাজার': 'Moulvibazar',
  'শ্যামলী এনআর ট্রাভেলস': 'Shyamoli NR Travels', 'লন্ডন এক্সপ্রেস': 'London Express', 'সেন্টমার্টিন পরিবহন': 'St. Martin Paribahan',
  'এভারগ্রিন পরিবহন': 'Evergreen Paribahan', 'বিআরটিসি': 'BRTC', 'ইউনাইটেড পরিবহন': 'United Paribahan', 'শেরপুর ডিলাক্স': 'Sherpur Deluxe',
  'সৌখিন পরিবহন': 'Soukhin Paribahan', 'ভাটি বাংলা এক্সপ্রেস': 'Bhati Bangla Express', 'ড্রিমল্যান্ড পরিবহন': 'Dreamland Paribahan',
  'এনা পরিবহন': 'Ena Paribahan', 'শামীম এন্টারপ্রাইজ': 'Shamim Enterprise', 'আগমনী এক্সপ্রেস': 'Agamoni Express',
  'গ্রীন সেন্টমার্টিন এক্সপ্রেস': 'Green St. Martin Express', 'ইউরো কোচ': 'Euro Coach', 'প্রচেষ্টা পরিবহন': 'Prochesta Paribahan',
  'সেন্টমার্টিন ট্রাভেলস': 'St. Martin Travels', 'গ্রামীণ ট্রাভেলস': 'Grameen Travels', 'একতা ট্রান্সপোর্ট': 'Ekota Transport',
  'তুহিন এন্টারপ্রাইজ': 'Tuhin Enterprise', 'ফাল্গুনী মধুমতি পরিবহন': 'Falguni Madhumoti Paribahan'
};

// Sentences with a number or a name inside. First match wins; N is a number as the app prints it.
const N = '([\\d.,]+)';
const P = (source, fn) => [new RegExp('^' + source + '$'), fn];
const PATTERNS = [
  P(N + ' ঘণ্টা ' + N + ' মিনিট', (h, m) => `${h} hr ${m} min`),
  P(N + ' ঘণ্টা', h => `${h} hr`), P(N + ' মিনিট', m => `${m} min`), P(N + ' মিটার', m => `${m} m`), P(N + ' কিমি', k => `${k} km`),
  P(N + ' টি', n => n), P(N + ' জন', n => `${n} ${n === '1' ? 'rating' : 'ratings'}`), P(N + ' শয্যা', n => `${n} beds`),
  P(N + ' স্টপ', n => `${n} stops`), P(N + ' তারা', n => `${n} stars`),
  P(N + ' জন সদস্য', n => `${n} ${n === '1' ? 'person' : 'people'}`),
  P(N + ' দিন ' + N + ' রাত', (d, n) => `${d} days, ${n} ${n === '1' ? 'night' : 'nights'}`), P(N + ' দিন', d => `${d} ${d === '1' ? 'day' : 'days'}`),
  P(N + ' রুম × ' + N + ' রাত', (r, n) => `${r} ${r === '1' ? 'room' : 'rooms'} × ${n} ${n === '1' ? 'night' : 'nights'}`),
  P('জনপ্রতি (৳[^·]+)', a => `${a} per person`),
  P('(.+) ট্যুর', a => `${tr(a)} tour`),
  P('প্রায় ([^·]+)', a => `about ${tr(a)}`),
  P('গাড়িতে প্রায় ([^·]+)', a => `about ${tr(a)} by car`),
  P('(.+) থেকে উঠুন', a => `Board at ${tr(a)}`),
  P('(.+)-এ বাস বদল', a => `Change bus at ${tr(a)}`),
  P('(.+) স্টপে নামুন', a => `Get off at ${tr(a)}`),
  P('(.+) – (.+) রুটের বাস', (a, b) => `Buses on ${tr(a)} – ${tr(b)}`),
  P('(.+) দূরে', a => `${tr(a)} away`),
  P('([^·]+)-এর কাছে ' + N + ' টি ([^·]+)', (place, n, kind) => `${tr(kind)}: ${n} near ${tr(place)}`),
  P('(.+)-এর কাছের (.+) খোঁজা হচ্ছে…', (place, kind) => `Looking for ${tr(kind)} near ${tr(place)}…`),
  P('(.+)-এর ৩০ কিমির মধ্যে কোনো (.+) ম্যাপে পাওয়া যায়নি।', (place, kind) => `No ${tr(kind)} found on the map within 30 km of ${tr(place)}.`),
  P('(.+)-এর কাছে \\(১\\.২ কিমির মধ্যে\\) কোনো বাস স্টপ আমাদের তালিকায় নেই।', a => `No bus stop in our list within 1.2 km of ${tr(a)}.`),
  P('(.+) — কাছের স্টপ: (.+)', (a, stops) => `${tr(a)} — nearby stops: ${stops.split(', ').map(tr).join(', ')}`),
  P(N + ' টি বাস যায়', n => `${n} buses go there`),
  P('(.+) খোঁজা হচ্ছে…', a => `Looking for ${tr(a)}…`),
  P('([^·]+) বিভাগ', a => `${tr(a)} Division`),
  P('ঢাকা থেকে ' + N + ' জেলায়', n => `${n} districts from Dhaka`),
  P('ঢাকা থেকে (৳.+)', a => `From Dhaka ${a}`),
  P('এসি (৳.+)', a => `AC ${a}`),
  P('কিমি প্রতি (.+)', a => `${a} per km`),
  P('(.+)/কিমি', a => `${a}/km`),
  P('প্রথম ' + N + ' কিমি', n => `First ${n} km`),
  P('ডেমো: (.+) ' + N + ' মিনিটে আসছে', (name, n) => `Demo: ${tr(name)} arriving in ${n} min`),
  P('সড়কপথে ' + N + ' কিমি', n => `${n} km by road`),
  P('সরকারি হারে আনুমানিক (.+)', a => `about ${a} at the government rate`),
  P('কিমি-প্রতি হার সরকার নির্ধারিত, (.+) থেকে।.*', date =>
    `The per-km rate is set by the government, from ${tr(date)}. Fares in the app are that rate × an estimated distance, so they may ` +
    'differ a little from BRTA’s route-by-route chart (bridge tolls are not included). AC bus fares are set by the companies.')
];

// Bangla name -> English name, from the app's own data. Built on first use, after every data file has loaded.
let NAMES = null;
const NAME_FIXES = { 'কক্সবাজার': 'Cox’s Bazar' };
function buildNames() {
  NAMES = new Map();
  const add = (bn, en) => { if (bn && en && !NAMES.has(bn)) NAMES.set(bn, en); };
  for (const d of DISTRICTS) add(d.bn, NAME_FIXES[d.bn] || d.en.split(' ')[0]);   // `en` also holds old spellings
  for (const s of Object.values(STOPS)) add(s.bn, s.en);
  for (const r of LOCAL_ROUTES) add(r.bn, r.en);
  for (const o of OPERATORS) add(o.bn, o.en);
  for (const p of PLACES) {
    // The English field carries alternate spellings for search; drop a word that only respells an earlier one.
    const keys = new Set(), words = [];
    for (const w of p.en.split(' ')) {
      const k = latinKey(w);
      if (!keys.has(k)) { keys.add(k); words.push(w); }
    }
    add(p.bn, words.join(' '));
  }
}
function addIndexNames(index) {
  if (LANG !== 'en') return;
  if (!NAMES) buildNames();
  for (const p of index) if (p.en && p.bn !== p.en && !NAMES.has(p.bn)) NAMES.set(p.bn, p.en);
}

const HAS_BANGLA = /[ঀ-৿]/;
const SEPARATORS = [' · ', ' — ', ' → ', ' – ', ', '];
const trCache = new Map();

// Bangla text -> English, or the text unchanged when there is no translation.
function tr(text) {
  if (LANG !== 'en' || !text || !HAS_BANGLA.test(text)) return text;
  if (trCache.has(text)) return trCache.get(text);
  if (!NAMES) buildNames();
  const lead = text.match(/^\s*/)[0], tail = text.match(/\s*$/)[0], s = text.trim();
  let out = EXACT[s] || NAMES.get(s);
  if (!out) {
    for (const [re, fn] of PATTERNS) {
      const m = s.match(re);
      if (m) { out = fn(...m.slice(1)); break; }
    }
  }
  if (!out) {
    const sep = SEPARATORS.find(x => s.includes(x));
    if (sep) out = s.split(sep).map(tr).join(sep);
  }
  out = lead + (out || s) + tail;
  trCache.set(text, out);
  return out;
}

// Translate one element and everything under it: text, placeholders, tooltips and screen-reader labels.
function translateTree(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (HAS_BANGLA.test(n.nodeValue) && !n.parentNode.closest('script, style, .bn-labels')) {
      const t = tr(n.nodeValue);
      if (t !== n.nodeValue) n.nodeValue = t;
    }
  }
  const els = root.nodeType === 1 ? [root, ...root.querySelectorAll('[placeholder], [title], [aria-label], option, optgroup')] : [];
  for (const e of els) {
    for (const attr of ['placeholder', 'title', 'aria-label', 'label']) {
      const v = e.getAttribute && e.getAttribute(attr);
      if (v && HAS_BANGLA.test(v)) e.setAttribute(attr, tr(v));
    }
  }
}

// English mode: translate the page now, and keep translating whatever the app draws later.
function startTranslating() {
  if (LANG !== 'en') return;
  translateTree(document.body);
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData') {
        if (HAS_BANGLA.test(r.target.nodeValue) && !r.target.parentNode.closest('.bn-labels')) {
          const t = tr(r.target.nodeValue);
          if (t !== r.target.nodeValue) r.target.nodeValue = t;
        }
      } else for (const n of r.addedNodes) {
        if (n.nodeType === 1) translateTree(n);
        else if (n.nodeType === 3 && HAS_BANGLA.test(n.nodeValue)) n.nodeValue = tr(n.nodeValue);
      }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
