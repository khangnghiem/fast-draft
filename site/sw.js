// Service Worker for Fast Draft — caches WASM + vendor JS for instant loading.
// Strategy: stale-while-revalidate for WASM & vendor assets, network-first for everything else.

const CACHE_NAME = 'fd-v0.11.7';
const WASM_ASSETS = [
  '/wasm/fd_wasm.js',
  '/wasm/fd_wasm_bg.wasm',
];

// Vendor bundle (CodeMirror + lz-string) — served from same origin, no CDN
const VENDOR_ASSETS = [
  '/vendor/cm.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching WASM + vendor assets');
      return cache.addAll([
        ...WASM_ASSETS.map(u => u + '?v=0.11.295'),
        ...VENDOR_ASSETS,
      ]);
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

  // Cache WASM + vendor assets (stale-while-revalidate)
  const isWasmAsset = url.pathname.startsWith('/wasm/');
  const isVendorAsset = url.pathname.startsWith('/vendor/');

  if (!isWasmAsset && !isVendorAsset) return;

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
