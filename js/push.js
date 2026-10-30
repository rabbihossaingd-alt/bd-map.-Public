// ---- Push notifications on this phone or computer ----
// Turned on from Settings or the card above the chat list. The server sends them only while no open Manzeela page is
// in view (this page tells it, below), so nothing pings while you are already looking. iPhone: only once Manzeela is
// added to the Home Screen (Safari 16.4+), so there the card says how.
const PUSH_TAB = Math.random().toString(36).slice(2, 12);
const pushCan = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const pushIosBrowser = () => /iP(hone|ad|od)/.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;

function pushKeyBytes(key) {
  const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function pushSub() {
  if (!pushCan()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
// 'on' | 'off' | 'denied' | 'install' (iPhone in Safari) | 'none' (this browser cannot)
async function pushStatus() {
  if (pushIosBrowser()) return 'install';
  if (!pushCan()) return 'none';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && await pushSub() ? 'on' : 'off';
}
// one at a time: the switch and the sync after login can ask together, and two subscribe calls can make two addresses
let pushBusy = null;
function pushOn() { return pushBusy || (pushBusy = pushOnNow().finally(() => { pushBusy = null; })); }
async function pushOnNow() {
  if (!pushCan() || !ME) return false;
  if (await Notification.requestPermission() !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const key = (await (await fetch('api/push/key')).json()).key;
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKeyBytes(key) });
  const r = await fetch('api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sub.toJSON(), lang: LANG }) });   // notifications come in the language the app is in
  return r.ok;
}
async function pushOff() {
  const sub = await pushSub().catch(() => null);
  if (!sub) return;
  await fetch('api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// In view or not, told to the server on every change and once a minute while in view.
function pushSeen() {
  if (!ME) return;
  const visible = document.visibilityState === 'visible';
  fetch('api/push/seen', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab: PUSH_TAB, visible }) }).catch(() => {});
}
document.addEventListener('visibilitychange', pushSeen);
addEventListener('pagehide', () => { if (ME) navigator.sendBeacon && navigator.sendBeacon('api/push/seen', new Blob([JSON.stringify({ tab: PUSH_TAB, visible: false })], { type: 'application/json' })); });
setInterval(() => { if (document.visibilityState === 'visible') pushSeen(); }, 60_000);

// The switch in Settings and the card above the chat list.
async function paintPush() {
  const st = await pushStatus().catch(() => 'none');
  const sw = $('set-push'), sub = $('set-push-sub');
  if (sw) {
    sw.setAttribute('aria-checked', String(st === 'on')); sw.classList.toggle('on', st === 'on'); sw.disabled = st === 'none' || st === 'install';
    sub.hidden = st === 'on' || st === 'off';
    sub.textContent = {
      on: 'চালু — নতুন মেসেজ, মিসড কল, লাইক, মন্তব্য ও ফলো এলে জানাবে',
      off: 'বন্ধ — চালু করলে অ্যাপ বন্ধ থাকলেও নতুন মেসেজ এলে জানাবে',
      denied: 'ব্রাউজারে এই সাইটের নোটিফিকেশন বন্ধ করা আছে — ব্রাউজারের সাইট সেটিংস থেকে চালু করুন',
      install: 'আইফোনে: Safari-তে শেয়ার বাটন → "Add to Home Screen", তারপর সেখান থেকে খুলে চালু করুন',
      none: 'এই ব্রাউজারে নোটিফিকেশন চলে না'
    }[st];
  }
  const ask = $('push-ask');
  if (ask) {
    let later = false;
    try { later = Date.now() - Number(localStorage.getItem('bdmap.pushask') || 0) < 14 * 864e5; } catch { /* storage off */ }
    ask.hidden = !ME || later || !(st === 'off' || st === 'install');
    ask.querySelector('.pa-go').hidden = st === 'install';
    ask.querySelector('em').textContent = st === 'install' ? 'আইফোনে: শেয়ার বাটন → "Add to Home Screen", তারপর সেখান থেকে খুলুন' : 'অ্যাপ বন্ধ থাকলেও নতুন মেসেজ ও মিসড কল জানতে পারবেন';
  }
}
async function pushToggle(want) {
  const sw = $('set-push');
  if (sw) sw.disabled = true;
  try {
    if (want) { if (!(await pushOn()) && typeof setStatus === 'function') setStatus(Notification.permission === 'denied' ? 'ব্রাউজারে নোটিফিকেশন বন্ধ করা আছে' : 'নোটিফিকেশন চালু করা গেল না'); }
    else await pushOff();
  } catch { /* shown by the switch staying as it was */ }
  await paintPush();
}
$('set-push').addEventListener('click', async () => pushToggle(!(await pushStatus().catch(() => 'none') === 'on')));
$('push-ask').querySelector('.pa-go').addEventListener('click', () => pushToggle(true));
$('push-ask').querySelector('.pa-x').addEventListener('click', () => { try { localStorage.setItem('bdmap.pushask', String(Date.now())); } catch { /* storage off */ } $('push-ask').hidden = true; });

// A new login: the browser's existing permission is tied to this login on the server too.
document.addEventListener('bdmap:auth', async () => {
  pushSeen();
  if (ME && pushCan() && Notification.permission === 'granted') pushOn().catch(() => {});
  paintPush();
});
if (ME) pushSeen();
paintPush();
