// Network first, cache as offline fallback — the app shell and data files keep working without a connection.
// `no-cache` makes the browser revalidate each file, so an updated app shows up on a normal refresh.
// Only good answers are kept: an error page (a 503 while the server restarts) must never become the offline copy.
const CACHE = 'bdmap-v7';
// Photos from Wikimedia and the web fonts: they never change at the same address, so the copy on the device is used
// first and the network only once. Kept apart from the app's own files and trimmed to the newest 300.
const MEDIA = 'bdmap-media-v1';
// The map's own pieces: OpenFreeMap's street tiles (their addresses carry the map's build date, so a copy never
// goes stale), its letters and sprites, and the terrain tiles. Kept apart, the newest 2,500, so opening the
// map again draws it from the phone. Satellite photos are not kept (Esri's terms).
const MAPS = 'bdmap-maps-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== MEDIA && k !== MAPS).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  // the tile list (/planet) and the style name no date, so they always come fresh; tiles, letters and sprites do
  const ofm = url.hostname === 'tiles.openfreemap.org' && /^\/(planet\/\d|fonts\/|sprites\/)/.test(url.pathname);
  if (req.method === 'GET' && (ofm || (url.hostname === 's3.amazonaws.com' && url.pathname.startsWith('/elevation-tiles-prod/')))) {
    event.respondWith(caches.open(MAPS).then(c => c.match(req.url).then(hit => hit || fetch(req).then(res => {
      if (res.ok && (res.type === 'cors' || res.type === 'basic')) {
        res.clone().blob().then(body => c.put(req.url, new Response(body, { headers: { 'Content-Type': res.headers.get('Content-Type') || '', 'Access-Control-Allow-Origin': '*' } })))
          .then(() => Math.random() < 0.05 ? c.keys().then(k => Promise.all(k.slice(0, Math.max(0, k.length - 2500)).map(x => c.delete(x)))) : null).catch(() => {});
      }
      return res;
    }))));
    return;
  }
  if (req.method === 'GET' && /^(upload\.wikimedia\.org|thumb\.wikimedia\.org|fonts\.gstatic\.com|fonts\.googleapis\.com)$/.test(url.hostname)) {
    event.respondWith(caches.open(MEDIA).then(c => c.match(req.url).then(hit => hit || fetch(req).then(res => {
      // only answers the page may read (CORS); an opaque one would take far more room than it is worth
      if (res.ok && (res.type === 'cors' || res.type === 'basic')) {
        // a clean copy: Wikimedia's own headers (Vary) can stop the cache from keeping the answer as it came
        res.clone().blob().then(body => c.put(req.url, new Response(body, { headers: { 'Content-Type': res.headers.get('Content-Type') || '', 'Access-Control-Allow-Origin': '*' } })))
          .then(() => c.keys()).then(k => Promise.all(k.slice(0, Math.max(0, k.length - 300)).map(x => c.delete(x)))).catch(() => {});
      }
      return res;
    }))));
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Live data stays out of the cache: the message stream never ends, and private answers do not belong on disk.
  if (url.pathname.includes('/api/') || url.pathname.includes('/media/')) return;
  // A file named with its version (?v=… or vendor/) never changes: from the cache first, the network only once.
  if (url.searchParams.has('v') || url.pathname.startsWith('/vendor/')) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  event.respondWith(
    fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('/') : undefined)))
  );
});

// ---- Push notifications: a message, a missed call, a like, a comment or a new follower (server.js: pushTo) ----
self.addEventListener('push', event => {
  let n = {};
  try { n = event.data ? event.data.json() : {}; } catch { n = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(n.title || 'Manzeela', {
    body: n.body || '', tag: n.tag || undefined, renotify: !!n.tag, icon: '/img/icon-192.png', badge: '/img/badge-96.png',
    data: { url: n.url || '/' }, lang: n.lang === 'en' ? 'en' : 'bn', timestamp: Date.now(),
    // a call stays on screen until answered or dismissed, and buzzes like one
    requireInteraction: !!n.call, vibrate: n.call ? [600, 300, 600, 300, 600] : [150]
  }));
});
// A tap opens the app where the notification points: an open window is brought forward, else a new one.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => new URL(c.url).origin === self.location.origin);
    if (open) return open.focus().then(c => (c && 'navigate' in c ? c.navigate(url) : c));
    return clients.openWindow(url);
  }));
});
// The browser renewed its push address: tell the server the new one (the login cookie goes with it).
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const key = (await (await fetch('/api/push/key')).json()).key;
    const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
    await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });   // the server keeps the language this person used before
  })().catch(() => {}));
});
