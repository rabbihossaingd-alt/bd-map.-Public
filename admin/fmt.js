// Numbers, money and time the way the panel shows them: Bangla digits by default (English in the panel settings),
// taka as ৳১২,৩৪৫, times in Asia/Dhaka, "৫ মিনিট আগে" with the full date on hover.
const TZ = 'Asia/Dhaka';
const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
export const prefs = {
  get digits() { return read('mzadm.digits', 'bn'); },
  set digits(v) { try { localStorage.setItem('mzadm.digits', v); } catch { /* storage off */ } },
  get density() { return read('mzadm.density', 'comfy'); },
  set density(v) { try { localStorage.setItem('mzadm.density', v); } catch { /* storage off */ } }
};
const locale = () => prefs.digits === 'en' ? 'en-US' : 'bn-BD';
export const num = (n, digits = 0) => n == null || Number.isNaN(+n) ? '—' : Number(n).toLocaleString(locale(), { maximumFractionDigits: digits });
export const taka = n => '৳' + num(Math.round(+n || 0));
export const pct = n => (n > 0 ? '+' : '') + num(n) + '%';
export const digits = s => prefs.digits === 'en' ? String(s) : String(s).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);

export function full(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString(locale(), { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function day(ts) { return new Date(ts).toLocaleDateString(locale(), { timeZone: TZ, day: 'numeric', month: 'short' }); }
export function ago(ts) {
  if (!ts) return '—';
  const s = (Date.now() - ts) / 1000;
  if (s < 0) return 'এখন';
  if (s < 50) return 'এইমাত্র';
  if (s < 3600) return `${num(Math.round(s / 60))} মিনিট আগে`;
  if (s < 86400) return `${num(Math.floor(s / 3600))} ঘণ্টা আগে`;
  if (s < 172800) return 'গতকাল';
  if (s < 30 * 86400) return `${num(Math.floor(s / 86400))} দিন আগে`;
  return new Date(ts).toLocaleDateString(locale(), { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
}
// how long something has waited: "৩ ঘণ্টা", "২ দিন"
export function waited(ms) {
  const m = ms / 60000;
  if (m < 60) return `${num(Math.max(1, Math.round(m)))} মিনিট`;
  if (m < 1440) return `${num(Math.floor(m / 60))} ঘণ্টা`;
  return `${num(Math.floor(m / 1440))} দিন`;
}
// start of today in Dhaka, as a timestamp
export function dhakaDayStart(offsetDays = 0) {
  const d = new Date(Date.now() + 6 * 3600e3);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - 6 * 3600e3 - offsetDays * 864e5;
}
