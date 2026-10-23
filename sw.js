// Network first, cache as offline fallback — the app shell and data files keep working without a connection.
// `no-cache` makes the browser revalidate each file, so an updated app shows up on a normal refresh.
// Only good answers are kept: an error page (a 503 while the server restarts) must never become the offline copy.
const CACHE = 'bdmap-v6';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
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
    data: { url: n.url || '/' }, lang: 'bn', timestamp: Date.now()
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
    await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
  })().catch(() => {}));
});
