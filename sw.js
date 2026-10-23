/* SIGEP PWA Service Worker */
const CACHE_NAME = 'sigep-pwa-v1';
const PRECACHE = [
  './',
  './index.html',
  './login.html',
  './menu.html',
  './painel.html',
  './style.css',
  './app.js',
  './diario.js',
  './sec-common.js',
  './manifest.json',
  './icone-192.png',
  './icone-512.png',
  './icone-menu.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Network-first for Firebase / API
  if (req.url.includes('firebaseio.com') || req.url.includes('googleapis.com')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      }).catch(() => {
        // offline fallback for navigation
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 408 });
      });
    })
  );
});
