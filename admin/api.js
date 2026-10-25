// Talking to /api/admin/v2. Every change carries the CSRF token;
// a locked panel shows the unlock screen; an action that needs a fresh code asks for it once and tries again.
export const session = { me: null, csrf: '' };
const listeners = { locked: [], stepup: [] };
export const on = (event, fn) => listeners[event].push(fn);

export const ERR = {
  forbidden: 'এই কাজের অনুমতি আপনার ভূমিকায় নেই।', locked: 'প্যানেল লক হয়ে গেছে — আবার কোড দিন।', csrf: 'নিরাপত্তা টোকেন মেলেনি — পাতাটি আবার খুলুন।',
  slow: 'খুব দ্রুত অনেক কাজ — এক মিনিট পরে চেষ্টা করুন।', reason: 'কারণ লিখতে হবে।', stepup: 'নতুন কোড দরকার।', code: 'কোডটি মেলেনি।',
  'needs-2fa': 'আপনার অ্যাকাউন্টে টু-স্টেপ ভেরিফিকেশন চালু করতে হবে।', owner: 'Owner-এর ভূমিকা প্যানেল থেকে বদলানো যায় না।', self: 'নিজের ভূমিকা নিজে বদলানো যায় না।',
  role: 'এই ভূমিকা নেই।', 'same-person': 'যিনি অনুমোদন দিয়েছেন বা সিদ্ধান্ত নিয়েছেন, তিনি নিজে পরের ধাপ করতে পারেন না — অন্য কেউ করবেন।',
  duplicate: 'এই TrxID আগে একটি পেআউটে দেওয়া হয়েছে — আবার দেওয়া যায় না।', ref: 'TrxID ঠিক নয় — ইংরেজি বড় হাতের অক্ষর আর সংখ্যা, ৮–২০টি।', state: 'অবস্থা বদলে গেছে — পাতাটি আবার দেখুন।',
  amount: 'টাকার পরিমাণ ঠিক নয়।', balance: 'ব্যালান্সের চেয়ে বেশি কাটা যায় না।', note: 'একটি নোট লিখতে হবে।', creator: 'তিনি এখন অনুমোদিত ক্রিয়েটর নন।',
  'ban-perm': 'পরের স্ট্রাইকে অ্যাকাউন্ট বন্ধ হবে — অ্যাকাউন্ট বন্ধের অনুমতি আপনার নেই।', team: 'টিমের সদস্যকে স্ট্রাইক দেওয়া যায় না।', short: 'আরেকটু লিখুন।', 'not found': 'খুঁজে পাওয়া যায়নি।', 'bad request': 'তথ্যটি ঠিক নয়।', mail: 'মেইল পাঠানো যায়নি।', network: 'ইন্টারনেট সংযোগ নেই।', server: 'সার্ভারে সমস্যা হয়েছে।'
};
export const errText = e => ERR[e && e.message] || ERR.server;

async function call(base, path, body, { retry = true } = {}) {
  let res;
  try {
    res = await fetch(base + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF': session.csrf }, body: JSON.stringify(body), credentials: 'same-origin' } : { credentials: 'same-origin' });
  } catch { throw Object.assign(new Error('network'), { status: 0 }); }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json().catch(() => ({})) : {};
  if (res.ok) return data;
  const err = Object.assign(new Error(data.error || 'server'), { status: res.status, data });
  if (err.message === 'locked') { for (const f of listeners.locked) f(); }
  // a high-risk step: ask for a fresh code, then do it again (once)
  if (err.message === 'stepup' && retry && listeners.stepup.length) {
    const ok = await listeners.stepup[0]();
    if (ok) return call(base, path, body, { retry: false });
  }
  throw err;
}
export const api = (path, body, opt) => call('api/admin/v2/', path, body, opt);
export const can = perm => !!(session.me && session.me.perms.includes(perm));
