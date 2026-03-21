// Service Worker for Fast Draft — caches WASM + JS + CDN deps for instant loading.
// Strategy: stale-while-revalidate for WASM & CDN, network-first for everything else.

const CACHE_NAME = 'fd-v0.11.5';
const WASM_ASSETS = [
  '/wasm/fd_wasm.js',
  '/wasm/fd_wasm_bg.wasm',
];

// CDN dependencies to pre-cache (#4 — eliminates cold-load CDN waterfall)
const CDN_MODULES = [
  'https://esm.sh/@codemirror/state@6',
  'https://esm.sh/@codemirror/view@6',
  'https://esm.sh/@codemirror/language@6',
  'https://esm.sh/@lezer/highlight@1',
  'https://esm.sh/@codemirror/autocomplete@6',
  'https://esm.sh/@codemirror/lint@6',
  'https://esm.sh/@codemirror/commands@6',
  'https://esm.sh/@codemirror/search@6',
  'https://esm.sh/lz-string@1.5.0',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching WASM + CDN assets');
      // Pre-cache WASM assets (critical path)
      const wasmPromises = cache.addAll(WASM_ASSETS.map(u => u + '?v=0.11.5'));
      // Pre-cache CDN modules (best-effort — don't block install if CDN is slow)
      const cdnPromises = Promise.allSettled(
        CDN_MODULES.map(url => fetch(url, { mode: 'cors' }).then(r => {
          if (r.ok) return cache.put(url, r);
        }).catch(() => {}))
      );
      return Promise.all([wasmPromises, cdnPromises]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache WASM assets (stale-while-revalidate)
  const isWasmAsset = url.pathname.startsWith('/wasm/');
  // Cache CDN modules from esm.sh (stale-while-revalidate)
  const isCdnModule = url.hostname === 'esm.sh';

  if (!isWasmAsset && !isCdnModule) return;

  // Stale-while-revalidate: serve from cache immediately, update in background
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => cached); // Network fail → use cached

        return cached || fetchPromise;
      });
    })
  );
});
