# Builds data/dhaka-buses.js: every Dhaka-area local bus with its ordered stops.
#
#   python tools/build-buses.py
#
# Routes come from the open dataset github.com/imamhossain94/dhaka-city-local-bus-json-data (scraped from
# busroutebd.com), saved as tools/.cache/busroutebd.json. A few buses the dataset lacks are kept from an
# earlier hand-made list (EXTRA_ROUTES). The dataset names stops in English only and has no positions, so
# every stop is listed here with its Bangla name and an approximate position entered by hand.
# Routes change often and positions are rough: treat the result as a guide, not a survey.

import io, json, math, re, sys

SRC = 'tools/.cache/busroutebd.json'
OUT = 'data/dhaka-buses.js'

# dataset stop name -> (id, Bangla, English shown in the app, lat, lon)
STOPS = {
    # --- Savar, Ashulia, Dhamrai, Manikganj
    'Manikganj': ('manikganj', 'মানিকগঞ্জ', 'Manikganj', 23.8617, 90.0003),
    'Paturia': ('paturia', 'পাটুরিয়া', 'Paturia', 23.7900, 89.7900),
    'Kalampur': ('kalampur', 'কালামপুর', 'Kalampur', 23.9300, 90.1600),
    'Dhamrai': ('dhamrai', 'ধামরাই', 'Dhamrai', 23.9130, 90.2130),
    'Chandra': ('chandra', 'চন্দ্রা', 'Chandra', 24.0440, 90.2390),
    'Nandan Park': ('nandan', 'নন্দন পার্ক', 'Nandan Park', 24.0050, 90.2530),
    'Zirani Bazar': ('jirani', 'জিরানী বাজার', 'Zirani Bazar', 23.9830, 90.2600),
    'Baipayl': ('baipayl', 'বাইপাইল', 'Baipayl', 23.9455, 90.2710),
    'Palli Bidyut': ('pallibidyut', 'পল্লী বিদ্যুৎ', 'Palli Bidyut', 23.9330, 90.2670),
    'Shimultola': ('shimultola', 'শিমুলতলা', 'Shimultola', 23.9300, 90.2800),
    'Jamgora': ('jamgora', 'জামগড়া', 'Jamgora', 23.9210, 90.2930),
    'Fantasy Kingdom': ('fantasy', 'ফ্যান্টাসি কিংডম', 'Fantasy Kingdom', 23.9255, 90.2890),
    'Narshinghapur': ('narsinghapur', 'নরসিংহপুর', 'Narsinghapur', 23.9280, 90.3050),
    'Zirabo': ('zirabo', 'জিরাবো', 'Zirabo', 23.9100, 90.3050),
    'Ashulia Bazar': ('ashuliabazar', 'আশুলিয়া বাজার', 'Ashulia Bazar', 23.8975, 90.3220),
    'Ashulia': ('ashulia', 'আশুলিয়া', 'Ashulia', 23.8950, 90.3250),
    'Nobinagar': ('nabinagar', 'নবীনগর', 'Nabinagar', 23.9130, 90.2580),
    'Savar Cantonment': ('savarcantt', 'সাভার ক্যান্টনমেন্ট', 'Savar Cantonment', 23.9120, 90.2620),
    'Savar': ('savar', 'সাভার', 'Savar', 23.8480, 90.2570),
    'Hemayetpur': ('hemayetpur', 'হেমায়েতপুর', 'Hemayetpur', 23.7935, 90.2720),
    'Amin Bazar': ('aminbazar', 'আমিনবাজার', 'Amin Bazar', 23.7870, 90.3290),
    'Birulia': ('birulia', 'বিরুলিয়া', 'Birulia', 23.8520, 90.3380),
    'Dhour': ('dhour', 'ধউর', 'Dhour', 23.8900, 90.3720),
    'Kamarpara': ('kamarpara', 'কামারপাড়া', 'Kamarpara', 23.8900, 90.3880),
    # --- Gazipur
    'Baromi': ('baromi', 'বরমী', 'Baromi', 24.2300, 90.5100),
    'Sreepur': ('sreepur', 'শ্রীপুর', 'Sreepur', 24.2000, 90.4700),
    'Joydebpur': ('joydebpur', 'জয়দেবপুর', 'Joydebpur', 24.0000, 90.4200),
    'Shib Bari': ('shibbari', 'শিববাড়ি', 'Shib Bari', 23.9980, 90.4150),
    'Gazipur Chourasta': ('gazipur', 'গাজীপুর চৌরাস্তা', 'Gazipur Chowrasta', 23.9900, 90.3830),
    'Gazipur Bypass': ('gazipurbypass', 'গাজীপুর বাইপাস', 'Gazipur Bypass', 23.9760, 90.3840),
    'Konabari': ('konabari', 'কোনাবাড়ী', 'Konabari', 24.0080, 90.3260),
    'Jarun': ('jarun', 'জরুন', 'Jarun', 24.0050, 90.3300),
    'Kashimpur': ('kashimpur', 'কাশিমপুর', 'Kashimpur', 23.9900, 90.3130),
    'Sura Bari': ('surabari', 'সুরাবাড়ী', 'Sura Bari', 23.9700, 90.3000),
    'Board Bazar': ('boardbazar', 'বোর্ড বাজার', 'Board Bazar', 23.9460, 90.3830),
    'Mill Gate': ('millgate', 'মিল গেট', 'Mill Gate', 23.9050, 90.4010),
    'Station Road': ('stationroad', 'স্টেশন রোড', 'Station Road', 23.8960, 90.4010),
    'Tongi': ('tongi', 'টঙ্গী', 'Tongi', 23.8915, 90.4020),
    # --- Uttara, Airport, Cantonment
    'Abdullahpur': ('abdullahpur', 'আব্দুল্লাহপুর', 'Abdullahpur', 23.8797, 90.4010),
    'House Building': ('uttara', 'হাউজ বিল্ডিং', 'House Building', 23.8740, 90.4005),
    'Azampur': ('azampur', 'আজমপুর', 'Azampur', 23.8680, 90.4002),
    'Rajlakshmi': ('rajlakshmi', 'রাজলক্ষ্মী', 'Rajlakshmi', 23.8640, 90.4003),
    'Jashimuddin (Uttara)': ('jashimuddin', 'জসীমউদ্দীন', 'Jashimuddin', 23.8610, 90.4005),
    'Diabari': ('diabari', 'দিয়াবাড়ি', 'Diabari', 23.8730, 90.3690),
    'Airport': ('airport', 'বিমানবন্দর', 'Airport', 23.8515, 90.4080),
    'Khilkhet': ('khilkhet', 'খিলক্ষেত', 'Khilkhet', 23.8290, 90.4200),
    'Kuril Bishwa Road': ('kuril', 'কুড়িল বিশ্বরোড', 'Kuril Bishwa Road', 23.8205, 90.4200),
    'Shewra': ('shewra', 'শেওড়া', 'Shewra', 23.8195, 90.4150),
    'MES': ('mes', 'এমইএস', 'MES', 23.8160, 90.4030),
    'Staff Road': ('staffroad', 'স্টাফ রোড', 'Staff Road', 23.8030, 90.4015),
    'ECB Square': ('ecb', 'ইসিবি চত্বর', 'ECB Square', 23.8225, 90.3930),
    'Balughat': ('balughat', 'বালুঘাট', 'Balughat', 23.8270, 90.3925),
    'Cantonment': ('cantonmentst', 'ক্যান্টনমেন্ট', 'Cantonment', 23.8230, 90.3980),
    'Signal': ('signal', 'সিগন্যাল', 'Signal', 23.8200, 90.3960),
    'Garrison (Cantonment)': ('garrison', 'গ্যারিসন', 'Garrison', 23.8180, 90.3960),
    'CMH': ('cmh', 'সিএমএইচ', 'CMH', 23.8145, 90.3960),
    'Adamjee College': ('adamjee', 'আদমজী কলেজ', 'Adamjee College', 23.8100, 90.3985),
    'Workshop': ('workshop', 'ওয়ার্কশপ', 'Workshop', 23.7960, 90.3950),
    'Kachukhet': ('cantonment', 'কচুক্ষেত', 'Kachukhet', 23.7925, 90.3890),
    'Saudi Colony': ('saudicolony', 'সৌদি কলোনি', 'Saudi Colony', 23.7870, 90.3920),
    'Vashantek': ('vashantek', 'ভাষানটেক', 'Vashantek', 23.8060, 90.3900),
    # --- Purbachal, Rupganj
    '300 Feet': ('feet300', '৩০০ ফিট', '300 Feet', 23.8215, 90.4330),
    'Nila Market': ('nilamarket', 'নীলা মার্কেট', 'Nila Market', 23.8310, 90.4900),
    'Kanchan Bridge': ('kanchanbridge', 'কাঞ্চন ব্রিজ', 'Kanchan Bridge', 23.8340, 90.5180),
    'Vulta': ('vulta', 'ভুলতা', 'Bhulta', 23.7850, 90.5650),
    # --- Badda, Gulshan, Banani, Mohakhali
    'Jamuna Future Park': ('jamuna', 'যমুনা ফিউচার পার্ক', 'Jamuna Future Park', 23.8135, 90.4245),
    'Bashundhara': ('bashundhara', 'বসুন্ধরা', 'Bashundhara', 23.8110, 90.4247),
    'Nadda': ('nadda', 'নদ্দা', 'Nadda', 23.8060, 90.4245),
    'Notun Bazar': ('notunbazar', 'নতুন বাজার', 'Notun Bazar', 23.7975, 90.4235),
    'Bashtola': ('bashtola', 'বাঁশতলা', 'Bashtola', 23.7945, 90.4240),
    'Shahjadpur': ('shahjadpur', 'শাহজাদপুর', 'Shahjadpur', 23.7915, 90.4245),
    'Uttar Badda': ('uttarbadda', 'উত্তর বাড্ডা', 'Uttar Badda', 23.7860, 90.4257),
    'Badda': ('badda', 'বাড্ডা', 'Badda', 23.7815, 90.4258),
    'Badda Link Road': ('baddalink', 'বাড্ডা লিংক রোড', 'Badda Link Road', 23.7806, 90.4245),
    'Madhya Badda': ('madhyabadda', 'মধ্য বাড্ডা', 'Madhya Badda', 23.7785, 90.4257),
    'Merul': ('merul', 'মেরুল', 'Merul', 23.7730, 90.4255),
    'Rampura Bridge': ('rampurabridge', 'রামপুরা ব্রিজ', 'Rampura Bridge', 23.7680, 90.4225),
    'Rampura Bazar': ('rampura', 'রামপুরা বাজার', 'Rampura Bazar', 23.7600, 90.4195),
    'Banasree': ('banasree', 'বনশ্রী', 'Banasree', 23.7630, 90.4330),
    'South Banasree': ('southbanasree', 'দক্ষিণ বনশ্রী', 'South Banasree', 23.7560, 90.4380),
    'Demra Staff Quarter': ('demrastaff', 'ডেমরা স্টাফ কোয়ার্টার', 'Demra Staff Quarter', 23.7215, 90.4860),
    'Hazipara': ('hazipara', 'হাজীপাড়া', 'Hazipara', 23.7560, 90.4175),
    'Gulshan 2': ('gulshan2', 'গুলশান ২', 'Gulshan 2', 23.7947, 90.4143),
    'Gulshan 1': ('gulshan1', 'গুলশান ১', 'Gulshan 1', 23.7806, 90.4165),
    'Police Plaza': ('policeplaza', 'পুলিশ প্লাজা', 'Police Plaza', 23.7740, 90.4165),
    'Kakali': ('kakali', 'কাকলী', 'Kakali', 23.7950, 90.4008),
    'Banani': ('banani', 'বনানী', 'Banani', 23.7922, 90.4012),
    'Sainik Club': ('sainikclub', 'সৈনিক ক্লাব', 'Sainik Club', 23.7895, 90.4005),
    'Chairman Bari': ('chairmanbari', 'চেয়ারম্যান বাড়ি', 'Chairman Bari', 23.7855, 90.4000),
    'Wireless': ('wireless', 'ওয়্যারলেস', 'Wireless', 23.7800, 90.4070),
    'Mohakhali': ('mohakhali', 'মহাখালী', 'Mohakhali', 23.7780, 90.3975),
    'Jahangir Gate': ('jahangirgate', 'জাহাঙ্গীর গেট', 'Jahangir Gate', 23.7760, 90.3910),
    'Old Airport': ('oldairport', 'পুরাতন বিমানবন্দর', 'Old Airport', 23.7720, 90.3900),
    'Nabisco': ('nabisco', 'নাবিস্কো', 'Nabisco', 23.7680, 90.4020),
    'Bot tola': ('bottola', 'বটতলা', 'Bot Tola', 23.7600, 90.3990),
    'Satrasta': ('satrasta', 'সাতরাস্তা', 'Satrasta', 23.7585, 90.4010),
    # --- Mirpur
    'Mirpur DOHS': ('mirpurdohs', 'মিরপুর ডিওএইচএস', 'Mirpur DOHS', 23.8370, 90.3690),
    'Mirpur 12': ('mirpur12', 'মিরপুর ১২', 'Mirpur 12', 23.8280, 90.3640),
    'Pallabi': ('pallabi', 'পল্লবী', 'Pallabi', 23.8250, 90.3650),
    'Duaripara': ('duaripara', 'দুয়ারীপাড়া', 'Duaripara', 23.8270, 90.3540),
    'Purobi': ('purobi', 'পূরবী', 'Purobi', 23.8200, 90.3655),
    'Kalshi': ('kalshi', 'কালশী', 'Kalshi', 23.8225, 90.3765),
    'Mirpur 11': ('mirpur11', 'মিরপুর ১১', 'Mirpur 11', 23.8160, 90.3663),
    'Rupnagar': ('rupnagar', 'রূপনগর', 'Rupnagar', 23.8160, 90.3560),
    'Shiyal Bari': ('shiyalbari', 'শিয়ালবাড়ি', 'Shiyal Bari', 23.8140, 90.3580),
    'Proshika Moor': ('proshika', 'প্রশিকা মোড়', 'Proshika Mor', 23.8115, 90.3600),
    'Beribadh': ('beribadh', 'বেড়িবাঁধ', 'Beribadh', 23.8300, 90.3440),
    'Chiriyakhana': ('chiriyakhana', 'চিড়িয়াখানা', 'Chiriyakhana (Zoo)', 23.8125, 90.3480),
    'Mirpur 10': ('mirpur10', 'মিরপুর ১০', 'Mirpur 10', 23.8069, 90.3687),
    'Mirpur 13': ('mirpur13', 'মিরপুর ১৩', 'Mirpur 13', 23.8050, 90.3780),
    'Mirpur 14': ('mirpur14', 'মিরপুর ১৪', 'Mirpur 14', 23.7990, 90.3860),
    'Mirpur 2': ('mirpur2', 'মিরপুর ২', 'Mirpur 2', 23.8062, 90.3605),
    'Sony Cinema Hall': ('sony', 'সনি সিনেমা হল', 'Sony Cinema Hall', 23.8040, 90.3630),
    'Mirpur 1': ('mirpur1', 'মিরপুর ১', 'Mirpur 1', 23.7956, 90.3537),
    'Ansar Camp': ('ansarcamp', 'আনসার ক্যাম্প', 'Ansar Camp', 23.7905, 90.3535),
    'Tolarbag': ('tolarbag', 'টোলারবাগ', 'Tolarbag', 23.7880, 90.3530),
    'Bangla College': ('banglacollege', 'বাংলা কলেজ', 'Bangla College', 23.7860, 90.3530),
    'Mazar Road': ('mazarroad', 'মাজার রোড', 'Mazar Road', 23.7905, 90.3470),
    'Kazipara': ('kazipara', 'কাজীপাড়া', 'Kazipara', 23.7972, 90.3728),
    'Shewrapara': ('shewrapara', 'শেওড়াপাড়া', 'Shewrapara', 23.7906, 90.3755),
    'Taltola': ('taltola', 'তালতলা', 'Taltola', 23.7835, 90.3780),
    'IDB': ('idb', 'আইডিবি ভবন', 'IDB Bhaban', 23.7790, 90.3790),
    'Agargaon': ('agargaon', 'আগারগাঁও', 'Agargaon', 23.7776, 90.3803),
    # --- Gabtoli, Shyamoli, Mohammadpur, Dhanmondi
    'Gabtoli': ('gabtoli', 'গাবতলী', 'Gabtoli', 23.7833, 90.3442),
    'Technical': ('technical', 'টেকনিক্যাল', 'Technical', 23.7809, 90.3525),
    'Darussalam': ('darussalam', 'দারুস সালাম', 'Darussalam', 23.7805, 90.3560),
    'Kallyanpur': ('kallyanpur', 'কল্যাণপুর', 'Kallyanpur', 23.7812, 90.3611),
    'Shyamoli': ('shyamoli', 'শ্যামলী', 'Shyamoli', 23.7746, 90.3655),
    'Shishu Mela': ('shishumela', 'শিশু মেলা', 'Shishu Mela', 23.7725, 90.3668),
    'College Gate': ('collegegate', 'কলেজ গেট', 'College Gate', 23.7690, 90.3690),
    'Asad Gate': ('asadgate', 'আসাদ গেট', 'Asad Gate', 23.7601, 90.3727),
    'Adabor': ('adabor', 'আদাবর', 'Adabor', 23.7715, 90.3585),
    'Ring Road': ('ringroad', 'রিং রোড', 'Ring Road', 23.7690, 90.3620),
    'Japan Garden City': ('japangarden', 'জাপান গার্ডেন সিটি', 'Japan Garden City', 23.7660, 90.3570),
    'Shia Mosque': ('shiamasjid', 'শিয়া মসজিদ', 'Shia Masjid', 23.7660, 90.3590),
    'Tajmahal Road': ('tajmahal', 'তাজমহল রোড', 'Tajmahal Road', 23.7640, 90.3580),
    'Salimullah Road': ('salimullah', 'সলিমুল্লাহ রোড', 'Salimullah Road', 23.7620, 90.3610),
    'Jakir Hossen Road': ('jakirhossain', 'জাকির হোসেন রোড', 'Zakir Hossain Road', 23.7600, 90.3640),
    'Mohammadpur': ('mohammadpur', 'মোহাম্মদপুর', 'Mohammadpur', 23.7575, 90.3615),
    'Bosila': ('bosila', 'বসিলা', 'Bosila', 23.7440, 90.3480),
    'Ghatar Char': ('ghatarchar', 'ঘাটারচর', 'Ghatar Char', 23.7420, 90.3330),
    'Beribadh Tin Rastar Moor': ('beribadhtin', 'বেড়িবাঁধ তিন রাস্তার মোড়', 'Beribadh Tin Rastar Mor', 23.7480, 90.3520),
    'Rayer Bazar': ('rayerbazar', 'রায়েরবাজার', 'Rayer Bazar', 23.7440, 90.3640),
    'Sikder Medical College': ('sikder', 'সিকদার মেডিকেল', 'Sikder Medical College', 23.7410, 90.3600),
    'Hazaribag': ('hazaribag', 'হাজারীবাগ', 'Hazaribagh', 23.7340, 90.3670),
    'Nawabganj': ('nawabganj', 'নবাবগঞ্জ', 'Nawabganj', 23.7230, 90.3780),
    'Kamrangirchar': ('kamrangirchar', 'কামরাঙ্গীরচর', 'Kamrangirchar', 23.7170, 90.3700),
    'Shankar': ('shankar', 'শংকর', 'Shankar', 23.7510, 90.3680),
    'Dhanmondi 15': ('dhanmondi15', 'ধানমন্ডি ১৫', 'Dhanmondi 15', 23.7455, 90.3720),
    'Star Kabab': ('starkabab', 'স্টার কাবাব', 'Star Kabab', 23.7430, 90.3735),
    'Jigatola': ('jigatola', 'জিগাতলা', 'Jigatola', 23.7390, 90.3755),
    'Dhanmondi 27': ('dhanmondi27', 'ধানমন্ডি ২৭', 'Dhanmondi 27', 23.7560, 90.3745),
    'Dhanmondi 32': ('dhanmondi32', 'ধানমন্ডি ৩২', 'Dhanmondi 32', 23.7515, 90.3770),
    'Shukrabad': ('shukrabad', 'শুক্রাবাদ', 'Shukrabad', 23.7525, 90.3775),
    'Kalabagan': ('kalabagan', 'কলাবাগান', 'Kalabagan', 23.7480, 90.3800),
    'City College': ('citycollege', 'সিটি কলেজ', 'City College', 23.7405, 90.3828),
    'Science Lab': ('sciencelab', 'সায়েন্স ল্যাব', 'Science Lab', 23.7389, 90.3835),
    'Bata Signal': ('batasignal', 'বাটা সিগন্যাল', 'Bata Signal', 23.7395, 90.3885),
    'Katabon': ('katabon', 'কাঁটাবন', 'Katabon', 23.7385, 90.3910),
    'New Market': ('newmarket', 'নিউ মার্কেট', 'New Market', 23.7335, 90.3850),
    'Nilkhet': ('nilkhet', 'নীলক্ষেত', 'Nilkhet', 23.7320, 90.3870),
    'Eden College': ('edencollege', 'ইডেন কলেজ', 'Eden College', 23.7300, 90.3860),
    'Azimpur': ('azimpur', 'আজিমপুর', 'Azimpur', 23.7275, 90.3850),
    'Palashi': ('palashi', 'পলাশী', 'Palashi', 23.7270, 90.3890),
    'Dhakeshwari': ('dhakeshwari', 'ঢাকেশ্বরী', 'Dhakeshwari', 23.7230, 90.3900),
    'Bakshi Bazar': ('bakshibazar', 'বকশীবাজার', 'Bakshi Bazar', 23.7235, 90.3935),
    'Chankhar Pul': ('chankharpul', 'চানখাঁরপুল', 'Chankharpul', 23.7235, 90.4000),
    # --- Farmgate, Shahbag, Motijheel
    'Manik Mia Avenue': ('manikmia', 'মানিক মিয়া এভিনিউ', 'Manik Mia Avenue', 23.7590, 90.3790),
    'Zia Uddyan': ('ziauddyan', 'জিয়া উদ্যান', 'Zia Udyan', 23.7680, 90.3790),
    'Bijoy Sarani': ('bijoysarani', 'বিজয় সরণি', 'Bijoy Sarani', 23.7650, 90.3890),
    'Khamar Bari': ('khamarbari', 'খামারবাড়ি', 'Khamarbari', 23.7590, 90.3840),
    'Farmgate': ('farmgate', 'ফার্মগেট', 'Farmgate', 23.7577, 90.3900),
    'Panthapath': ('panthapath', 'পান্থপথ', 'Panthapath', 23.7515, 90.3870),
    'Kawran Bazar': ('karwanbazar', 'কারওয়ান বাজার', 'Karwan Bazar', 23.7508, 90.3932),
    'Bangla Motor': ('banglamotor', 'বাংলামোটর', 'Bangla Motor', 23.7461, 90.3948),
    'Mogbazar': ('moghbazar', 'মগবাজার', 'Moghbazar', 23.7490, 90.4040),
    'Mouchak': ('mouchak', 'মৌচাক', 'Mouchak', 23.7460, 90.4120),
    'Malibagh Moor': ('malibagh', 'মালিবাগ মোড়', 'Malibagh Mor', 23.7500, 90.4130),
    'Malibagh Railgate': ('malibaghrail', 'মালিবাগ রেলগেট', 'Malibagh Railgate', 23.7497, 90.4165),
    'Shantinagar': ('shantinagar', 'শান্তিনগর', 'Shantinagar', 23.7400, 90.4130),
    'Rajarbag': ('rajarbag', 'রাজারবাগ', 'Rajarbagh', 23.7410, 90.4170),
    'Kakrail': ('kakrail', 'কাকরাইল', 'Kakrail', 23.7375, 90.4085),
    'Shahbag': ('shahbag', 'শাহবাগ', 'Shahbag', 23.7381, 90.3958),
    'Matsya Bhaban': ('matsyabhaban', 'মৎস্য ভবন', 'Matsya Bhaban', 23.7335, 90.4050),
    'High Court': ('highcourt', 'হাইকোর্ট', 'High Court', 23.7305, 90.4030),
    'Press Club': ('pressclub', 'প্রেস ক্লাব', 'Press Club', 23.7300, 90.4075),
    'Paltan': ('paltan', 'পল্টন', 'Paltan', 23.7353, 90.4126),
    'GPO': ('gpo', 'জিপিও', 'GPO', 23.7285, 90.4115),
    'Baitul Mukarram': ('baitulmukarram', 'বায়তুল মোকাররম', 'Baitul Mukarram', 23.7290, 90.4125),
    'Dainik Bangla Moor': ('dainikbangla', 'দৈনিক বাংলা মোড়', 'Dainik Bangla Mor', 23.7305, 90.4150),
    'Fakirapul': ('fakirapul', 'ফকিরাপুল', 'Fakirapul', 23.7335, 90.4165),
    'Motijheel': ('motijheel', 'মতিঝিল', 'Motijheel', 23.7330, 90.4172),
    'Bangladesh Bank': ('bangladeshbank', 'বাংলাদেশ ব্যাংক', 'Bangladesh Bank', 23.7280, 90.4200),
    'Arambagh': ('arambagh', 'আরামবাগ', 'Arambagh', 23.7320, 90.4205),
    'Kamalapur': ('kamalapur', 'কমলাপুর', 'Kamalapur', 23.7320, 90.4260),
    'Gulistan': ('gulistan', 'গুলিস্তান', 'Gulistan', 23.7231, 90.4133),
    'Golap Shah Mazar': ('golapshah', 'গোলাপ শাহ মাজার', 'Golap Shah Mazar', 23.7250, 90.4110),
    'Fulbaria': ('fulbaria', 'ফুলবাড়িয়া', 'Fulbaria', 23.7240, 90.4100),
    # --- Khilgaon, Bashabo, Sayedabad, Jatrabari
    'Khilgaon': ('khilgaon', 'খিলগাঁও', 'Khilgaon', 23.7510, 90.4250),
    'Khilgaon Flyover': ('khilgaonflyover', 'খিলগাঁও ফ্লাইওভার', 'Khilgaon Flyover', 23.7445, 90.4245),
    'Bashabo': ('bashabo', 'বাসাবো', 'Bashabo', 23.7405, 90.4290),
    'Mugdapara': ('mugda', 'মুগদা', 'Mugda', 23.7311, 90.4290),
    'TT Para': ('ttipara', 'টিটিপাড়া', 'TT Para', 23.7290, 90.4265),
    'Manik Nagar': ('maniknagar', 'মানিকনগর', 'Maniknagar', 23.7230, 90.4320),
    'Golapbag Chourasta': ('golapbag', 'গোলাপবাগ', 'Golapbagh', 23.7195, 90.4285),
    'Ittefaq Moor': ('ittefaq', 'ইত্তেফাক মোড়', 'Ittefaq Mor', 23.7215, 90.4215),
    'Tikatuli': ('tikatuli', 'টিকাটুলি', 'Tikatuli', 23.7190, 90.4200),
    'Sayedabad': ('sayedabad', 'সায়েদাবাদ', 'Sayedabad', 23.7166, 90.4270),
    'Janapath Moor': ('janapath', 'জনপথ মোড়', 'Janapath Mor', 23.7150, 90.4295),
    'Jatrabari': ('jatrabari', 'যাত্রাবাড়ী', 'Jatrabari', 23.7104, 90.4348),
    'Kazla': ('kazla', 'কাজলা', 'Kazla', 23.7075, 90.4420),
    'Shonir Akhra': ('shonirakhra', 'শনির আখড়া', 'Shonir Akhra', 23.7030, 90.4510),
    'Rayerbag': ('rayerbag', 'রায়েরবাগ', 'Rayerbagh', 23.7000, 90.4580),
    'Matuail': ('matuail', 'মাতুয়াইল', 'Matuail', 23.6990, 90.4660),
    'Sign Board': ('signboard', 'সাইনবোর্ড', 'Signboard', 23.6940, 90.4810),
    'Sanarpar': ('sanarpar', 'সানারপাড়', 'Sanarpar', 23.6945, 90.4920),
    'Chittagong Road': ('ctgroad', 'চিটাগাং রোড', 'Chittagong Road', 23.6975, 90.5085),
    'Kanchpur': ('kanchpur', 'কাঁচপুর', 'Kanchpur', 23.7050, 90.5230),
    'Madanpur': ('madanpur', 'মদনপুর', 'Madanpur', 23.6920, 90.5520),
    'Tarabo': ('tarabo', 'তারাবো', 'Tarabo', 23.7290, 90.5130),
    'Meghna Ghat': ('meghnaghat', 'মেঘনা ঘাট', 'Meghna Ghat', 23.6100, 90.6100),
    # --- Narayanganj
    'Jalkuri': ('jalkuri', 'জালকুড়ি', 'Jalkuri', 23.6650, 90.4920),
    'Shibu Market': ('shibumarket', 'শিবু মার্কেট', 'Shibu Market', 23.6420, 90.4960),
    'Chashara': ('chashara', 'চাষাঢ়া', 'Chashara', 23.6235, 90.4995),
    'Metro Hall': ('metrohall', 'মেট্রো হল', 'Metro Hall', 23.6180, 90.5010),
    # --- Old Dhaka, Postogola, Keraniganj, Mawa road
    'Dholairpar': ('dholairpar', 'ধোলাইপাড়', 'Dholairpar', 23.7005, 90.4330),
    'Dayaganj': ('dayaganj', 'দয়াগঞ্জ', 'Dayaganj', 23.7095, 90.4250),
    'Dhupkhola': ('dhupkhola', 'ধূপখোলা', 'Dhupkhola', 23.7075, 90.4215),
    'Gandaria': ('gandaria', 'গেন্ডারিয়া', 'Gandaria', 23.7045, 90.4245),
    'Jurain': ('jurain', 'জুরাইন', 'Jurain', 23.6935, 90.4285),
    'Postagola': ('postogola', 'পোস্তগোলা', 'Postogola', 23.6900, 90.4270),
    'Hasnabad': ('hasnabad', 'হাসনাবাদ', 'Hasnabad', 23.6790, 90.4280),
    'Ray Saheb Bazar': ('raysahebbazar', 'রায়সাহেব বাজার', 'Ray Saheb Bazar', 23.7115, 90.4135),
    'Victoria Park': ('victoriapark', 'ভিক্টোরিয়া পার্ক', 'Victoria Park', 23.7090, 90.4120),
    'Sadarghat': ('sadarghat', 'সদরঘাট', 'Sadarghat', 23.7085, 90.4110),
    'Naya Bazar': ('nayabazar', 'নয়াবাজার', 'Naya Bazar', 23.7150, 90.4060),
    'Babubazar': ('babubazar', 'বাবুবাজার', 'Babubazar', 23.7130, 90.4020),
    'Mitford Ghat': ('mitford', 'মিটফোর্ড ঘাট', 'Mitford Ghat', 23.7095, 90.4005),
    'Showari Ghat': ('showarighat', 'সোয়ারীঘাট', 'Showari Ghat', 23.7120, 90.3950),
    'Keraniganj': ('keraniganj', 'কেরানীগঞ্জ', 'Keraniganj', 23.7000, 90.3900),
    'Kadamtali': ('kadamtali', 'কদমতলী', 'Kadamtali', 23.6950, 90.3880),
    'Rajendrapur': ('rajendrapur', 'রাজেন্দ্রপুর', 'Rajendrapur', 23.6550, 90.3850),
    'Kuchimura': ('kuchimura', 'কুচিয়ামোড়া', 'Kuchimura', 23.6200, 90.3600),
    'Nimtola': ('nimtola', 'নিমতলা', 'Nimtola', 23.5600, 90.3300),
    'Shonbari Sreenagar': ('sreenagar', 'শ্রীনগর', 'Sreenagar', 23.5350, 90.2900),
    'Maowa': ('mawa', 'মাওয়া', 'Mawa', 23.4720, 90.2600),
}

# Other spellings in the dataset -> the name used above.
ALIASES = {
    '- Ray Saheb Bazar': 'Ray Saheb Bazar', 'Ray Shaheb Bazar': 'Ray Saheb Bazar', 'Abdulla': 'Abdullahpur',
    'Adabor Shyamoli': 'Adabor', 'Adamjee School': 'Adamjee College', 'Airport Jashimuddin (Uttara)': 'Jashimuddin (Uttara)',
    'Arambagh Kingdom': 'Arambagh', 'Arambagh Notre Dame College': 'Arambagh', 'Bangla Motor Shahbag': 'Bangla Motor',
    'Bashtola -': 'Bashtola', 'Bashundhara (300 Feet Gate)': '300 Feet', 'Dhamra': 'Dhamrai', 'Dhanmondi 32 Kalabagan': 'Dhanmondi 32',
    'Dia Bari': 'Diabari', 'Farmgate Bijoy Sarani': 'Farmgate', 'Gulshan Link Road': 'Badda Link Road',
    'Ittefaq Moor Sayedabad': 'Ittefaq Moor', 'Jatrabari -': 'Jatrabari', 'Kajipara': 'Kazipara', 'Kazipara Shewrapara': 'Kazipara',
    'kakali': 'Kakali', 'Kalabagan City College': 'Kalabagan', 'Kolabagan': 'Kalabagan', 'Kalshi Pallabi': 'Kalshi',
    'Kamlapur': 'Kamalapur', 'Karwan Bazar': 'Kawran Bazar', 'Khamar Bari -': 'Khamar Bari', 'Khamar Bari Farmgate': 'Khamar Bari',
    'Khamarbari': 'Khamar Bari', 'Khilgaon Khidma Hospital': 'Khilgaon', 'Kuril  Bishwa Road': 'Kuril Bishwa Road',
    'Kuril Bissho Road': 'Kuril Bishwa Road', 'Kuril Chourasta': 'Kuril Bishwa Road', 'Kuril Flyover': 'Kuril Bishwa Road',
    'Malibagh': 'Malibagh Moor', 'Mirpur 2 Mirpur 10': 'Mirpur 2', 'Mirpur Sony Cinema Hall': 'Sony Cinema Hall',
    'Mogbazar Mohakhali': 'Mogbazar', 'Mohammadpur Bus Stand': 'Mohammadpur', 'Motsho Bhaban': 'Matsya Bhaban',
    'New Market Nilkhet': 'New Market', 'Nobinagar Baipayl': 'Nobinagar', 'Nobinagar Chandra': 'Nobinagar', 'Panthopoth': 'Panthapath',
    'Press Club  Paltan': 'Press Club', 'Purobi Pallabi': 'Purobi', 'Rajlakshmi House Building': 'Rajlakshmi', 'Ring road': 'Ring Road',
    'Rupnagar Abashik': 'Rupnagar', 'Sat rasta': 'Satrasta', 'Shanir Akhra': 'Shonir Akhra', 'Sony CInema Hall': 'Sony Cinema Hall',
    'Sony Cenema Hall': 'Sony Cinema Hall', 'Sony Cinema Hall Mirpur 1': 'Sony Cinema Hall', 'Technical -': 'Technical',
}

# Stops only the hand-made routes below use.
MORE_STOPS = {
    'kaliakair': ('কালিয়াকৈর', 'Kaliakair', 24.0700, 90.2200),
    'epz': ('ইপিজেড', 'EPZ', 23.9470, 90.2740),
    'mirpur6': ('মিরপুর ৬', 'Mirpur 6', 23.8110, 90.3610),
    'tsc': ('টিএসসি', 'TSC', 23.7325, 90.3955),
    'bangabazar': ('বঙ্গবাজার', 'Bangabazar', 23.7245, 90.4075),
    'bangabhaban': ('বঙ্গভবন', 'Bangabhaban', 23.7228, 90.4180),
}

# Buses the dataset does not list, kept from the earlier hand-made list (stop ids).
EXTRA_ROUTES = [
    ('তুরাগ', 'Turag', 'tongi abdullahpur uttara airport kuril notunbazar badda rampura malibagh khilgaon bashabo mugda maniknagar sayedabad jatrabari'),
    ('নিউ পল্লবী', 'New Pollobi', 'gabtoli mirpur1 mirpur10 kalshi kuril airport uttara abdullahpur'),
    ('বৃহত্তর মিরপুর', 'Brihottor Mirpur', 'chiriyakhana mirpur1 gabtoli savar nabinagar chandra'),
    ('ঢাকা মেট্রো', 'Dhaka Metro', 'mirpur1 kallyanpur shyamoli asadgate shukrabad kalabagan sciencelab newmarket nilkhet azimpur'),
    ('নবকলি', 'Nobokoli', 'mirpur1 kallyanpur shyamoli agargaon mohakhali banani gulshan2 notunbazar'),
    ('৩ নম্বর (এয়ারপোর্ট)', '3 Number (Airport)', 'bangabazar highcourt shahbag farmgate mohakhali banani kuril airport uttara abdullahpur'),
    ('৯ নম্বর', '9 Number', 'collegegate shyamoli technical mirpur1 mirpur12'),
    ('তরঙ্গ', 'Torongo', 'mohammadpur asadgate farmgate mohakhali gulshan1 badda notunbazar'),
]


def km(a, b):
    rad = math.radians
    h = math.sin(rad(b[0] - a[0]) / 2) ** 2 + math.cos(rad(a[0])) * math.cos(rad(b[0])) * math.sin(rad(b[1] - a[1]) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    data = json.load(io.open(SRC, encoding='utf-8'))['data']
    stops = {sid: (bn, en, lat, lon) for (sid, bn, en, lat, lon) in STOPS.values()}
    for sid, row in MORE_STOPS.items():
        stops[sid] = row
    unknown, routes, flagged = set(), [], []

    for bus in data:
        ids = []
        for raw in bus['routes']:
            name = ALIASES.get(raw.strip(), raw.strip())
            if name not in STOPS:
                unknown.add(raw.strip())
                continue
            sid = STOPS[name][0]
            # Two names in the dataset mean a different, nearby place on these routes than the well-known one
            # (a "Konabari" on the Mirpur embankment, a "Palashi" beside Meghna Ghat); we have no position for those.
            if (sid == 'konabari' and ids and ids[-1] == 'mazarroad') or (sid == 'palashi' and 'Meghna Ghat' in bus['routes']):
                continue
            if not ids or ids[-1] != sid:            # aliases can repeat the same stop back to back
                ids.append(sid)
        if len(ids) < 2:
            continue
        bn = re.sub(r'\s*(বাস|বাস সার্ভিস)$', '', bus['bangle'].strip()).strip()
        if not re.search(r'[ঀ-৿]', bn):
            bn = bus['english'].strip()
        en = re.sub(r'\s+(Dhaka|Bus)$', '', bus['english'].strip())
        routes.append([bn, en, ids])

    for bn, en, line in EXTRA_ROUTES:
        routes.append([bn, en, line.split()])

    # Names the dataset spells in English or wrongly (the company's own Bangla name).
    NAME_FIX = {'Lal Sabuj': 'লাল সবুজ', 'মাঞ্জিল এক্সপ্রেস': 'মঞ্জিল এক্সপ্রেস'}
    for r in routes:
        r[0] = NAME_FIX.get(r[0], r[0])

    # One bus, one entry. The dataset lists some buses twice: the same stops under two names (৬নং and ৬নং মতিঝিল বনানী
    # ট্রান্সপোর্ট), the same company spelt two ways (Deepan / Dipon), or each direction on its own (শিকড়). Buses run
    # both ways here, so these become one; the longer list of stops and the fuller name are kept.
    SAME_BUS = [('Deepan', 'Dipon')]
    base = lambda en: re.sub(r'\s*\([^)]*\)\s*$', '', en).strip()
    def same(a, b):
        # the same stops under a shorter and a fuller form of one name (৬নং / ৬নং মতিঝিল বনানী ট্রান্সপোর্ট); two companies
        # on the same road (Alif and Bhuiyan) stay two buses
        if (a[2] == b[2] or a[2] == b[2][::-1]) and (a[0].startswith(b[0]) or b[0].startswith(a[0])):
            return True
        if any({a[1], b[1]} == set(p) for p in SAME_BUS):
            return True
        return base(a[1]) == base(b[1]) and {a[2][0], a[2][-1]} == {b[2][0], b[2][-1]}
    merged = []
    for r in routes:
        twin = next((m for m in merged if same(m, r)), None)
        if not twin:
            merged.append(r)
            continue
        # the one kept, name and all: the longer list of stops; with the same stops, the fuller name
        if len(twin[2]) != len(r[2]):
            keep = twin if len(twin[2]) > len(r[2]) else r
        else:
            keep = twin if len(twin[0]) >= len(r[0]) else r
        if base(twin[1]) == base(r[1]):            # one company, each direction on its own: drop the direction
            keep[0] = re.sub(r'\s*\([^)]*\)\s*$', '', keep[0]).strip()
            keep[1] = base(keep[1])
        merged[merged.index(twin)] = keep
        print('merged:', twin[1], '+', r[1], '->', keep[0])
    routes = merged

    # Several buses share a name (BRTC, Alif, Trust…): tell them apart by their two ends.
    seen = {}
    for r in routes:
        seen[r[1]] = seen.get(r[1], 0) + 1
    for r in routes:
        if seen[r[1]] > 1:
            a, b = stops[r[2][0]], stops[r[2][-1]]
            r[0] = f'{r[0]} ({a[0]}–{b[0]})'
            r[1] = f'{r[1]} ({a[1]}–{b[1]})'

    for bn, en, ids in routes:
        for x, y in zip(ids, ids[1:]):
            d = km(stops[x][2:], stops[y][2:])
            if d > 9:
                flagged.append(f'{en}: {x} -> {y} {d:.1f} km')

    used = {sid for r in routes for sid in r[2]}
    lines = ['// ---- Dhaka-area local buses ----',
             '// GENERATED by tools/build-buses.py — edit that file, not this one.',
             '// Routes: github.com/imamhossain94/dhaka-city-local-bus-json-data (from busroutebd.com) plus a few hand-added buses.',
             '// Stop positions are approximate, entered by hand. Buses are treated as running both directions.',
             '', 'const STOPS = {', '  // id: [Bangla, English, lat, lon]']
    for sid, (bn, en, lat, lon) in stops.items():
        if sid in used:
            lines.append(f"  {sid}: ['{bn}', {json.dumps(en)}, {lat:.4f}, {lon:.4f}],")
    lines += ['};', 'for (const id in STOPS) {', '  const [bn, en, lat, lon] = STOPS[id];', '  STOPS[id] = { bn, en, lat, lon };', '}', '',
              'const LOCAL_ROUTES = [']
    for bn, en, ids in routes:
        lines.append(f"  [{json.dumps(bn, ensure_ascii=False)}, {json.dumps(en)}, '{' '.join(ids)}'],")
    lines += ["].map(([bn, en, stops]) => ({ bn, en, stops: stops.split(' ') }));", '']
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))

    out = sys.stdout
    out.reconfigure(encoding='utf-8')
    print(f'{len(routes)} routes, {len(used)} stops used')
    print('unknown stop names (dropped):', sorted(unknown))
    print('long hops (check positions):')
    for f in flagged:
        print('  ', f)


main()
