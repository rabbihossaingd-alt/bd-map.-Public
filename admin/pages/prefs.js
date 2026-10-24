// প্যানেল সেটিংস (this device): digits, density, theme. The team-wide settings (SLA, reason codes, strike rules,
// word lists, payout limits) come with the pages that use them.
import { h, select, field, toast } from '../ui.js';
import { prefs } from '../fmt.js';

export async function render(box) {
  const digits = select([['bn', 'বাংলা অঙ্ক (১২৩)'], ['en', 'ইংরেজি অঙ্ক (123)']], prefs.digits);
  const density = select([['comfy', 'আরামদায়ক'], ['dense', 'ঘন']], prefs.density);
  const theme = select([['dark', 'ডার্ক'], ['light', 'লাইট']], document.documentElement.dataset.theme || 'dark');
  digits.addEventListener('change', () => { prefs.digits = digits.value; toast('বদলানো হলো — পাতা আবার খুলছে।'); setTimeout(() => location.reload(), 600); });
  density.addEventListener('change', () => { prefs.density = density.value; toast('তালিকার ঘনত্ব বদলানো হলো।'); });
  theme.addEventListener('change', () => { document.documentElement.dataset.theme = theme.value; try { localStorage.setItem('mzadm.theme', theme.value); } catch { /* storage off */ } });
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'প্যানেল সেটিংস'), h('p', 'muted', 'এই ডিভাইসে প্যানেল কেমন দেখাবে।'))),
    h('div', 'card form', field('অঙ্ক', digits), field('তালিকার ঘনত্ব', density), field('থিম', theme)),
    h('p', 'hint', 'টিমের সবার জন্য সেটিংস — SLA সময়, কারণ-কোড, স্ট্রাইক নীতি, শব্দ-তালিকা, পেআউট সীমা — যে পাতাগুলো এগুলো ব্যবহার করে সেগুলোর সাথে আসবে (ফেজ ২–৪)।'));
  return {};
}
