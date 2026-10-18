// ---- Tourist Police: the zone or region office in a district, with its official number ----
// From the officer lists on touristpolice.gov.bd and its region sites (khureg, mymreg, coxsreg, rajreg, dhareg,
// rangpurreg, ctgreg, rangamatireg, kuareg .touristpolice.gov.bd), read with tools/tourist-police.mjs.
// Only official police numbers (the 01320 series, and office landlines) are kept — officers' personal mobiles,
// which change with every transfer, are left out. A district is listed only when an office is in it; for the rest
// the national 999 applies. Sylhet and Bandarban region sites publish no numbers.
const TOURIST_POLICE_CHECKED = { bn: '১৮ অক্টোবর ২০২৬', en: '18 October 2026' };
const TOURIST_POLICE = {
  dhaka: [['ট্যুরিস্ট পুলিশ, ঢাকা জোন', '01320-158050'], ['ট্যুরিস্ট পুলিশ, ঢাকা রিজিয়ন', '01320-158079']],
  coxsbazar: [['ট্যুরিস্ট পুলিশ, কক্সবাজার জোন', '01320-159044'], ['ট্যুরিস্ট পুলিশ, কক্সবাজার রিজিয়ন', '01320-159035']],
  chattogram: [['ট্যুরিস্ট পুলিশ, সীতাকুণ্ড জোন', '01320-158905'], ['ট্যুরিস্ট পুলিশ, চট্টগ্রাম রিজিয়ন', '01320-158750']],
  rangamati: [['ট্যুরিস্ট পুলিশ, রাঙ্গামাটি রিজিয়ন', '01320-159330']],
  patuakhali: [['ট্যুরিস্ট পুলিশ, কুয়াকাটা রিজিয়ন', '01320-160155']],
  khulna: [['ট্যুরিস্ট পুলিশ, খুলনা জোন', '01320-159857'], ['ট্যুরিস্ট পুলিশ, খুলনা রিজিয়ন', '01320-159850']],
  satkhira: [['ট্যুরিস্ট পুলিশ, সাতক্ষীরা জোন', '01320-159969']],
  bagerhat: [['ট্যুরিস্ট পুলিশ, সুন্দরবন জোন (মোংলা)', '01320-159899'], ['ট্যুরিস্ট পুলিশ, বাগেরহাট জোন', '02-479942058']],
  meherpur: [['ট্যুরিস্ট পুলিশ, মেহেরপুর জোন', '01320-160065']],
  kushtia: [['ট্যুরিস্ট পুলিশ, কুষ্টিয়া জোন', '01320-160110']],
  gopalganj: [['ট্যুরিস্ট পুলিশ, টুঙ্গিপাড়া জোন', '01320-160004']],
  mymensingh: [['ট্যুরিস্ট পুলিশ, ময়মনসিংহ রিজিয়ন', '01320-158520']],
  rajshahi: [['ট্যুরিস্ট পুলিশ, রাজশাহী রিজিয়ন', '01320-160602']],
  naogaon: [['ট্যুরিস্ট পুলিশ, নওগাঁ জোন', '01320-160710']],
  rangpur: [['ট্যুরিস্ট পুলিশ, রংপুর জোন', '01320-160430'], ['ট্যুরিস্ট পুলিশ, রংপুর রিজিয়ন', '01320-160362']]
};
