// A page not rebuilt yet: either it lives in the older panel for now (one tap opens it there), or it is new and comes
// in a later phase. Nothing from the older panel is gone.
import { attrs, h, icon } from '../ui.js';
import { num } from '../fmt.js';

const COMING = {
  inbox: 'সব বাকি কাজ এক তালিকায় — প্রায়োরিটি, SLA কাউন্টডাউন, অ্যাসাইন আর "পরেরটা নাও"।',
  macros: 'বারবার দেওয়া উত্তরগুলো টেমপ্লেট হিসেবে, {নাম}-এর মতো ভেরিয়েবলসহ।',
  modqueue: 'গালির শব্দ, লিংক-স্প্যাম আর নতুন অ্যাকাউন্টের অতিরিক্ত পোস্ট নিজে থেকে ধরা পড়ে এখানে আসবে।',
  strikes: 'স্ট্রাইক (সতর্কবার্তা → ৭ দিন সীমিত → বন্ধ, ৯০ দিনে মেয়াদ শেষ) আর ব্যবহারকারীর আপিল।',
  risk: 'একই ডিভাইসে অনেক অ্যাকাউন্ট, অস্বাভাবিক দ্রুত ফলো/মেসেজ, একই ওয়ালেট — প্রতিটায় স্কোর ও "কেন"।',
  media: 'আপলোডের আকার ও রেজোলিউশন, R2-তে কপি হয়েছে কিনা, মোট স্টোরেজ ও আনুমানিক খরচ। (ভিডিও ফোনেই ছোট হয়, তাই সার্ভারে ট্রান্সকোড-কিউ নেই।)',
  routes: 'ঢাকার বাস রুট ও স্টপ এডিট — ক্রম বদল, ম্যাপে দেখা, ভার্সন ইতিহাস।', intercity: 'কোম্পানি, রুট, ভাড়ার রেঞ্জ, সময়, রেটিং।',
  quality: 'প্রায়-একই নামের বাস, দুই দিকের আলাদা এন্ট্রি, বাংলা নাম নেই, অবাস্তব সময় — নিজে থেকে খুঁজে বের করা।',
  ledger: 'প্রতিটি আয়, সমন্বয়, পেআউট আর ফেরত — অপরিবর্তনীয় হিসাব, মাসিক সারসংক্ষেপ ও CSV।',
  growth: 'DAU/WAU/MAU, D1/D7/D30 রিটেনশন কোহর্ট, অ্যাক্টিভেশন ফানেল।', features: 'কোন ফিচার কতজন ব্যবহার করছেন।', searches: 'সবচেয়ে বেশি সার্চ, আর যেসব সার্চে কিছু পাওয়া যায়নি (ডেটার ফাঁক)।'
};

export function render(box, { page }) {
  if (page.status === 'legacy') {
    box.append(h('div', 'later', icon(page.ic, 'lg'), h('h1', null, page.title), h('p', null, 'এই পাতা এখনো পুরনো প্যানেলে আছে — সব কাজ সেখানে আগের মতোই করা যায়। নতুন রূপে আসছে সামনের ফেজে।'),
      attrs(h('a', 'btn primary', icon('ext'), h('span', null, 'পুরনো প্যানেলে খুলুন')), { href: 'admin-old.html#' + page.legacy })));
  } else {
    box.append(h('div', 'later', icon(page.ic, 'lg'), h('h1', null, page.title), h('span', 'badge info', `ফেজ ${num(page.status)}-এ আসছে`), h('p', null, COMING[page.key] || '')));
  }
  return {};
}
