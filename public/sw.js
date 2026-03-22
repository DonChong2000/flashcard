const VERSION = 'v3';
const CACHE_SHELL  = `flashcard-shell-${VERSION}`;
const CACHE_STATIC = `flashcard-static-${VERSION}`;
const CACHE_DATA   = `flashcard-data-${VERSION}`;
const ALL_CACHES   = [CACHE_SHELL, CACHE_STATIC, CACHE_DATA];

const SHELL_URLS = [
  '/flashcard/',
  '/flashcard/quiz',
  '/flashcard/manifest.webmanifest',
  '/flashcard/data/manifest.json',
];

// HTML pages whose linked _next/static/ assets will be pre-cached at install
const HTML_SHELL_URLS = ['/flashcard/', '/flashcard/quiz'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(CACHE_SHELL);
      await shellCache.addAll(SHELL_URLS);

      // Pre-cache _next/static/ assets linked from each HTML shell page.
      // These are fetched before the SW activates on first visit, so they
      // would never enter CACHE_STATIC via the normal fetch handler.
      const staticCache = await caches.open(CACHE_STATIC);
      await Promise.all(HTML_SHELL_URLS.map(async (url) => {
        const resp = await shellCache.match(url);
        if (!resp) return;
        const html = await resp.text();
        const staticUrls = [...new Set(
          [...html.matchAll(/"([^"]*\/_next\/static\/[^"]+)"/g)].map(m => m[1])
        )];
        await Promise.all(staticUrls.map((staticUrl) =>
          fetch(staticUrl)
            .then((r) => { if (r.ok) staticCache.put(staticUrl, r); })
            .catch(() => {})
        ));
      }));

      self.skipWaiting();
    })()
  );
});

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

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
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
