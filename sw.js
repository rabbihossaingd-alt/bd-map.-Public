// Network first, cache as offline fallback — the app shell and data files keep working without a connection.
// `no-cache` makes the browser revalidate each file, so an updated app shows up on a normal refresh.
const CACHE = 'bdmap-v3';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Live data stays out of the cache: the message stream never ends, and private answers do not belong on disk.
  if (url.pathname.includes('/api/') || url.pathname.includes('/media/')) return;
  event.respondWith(
    fetch(req, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});
