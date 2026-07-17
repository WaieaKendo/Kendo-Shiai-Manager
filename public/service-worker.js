const CACHE_NAME = 'ksm-shell-v3.15.14';
const APP_SHELL = [
  '/', '/index.html', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png',
  '/assets/ksm-fuji-logo.svg', '/assets/ksm-fuji-logo-nav.svg',
  '/assets/KSM-Background-watermark.svg', '/assets/ksm-seigaiha-light.svg', '/assets/ksm-seigaiha-dark.svg',
  '/assets/nav-icons/setup.svg', '/assets/nav-icons/registration.svg', '/assets/nav-icons/courts.svg',
  '/assets/nav-icons/live-scores.svg', '/assets/nav-icons/search.svg', '/assets/nav-icons/results.svg',
  '/assets/nav-icons/export.svg', '/assets/nav-icons/save-load.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
      return response;
    }).catch(() => caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
    return response;
  })));
});
