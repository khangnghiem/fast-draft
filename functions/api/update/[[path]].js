/**
 * Cloudflare Pages Function — proxy for Tauri auto-updater.
 *
 * Serves the latest.json from the most recent GitHub Release,
 * acting as a CDN-cached, fast endpoint for the desktop app updater.
 *
 * Route: /api/update/:target/:arch/:current_version
 * The Tauri updater sends target (e.g. "darwin-aarch64"), arch, and version.
 * We ignore those params and always return the latest release info —
 * the updater compares versions client-side.
 */
const ALLOWED_ORIGINS = [
  'https://fast-draft.com',
  'https://www.fast-draft.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';

  let allowedOrigin = null;
  if (ALLOWED_ORIGINS.includes(origin) || origin.startsWith('vscode-webview://') || origin.startsWith('tauri://') || origin.startsWith('https://tauri.localhost')) {
    allowedOrigin = origin;
  }

  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }

  return headers;
}

export async function onRequest(context) {
  const GITHUB_LATEST =
    "https://github.com/khangnghiem/fast-draft/releases/latest/download/latest.json";

  // Handle CORS preflight options request
  if (context.request.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(context.request) });
  }

  try {
    const res = await fetch(GITHUB_LATEST, {
      headers: { "User-Agent": "Fast-Draft-Updater/1.0" },
      cf: { cacheTtl: 300, cacheEverything: true }, // 5 min edge cache
    });

    if (!res.ok) {
      // No update available (e.g. latest.json not yet uploaded)
      return new Response(null, { status: 204 });
    }

    const json = await res.text();
    return new Response(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // 5 min browser cache
        ...getCorsHeaders(context.request),
      },
    });
  } catch {
    // Network error — return 204 (no update) so the app doesn't crash
    return new Response(null, { status: 204 });
  }
}
