const CACHE_NAME = 'wellnessquest-v8';
const CORE_ASSETS = [
  './',
  './index.html',
  './app.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './data/playerStats.json',
  './data/foods.json',
  './data/fitnessActions.json',
  './data/diseases.json',
  './data/economy.json',
  './data/gameRules.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.url.endsWith('.json')) {
    event.respondWith(
      fetch(req).then(res => { const clone = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, clone)); return res; })
        .catch(() => caches.match(req))
    );
  } else {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => { const clone = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, clone)); return res; }))
    );
  }
});
