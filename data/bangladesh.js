// ---- All 64 districts (district town coordinates, approximate) ----
const DISTRICTS = [
  // id, Bangla, English, lat, lon, division
  ['dhaka', 'ঢাকা', 'Dhaka', 23.8103, 90.4125, 'ঢাকা'],
  ['gazipur', 'গাজীপুর', 'Gazipur', 23.9999, 90.4203, 'ঢাকা'],
  ['narayanganj', 'নারায়ণগঞ্জ', 'Narayanganj', 23.6238, 90.5000, 'ঢাকা'],
  ['munshiganj', 'মুন্সীগঞ্জ', 'Munshiganj', 23.5422, 90.5305, 'ঢাকা'],
  ['narsingdi', 'নরসিংদী', 'Narsingdi', 23.9230, 90.7177, 'ঢাকা'],
  ['manikganj', 'মানিকগঞ্জ', 'Manikganj', 23.8617, 90.0003, 'ঢাকা'],
  ['tangail', 'টাঙ্গাইল', 'Tangail', 24.2513, 89.9167, 'ঢাকা'],
  ['kishoreganj', 'কিশোরগঞ্জ', 'Kishoreganj', 24.4260, 90.7829, 'ঢাকা'],
  ['faridpur', 'ফরিদপুর', 'Faridpur', 23.6070, 89.8429, 'ঢাকা'],
  ['rajbari', 'রাজবাড়ী', 'Rajbari', 23.7574, 89.6445, 'ঢাকা'],
  ['gopalganj', 'গোপালগঞ্জ', 'Gopalganj', 23.0050, 89.8266, 'ঢাকা'],
  ['madaripur', 'মাদারীপুর', 'Madaripur', 23.1641, 90.1897, 'ঢাকা'],
  ['shariatpur', 'শরীয়তপুর', 'Shariatpur', 23.2423, 90.4348, 'ঢাকা'],
  ['mymensingh', 'ময়মনসিংহ', 'Mymensingh', 24.7471, 90.4203, 'ময়মনসিংহ'],
  ['jamalpur', 'জামালপুর', 'Jamalpur', 24.9375, 89.9372, 'ময়মনসিংহ'],
  ['sherpur', 'শেরপুর', 'Sherpur', 25.0205, 90.0153, 'ময়মনসিংহ'],
  ['netrokona', 'নেত্রকোনা', 'Netrokona', 24.8703, 90.7279, 'ময়মনসিংহ'],
  ['chattogram', 'চট্টগ্রাম', 'Chattogram Chittagong', 22.3569, 91.7832, 'চট্টগ্রাম'],
  ['coxsbazar', 'কক্সবাজার', "Cox's Bazar Coxs", 21.4272, 92.0058, 'চট্টগ্রাম'],
  ['cumilla', 'কুমিল্লা', 'Cumilla Comilla', 23.4607, 91.1809, 'চট্টগ্রাম'],
  ['feni', 'ফেনী', 'Feni', 23.0159, 91.3976, 'চট্টগ্রাম'],
  ['brahmanbaria', 'ব্রাহ্মণবাড়িয়া', 'Brahmanbaria', 23.9571, 91.1119, 'চট্টগ্রাম'],
  ['chandpur', 'চাঁদপুর', 'Chandpur', 23.2333, 90.6713, 'চট্টগ্রাম'],
  ['lakshmipur', 'লক্ষ্মীপুর', 'Lakshmipur', 22.9425, 90.8412, 'চট্টগ্রাম'],
  ['noakhali', 'নোয়াখালী', 'Noakhali', 22.8696, 91.0995, 'চট্টগ্রাম'],
  ['rangamati', 'রাঙ্গামাটি', 'Rangamati', 22.6533, 92.1789, 'চট্টগ্রাম'],
  ['khagrachhari', 'খাগড়াছড়ি', 'Khagrachhari', 23.1193, 91.9847, 'চট্টগ্রাম'],
  ['bandarban', 'বান্দরবান', 'Bandarban', 22.1953, 92.2184, 'চট্টগ্রাম'],
  ['sylhet', 'সিলেট', 'Sylhet', 24.8949, 91.8687, 'সিলেট'],
  ['moulvibazar', 'মৌলভীবাজার', 'Moulvibazar', 24.4829, 91.7774, 'সিলেট'],
  ['habiganj', 'হবিগঞ্জ', 'Habiganj', 24.3745, 91.4155, 'সিলেট'],
  ['sunamganj', 'সুনামগঞ্জ', 'Sunamganj', 25.0658, 91.3950, 'সিলেট'],
  ['rajshahi', 'রাজশাহী', 'Rajshahi', 24.3745, 88.6042, 'রাজশাহী'],
  ['bogura', 'বগুড়া', 'Bogura Bogra', 24.8465, 89.3773, 'রাজশাহী'],
  ['pabna', 'পাবনা', 'Pabna', 24.0064, 89.2372, 'রাজশাহী'],
  ['sirajganj', 'সিরাজগঞ্জ', 'Sirajganj', 24.4534, 89.7007, 'রাজশাহী'],
  ['natore', 'নাটোর', 'Natore', 24.4206, 89.0003, 'রাজশাহী'],
  ['naogaon', 'নওগাঁ', 'Naogaon', 24.7936, 88.9318, 'রাজশাহী'],
  ['chapainawabganj', 'চাঁপাইনবাবগঞ্জ', 'Chapainawabganj', 24.5965, 88.2775, 'রাজশাহী'],
  ['joypurhat', 'জয়পুরহাট', 'Joypurhat', 25.0968, 89.0227, 'রাজশাহী'],
  ['rangpur', 'রংপুর', 'Rangpur', 25.7439, 89.2752, 'রংপুর'],
  ['dinajpur', 'দিনাজপুর', 'Dinajpur', 25.6217, 88.6354, 'রংপুর'],
  ['thakurgaon', 'ঠাকুরগাঁও', 'Thakurgaon', 26.0337, 88.4617, 'রংপুর'],
  ['panchagarh', 'পঞ্চগড়', 'Panchagarh', 26.3411, 88.5542, 'রংপুর'],
  ['nilphamari', 'নীলফামারী', 'Nilphamari', 25.9318, 88.8560, 'রংপুর'],
  ['lalmonirhat', 'লালমনিরহাট', 'Lalmonirhat', 25.9923, 89.2847, 'রংপুর'],
  ['kurigram', 'কুড়িগ্রাম', 'Kurigram', 25.8054, 89.6362, 'রংপুর'],
  ['gaibandha', 'গাইবান্ধা', 'Gaibandha', 25.3288, 89.5281, 'রংপুর'],
  ['khulna', 'খুলনা', 'Khulna', 22.8456, 89.5403, 'খুলনা'],
  ['jashore', 'যশোর', 'Jashore Jessore', 23.1667, 89.2089, 'খুলনা'],
  ['satkhira', 'সাতক্ষীরা', 'Satkhira', 22.7185, 89.0705, 'খুলনা'],
  ['bagerhat', 'বাগেরহাট', 'Bagerhat', 22.6516, 89.7859, 'খুলনা'],
  ['kushtia', 'কুষ্টিয়া', 'Kushtia', 23.9013, 89.1205, 'খুলনা'],
  ['jhenaidah', 'ঝিনাইদহ', 'Jhenaidah', 23.5448, 89.1539, 'খুলনা'],
  ['magura', 'মাগুরা', 'Magura', 23.4873, 89.4199, 'খুলনা'],
  ['narail', 'নড়াইল', 'Narail', 23.1725, 89.5127, 'খুলনা'],
  ['chuadanga', 'চুয়াডাঙ্গা', 'Chuadanga', 23.6402, 88.8418, 'খুলনা'],
  ['meherpur', 'মেহেরপুর', 'Meherpur', 23.7622, 88.6318, 'খুলনা'],
  ['barishal', 'বরিশাল', 'Barishal Barisal', 22.7010, 90.3535, 'বরিশাল'],
  ['patuakhali', 'পটুয়াখালী', 'Patuakhali', 22.3596, 90.3299, 'বরিশাল'],
  ['bhola', 'ভোলা', 'Bhola', 22.6859, 90.6482, 'বরিশাল'],
  ['pirojpur', 'পিরোজপুর', 'Pirojpur', 22.5841, 89.9720, 'বরিশাল'],
  ['jhalokathi', 'ঝালকাঠি', 'Jhalokathi', 22.6406, 90.1987, 'বরিশাল'],
  ['barguna', 'বরগুনা', 'Barguna', 22.1591, 90.1256, 'বরিশাল']
].map(([id, bn, en, lat, lon, division]) => ({ id, bn, en, lat, lon, division }));

// ---- Inter-district bus companies ----
// From general knowledge, NOT from official timetables: which districts each company runs to from Dhaka.
// Verify with the company / counters. Ticket prices are deliberately not stored here — the app shows the
// BRTA legal non-AC fare and an AC estimate instead. Add `price` data only from a real source.
const OPERATORS = [
  // Bangla, English, AC, non-AC, districts served (Dhaka is implied)
  ['হানিফ এন্টারপ্রাইজ', 'Hanif Enterprise', true, true, 'chattogram coxsbazar sylhet rajshahi rangpur dinajpur bogura khulna jashore barishal kushtia pabna thakurgaon panchagarh nilphamari satkhira feni rangamati khagrachhari chapainawabganj naogaon'],
  ['শ্যামলী পরিবহন', 'Shyamoli Paribahan', true, true, 'chattogram coxsbazar sylhet rajshahi rangpur dinajpur bogura khulna jashore kushtia pabna bandarban rangamati khagrachhari thakurgaon panchagarh kurigram lalmonirhat satkhira moulvibazar'],
  ['গ্রীন লাইন', 'Green Line', true, false, 'chattogram coxsbazar sylhet khulna jashore barishal'],
  ['এনা ট্রান্সপোর্ট', 'Ena Transport', true, true, 'sylhet moulvibazar habiganj sunamganj chattogram coxsbazar mymensingh'],
  ['সৌদিয়া', 'Soudia', true, true, 'chattogram coxsbazar'],
  ['এস. আলম', 'S. Alam', true, true, 'chattogram coxsbazar'],
  ['টিআর ট্রাভেলস', 'TR Travels', true, true, 'chattogram coxsbazar'],
  ['ইউনিক সার্ভিস', 'Unique Service', false, true, 'chattogram coxsbazar sylhet noakhali'],
  ['সোহাগ পরিবহন', 'Sohag Paribahan', true, true, 'chattogram coxsbazar khulna jashore satkhira'],
  ['স্টার লাইন', 'Star Line', true, true, 'feni chattogram'],
  ['তিশা', 'Tisha', true, true, 'cumilla'],
  ['রয়েল কোচ', 'Royal Coach', true, false, 'cumilla brahmanbaria'],
  ['হিমাচল এক্সপ্রেস', 'Himachal Express', true, true, 'noakhali lakshmipur'],
  ['নাবিল পরিবহন', 'Nabil Paribahan', true, true, 'rangpur dinajpur thakurgaon panchagarh nilphamari bogura'],
  ['এসআর ট্রাভেলস', 'SR Travels', true, true, 'bogura rangpur dinajpur naogaon joypurhat gaibandha'],
  ['শাহ ফতেহ আলী', 'Shah Fateh Ali', true, true, 'bogura'],
  ['দেশ ট্রাভেলস', 'Desh Travels', true, true, 'rajshahi chapainawabganj natore chattogram coxsbazar jashore'],
  ['ন্যাশনাল ট্রাভেলস', 'National Travels', true, true, 'rajshahi chapainawabganj natore'],
  ['ঈগল পরিবহন', 'Eagle Paribahan', true, true, 'khulna jashore satkhira magura'],
  ['ইমাদ পরিবহন', 'Emad Paribahan', true, true, 'gopalganj khulna bagerhat pirojpur'],
  ['টুঙ্গিপাড়া এক্সপ্রেস', 'Tungipara Express', false, true, 'gopalganj'],
  ['গোল্ডেন লাইন', 'Golden Line', false, true, 'faridpur rajbari'],
  ['সাকুরা পরিবহন', 'Sakura Paribahan', true, true, 'barishal patuakhali jhalokathi pirojpur barguna'],
  ['আলম এশিয়া', 'Alam Asia', false, true, 'mymensingh'],
  ['নিরালা সুপার', 'Nirala Super', false, true, 'tangail'],
  ['অনন্যা সুপার', 'Ananya Super', false, true, 'kishoreganj']
].map(([bn, en, ac, nonAc, d]) => ({ bn, en, ac, nonAc, districts: ['dhaka', ...d.split(' ')] }));

// ---- Counter (market) fares from Dhaka, per district ----
// Source: vromonprio.com "ঢাকা থেকে ৬৪ জেলার বাস ভাড়ার তালিকা ২০২৬" — an unofficial travel site, not BRTA.
// These are what counters typically charge; show them as a guide next to the government-rate estimate.
// [non-AC low, non-AC high, AC low, AC high] in taka; AC omitted where the source gave none.
const MARKET_FARES = {
  shariatpur: [250, 250], madaripur: [450, 500], faridpur: [550, 1000], rajbari: [550, 550], gopalganj: [500, 1200],
  manikganj: [120, 150], munshiganj: [80, 80], kishoreganj: [270, 350], narsingdi: [180, 180], tangail: [180, 250],
  narayanganj: [35, 70], gazipur: [80, 140],
  sylhet: [650, 700, 900, 1500], moulvibazar: [570, 570, 700, 700], sunamganj: [800, 850, 1050, 1050], habiganj: [460, 460],
  chattogram: [650, 750, 850, 2000], coxsbazar: [1000, 1000, 1200, 2000], rangamati: [850, 900, 1200, 1800],
  bandarban: [850, 900, 1200, 1800], khagrachhari: [750, 850, 1000, 1600], cumilla: [250, 400], brahmanbaria: [250, 300],
  noakhali: [500, 1000], lakshmipur: [450, 450, 550, 550], feni: [580, 1000, 700, 1400], chandpur: [250, 250],
  mymensingh: [320, 320, 450, 450], sherpur: [500, 500, 600, 600], netrokona: [450, 450], jamalpur: [500, 500, 600, 600],
  rangpur: [750, 800, 900, 1500], dinajpur: [800, 1080, 1100, 1500], panchagarh: [1000, 1100, 1300, 1900],
  thakurgaon: [800, 1050, 1200, 1800], kurigram: [800, 950, 1000, 1400], nilphamari: [800, 950, 1450, 1450],
  lalmonirhat: [800, 950, 1200, 1600], gaibandha: [600, 650, 700, 1100],
  barishal: [500, 650, 850, 1200], barguna: [650, 800], pirojpur: [650, 700, 800, 800], patuakhali: [750, 900, 1100, 1600],
  jhalokathi: [550, 700],
  rajshahi: [690, 750, 800, 1100], chapainawabganj: [600, 700, 1000, 1300], sirajganj: [500, 700, 800, 1300],
  bogura: [550, 1020, 1000, 1100], pabna: [500, 500, 800, 900], naogaon: [680, 1020, 1400, 1400], natore: [600, 750, 900, 1200],
  joypurhat: [600, 650, 700, 1400],
  khulna: [600, 750, 800, 1400], jashore: [550, 750, 750, 1300], bagerhat: [650, 800], magura: [500, 700, 750, 1300],
  satkhira: [650, 800, 900, 1200], chuadanga: [650, 1000], jhenaidah: [650, 650, 1000, 1200], kushtia: [600, 700, 1000, 1200],
  meherpur: [600, 700, 800, 1300], narail: [550, 550, 1200, 1200]
};

// Bus companies the same source lists per division (not per district) for trips from Dhaka.
const DIVISION_OPERATORS = {
  'সিলেট': ['এনা ট্রান্সপোর্ট', 'শ্যামলী এনআর ট্রাভেলস', 'হানিফ এন্টারপ্রাইজ', 'গ্রীন লাইন', 'লন্ডন এক্সপ্রেস'],
  'চট্টগ্রাম': ['গ্রীন লাইন', 'হানিফ এন্টারপ্রাইজ', 'শ্যামলী পরিবহন', 'সৌদিয়া', 'সেন্টমার্টিন পরিবহন', 'ঈগল পরিবহন', 'সোহাগ পরিবহন', 'এভারগ্রিন পরিবহন'],
  'ময়মনসিংহ': ['বিআরটিসি', 'ইউনাইটেড পরিবহন', 'শেরপুর ডিলাক্স', 'সৌখিন পরিবহন', 'ভাটি বাংলা এক্সপ্রেস', 'আলম এশিয়া', 'ড্রিমল্যান্ড পরিবহন', 'এনা পরিবহন', 'শামীম এন্টারপ্রাইজ'],
  'রংপুর': ['হানিফ এন্টারপ্রাইজ', 'শ্যামলী পরিবহন', 'শাহ ফতেহ আলী', 'আগমনী এক্সপ্রেস', 'নাবিল পরিবহন'],
  'বরিশাল': ['গ্রীন লাইন', 'হানিফ এন্টারপ্রাইজ', 'এনা পরিবহন', 'শ্যামলী পরিবহন', 'গ্রীন সেন্টমার্টিন এক্সপ্রেস', 'ইউরো কোচ', 'গোল্ডেন লাইন', 'প্রচেষ্টা পরিবহন', 'সেন্টমার্টিন ট্রাভেলস', 'সাকুরা পরিবহন'],
  'রাজশাহী': ['দেশ ট্রাভেলস', 'ন্যাশনাল ট্রাভেলস', 'গ্রামীণ ট্রাভেলস', 'হানিফ এন্টারপ্রাইজ', 'শ্যামলী পরিবহন', 'একতা ট্রান্সপোর্ট', 'তুহিন এন্টারপ্রাইজ'],
  'খুলনা': ['গ্রীন লাইন', 'সোহাগ পরিবহন', 'হানিফ এন্টারপ্রাইজ', 'টুঙ্গিপাড়া এক্সপ্রেস', 'ইমাদ পরিবহন', 'ফাল্গুনী মধুমতি পরিবহন'],
  'ঢাকা': []
};

// What people look for around a place. `tag` is an OpenStreetMap key:value used by the nearby search.
const NEARBY_CATEGORIES = [
  ['cross', 'হাসপাতাল', 'amenity:hospital'], ['pill', 'ফার্মেসি', 'amenity:pharmacy'], ['shield', 'থানা', 'amenity:police'],
  ['bus', 'বাস স্ট্যান্ড', 'amenity:bus_station'], ['train', 'রেলস্টেশন', 'railway:station'], ['fuel', 'পেট্রোল পাম্প', 'amenity:fuel'],
  ['card', 'এটিএম', 'amenity:atm'], ['bank', 'ব্যাংক', 'amenity:bank'], ['tree', 'পার্ক', 'leisure:park'],
  ['star', 'দর্শনীয় স্থান', 'tourism:attraction'], ['bed', 'হোটেল', 'tourism:hotel'], ['fork', 'রেস্টুরেন্ট', 'amenity:restaurant'],
  ['bag', 'মার্কেট', 'amenity:marketplace'], ['moon', 'মসজিদ', 'amenity:place_of_worship'], ['cap', 'স্কুল', 'amenity:school'],
  ['cap', 'কলেজ', 'amenity:college'], ['cap', 'বিশ্ববিদ্যালয়', 'amenity:university'], ['flame', 'ফায়ার সার্ভিস', 'amenity:fire_station']
].map(([icon, bn, tag]) => ({ icon, bn, tag }));

// National helplines.
const HELPLINES = [
  ['999', 'জরুরি সেবা', 'পুলিশ, ফায়ার সার্ভিস, অ্যাম্বুলেন্স'],
  ['16263', 'স্বাস্থ্য বাতায়ন', 'ডাক্তারের পরামর্শ'],
  ['333', 'সরকারি তথ্য ও সেবা', 'যেকোনো সরকারি সেবা'],
  ['109', 'নারী ও শিশু সহায়তা', 'নির্যাতন প্রতিরোধ'],
  ['1098', 'শিশু সহায়তা', 'চাইল্ড হেল্পলাইন'],
  ['16430', 'আইনি সহায়তা', 'বিনামূল্যে আইনি পরামর্শ']
].map(([number, bn, sub]) => ({ number, bn, sub }));
