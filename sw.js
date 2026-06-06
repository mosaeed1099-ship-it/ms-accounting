// MS Accounting — Service Worker
// Caches the app shell so the site loads even during backend restarts.

const CACHE_NAME = 'ms-accounting-v1';
const APP_SHELL = [
  '/ms-accounting/',
  '/ms-accounting/index.html',
];

// On install: cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// On activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// On fetch:
// - Navigation requests (HTML) → network first, fall back to cached index.html
// - API requests → network only (never cache, never serve stale API)
// - Static assets (JS/CSS/fonts) → cache first
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept API calls — let them fail naturally so the app can handle it
  if (url.pathname.startsWith('/api/') || url.hostname !== self.location.hostname) {
    return;
  }

  // Navigation → serve cached shell if network fails
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Update cache with fresh response
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('/ms-accounting/index.html'))
    );
    return;
  }

  // Static assets → cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
