const VERSION = 'v8';
// Cache Storage is per origin, and the separate /flashcard/ app shares this
// origin (donchong2000.github.io). Every cache name carries this app's prefix,
// and activate only ever deletes caches with that prefix.
const CACHE_PREFIX = 'jpflashcard-';
const CACHE_SHELL  = `${CACHE_PREFIX}shell-${VERSION}`;
const CACHE_STATIC = `${CACHE_PREFIX}static-${VERSION}`;
const CACHE_DATA   = `${CACHE_PREFIX}data-${VERSION}`;
const ALL_CACHES   = [CACHE_SHELL, CACHE_STATIC, CACHE_DATA];

const SHELL_URLS = [
  '/japanese-flashcard/',
  '/japanese-flashcard/quiz',
  '/japanese-flashcard/manifest.webmanifest',
  '/japanese-flashcard/data/manifest.json',
];

// HTML pages whose linked _next/static/ assets will be pre-cached at install
const HTML_SHELL_URLS = ['/japanese-flashcard/', '/japanese-flashcard/quiz'];

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
        const staticUrls = [...new Set([
          ...[...html.matchAll(/"([^"]*\/_next\/static\/[^"]+)"/g)].map(m => m[1]),
          ...[...html.matchAll(/'([^']*\/_next\/static\/[^']+)'/g)].map(m => m[1]),
        ])];
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
            .filter((k) => k.startsWith(CACHE_PREFIX) && !ALL_CACHES.includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
      .then(() => precacheDecks())
  );
});

// Download every deck's JSON once the worker takes over, so all decks work
// offline without being opened first. Listening audio is not included.
async function precacheDecks() {
  try {
    const base = '/japanese-flashcard/data/';
    const resp = await fetch(base + 'manifest.json', { cache: 'no-cache' });
    if (!resp.ok) return;
    const cache = await caches.open(CACHE_DATA);
    await cache.put(base + 'manifest.json', resp.clone());
    const manifest = await resp.json();
    const urls = [];
    for (const d of manifest.datasets || []) {
      urls.push(`${base}${d.slug}/all.json`);
      for (const t of d.topics || []) urls.push(`${base}${d.slug}/topic-${t}.json`);
    }
    for (let i = 0; i < urls.length; i += 8) {
      await Promise.all(urls.slice(i, i + 8).map(async (u) => {
        try {
          const r = await fetch(u);
          if (r.ok) await cache.put(u, r);
        } catch {}
      }));
    }
  } catch {}
}

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

  // /japanese-flashcard/data/** → network-first, cache on success, fallback to cache
  if (path.startsWith('/japanese-flashcard/data/')) {
    event.respondWith(networkFirstData(request));
    return;
  }

  // RSC navigation prefetch (Next.js App Router) — return 503 offline
  // so Next.js falls back to client rendering (same behaviour as a server 404)
  if (url.searchParams.has('_rsc')) {
    event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Navigation requests → network-first, shell fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigate(request));
    return;
  }

  // Everything else: pass through to network
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
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match(new URL(request.url).pathname.replace(/\/$/, '').replace(/\.html$/, ''))) ||
      (await caches.match('/japanese-flashcard/'));
    if (cached) return cached;
    return new Response('Offline \u2013 open the app while connected first.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
