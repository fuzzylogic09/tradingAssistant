// sw.js — Service Worker PWA
const CACHE_NAME = 'etf-advisor-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/main.css',
  '/js/config.js',
  '/js/dataFetcher.js',
  '/js/rules.js',
  '/js/llmInterface.js',
  '/js/watchlist.js',
  '/js/ui.js',
  '/js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Toujours réseau pour les APIs (finance, LLM)
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('yahoo.com') ||
    url.hostname.includes('finance.yahoo') ||
    url.hostname.includes('allorigins.win') ||
    url.hostname.includes('corsproxy.io') ||
    url.hostname.includes('finviz.com') ||
    url.hostname.includes('cnn.io')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache first pour les assets statiques
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
