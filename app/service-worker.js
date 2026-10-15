const CACHE_NAME = 'ksm-shell-v__KSM_VERSION__';
const APP_SHELL = [
  '/', '/index.html', '/app.css', '/app.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png',
  '/assets/ksm-fuji-logo.svg', '/assets/ksm-fuji-logo-nav.svg',
  '/assets/KSM-Background-watermark.svg', '/assets/ksm-seigaiha-light.svg', '/assets/ksm-seigaiha-dark.svg',
  '/assets/nav-icons/setup.svg', '/assets/nav-icons/registration.svg', '/assets/nav-icons/courts.svg',
  '/assets/nav-icons/live-scores.svg', '/assets/nav-icons/search.svg', '/assets/nav-icons/results.svg',
  '/assets/sounds/whistle01.mp3', '/assets/sounds/whistle02.mp3',
  '/assets/nav-icons/export.svg', '/assets/nav-icons/save-load.svg'
];
// Path URLs (M.9, the scheme in app/engine/routes.ts): the app answers /, /index.html and every
// /t/... path (/t/<id>, /t/<id>/court/a, /t/<id>/tv/b, ...) except the stream overlay's
// /t/<id>/overlay[/a|b]. tests/engine/routes.test.mjs checks this rule against servesAppShell().
const OVERLAY_PATH = /^\/t\/([^/]+)\/overlay(?:\/[ab])?\/?$/i;
function isOverlayPath(pathname) {
  const match = OVERLAY_PATH.exec(pathname);
  if (!match) return false;
  try { return Boolean(decodeURIComponent(match[1])); } catch (_) { return false; }
}
function servesAppShell(pathname) {
  if (pathname === '/' || pathname === '/index.html') return true;
  if (pathname !== '/t' && !pathname.startsWith('/t/')) return false;
  return !isOverlayPath(pathname);
}
// F22: install caches /index.html through the host's redirect to / (Cloudflare's asset server), so
// that copy is a redirected response, which a browser refuses for a navigation (net::ERR_FAILED):
// an offline device got no app until an online navigation had replaced the copy. Serve its body.
function offlineCopy(cached) {
  if (!cached || !cached.redirected) return cached;
  return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers: cached.headers });
}
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
  // Only the app itself is the offline shell (servesAppShell(): /, /index.html, /t/...). Other
  // pages (the overlay: /overlay, /t/<id>/overlay/a) are live-only: the network answers them, so
  // they are never cached as /index.html.
  if (event.request.mode === 'navigate' && !servesAppShell(url.pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (!response.ok) return response;
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy)));
      return response;
    }).catch(() => caches.match('/index.html').then(offlineCopy)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => {
    if (cached) return cached;
    return fetch(event.request).then(response => {
      if (!response.ok) return response;
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
      return response;
    });
  }));
});
