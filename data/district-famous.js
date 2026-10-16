// ---- What each district is famous for: Bangladesh's registered Geographical Indications (GI) ----
// Source: the GI journal list of the Department of Patents, Designs and Trademarks (dpdt.gov.bd, জি-আই-জার্নাল),
// read on 17 Oct 2026 — 68 numbered entries. Each product is placed in the district its registered name gives.
// Left out: products registered for the whole country (ilish, kalijira, shital pati, bagda chingri, Black Bengal
// goat), Jamdani (no place in its name), and Kaliganj towels (four districts have a Kaliganj).
// Sundarban honey is listed for the three districts the Sundarbans lie in.
// [district id, Bangla name, English name, 'f' food or 'p' product, GI journal number]
const GI_PRODUCTS = [
  ['dhaka', 'ঢাকাই মসলিন', 'Dhakai Muslin', 'p', 9], ['dhaka', 'মিরপুরের কাতান শাড়ি', 'Mirpur Katan saree', 'p', 39],
  ['dhaka', 'ঢাকাই ফুটি কার্পাস তুলা', 'Dhakai Phuti Karpas cotton', 'p', 40],
  ['gazipur', 'গাজীপুরের কাঁঠাল', 'Gazipur jackfruit', 'f', 47],
  ['munshiganj', 'মুন্সীগঞ্জের পাতক্ষীর', 'Munshiganj patkhir', 'f', 53],
  ['narsingdi', 'নরসিংদীর অমৃত সাগর কলা', 'Narsingdi Amrita Sagar banana', 'f', 24], ['narsingdi', 'নরসিংদীর লটকন', 'Narsingdi latkan', 'f', 33],
  ['manikganj', 'মানিকগঞ্জের হাজারী গুড়', 'Manikganj Hajari gur', 'f', 65],
  ['tangail', 'টাঙ্গাইলের পোড়াবাড়ির চমচম', 'Porabari chamcham', 'f', 20], ['tangail', 'টাঙ্গাইল শাড়ি', 'Tangail saree', 'p', 23],
  ['tangail', 'মধুপুরের আনারস', 'Madhupur pineapple', 'f', 34], ['tangail', 'মির্জাপুরের জামুর্কির সন্দেশ', 'Jamurki sandesh', 'f', 55],
  ['kishoreganj', 'অষ্টগ্রামের পনির', 'Austagram cheese', 'f', 49], ['kishoreganj', 'কিশোরগঞ্জের রাতা বোরো ধান', 'Kishoreganj Rata Boro rice', 'f', 48],
  ['faridpur', 'ফরিদপুরের পাট', 'Faridpur jute', 'p', 61],
  ['rajbari', 'রাজবাড়ীর ক্ষীর চমচম', 'Rajbari khir chamcham', 'f', 66],
  ['gopalganj', 'গোপালগঞ্জের রসগোল্লা', 'Gopalganj rasgolla', 'f', 29], ['gopalganj', 'গোপালগঞ্জের ব্রোঞ্জের গহনা', 'Gopalganj bronze jewellery', 'p', 44],
  ['mymensingh', 'মুক্তাগাছার মণ্ডা', 'Muktagachha monda', 'f', 28], ['mymensingh', 'ফুলবাড়ীয়ার লাল চিনি', 'Fulbaria red sugar', 'f', 59],
  ['jamalpur', 'জামালপুরের নকশিকাঁথা', 'Jamalpur nakshi kantha', 'p', 32],
  ['sherpur', 'শেরপুরের তুলশিমালা ধান', 'Sherpur Tulshimala rice', 'f', 13], ['sherpur', 'শেরপুরের ছানার পায়েস', 'Sherpur chhanar payesh', 'f', 41],
  ['netrokona', 'বিজয়পুরের সাদা মাটি', 'Bijoypur white clay', 'p', 4], ['netrokona', 'নেত্রকোণার বালিশ মিষ্টি', 'Netrokona balish mishti', 'f', 58],
  ['cumilla', 'কুমিল্লার রসমালাই', 'Cumilla rasmalai', 'f', 21], ['cumilla', 'কুমিল্লার খাদি', 'Cumilla khadi', 'p', 42],
  ['brahmanbaria', 'ব্রাহ্মণবাড়িয়ার ছানামুখী মিষ্টি', 'Brahmanbaria chhanamukhi', 'f', 43],
  ['sylhet', 'সিলেটের মণিপুরি শাড়ি', 'Sylhet Manipuri saree', 'p', 38],
  ['moulvibazar', 'মৌলভীবাজারের আগর', 'Moulvibazar agar', 'p', 26], ['moulvibazar', 'মৌলভীবাজারের আগর আতর', 'Moulvibazar agar attar', 'p', 27],
  ['rajshahi', 'রাজশাহী সিল্ক', 'Rajshahi silk', 'p', 8], ['rajshahi', 'রাজশাহীর ফজলি আম', 'Rajshahi Fazli mango', 'f', 10], ['rajshahi', 'রাজশাহীর মিষ্টি পান', 'Rajshahi sweet betel leaf', 'f', 31],
  ['chapainawabganj', 'চাঁপাইনবাবগঞ্জের খিরসাপাত আম', 'Khirsapat mango', 'f', 3], ['chapainawabganj', 'চাঁপাইনবাবগঞ্জের ফজলি আম', 'Fazli mango', 'f', 12],
  ['chapainawabganj', 'চাঁপাইনবাবগঞ্জের ল্যাংড়া আম', 'Langra mango', 'f', 16], ['chapainawabganj', 'চাঁপাইনবাবগঞ্জের আশ্বিনা আম', 'Ashwina mango', 'f', 17],
  ['chapainawabganj', 'চাঁপাইনবাবগঞ্জের গোপালভোগ আম', 'Gopalbhog mango', 'f', 68],
  ['bogura', 'বগুড়ার দই', 'Bogura doi', 'f', 15],
  ['natore', 'নাটোরের কাঁচাগোল্লা', 'Natore kachagolla', 'f', 18],
  ['naogaon', 'নওগাঁর নাক ফজলি আম', 'Naogaon Nak Fazli mango', 'f', 54],
  ['joypurhat', 'জয়পুরহাটের লতিরাজ কচু', 'Joypurhat Latiraj kachu', 'f', 64],
  ['sirajganj', 'সিরাজগঞ্জের গামছা', 'Sirajganj gamchha', 'p', 37], ['sirajganj', 'সিরাজগঞ্জের লুঙ্গি', 'Sirajganj lungi', 'p', 46],
  ['rangpur', 'রংপুরের শতরঞ্জি', 'Rangpur shataranji', 'p', 7], ['rangpur', 'রংপুরের হাঁড়িভাঙ্গা আম', 'Haribhanga mango', 'f', 25],
  ['dinajpur', 'দিনাজপুরের কাটারীভোগ চাল', 'Dinajpur Kataribhog rice', 'f', 5], ['dinajpur', 'দিনাজপুরের বেদানা লিচু', 'Dinajpur Bedana litchi', 'f', 52],
  ['kushtia', 'কুষ্টিয়ার তিলের খাজা', 'Kushtia tiler khaja', 'f', 22], ['kushtia', 'কুমারখালীর বেডশিট', 'Kumarkhali bedsheet', 'p', 51],
  ['jashore', 'যশোরের খেজুরের গুড়', 'Jashore date-palm gur', 'f', 30],
  ['magura', 'মাগুরার হাজরাপুরী লিচু', 'Magura Hazrapuri litchi', 'f', 36],
  ['meherpur', 'মেহেরপুরের মেহেরসাগর কলা', 'Mehersagar banana', 'f', 57], ['meherpur', 'মেহেরপুরের হিমসাগর আম', 'Meherpur Himsagar mango', 'f', 60],
  ['meherpur', 'মেহেরপুরের সাবিত্রী মিষ্টি', 'Meherpur Sabitri mishti', 'f', 62],
  ['satkhira', 'সাতক্ষীরার মাটির টালি', 'Satkhira clay tiles', 'p', 67],
  ['khulna', 'সুন্দরবনের মধু', 'Sundarban honey', 'f', 45], ['bagerhat', 'সুন্দরবনের মধু', 'Sundarban honey', 'f', 45], ['satkhira', 'সুন্দরবনের মধু', 'Sundarban honey', 'f', 45],
  ['barishal', 'বরিশালের আমড়া', 'Barishal amra', 'f', 50],
  ['bhola', 'ভোলার মহিষের দুধের কাঁচা দই', 'Bhola buffalo-milk doi', 'f', 35]
];
const GI_NATIONAL = [['বাংলাদেশের ইলিশ', 'Ilish of Bangladesh', 'f', 2], ['বাংলাদেশ কালিজিরা চাল', 'Kalijira rice', 'f', 6], ['বাংলাদেশের শীতল পাটি', 'Shital pati', 'p', 14],
  ['বাংলাদেশের বাগদা চিংড়ি', 'Bagda shrimp', 'f', 11], ['জামদানি শাড়ি', 'Jamdani saree', 'p', 1]];
const GI_SOURCE = { bn: 'জিআই: পেটেন্ট, শিল্প-নকশা ও ট্রেডমার্কস অধিদপ্তরের জিআই জার্নাল', en: 'GI: Department of Patents, Designs and Trademarks, GI journal', url: 'https://dpdt.gov.bd/' };
const giOf = id => GI_PRODUCTS.filter(g => g[0] === id).map(([, bn, en, kind, no]) => ({ bn, en, kind, no }));
