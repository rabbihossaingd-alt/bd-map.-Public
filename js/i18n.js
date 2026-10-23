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

  'বাইক: পাঠাও-র প্রকাশিত হার (আগস্ট ২০২২)। কার: উবারের প্রকাশিত হার (২০১৭)। অ্যাপে চাহিদা বাড়লে ভাড়াও বাড়ে।': 'Bike: Pathao’s published rates (August 2022). Car: Uber’s published rates (2017). In the apps, fares rise with demand.',

  // trains, launches, fare reports, More page
  'সায়েদাবাদ': 'Sayedabad', 'গাবতলী': 'Gabtoli', 'মহাখালী': 'Mohakhali',
  'ট্রেন': 'Train', 'আরও': 'More', 'ভাষা': 'Language', 'লঞ্চ': 'Launch', 'রূপসী বাংলা': 'Rupashi Bangla', 'জেলা ঘুরি': 'Explore districts', 'জায়গা, বিখ্যাত খাবার, ভাড়া': 'Places, famous food, fares', 'খরচের হিসাব আর শেয়ারের কার্ড': 'Costs and a card to share',
  'যেসব জেলায় গিয়েছি': 'Districts I have been to', '/৬৪ জেলা': '/64 districts', '৬৪ জেলার জায়গা, বিখ্যাত খাবার, যেসব জেলায় গিয়েছেন': 'Places of 64 districts, famous food, where you have been',
  'কোথায় যাবেন, কতজন, কত দিন — খরচের হিসাব, আর বন্ধুদের সাথে শেয়ার করার কার্ড।': 'Where, how many, how long — the costs, and a card to share with friends.', 'কোথায় ঘুরবেন?': 'Where to go?', '৬৪ জেলার সবচেয়ে বেশি দেখা জায়গা, কোন জেলার কী বিখ্যাত, আর ঢাকা থেকে যাওয়ার ভাড়া — এক জায়গায়।': 'The most-visited places of 64 districts, what each is famous for, and the fare from Dhaka — in one place.',
  'সবচেয়ে বেশি দেখা জায়গা': 'Most-viewed places', 'উইকিপিডিয়ায় গত ৬০ দিনে সবচেয়ে বেশি পড়া জায়গাগুলো': 'The places read most on Wikipedia in the last 60 days',
  'কোন জেলার কী বিখ্যাত': 'What each district is famous for', 'সরকারের জিআই (ভৌগোলিক নির্দেশক) স্বীকৃত খাবার ও পণ্য — চাপ দিলে সেই জেলা': 'Food and goods with a government GI (geographical indication) — tap for the district',
  'জেলায় চাপ দিন — দর্শনীয় স্থান, বিখ্যাত খাবার, ঢাকা থেকে ভাড়া ও বাস।': 'Tap a district — its sights, famous food, and fares and buses from Dhaka.',
  'দর্শনীয় স্থান ও ছবি: বাংলা উইকিপিডিয়া ও উইকিমিডিয়া কমন্স · বিখ্যাত খাবার ও পণ্য: পেটেন্ট, শিল্প-নকশা ও ট্রেডমার্কস অধিদপ্তরের জিআই জার্নাল · ভাড়া: বিআরটিএ।': 'Sights and photos: Bangla Wikipedia and Wikimedia Commons · Famous food and goods: the GI journal of the Department of Patents, Designs and Trademarks · Fares: BRTA.',
  'জেলার নাম — যেমন: সিলেট, coxbazar': 'A district — e.g. Sylhet, coxbazar', 'নগরপথ': 'City ways', 'শহরে কীভাবে যাবেন?': 'Getting around the city', 'কোন লোকাল বাস কোথায় যায়, আর আসল ভাড়া কত — যাঁরা যান, তাঁদের কাছ থেকে।': 'Which local bus goes where, and what the fare really is — from the people who ride.',
  'ভাড়া জানান': 'Report a fare', 'প্রতিবার +১০ পয়েন্ট · লিডারবোর্ড': '+10 points each time · leaderboard', 'লোকাল বাস · ভাড়া জানান ও পয়েন্ট': 'Local buses · report fares, earn points', 'শহরে চলাচল': 'In the city', 'দূরপাল্লা': 'Long distance', 'Manzeela-র সব কিছু, এক জায়গায়।': 'Everything in Manzeela, in one place.',
  'কোন বাস কোথায় যায়, কোথায় থামে': 'Which bus goes where, and where it stops', 'লোকাল বাস, সিএনজি, লঞ্চ · লিডারবোর্ড': 'Local bus, CNG, launch · leaderboard',
  'জেলা থেকে জেলা, ট্রেন, লঞ্চ': 'District to district, trains, launches', 'লোকাল বাস': 'Local bus', 'কোথায় যাবেন?': 'Where to?', 'কোথা থেকে': 'From', 'কোথায় যাবেন': 'To', 'বাস': 'Bus', 'বাস · ট্রেন · লঞ্চ': 'Bus · Train · Launch', 'দূরপাল্লার বাস, ট্রেন আর লঞ্চ — রুট, সময় আর ভাড়া এক জায়গায়।': 'Long-distance buses, trains and launches — routes, times and fares in one place.',
  'যেকোনো দুটি জেলার মধ্যে দূরপাল্লার বাসের ভাড়া, আর কোন রুটে কোন বাস চলে।': 'Bus fares between any two districts, and which buses run on the route.', 'বাস কোম্পানি': 'Bus companies', 'তারায় চাপ দিয়ে রেটিং দিন।': 'Tap a star to rate.',
  'কোথায় যাবেন — যেমন: বরিশাল, ভোলা': 'Where to — e.g. Barishal, Bhola', 'জেলা থেকে জেলার বাস ভাড়া': 'Bus fares, district to district', 'যেকোনো দুটি জেলা — ভাড়া আর কোন বাস চলে, যাতায়াত পাতায়': 'Any two districts — fares and buses, on the Transport page',
  'দূরপাল্লার বাস, ট্রেন ও লঞ্চের সময়, ভাড়া, কোন ট্রেন': 'Times and fares of buses, trains and launches, which train', 'খরচের হিসাব আর শেয়ার করার কার্ড': 'A cost estimate and a card to share',
  'দুটি স্টেশন বেছে নিন — কোন ট্রেন, কখন ছাড়ে, ভাড়া কত।': 'Choose two stations — which trains, when they leave, what they cost.',
  'কোন স্টেশন থেকে': 'From which station', 'কোন স্টেশনে': 'To which station', 'দুটি স্টেশন বেছে নিন।': 'Choose two stations.',
  'দুটি আলাদা স্টেশন বেছে নিন।': 'Choose two different stations.', 'ট্রেনের তালিকা আসছে…': 'Loading the trains…',
  'ট্রেনের তালিকা আনা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।': 'The trains could not be loaded. Check your internet connection and try again.',
  'চাপ দিলে সব স্টেশন ও ভাড়া': 'tap for all stations and fares', 'প্রতিদিন': 'Daily', 'রেলওয়ের ভাড়া': 'railway fare',
  'শোভন': 'Shovon', 'শোভন চেয়ার': 'Shovon Chair', 'প্রথম শ্রেণি': 'First Class', 'স্নিগ্ধা': 'Snigdha', 'এসি সিট': 'AC Seat', 'এসি বার্থ': 'AC Berth',
  'আন্তঃনগর': 'Intercity', 'মেইল / এক্সপ্রেস': 'Mail / Express', 'কমিউটার': 'Commuter',
  'ঢাকা থেকে নদীপথে। তথ্য পুরোনো হতে পারে — ঘাটে যাচাই করে নিন।': 'By river from Dhaka. This information may be out of date — confirm at the terminal.',
  'যাচাই করা ভাড়া': 'Verified fare', 'ভাড়া ঠিক নয়? আসল ভাড়া জানান': 'Fare not right? Tell us the real fare',
  'আসল ভাড়া জানান': 'Report the real fare', 'আপনি কত ভাড়া দিয়েছেন? (টাকা)': 'How much did you pay? (taka)', 'জমা দিন': 'Submit',
  'আপনার জানানো ভাড়া সবার জন্য দেখানো হবে।': 'The fare you report will be shown to everyone.',
  '৫ থেকে ২০০০ টাকার মধ্যে একটি সংখ্যা লিখুন।': 'Enter a number between 5 and 2000 taka.',
  'জমা দেওয়া যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।': 'Could not save. Check your internet connection and try again.',
  'এই জায়গার কিছু হোটেল (ম্যাপ থেকে)': 'Some hotels here (from the map)',
  'সোমবার': 'Monday', 'মঙ্গলবার': 'Tuesday', 'বুধবার': 'Wednesday', 'বৃহস্পতিবার': 'Thursday', 'শুক্রবার': 'Friday', 'শনিবার': 'Saturday', 'রবিবার': 'Sunday',

  'যেমন: তুরাগ, jatrabari, ঢাকা মেডিকেল': 'e.g. Turag, Jatrabari, Dhaka Medical',
  // launches
  'ঢাকা (সদরঘাট)': 'Dhaka (Sadarghat)', 'রাত ৮টা': '8 pm', '৯টা ১৫': '9:15 pm', '৭–৮ ঘণ্টা': '7–8 hours', '৩–৪ ঘণ্টা': '3–4 hours',
  'সকাল ৭টা থেকে': 'from 7 am', 'দিনে কয়েকবার': 'several times a day',
  'মানামী': 'Manami', 'কুয়াকাটা-২': 'Kuakata-2', 'অ্যাডভেঞ্চার ৯': 'Adventure 9', 'কীর্তনখোলা ১০': 'Kirtankhola 10', 'পারাবত ১২': 'Parabat 12',
  'পারাবত ১৮': 'Parabat 18', 'সোনার বাংলা': 'Sonar Bangla', 'নূরজাহান': 'Nurjahan', 'রহমতুল্লাহ': 'Rahmatullah', 'ঈগল-৭': 'Eagle-7', 'রফ রফ': 'Rof Rof',
  'জনপ্রিয়': 'Popular', 'জনপ্রিয় স্টপ': 'Popular stops', 'ব্যস্ত স্টেশন': 'Busiest stations',
  'ঢাকার সদরঘাট থেকে নদীপথে। সময় ও ভাড়া বদলায় — যাওয়ার আগে ঘাটে যাচাই করে নিন।': 'By river from Sadarghat, Dhaka. Times and fares change — confirm at the terminal before you go.',
  'দুটি ট্রেনের টিকিট আলাদা কাটতে হয়। প্রথম ট্রেন দেরি করলে পরেরটি ধরা নাও যেতে পারে।': 'The two trains need separate tickets. If the first train is late you may miss the second.',
  // sign-in by e-mail, profile
  'ই-মেইলে আসা কোড দিয়ে': 'with a code sent to your e-mail', 'আপনার ই-মেইল': 'Your e-mail', 'কোড পাঠান': 'Send code', 'কোড দিন': 'Enter the code', '৬ সংখ্যার কোড': '6-digit code',
  'এই ঠিকানায় ৬ সংখ্যার একটি কোড যাবে। পাসওয়ার্ড লাগে না।': 'A 6-digit code will be sent to this address. No password needed.',
  'ই-মেইল না পেলে স্প্যাম ফোল্ডার দেখুন। কোড ১০ মিনিট চলবে।': 'If the e-mail does not arrive, check the spam folder. The code lasts 10 minutes.',
  'অন্য ই-মেইল দিন': 'Use another e-mail', 'যাচাই করুন': 'Verify', 'প্রোফাইল, মেসেজ ও সাপোর্ট পেতে': 'for your profile, messages and support',
  'ই-মেইল ঠিকানাটি ঠিক নয়।': 'That e-mail address is not valid.', 'একটু আগে কোড পাঠানো হয়েছে। এক মিনিট পরে আবার চেষ্টা করুন।': 'A code was just sent. Try again in a minute.',
  'এই মুহূর্তে ই-মেইল পাঠানো যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।': 'E-mail cannot be sent right now. Try again shortly.',
  'কোডটি মিলছে না। ই-মেইলটি আবার দেখুন।': 'That code does not match. Check the e-mail again.', 'কোডের সময় শেষ। নতুন কোড নিন।': 'The code has expired. Ask for a new one.',
  'ছবিটি নেওয়া যায়নি। অন্য একটি ছবি দিয়ে চেষ্টা করুন।': 'That picture could not be used. Try another one.',
  'এই অ্যাকাউন্টটি বন্ধ করা হয়েছে। সাহায্যের জন্য সাপোর্টে লিখুন।': 'This account has been suspended. Write to support for help.',
  'প্রোফাইল': 'Profile', 'আপনার প্রোফাইল': 'Your profile', 'নাম': 'Name', 'বায়ো — নিজের সম্পর্কে এক-দুই লাইন': 'Bio — a line or two about you',
  'যেমন: ঢাকায় থাকি, ঘুরতে ভালোবাসি': 'e.g. I live in Dhaka and love to travel', 'ছবি সরান': 'Remove picture', 'ছবি বদলানো হয়েছে।': 'Picture changed.', 'সেভ করুন': 'Save',
  'স্বাগতম! আপনার নাম আর একটি ছবি দিন, যাতে বন্ধুরা আপনাকে চিনতে পারে।': 'Welcome! Add your name and a picture so friends can recognise you.',
  'অ্যাডমিন প্যানেল': 'Admin panel', 'অ্যাকাউন্ট মুছে ফেলুন': 'Delete account', 'অ্যাকাউন্ট মুছে ফেলবেন?': 'Delete your account?', 'হ্যাঁ, সব মুছে ফেলুন': 'Yes, delete everything',
  'আপনার প্রোফাইল, বন্ধু তালিকা, সব মেসেজ, রেটিং ও সাপোর্টের কথোপকথন চিরতরে মুছে যাবে। এটি ফেরানো যায় না।': 'Your profile, friends, all messages, ratings and support conversations will be deleted for good. This cannot be undone.',
  'প্রোফাইল দেখুন': 'View profile', 'ব্যবহারকারী, সাপোর্ট, রিপোর্ট': 'Users, support, reports',
  // profiles, following, settings
  'ফলো করুন': 'Follow', 'ফলো ব্যাক করুন': 'Follow back', 'ফলো ব্যাক': 'Follow back', 'ফলো করছেন': 'Following', 'বন্ধু': 'Friends', 'আনফলো': 'Unfollow', 'আনফলো করুন': 'Unfollow',
  'ফলোয়ার': 'Followers', 'ফলোয়িং': 'Following', 'পয়েন্ট': 'Points', 'সরান': 'Remove', 'আপনাকে ফলো করছেন': 'Following you',
  'ফলো করছেন · ফলো ব্যাকের অপেক্ষায়': 'You follow them · waiting for a follow back', 'এখনো কাউকে ফলো করেননি।': 'Not following anyone yet.', 'এখনো কোনো ফলোয়ার নেই।': 'No followers yet.',
  'মানুষ খুঁজুন': 'Find people', 'নাম দিয়ে': 'by name', 'নাম লিখুন': 'Type a name', 'নাম দিয়ে খুঁজে ফলো করুন': 'Search by name and follow',
  'যাঁকে খুঁজছেন তাঁর নামের প্রথম কয়েকটি অক্ষর লিখুন।': 'Type the first few letters of the name you are looking for.', 'এই নামে কাউকে পাওয়া যায়নি।': 'Nobody was found with that name.',
  'এখনো কোনো কথোপকথন নেই': 'No conversations yet', 'নাম দিয়ে মানুষ খুঁজে ফলো করুন। দুজনই দুজনকে ফলো করলে মেসেজ ও কল করা যাবে।': 'Find people by name and follow them. When you both follow each other, you can message and call.',
  'আপনারা একে অপরকে ফলো করছেন। প্রথম মেসেজটি পাঠান।': 'You follow each other. Send the first message.', 'তিনি ফলো ব্যাক করলে মেসেজ করা যাবে': 'You can message once they follow you back',
  'প্রোফাইল এডিট': 'Edit profile', 'সেটিংস': 'Settings', 'প্রোফাইল, ভাষা, লগআউট': 'Profile, language, log out', 'প্রোফাইল দেখতে ও সাজাতে লগইন করুন।': 'Log in to see and set up your profile.',
  'নিজের সম্পর্কে এক-দুই লাইন লিখুন।': 'Write a line or two about yourself.', 'এখনো কোনো ভাড়া জানানো হয়নি': 'No fares shared yet', 'প্রথম ভাড়াটি জানান': 'Share your first fare',
  'প্রোফাইলটি পাওয়া যায়নি।': 'That profile was not found.', 'অ্যাকাউন্ট থেকে বের হওয়া': 'Leaving the account', 'সব তথ্য চিরতরে মুছে যাবে': 'everything is deleted for good', 'লগইন করা নেই': 'Not logged in', 'সাহায্য': 'Help',
  'আপনার প্রোফাইল, ফলোয়ার, সব মেসেজ, পয়েন্ট, রেটিং ও সাপোর্টের কথোপকথন চিরতরে মুছে যাবে। এটি ফেরানো যায় না।': 'Your profile, followers, all messages, points, ratings and support conversations will be deleted for good. This cannot be undone.',
  // stories, sharing, saving, text posts, attachments, requests, theme
  'আপনার স্টোরি': 'Your story', 'আপনি': 'You', 'স্টোরি আপলোড হচ্ছে…': 'Uploading your story…', 'স্টোরি দেওয়া হয়েছে — ২৪ ঘণ্টা থাকবে।': 'Story added — it stays for 24 hours.',
  'স্টোরি দেওয়া যায়নি। আবার চেষ্টা করুন।': 'The story could not be added. Try again.', 'ভিডিওটি ৫০ এমবির বেশি।': 'That video is over 50 MB.',
  'শেয়ার': 'Share', 'সেভ': 'Save', 'সেভ করা': 'Saved', 'লিংক কপি হয়েছে।': 'Link copied.', 'সেভ করা হয়েছে — প্রোফাইলে পাবেন।': 'Saved — find it on your profile.',
  'এখনো কিছু সেভ করেননি। পোস্টের নিচের বুকমার্ক চিহ্নে চাপ দিন।': 'Nothing saved yet. Tap the bookmark under a post.',
  'লেখা': 'Text', 'অথবা কিছু না বেছে শুধু লেখা পোস্ট করুন': 'or choose nothing and post words alone', 'একটি ছবি বা ভিডিও বেছে নিন, অথবা কিছু লিখুন।': 'Choose a photo or video, or write something.',
  'মেসেজ রিকোয়েস্ট': 'Message requests', 'মুছুন': 'Delete', 'রিকোয়েস্ট পাঠানো হয়েছে': 'Request sent',
  'মেসেজ রিকোয়েস্ট পাঠানো হয়েছে। তিনি গ্রহণ করলে পুরো কথোপকথন, ছবি ও কল চালু হবে।': 'Message request sent. Once they accept, the full conversation, photos and calls open up.',
  'তিনি রিকোয়েস্ট গ্রহণ না করা পর্যন্ত আর মেসেজ পাঠানো যাবে না।': 'You cannot send more until they accept your request.',
  'নাম দিয়ে মানুষ খুঁজে মেসেজ পাঠান। তিনি গ্রহণ করলে কথা ও কল শুরু হবে।': 'Find someone by name and message them. Once they accept, you can talk and call.',
  'ছবি, ভিডিও বা ফাইল': 'Photo, video or file', 'ইমোজি': 'Emoji', 'ফাইলটি ২৫ এমবির বেশি।': 'That file is over 25 MB.', 'ফাইলটি পাঠানো যায়নি।': 'The file could not be sent.',
  '📷 ছবি': '📷 Photo', '🎬 ভিডিও': '🎬 Video', 'থিম': 'Theme', 'অ্যাপের রং': 'the look of the app', 'ডার্ক': 'Dark', 'লাইট': 'Light', 'ফোনের মতো': 'Like my phone',
  'আগের': 'Previous', 'পরের': 'Next',
  'রিকোয়েস্ট': 'Requests', 'নতুন মেসেজ': 'New message', 'খুঁজুন': 'Search', 'কোনো রিকোয়েস্ট নেই।': 'No requests.', 'এই নামে কোনো কথোপকথন নেই': 'No conversation with that name',
  'হাই বলুন 👋': 'Say hi 👋',
  // home
  'ম্যাপ': 'Map', 'বাংলাদেশ, সবার চোখে': "Bangladesh, through everyone's eyes", 'সব দেখুন': 'See all', 'ট্যুর প্ল্যান': 'Tour plan', 'দল নিয়ে ঘুরতে যাচ্ছেন?': 'Travelling with a group?',
  'খরচ হিসাব করুন, সবার ছবি দিয়ে শেয়ার করার কার্ড বানান।': 'Work out the cost and make a card with everyone on it to share.', 'আপনার জানা ভাড়াটি একজন যাত্রীকে ঠকা থেকে বাঁচায়।': 'The fare you know saves a passenger from being overcharged.',
  'প্রশ্নের উত্তর ও সাপোর্ট': 'Answers and support', 'জরুরি নম্বর': 'Emergency numbers', 'চাপ দিলে কল হবে': 'tap to call', 'বাংলাদেশের যাতায়াত, এক জায়গায়': 'Getting around Bangladesh, in one place',
  'ভাড়া: বিআরটিএ · ম্যাপ: OpenStreetMap, OpenFreeMap ও Overture Maps · ট্রেন ও লঞ্চ: খোলা তথ্যভান্ডার · ছবি: উইকিমিডিয়া কমন্স। তথ্য বদলাতে পারে — যাত্রার আগে মিলিয়ে নিন।': 'Fares: BRTA · Map: OpenStreetMap, OpenFreeMap and Overture Maps · Trains and launches: open datasets · Photos: Wikimedia Commons. Information can change — check before you travel.',
  'ম্যাপের ধরন': 'Map type', 'সাধারণ': 'Standard', 'হাইব্রিড': 'Hybrid', 'স্যাটেলাইট': 'Satellite', '৩D ভবন ও পাহাড়': '3D buildings and hills',
  'রূপসী বাংলা · আজকের গন্তব্য': 'Rupashi Bangla · Today’s pick', '৬৪ জেলা ঘুরে দেখুন': 'Explore 64 districts', '৬৪ জেলার জায়গা, বিখ্যাত খাবার, ট্যুর প্ল্যান': 'Places of 64 districts, famous food, trip plans',
  'ভাড়া: বিআরটিএ · ম্যাপ: OpenStreetMap ও OpenFreeMap · ট্রেন ও লঞ্চ: খোলা তথ্যভান্ডার। তথ্য বদলাতে পারে — যাত্রার আগে মিলিয়ে নিন।': 'Fares: BRTA · Map: OpenStreetMap and OpenFreeMap · Trains and launches: open datasets. Information can change — check before you travel.',
  // explore
  'খুঁজুন — মানুষ, জায়গা, পোস্ট': 'Search — people, places, posts', 'লাইক': 'Like', 'মন্তব্য': 'Comment', 'প্রথম মন্তব্যটি করুন': 'Be the first to comment', 'মানুষ': 'People',
  'জায়গাটি ম্যাপে দেখুন': 'Show the place on the map', 'পোস্টটি মুছে ফেলুন': 'Delete this post', 'এই খোঁজে কোনো পোস্ট পাওয়া যায়নি।': 'No posts matched that search.', 'মানুষ খুঁজতে লগইন করুন।': 'Log in to search for people.',
  'বন্ধ করুন': 'Close', 'শব্দ': 'Sound',
  'এক্সপ্লোর': 'Explore', 'বাংলাদেশ, সবার চোখে': 'Bangladesh, through everyone\'s eyes', 'ঘুরে আসা জায়গার ছবি ও ভিডিও। আপনিও দিন।': 'Photos and videos of places people have been. Add yours.',
  'নতুন পোস্ট': 'New post', 'পোস্ট': 'Posts', 'পোস্ট করুন': 'Post', 'আরও দেখুন': 'Show more', 'মুছে ফেলুন': 'Delete', 'রিপোর্ট': 'Report', 'রিপোর্ট পাঠানো হয়েছে': 'Report sent',
  'মন্তব্য লিখুন…': 'Write a comment…', 'ছবি বা ভিডিও বেছে নিন': 'Choose a photo or video', 'ঘুরে আসা জায়গার একটি ছবি, অথবা ৫০ এমবি পর্যন্ত একটি ভিডিও': 'A photo of a place you visited, or a video up to 50 MB',
  'ক্যাপশন': 'Caption', 'কোথায় গিয়েছিলেন, কেমন লাগল…': 'Where you went, how it was…', 'জায়গা (ঐচ্ছিক)': 'Place (optional)', 'যেমন: কক্সবাজার, সাজেক': "e.g. Cox's Bazar, Sajek",
  'আপলোড হচ্ছে…': 'Uploading…', 'আগে একটি ছবি বা ভিডিও বেছে নিন।': 'Choose a photo or video first.', 'ভিডিওটি ৫০ এমবির বেশি। ছোট একটি ভিডিও দিন।': 'That video is over 50 MB. Choose a smaller one.',
  'ফাইলটি অনেক বড়।': 'That file is too big.', 'এই ধরনের ফাইল নেওয়া যায় না। JPG, PNG, MP4 বা WebM দিন।': 'That kind of file cannot be used. Use JPG, PNG, MP4 or WebM.',
  'আজ অনেকগুলো পোস্ট করেছেন। কাল আবার চেষ্টা করুন।': 'You have posted a lot today. Try again tomorrow.', 'ছবিটি পড়া যায়নি। অন্য একটি ছবি দিন।': 'That picture could not be read. Try another.',
  'পোস্ট করা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।': 'Not posted. Check your connection and try again.', 'এখনো কেউ কিছু পোস্ট করেননি। প্রথম পোস্টটি আপনার হোক।': 'Nobody has posted yet. Be the first.',
  'এখনো কিছু পোস্ট করেননি। ঘুরে আসা জায়গার একটি ছবি দিন।': 'You have not posted yet. Share a photo of a place you visited.', 'এখনো কোনো পোস্ট নেই।': 'No posts yet.', 'ছবি বদলান': 'Change picture',
  'এইমাত্র': 'just now', 'কোন বাস কোথায় যায়': 'Which bus goes where',
  // community
  'সবাই মিলে': 'Together', 'ভাড়া জানান ও পয়েন্ট': 'Share fares and earn points', 'লিডারবোর্ড, সচেতনতার বার্তা': 'Leaderboard and safety reminders',
  'ভাড়া জানান, পয়েন্ট জিতুন': 'Share a fare, win points', 'ভাড়া জানান': 'Share a fare', '+১০ পয়েন্ট': '+10 points',
  'আপনি যে পথের ভাড়া জানেন, তা জানিয়ে অন্যদের সাহায্য করুন। সেরা তিনজন থাকেন লিডারবোর্ডে।': 'Tell us the fare on a trip you know and help others. The top three stand on the leaderboard.',
  'আপনি জানেন, অন্যরা জানে না': 'You know it. Others do not.', 'যে পথের ভাড়া আপনি জানেন, তা জানিয়ে দিন। একজন যাত্রী ঠকবে না — আর আপনি পাবেন পয়েন্ট।': 'Share the fare on a trip you know. One passenger is not overcharged — and you earn points.',
  'কোথায়': 'To where', 'কীসে গিয়েছেন?': 'How did you travel?', 'ভাড়া কত দিয়েছেন? (টাকা)': 'How much did you pay? (taka)',
  'শুধু নিজে দেওয়া আসল ভাড়াটি জানান। ভুল তথ্য সরিয়ে দেওয়া হয়, পয়েন্টও কাটা যায়।': 'Report only a real fare you paid yourself. Wrong information is removed, and the points with it.',
  'লিডারবোর্ড': 'Leaderboard', 'সেরা ৫০ জন দেখুন': 'See the top 50', 'সেরা ৫০ জন': 'Top 50', 'পয়েন্ট অনুযায়ী': 'by points', 'জায়গাটি ফাঁকা': 'This spot is open', 'আপনিই হতে পারেন': 'It could be you',
  'প্রথম ভাড়াটি জানিয়ে তালিকায় আসুন': 'Share your first fare to join the list', 'পয়েন্ট দিয়ে কী হবে?': 'What are points for?', 'এখন: সম্মান। সামনে: ছাড়।': 'Today: recognition. Later: discounts.',
  'Manzeela-তে রাইড বা টিকিট কাটার ব্যবস্থা চালু হলে জমানো পয়েন্ট দিয়ে ছাড় পাওয়া যাবে। সেটি এখনো চালু হয়নি — ততদিন পয়েন্ট জমতে থাকবে।': 'When rides or ticket booking open on Manzeela, saved points will give discounts. That has not started yet — until then your points keep adding up.',
  'সচেতন থাকুন': 'Stay safe', 'সম্প্রতি যাঁরা জানিয়েছেন': 'Recently shared', 'যাত্রীদের জানানো ভাড়া': 'Fares shared by riders',
  'বাস': 'Bus', 'রিকশা': 'Rickshaw', 'লেগুনা': 'Leguna', 'অন্য': 'Other',
  'দুটি জায়গাই তালিকা থেকে বেছে নিন।': 'Choose both places from the list.', 'ভাড়া ৫ থেকে ২০,০০০ টাকার মধ্যে একটি সংখ্যা হতে হবে।': 'The fare must be a number between 5 and 20,000 taka.',
  'দুটি আলাদা জায়গা বেছে নিন।': 'Choose two different places.', 'এই দূরত্বের জন্য ভাড়াটি অস্বাভাবিক মনে হচ্ছে। সংখ্যাটি আবার দেখে নিন।': 'That fare looks unusual for this distance. Check the number again.',
  'আজ অনেকগুলো ভাড়া জানিয়েছেন — ধন্যবাদ! কাল আবার জানাতে পারবেন।': 'You have shared many fares today — thank you! You can share more tomorrow.',
  'আপনার আগের জানানো ভাড়াটি বদলে দেওয়া হলো।': 'Your earlier fare for this trip was updated.', 'জমা দেওয়া যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।': 'Not saved. Check your connection and try again.',
  // nearby details
  'ক্লিনিক': 'Clinic', 'ব্যাংকের ভেতরে': 'Inside a bank', 'সিএনজি আছে': 'CNG available', 'এলপিজি আছে': 'LPG available', '২৪ ঘণ্টা খোলা': 'Open 24 hours', 'ফোন আছে': 'Has a phone number', 'খোলা থাকে': 'Opening hours',
  // menu hub and help centre
  'যাতায়াত': 'Getting around', 'ঘোরাঘুরি': 'Explore', 'সাহায্য ও সেটিংস': 'Help and settings', 'প্রশ্নের উত্তর, সমস্যা জানান': 'Answers, and a way to report a problem',
  'সময়সূচি, ভাড়া, কোন ট্রেনে যাবেন': 'Timetables, fares, which train to take', 'ট্রেন ও লঞ্চ': 'Trains and launches',
  'Manzeela · বাংলাদেশের যাতায়াত, এক জায়গায়': 'Manzeela · getting around Bangladesh, in one place', 'বাংলা · English': 'বাংলা · English',
  'সাহায্য কেন্দ্র': 'Help centre', 'কীভাবে সাহায্য করতে পারি?': 'How can we help?', 'যেমন: লগইন কোড, ভাড়া ভুল, কল লাগছে না': 'e.g. login code, wrong fare, calls not connecting',
  'সাহায্য খুঁজুন': 'Search help', 'এখনো সমাধান হয়নি?': 'Still not solved?', 'আমাদের টিমকে লিখুন — সাধারণত এক-দুই দিনের মধ্যে উত্তর দিই।': 'Write to our team — we usually reply within a day or two.',
  'এই খোঁজে কোনো উত্তর পাওয়া যায়নি। অন্য শব্দে লিখে দেখুন, অথবা নিচ থেকে আমাদের লিখুন।': 'No answer matched that search. Try other words, or write to us below.',
  // support
  'সাহায্য ও সাপোর্ট': 'Help and support', 'সমস্যা জানান, উত্তর পান': 'Report a problem, get an answer',
  'কোনো সমস্যা, ভুল তথ্য বা অভিযোগ — আমাদের লিখুন। উত্তর এখানেই পাবেন।': 'A problem, wrong information or a complaint — write to us. The answer arrives here.',
  'সাপোর্টে লিখতে লগইন করুন, যাতে উত্তরটি আপনার কাছে পৌঁছায়।': 'Log in to write to support, so the answer can reach you.', 'সাপোর্টে লিখুন': 'Write to support', 'আপনার অনুরোধ': 'Your requests',
  'জরুরি নম্বর': 'Emergency', 'জরুরি বিপদে ৯৯৯-এ কল করুন। Manzeela সাপোর্ট জরুরি সেবা নয়।': 'In an emergency call 999. Manzeela support is not an emergency service.',
  'অ্যাকাউন্ট বা লগইন': 'Account or login', 'ভাড়া ভুল': 'Wrong fare', 'বাস, ট্রেন বা রুটের তথ্য ভুল': 'Wrong bus, train or route information', 'মেসেজ বা কল': 'Messages or calls',
  'কারও বিরুদ্ধে অভিযোগ': 'A complaint about someone', 'অন্য কিছু': 'Something else', 'উত্তরের অপেক্ষায়': 'Waiting for a reply', 'উত্তর এসেছে': 'Answered', 'বন্ধ': 'Closed',
  'আপনি এখনো সাপোর্টে কিছু লেখেননি।': 'You have not written to support yet.', 'বিষয়টি কী নিয়ে?': 'What is it about?', 'এক লাইনে সমস্যাটি': 'The problem in one line', 'বিস্তারিত লিখুন': 'Describe it',
  'কী হয়েছে, কোথায়, কখন — যত পরিষ্কার লিখবেন তত দ্রুত সমাধান হবে।': 'What happened, where, when — the clearer you are, the faster it is solved.',
  'আমরা সাধারণত এক-দুই দিনের মধ্যে উত্তর দিই।': 'We usually reply within a day or two.', 'বিষয় অন্তত ৩ অক্ষর, বিস্তারিত অন্তত ৫ অক্ষর লিখুন।': 'Write at least 3 characters for the subject and 5 for the details.',
  'আজ অনেকগুলো অনুরোধ পাঠিয়েছেন। কাল আবার চেষ্টা করুন।': 'You have sent many requests today. Try again tomorrow.', 'পাঠানো যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।': 'Not sent. Check your connection and try again.',
  'উত্তর লিখুন': 'Write a reply', 'সমাধান হয়েছে': 'Solved', 'এই কথোপকথনটি বন্ধ। নতুন সমস্যা হলে আবার লিখুন।': 'This conversation is closed. Write again if there is a new problem.',
  // reporting someone
  'রিপোর্ট করুন': 'Report', 'বাজে বা অশ্লীল কথা': 'Abusive or obscene language', 'হয়রানি বা হুমকি': 'Harassment or threats', 'স্প্যাম বা প্রতারণা': 'Spam or fraud',
  'অন্যের নাম-পরিচয় ব্যবহার': 'Pretending to be someone else', 'অন্য কারণ': 'Another reason', 'আরও কিছু জানাতে চাইলে লিখুন': 'Add anything else you want us to know',
  'রিপোর্ট পাঠান ও ব্লক করুন': 'Send report and block', 'আমাদের টিম রিপোর্টটি দেখবে। আপনার মেসেজগুলো আমরা পড়তে পারি না, তাই কী হয়েছে লিখে দিলে সুবিধা হয়।': 'Our team will look at the report. We cannot read your messages, so it helps to say what happened.',
  'বন্ধুর ই-মেইল': "Friend's e-mail", 'ই-মেইল দিয়ে খুঁজুন': 'Search by e-mail', 'যে ই-মেইল দিয়ে তিনি Manzeela-তে অ্যাকাউন্ট খুলেছেন, সেটি লিখুন।': 'Enter the e-mail they used to open their Manzeela account.',
  'এই ই-মেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।': 'No account was found for this e-mail.', 'এটি আপনার নিজের ই-মেইল।': 'That is your own e-mail.',
  'ই-মেইল দিয়ে বন্ধু খুঁজে নিন, তারপর মেসেজ ও কল করুন।': 'Find a friend by e-mail, then message and call them.',
  // messenger
  'মেসেজ': 'Messages', 'বন্ধু যোগ করুন': 'Add a friend', 'ব্লক করা মানুষ': 'Blocked people', 'বন্ধু হওয়ার অনুরোধ': 'Friend requests',
  'গ্রহণ': 'Accept', 'না': 'No', 'বাতিল': 'Cancel', 'অনুরোধ পাঠানো হয়েছে': 'Request sent', 'লিখছে…': 'typing…', 'অনলাইন': 'Online', 'অফলাইন': 'Offline',
  'আজ': 'Today', 'গতকাল': 'Yesterday', 'ম্যাপে দেখুন': 'Show on the map', 'বন্ধু হয়েছেন — হাই বলুন 👋': 'You are friends — say hi 👋',
  'এখনো কোনো বন্ধু নেই': 'No friends yet', 'মোবাইল নম্বর দিয়ে বন্ধু খুঁজে নিন, তারপর মেসেজ ও কল করুন।': 'Find a friend by mobile number, then message and call them.',
  'আপনারা এখন বন্ধু। প্রথম মেসেজটি পাঠান।': 'You are now friends. Send the first message.',
  'একটি কথোপকথন বেছে নিন': 'Choose a conversation', 'বন্ধুকে মেসেজ দিন, জায়গা পাঠান, ভয়েস বা ভিডিও কল করুন।': 'Message a friend, send a place, or make a voice or video call.',
  'মেসেজ লিখুন…': 'Write a message…', 'পাঠান': 'Send', 'জায়গা পাঠান': 'Send a place', 'ভয়েস কল': 'Voice call', 'ভিডিও কল': 'Video call', 'আরও অপশন': 'More options', 'ফিরে যান': 'Back',
  'বন্ধুদের সাথে কথা বলতে লগইন করুন': 'Log in to talk with friends', 'মেসেজ, জায়গা শেয়ার, ভয়েস ও ভিডিও কল — সব এক জায়গায়।': 'Messages, shared places, voice and video calls — all in one place.',
  'বন্ধুর মোবাইল নম্বর': "Friend's mobile number", 'মোবাইল নম্বর দিয়ে খুঁজুন': 'Search by mobile number', 'খুঁজুন': 'Search',
  'যে নম্বর দিয়ে তিনি Manzeela-তে অ্যাকাউন্ট খুলেছেন, সেটি লিখুন।': 'Enter the number they used to open their Manzeela account.',
  'আগে থেকেই বন্ধু': 'Already friends', 'অনুরোধ পাঠানো আছে': 'Request already sent', 'অনুরোধ গ্রহণ করুন': 'Accept request', 'অনুরোধ পাঠান': 'Send request', 'এখন বন্ধু': 'Now friends',
  'নম্বরটি ঠিক নয়। ০১ দিয়ে শুরু ১১ সংখ্যার নম্বর দিন।': 'That number is not valid. Enter an 11-digit number starting with 01.',
  'এই নম্বরে কোনো অ্যাকাউন্ট পাওয়া যায়নি।': 'No account was found for this number.', 'এটি আপনার নিজের নম্বর।': 'That is your own number.',
  'খোঁজা যায়নি। একটু পরে আবার চেষ্টা করুন।': 'The search failed. Try again in a moment.',
  'বন্ধু তালিকা থেকে সরান': 'Remove from friends', 'ব্লক করুন — আর মেসেজ বা কল আসবে না': 'Block — no more messages or calls', 'রিপোর্ট করুন ও ব্লক করুন': 'Report and block',
  'ব্লক তুলুন': 'Unblock', 'আপনি কাউকে ব্লক করেননি।': 'You have not blocked anyone.',
  'আমার এখনকার লোকেশন': 'My current location', 'একবার পাঠানো হবে, লাইভ নয়': 'sent once, not live', 'ম্যাপে খোলা জায়গা': 'the place open on the map', 'আমার লোকেশন': 'My location',
  'লোকেশনের অনুমতি পাওয়া যায়নি।': 'Location permission was not given.',
  'একটু ধীরে — অনেক মেসেজ একসাথে গেছে।': 'Slow down — too many messages at once.', 'মেসেজটি পাঠানো যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।': 'The message was not sent. Check your connection and try again.',
  'কল করা হচ্ছে…': 'Calling…', 'রিং হচ্ছে…': 'Ringing…', 'সংযোগ হচ্ছে…': 'Connecting…', 'ভিডিও কল আসছে…': 'Incoming video call…', 'ভয়েস কল আসছে…': 'Incoming voice call…',
  'কল শেষ।': 'Call ended.', 'উত্তর মেলেনি।': 'No answer.', 'কলটি ধরা হয়নি।': 'The call was declined.', 'কল শুরু করা যায়নি।': 'The call could not be started.', 'কল ধরা যায়নি।': 'The call could not be answered.',
  'এই ব্রাউজারে কল করা যায় না।': 'This browser cannot make calls.', 'মাইক্রোফোনের অনুমতি দিন।': 'Allow the microphone.', 'ক্যামেরা ও মাইক্রোফোনের অনুমতি দিন।': 'Allow the camera and microphone.',
  'সংযোগ করা যায়নি। দুজনের নেটওয়ার্ক দেখে আবার চেষ্টা করুন।': 'Could not connect. Check both networks and try again.',
  'কল ধরুন': 'Answer', 'কল কাটুন': 'Hang up', 'মাইক্রোফোন': 'Microphone', 'ক্যামেরা': 'Camera', 'ধরা হয়নি': 'declined', 'উত্তর মেলেনি': 'no answer',
  'মিসড ভয়েস কল': 'Missed voice call', 'মিসড ভিডিও কল': 'Missed video call',
  // BRTA chart fares
  'নন-এসি · বিআরটিএ নির্ধারিত': 'Non-AC · set by BRTA', '৪০ আসনের বাস': '40-seat bus', 'অনানুষ্ঠানিক তালিকা': 'unofficial list',
  // accounts
  'অ্যাকাউন্ট': 'Account', 'লগইন': 'Log in', 'লগইন করুন': 'Log in', 'লগআউট': 'Log out', 'নতুন অ্যাকাউন্ট': 'New account', 'অ্যাকাউন্ট খুলুন': 'Create account',
  'রেটিং ও সাম্প্রতিক যাত্রা সব ডিভাইসে পেতে': 'to keep your ratings and recent trips on every device',
  'মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে': 'with your mobile number and a password',
  'আপনার নাম': 'Your name', 'মোবাইল নম্বর': 'Mobile number', 'পাসওয়ার্ড': 'Password', 'নতুন পাসওয়ার্ড (অন্তত ৬ অক্ষর)': 'New password (at least 6 characters)',
  'এখনকার পাসওয়ার্ড': 'Current password', 'পাসওয়ার্ড বদলান': 'Change password', 'পাসওয়ার্ড বদলানো হয়েছে।': 'Password changed.',
  'এখনকার পাসওয়ার্ডটি মিলছে না।': 'The current password does not match.',
  'নম্বর এখনো এসএমএস দিয়ে যাচাই হয় না। পাসওয়ার্ড ভুলে গেলে ফেরত আনার উপায় নেই — মনে রাখুন।': 'Numbers are not verified by SMS yet. A forgotten password cannot be recovered — keep it safe.',
  'আগে থেকেই অ্যাকাউন্ট আছে? লগইন করুন': 'Already have an account? Log in', 'অ্যাকাউন্ট নেই? নতুন অ্যাকাউন্ট খুলুন': 'No account? Create one',
  'লগইন থাকলে আপনার রেটিং, জানানো ভাড়া আর সাম্প্রতিক যাত্রা সব ডিভাইসে একই থাকে।': 'While logged in, your ratings, reported fares and recent trips stay the same on every device.',
  'নাম অন্তত ২ অক্ষরের হতে হবে।': 'The name needs at least 2 characters.',
  'মোবাইল নম্বরটি ঠিক নয়। ০১ দিয়ে শুরু ১১ সংখ্যার নম্বর দিন।': 'That mobile number is not valid. Enter an 11-digit number starting with 01.',
  'পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।': 'The password needs at least 6 characters.',
  'এই নম্বরে আগে থেকেই অ্যাকাউন্ট আছে। লগইন করুন।': 'This number already has an account. Log in instead.',
  'মোবাইল নম্বর বা পাসওয়ার্ড মিলছে না।': 'The mobile number or password does not match.',
  'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।': 'Too many attempts. Try again in a while.',
  'আবার লগইন করুন।': 'Please log in again.', 'কাজটি করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।': 'That did not work. Check your internet connection and try again.',

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
  'তুহিন এন্টারপ্রাইজ': 'Tuhin Enterprise', 'ফাল্গুনী মধুমতি পরিবহন': 'Falguni Madhumoti Paribahan',
  // Messenger groups, details, settings, dashboard
  'সব': 'All',
  'না-পড়া': 'Unread',
  'গ্রুপ': 'Groups',
  'নতুন মেসেজ বা গ্রুপ': 'New message or group',
  'বিস্তারিত': 'Details',
  'কোনো রিকোয়েস্ট নেই': 'No requests',
  'যাঁরা আপনাকে ফলো করেন না, তাঁদের প্রথম মেসেজ এখানে আসবে।': 'First messages from people who don’t follow you arrive here.',
  'রিকোয়েস্ট গ্রহণ না করা পর্যন্ত তিনি জানবেন না যে আপনি মেসেজটি দেখেছেন।': 'They won’t know you’ve seen it until you accept.',
  'সব মেসেজ পড়া হয়েছে': 'You’re all caught up',
  'এখনো কোনো গ্রুপ নেই': 'No groups yet',
  'বন্ধুদের নিয়ে একটি গ্রুপ বানান — ট্যুরের পরিকল্পনা এক জায়গায়।': 'Start a group with friends — plan the trip in one place.',
  'নতুন গ্রুপ': 'New group',
  'রিঅ্যাক্ট': 'React',
  'উত্তর দিন': 'Reply',
  'কপি করুন': 'Copy',
  'ফরোয়ার্ড করুন': 'Forward',
  'সবার কাছ থেকে সরিয়ে নিন': 'Unsend',
  'মেসেজটি সরিয়ে নেবেন?': 'Unsend this message?',
  'কথোপকথনের সবার কাছ থেকে মেসেজটি মুছে যাবে।': 'It will be removed for everyone in the conversation.',
  'সরিয়ে নিন': 'Unsend',
  'থাক': 'Cancel',
  'সরানো যায়নি।': 'Could not unsend.',
  'পাঠানো হয়েছে': 'Sent',
  'পাঠানোর মতো কোনো কথোপকথন নেই।': 'No conversations to send to.',
  'সরাতে চাপ দিন': 'Tap to remove',
  'সদস্যদের দেখুন': 'See members',
  'কথোপকথনে খুঁজুন': 'Search in conversation',
  'মিডিয়া ও ফাইল': 'Media and files',
  'মিডিয়া': 'Media',
  'ফাইল': 'Files',
  'যোগ করুন': 'Add',
  'আনমিউট': 'Unmute',
  'মিউট': 'Mute',
  'কাস্টমাইজ': 'Customise',
  'গ্রুপের নাম বদলান': 'Change group name',
  'নাম দেওয়া নেই': 'No name',
  'অ্যাডমিন': 'Admin',
  'সরিয়ে দিন': 'Remove',
  'তিনি আর এই গ্রুপের মেসেজ দেখতে পাবেন না।': 'They will no longer see this group’s messages.',
  'সদস্য যোগ করুন': 'Add people',
  'প্রাইভেসি ও সাপোর্ট': 'Privacy and support',
  'নোটিফিকেশন চালু করুন': 'Unmute notifications',
  'মেসেজ মিউট করুন': 'Mute messages',
  'এখন মিউট করা আছে': 'Muted now',
  'নতুন মেসেজে আর জানানো হবে না': 'You won’t be notified of new messages',
  'গ্রুপ ছেড়ে দিন': 'Leave group',
  'ব্লক করুন': 'Block',
  'আমাদের টিম দেখবে; তিনি জানবেন না': 'Our team will look; they won’t be told',
  'তিনি আর আপনাকে মেসেজ বা কল করতে পারবেন না। চাইলে পরে সেটিংস থেকে ব্লক তুলতে পারবেন।': 'They won’t be able to message or call you. You can unblock them later in Settings.',
  'রিকোয়েস্ট গ্রহণের পরে থিম বদলানো যাবে।': 'The theme can be changed once the request is accepted.',
  'গ্রুপের নাম': 'Group name',
  'সবাই নতুন নামটি দেখবেন।': 'Everyone will see the new name.',
  'গ্রুপ ছাড়বেন?': 'Leave the group?',
  'আর এই গ্রুপের মেসেজ পাবেন না। কেউ আবার যোগ না করলে ফেরা যাবে না।': 'You’ll stop getting its messages. You can only come back if someone adds you.',
  'ছেড়ে দিন': 'Leave',
  'গ্রুপে শুধু তাঁদের রাখা যায়, যাঁদের আপনি ফলো করেন বা যাঁরা আপনাকে ফলো করেন — অন্তত দুজন।': 'A group needs at least two people you follow or who follow you.',
  'একটি গ্রুপে সবচেয়ে বেশি ৩২ জন থাকতে পারেন।': 'A group can have at most 32 people.',
  'আজ অনেক গ্রুপ বানানো হয়েছে। কাল আবার চেষ্টা করুন।': 'Too many groups today. Try again tomorrow.',
  'কাজটি করা যায়নি। আবার চেষ্টা করুন।': 'That didn’t work. Try again.',
  'তিনি শুধু যাঁদের ফলো করেন, তাঁদের কাছ থেকে মেসেজ নেন।': 'They only accept messages from people they follow.',
  'আপনি আর এই গ্রুপে নেই।': 'You are no longer in this group.',
  'আপনার অ্যাকাউন্ট': 'Your account',
  'প্রফেশনাল ড্যাশবোর্ড': 'Professional dashboard',
  'ভিউ, লাইক, ফলোয়ার — আপনার পোস্ট কেমন যাচ্ছে': 'Views, likes, followers — how your posts are doing',
  'কে কীভাবে আপনার সাথে যোগাযোগ করবে': 'How others can reach you',
  'অপরিচিত কেউ প্রথম মেসেজ পাঠাতে পারবে কি না': 'Whether people you don’t know can message you first',
  'সবাই': 'Everyone',
  'যাঁদের ফলো করি': 'People I follow',
  'অ্যাক্টিভিটি স্ট্যাটাস': 'Activity status',
  'বন্ধ করলে আপনি কখন অনলাইন তা কেউ দেখবে না, আপনিও অন্যদেরটা দেখবেন না': 'When off, no one sees when you’re online, and you don’t see theirs',
  'যাঁদের মেসেজ ও কল বন্ধ করেছেন': 'People you stopped messages and calls from',
  'যা দেখেন': 'What you see',
  'সহায়তা ও তথ্য': 'Help and info',
  'ভেরিফায়েড ব্যাজ': 'Verified badge',
  'নামের পাশে নীল ব্যাজ — কীভাবে পাবেন': 'The blue badge beside a name — how to get it',
  'আপনার অ্যাকাউন্ট ভেরিফায়েড': 'Your account is verified',
  'ব্যাজ কেনা যায় না — Manzeela টিম যাচাই করে দেয়।': 'The badge can’t be bought — the Manzeela team gives it after checking.',
  'যা দেখা হয়:': 'What we look at:',
  'প্রোফাইলে আপনার আসল নাম ও নিজের ছবি': 'Your real name and your own photo on the profile',
  'অন্তত কয়েকটি পোস্ট বা জানানো ভাড়া': 'At least a few posts or shared fares',
  'কোনো রিপোর্ট বা নিয়ম ভাঙা নেই': 'No reports or broken rules',
  'দোকান, পরিবহন বা ট্যুর কোম্পানি হলে তার পরিচয়ের প্রমাণ': 'For a shop, transport or tour company: proof of who it is',
  'আবেদন করুন': 'Apply',
  'নামের পাশে নীল ব্যাজটি সবাই দেখতে পান।': 'Everyone sees the blue badge beside your name.',
  'ব্যাজ টিকিয়ে রাখতে নিয়ম মেনে চলুন। ভুয়া তথ্য বা প্রতারণা পেলে ব্যাজ সরিয়ে নেওয়া হয়।': 'Keep to the rules to keep it. It is taken away for false information or fraud.',
  'ভেরিফায়েড ব্যাজের আবেদন': 'Verified badge request',
  'ড্যাশবোর্ড': 'Dashboard',
  'আপনার পোস্টের ভিউ, লাইক আর নতুন ফলোয়ার': 'Views, likes and new followers on your posts',
  'গত ১৪ দিন': 'Last 14 days',
  'আপনার পোস্ট কেমন যাচ্ছে দেখতে লগইন করুন।': 'Log in to see how your posts are doing.',
  'ভেরিফায়েড অ্যাকাউন্ট': 'Verified account',
  'ভিউ': 'Views',
  'সব পোস্ট মিলিয়ে': 'Across all posts',
  'অন্যরা সেভ করেছেন': 'Saved by others',
  'লাইক, গত ১৪ দিনে': 'likes in the last 14 days',
  'মন্তব্য, গত ১৪ দিনে': 'comments in the last 14 days',
  'নতুন ফলোয়ার, গত ১৪ দিনে': 'new followers in the last 14 days',
  'সবচেয়ে ভালো যাচ্ছে যে পোস্টগুলো': 'Your best posts',
  'টুলস': 'Tools',
  'ছবি, ভিডিও বা শুধু লেখা': 'Photo, video or just words',
  'পয়েন্ট বাড়ান': 'Earn points',
  'কীভাবে পাবেন, আবেদন করুন': 'How to get it, and apply',
  'এখনো কোনো পোস্ট নেই': 'No posts yet',
  'প্রথম পোস্টটি দিন': 'Share your first post',
  'ভিউ আর দিনভিত্তিক লাইক গোনা এই সুবিধা চালুর পর থেকে শুরু হয়েছে, তাই আগের পোস্টে সংখ্যা কম দেখাতে পারে।': 'Views and daily likes are counted from when this feature started, so older posts may show less.',
  'ড্যাশবোর্ড দেখানো যায়নি। একটু পরে আবার চেষ্টা করুন।': 'Could not load the dashboard. Try again shortly.',
  // Voice, edit, group calls, creator programme
  'ভয়েস মেসেজ': 'Voice message',
  'এডিট করুন': 'Edit',
  'মেসেজ এডিট করছেন': 'Editing message',
  'পাঠানোর ১৫ মিনিটের মধ্যে বদলানো যায়। সবাই "এডিট করা" লেখা দেখবেন।': 'You can change it within 15 minutes of sending. Everyone will see "Edited".',
  'পাঠানোর ১৫ মিনিট পেরিয়ে গেছে — এখন আর এডিট করা যায় না।': 'More than 15 minutes have passed — it can no longer be edited.',
  'এডিট করা যায়নি।': 'Could not edit.',
  'শুনুন': 'Play',
  'যোগ দিন': 'Join',
  'গ্রুপ ভিডিও কল চলছে': 'Group video call in progress',
  'গ্রুপ ভয়েস কল চলছে': 'Group voice call in progress',
  'কল ছাড়ুন': 'Leave call',
  'বাদ দিন': 'Dismiss',
  'আগে চলতি কলটি শেষ করুন।': 'Finish the current call first.',
  'কলে এখন ৮ জন আছেন — আর জায়গা নেই।': 'The call already has 8 people — it is full.',
  'কলে যোগ দেওয়া যায়নি।': 'Could not join the call.',
  'মনিটাইজেশন': 'Monetisation',
  'ক্রিয়েটর প্রোগ্রাম': 'Creator programme',
  'আপনি এখন আয় করতে পারেন': 'You can earn now',
  'নিয়মিত ভালো পোস্ট আর আসল ভাড়া জানিয়ে আয় করুন': 'Earn by posting regularly and sharing real fares',
  'যাচাই হচ্ছে': 'Under review',
  'চালু': 'Active',
  'গৃহীত হয়নি': 'Not accepted',
  'কোনো খোলা রিপোর্ট নেই': 'No open reports',
  'আপনার বিরুদ্ধে খোলা রিপোর্ট আছে': 'There are open reports about you',
  'আবেদন জমা আছে': 'Application sent',
  'Manzeela টিম আপনার প্রোফাইল দেখে জানাবে।': 'The Manzeela team will review your profile and let you know.',
  'আগের আবেদনটি গৃহীত হয়নি। প্রোফাইল ঠিক করে আবার আবেদন করতে পারেন।': 'Your last application was not accepted. Improve your profile and apply again.',
  'শর্ত পূরণ হলে আবেদন করা যাবে। অনুমোদনের পর থেকে আয় যোগ হবে।': 'Apply once you meet the requirements. Earnings are added after approval.',
  'তোলা যাবে': 'Available',
  'মোট আয়': 'Total earned',
  'পেয়েছেন': 'Paid out',
  'অপেক্ষায়': 'Pending',
  'টাকা তুলুন': 'Withdraw',
  'একটি অনুরোধ অপেক্ষায় আছে। সেটি পাঠানো হলে আবার তোলা যাবে।': 'A request is pending. You can withdraw again once it is paid.',
  'বিকাশ, নগদ বা রকেটে পাঠানো হয়।': 'Paid to bKash, Nagad or Rocket.',
  'লেনদেন': 'Transactions',
  'এখনো কোনো লেনদেন নেই।': 'No transactions yet.',
  'কোথায় পাঠাব': 'Where to send',
  'ওয়ালেটের নম্বর (নিজের নামে)': 'Wallet number (in your own name)',
  'নম্বরটি শুধু Manzeela টিম দেখবে। ভুল নম্বরে গেলে টাকা ফেরানো কঠিন — দুবার দেখে নিন।': 'Only the Manzeela team sees this number. Money sent to a wrong number is hard to recover — check it twice.',
  'নম্বরটি ঠিক নয় — ০১ দিয়ে শুরু ১১ সংখ্যার নম্বর দিন।': 'That number is not right — enter an 11-digit number starting with 01.',
  'আগের একটি অনুরোধ এখনো অপেক্ষায়।': 'An earlier request is still pending.',
  'অনুরোধ পাঠানো যায়নি।': 'Could not send the request.',
  'বিকাশ': 'bKash',
  'নগদ': 'Nagad',
  'রকেট': 'Rocket',
  // Sign-in, security, inbox, reels
  'পাসওয়ার্ড লাগে না — ই-মেইলে একটি কোড যাবে।': 'No password needed — we e-mail you a code.',
  'ই-মেইল ঠিকানা': 'E-mail address',
  'অথবা': 'OR',
  'নতুন অ্যাকাউন্ট খুলুন': 'Create new account',
  'লগইন করলে আপনি Manzeela-র নিয়ম ও প্রাইভেসি মেনে নিচ্ছেন।': 'By logging in you agree to Manzeela’s terms and privacy.',
  'বন্ধুদের ছবি-ভিডিও দেখুন, মেসেজ করুন, ভাড়া জানিয়ে পয়েন্ট নিন।': 'See photos and videos from friends, message them, earn points for fares.',
  'পুরো নাম': 'Full name',
  'ইউজারনেম': 'Username',
  'পরের ধাপ': 'Next',
  'আগে থেকেই অ্যাকাউন্ট আছে?': 'Have an account?',
  'কোডটি দিন': 'Enter the code',
  '৬ সংখ্যার কোড পাঠানো হয়েছে': 'We sent a 6-digit code to',
  'ঠিকানায়। ইনবক্স না পেলে স্প্যাম দেখুন।': '. Check spam if it is not in your inbox.',
  'আবার কোড পাঠান': 'Resend code',
  'তথ্য বদলান': 'Change details',
  'টু-স্টেপ ভেরিফিকেশন': 'Two-step verification',
  'Google Authenticator বা অন্য অথেন্টিকেটর অ্যাপে Manzeela-র ৬ সংখ্যার কোডটি দিন।': 'Enter the 6-digit Manzeela code from Google Authenticator or another authenticator app.',
  'ব্যাকআপ কোড দিন': 'Use backup code',
  'অ্যাপ হাতের কাছে নেই? ব্যাকআপ কোড ব্যবহার করুন': 'No app at hand? Use a backup code',
  'আবার শুরু করুন': 'Start over',
  'এই ই-মেইলে কোনো অ্যাকাউন্ট নেই।': 'There is no account with this e-mail.',
  'এই ই-মেইলে আগেই অ্যাকাউন্ট আছে — লগইন করুন।': 'An account already uses this e-mail — log in.',
  'এই মুহূর্তে নতুন অ্যাকাউন্ট খোলা বন্ধ আছে।': 'New accounts are closed right now.',
  'এই ইউজারনেম আগেই কেউ নিয়েছেন।': 'That username is taken.',
  'ইউজারনেমে ছোট হাতের a-z, 0-9, ডট ও আন্ডারস্কোর — ৩ থেকে ৩০ অক্ষর।': 'Usernames use a-z, 0-9, dots and underscores — 3 to 30 characters.',
  'পাসওয়ার্ড ও নিরাপত্তা': 'Password and security',
  'লগইন অ্যাক্টিভিটি': 'Login activity',
  'কোন কোন ডিভাইসে লগইন আছে, দূর থেকে লগআউট': 'Where you are logged in; log out remotely',
  'চালু আছে': 'On',
  'বন্ধ — চালু করলে অ্যাকাউন্ট আরও নিরাপদ': 'Off — turn it on for a safer account',
  'অ্যাকাউন্টে আরেকটি তালা দিন': 'Add another lock to your account',
  'কেউ আপনার ই-মেইলে ঢুকে গেলেও আপনার ফোনের অথেন্টিকেটর অ্যাপের কোড ছাড়া Manzeela-তে লগইন করতে পারবে না।': 'Even if someone gets into your e-mail, they cannot log in to Manzeela without the code from your phone’s authenticator app.',
  'অ্যাপ যুক্ত করুন': 'Add the app',
  'স্ক্যান করুন, তারপর কোড দিন': 'Scan, then enter the code',
  'স্ক্যান না হলে এই কী': 'Or type this key',
  'এই ফোনেই অথেন্টিকেটর অ্যাপ খুলুন': 'Open the authenticator app on this phone',
  'অ্যাপের ৬ সংখ্যার কোড': 'The 6-digit code from the app',
  'ব্যাকআপ কোড': 'Backup codes',
  'ফাইলে রাখুন': 'Save to a file',
  'রেখেছি': 'I saved them',
  'চালু হয়েছে': 'It is on',
  'টু-স্টেপ ভেরিফিকেশন চালু আছে': 'Two-step verification is on',
  'বন্ধ করতে কোড দিন': 'Enter a code to turn it off',
  'এই ডিভাইস': 'This device',
  'এখানে': 'Here',
  'অন্য সব ডিভাইস থেকে লগআউট': 'Log out of all other devices',
  'যেসব ডিভাইসে আপনার অ্যাকাউন্ট খোলা আছে': 'Devices where your account is open',
  'আপনার মেসেজ': 'Your messages',
  'বন্ধুকে বা গ্রুপে ছবি, ভিডিও, ভয়েস মেসেজ আর জায়গা পাঠান — ভয়েস ও ভিডিও কলও করুন।': 'Send photos, videos, voice messages and places to a friend or a group — and call them.',
  'মেসেজ পাঠান': 'Send message',
  'ছবি বা ভিডিও': 'Photo or video',
  'ফিড': 'Feed',
  'রিলস': 'Reels',
  'এখনো কোনো রিল নেই — প্রথম ভিডিওটি আপনিই দিন।': 'No reels yet — post the first video.',
  // Notifications
  'নোটিফিকেশন': 'Notifications',
  'এখনো কিছু নেই': 'Nothing yet',
  'কেউ আপনার পোস্টে লাইক বা মন্তব্য করলে, বা আপনাকে ফলো করলে এখানে দেখবেন।': 'When someone likes or comments on your posts, or follows you, you’ll see it here.',
  'এই সপ্তাহে': 'This week',
  'এই মাসে': 'This month',
  'কোনো মেসেজ রিকোয়েস্ট নেই': 'No message requests',
  'যাঁদের আপনি ফলো করেন না, তাঁদের প্রথম মেসেজ এখানে আসবে। নতুন ফলোয়ারের খবর এক্সপ্লোরের ❤️-তে।': 'First messages from people you don’t follow arrive here. New followers show up under the ❤️ in Explore.',
  'ফাইল, ছবি বা ভিডিও': 'File, photo or video',
  'ফোন থেকে বেছে নিন': 'Choose from your phone',
  'জায়গা': 'Place',
  'আপনার লোকেশন বা ম্যাপে খোলা জায়গা': 'Your location or the place open on the map',
  // Studio
  'নতুন স্টোরি': 'New story',
  'নতুন রিল': 'New reel',
  'গ্যালারি থেকে বেছে নিন': 'Choose from gallery',
  'ছবি ও ভিডিও এখানে': 'Photos and videos here',
  'রিলের জন্য ভিডিও': 'A video for your reel',
  '২৪ ঘণ্টার স্টোরি': 'A story for 24 hours',
  'গ্যালারি থেকে বেছে নিন, অথবা এখনই ক্যামেরায় তুলুন।': 'Pick from your gallery, or shoot with the camera now.',
  'গ্যালারি থেকে ভিডিও দিন, অথবা ক্যামেরায় রেকর্ড করুন — গান ও ফিল্টার পরে।': 'Pick a video, or record one — music and filters come next.',
  'শুধু লেখা পোস্ট করুন': 'Post just words',
  'এডিট': 'Edit',
  'ফিল্টার': 'Filters',
  'শেয়ার করুন': 'Share',
  'গান বাছুন': 'Choose music',
  'রিল বা পোস্টের সাথে বাজবে': 'Plays with your reel or post',
  'কোথা থেকে বাজবে': 'Start at',
  'বাছুন': 'Use',
  'বাছা হয়েছে': 'Selected',
  'গান সরান': 'Remove music',
  'Manzeela Music — কপিরাইট ছাড়া, যে কেউ ব্যবহার করতে পারেন': 'Manzeela Music — free for anyone to use',
  'রিলের মূল অডিও — অন্যদের রিলের শব্দ দিয়ে বানান': 'Original audio from reels — make yours with their sound',
  'এখনো কোনো রিল নেই।': 'No reels yet.',
  'পোস্ট হয়েছে।': 'Posted.',
  'রিল পোস্ট হয়েছে।': 'Reel posted.',
  'এখনো কোনো মন্তব্য নেই': 'No comments yet',
  'আলোচনা শুরু করুন।': 'Start the conversation.',
  'এই পোস্টে মন্তব্য বন্ধ।': 'Comments are turned off.',
  'মন্তব্য পাঠানো যায়নি। আবার চেষ্টা করুন।': 'Could not send the comment. Try again.',
  '১টি মন্তব্য দেখুন': 'View 1 comment',
  'লাইভ': 'Live',
  'প্রাইভেসি পলিসি': 'Privacy policy',
  'কোন তথ্য রাখা হয়, কার কাছে যায়, কীভাবে মুছবেন': 'What is kept, who gets it, how to delete it',
  'ব্যবহারের শর্তাবলি': 'Terms of use',
  'অ্যাপের নিয়ম, ভিডিওর সীমা': 'App rules, video limits',
  'আজ ৫টি ভিডিও পোস্ট হয়ে গেছে — কাল আবার দিন': '5 videos posted today — post more tomorrow',
  'ভিডিও ৫ মিনিটের বেশি — ছোট একটি দিন': 'The video is over 5 minutes — choose a shorter one',
  'ভিউ, লাইক আর নতুন ফলোয়ার': 'Views, likes and new followers'
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
  P('ভিউ গত ১৪ দিনে ' + N, n => `${n} in the last 14 days`), P('গত ১৪ দিনে ' + N, n => `${n} in the last 14 days`), P('গত ১৪ দিনে \\+' + N, n => `+${n} in the last 14 days`),
  P(N + ' জনকে ফলো করছেন', n => `Following ${n}`),
  P(N + ' জন আছেন', n => `${n} in the call`),
  P('অ্যাপের কোড বাকি: ' + N + 'টি', n => `${n} backup codes left`), P(N + ' / ' + N + ' ফলোয়ার', (a, b) => `${a} / ${b} followers`), P(N + ' / ' + N + ' পোস্ট', (a, b) => `${a} / ${b} posts`),
  P('কমপক্ষে ৳' + N + ' হলে তোলা যায়।', n => `You can withdraw from ৳${n}.`), P('তোলা যাবে ৳' + N, n => `৳${n} available`), P(N + ' পয়েন্ট · ' + N + 'টি ভাড়া জানিয়েছেন', (p, f) => `${p} points · ${f} fares shared`),
  P('ভাড়া জানালে প্রতিবার ' + N + ' পয়েন্ট · এখন ' + N, (a, b) => `${a} points for each fare · ${b} now`), P('ভাড়া · ' + N, n => `Fares · ${n}`),
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
  P(N + ' টি ট্রেন', n => `${n} trains`),
  P(N + ' পয়েন্ট', n => `${n} points`),
  P('(শুভ সকাল|শুভ দুপুর|শুভ সন্ধ্যা|শুভ রাত্রি), (.+)', (g, n) => `${{ 'শুভ সকাল': 'Good morning', 'শুভ দুপুর': 'Good afternoon', 'শুভ সন্ধ্যা': 'Good evening', 'শুভ রাত্রি': 'Good night' }[g]}, ${n}`),
  P('জিপিএস পাওয়া যায়নি — ইন্টারনেট সংযোগ থেকে আনুমানিক এলাকা দেখানো হচ্ছে(.*)। সঠিক লোকেশনের জন্য ব্রাউজারে লোকেশনের অনুমতি দিন।', c => `GPS was not available — showing the approximate area from your internet connection${c}. Allow location in your browser for the exact spot.`),
  P('ভাড়া · ' + N, n => `Fares · ${n}`),
  P(N + ' লাইক', n => `${n} likes`),
  P('সব ' + N + ' টি মন্তব্য দেখুন', n => `View all ${n} comments`),
  P(N + ' মিনিট আগে', n => `${n} min ago`),
  P(N + ' ঘণ্টা আগে', n => `${n} h ago`),
  P(N + ' দিন আগে', n => `${n} d ago`),
  P('লিডারবোর্ডে ' + N + ' নম্বরে', n => `Number ${n} on the leaderboard`),
  P('জানানো ভাড়া · ' + N, n => `Fares shared · ${n}`),
  P('আপনার অবস্থান ' + N + ' নম্বরে', n => `You are number ${n}`),
  P(N + ' জন জানিয়েছেন', n => `shared by ${n}`),
  P(N + ' টি ভাড়া জানানো হয়েছে', n => `${n} fares shared`),
  P(N + ' জন অবদান রেখেছেন', n => `${n} contributors`),
  P('ধন্যবাদ! আপনি ' + N + ' পয়েন্ট পেলেন। আপনার জানানো ভাড়া এখন অন্যদের কাজে লাগবে।', n => `Thank you! You earned ${n} points. Your fare will now help others.`),
  P('Manzeela সাপোর্ট · (.+)', d => `Manzeela support · ${d}`),
  P('(.+) এখন অফলাইন।', n => `${n} is offline now.`),
  P('(.+) অন্য কলে আছেন।', n => `${n} is on another call.`),
  P('বাস স্টপ · ' + N + ' টি বাস', n => `Bus stop · ${n} buses`),
  P('([^·→]+)-এ ট্রেন বদল', s => `change at ${tr(s)}`),
  P('(.+) স্টেশনে অপেক্ষা (.+)', (s, t) => `Wait at ${tr(s)}: ${tr(t)}`),
  P('এক বদলে · (.+)', t => `One change · ${tr(t)}`),
  P('সরাসরি ট্রেন নেই · এক বদলে ' + N + ' টি উপায়', n => `No direct train · ${n} ways with one change`),
  P('(.+) থেকে (.+) সরাসরি বা এক বদলে কোনো ট্রেন তালিকায় নেই।', (a, b) => `No train from ${tr(a)} to ${tr(b)}, direct or with one change, in the list.`),
  P('৫১ ও ৪০ আসনের বাস · (.+) থেকে', t => `51- and 40-seat buses · from ${tr(t)}`),
  P('৫১ আসনের বাস · (.+) থেকে', t => `51-seat bus · from ${tr(t)}`),
  P(N + ' কিমি · টোলসহ', n => `${n} km · tolls included`),
  P('([^·]+) বন্ধ', day => `no service on ${tr(day)}`),
  P('([^·]+) স্টেশন থেকে', a => `From ${tr(a)} station`),
  P('(.+) থেকে (.+) সরাসরি কোনো ট্রেন তালিকায় নেই।', (a, b) => `No direct train from ${tr(a)} to ${tr(b)} in the list.`),
  P('ডেক (৳.+)', a => `deck ${a}`),
  P('ট্রেনের সময়সূচি: বাংলাদেশ রেলওয়ের তথ্য থেকে, হালনাগাদ (.+)।', d => `Train timetable: from Bangladesh Railway data, updated ${d}.`),
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
    if (HAS_BANGLA.test(n.nodeValue) && !n.parentNode.closest('script, style, .bn-labels, .no-tr')) {
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
        if (HAS_BANGLA.test(r.target.nodeValue) && !r.target.parentNode.closest('.bn-labels, .no-tr')) {
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
