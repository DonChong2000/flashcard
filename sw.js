const VERSION = 'v1';
const CACHE_SHELL  = `flashcard-shell-${VERSION}`;
const CACHE_STATIC = `flashcard-static-${VERSION}`;
const CACHE_DATA   = `flashcard-data-${VERSION}`;
const ALL_CACHES   = [CACHE_SHELL, CACHE_STATIC, CACHE_DATA];

const SHELL_URLS = [
  '/flashcard/',
  '/flashcard/quiz',
  '/flashcard/manifest.webmanifest',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !ALL_CACHES.includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // _next/static/** → cache-first (content-hashed, immutable)
  if (path.includes('/_next/static/')) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // /flashcard/data/** → network-first, cache on success, fallback to cache
  if (path.startsWith('/flashcard/data/')) {
    event.respondWith(networkFirstData(request));
    return;
  }

  // Navigation requests → network-first, shell fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigate(request));
    return;
  }

  // Everything else (cross-origin, other assets): pass through
});

// ── Strategy implementations ──────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstData(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_DATA);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function networkFirstNavigate(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_SHELL);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached =
      (await caches.match(request)) ||
      (await caches.match('/flashcard/'));
    if (cached) return cached;
    return new Response('Offline \u2013 open the app while connected first.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
