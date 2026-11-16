/* Muft Tayyari service worker — offline-first.
   Precaches the app shell and the question bank on first visit. */
const CACHE = 'muft-tayyari-v1';
const ASSETS = [
  './', './index.html', './styles.css', './app.js',
  './data/questions.json', './manifest.webmanifest',
  './icon-192.svg', './icon-512.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.ok && event.request.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
