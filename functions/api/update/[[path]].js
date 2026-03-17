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
export async function onRequest(context) {
  const GITHUB_LATEST =
    "https://github.com/khangnghiem/fast-draft/releases/latest/download/latest.json";

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
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    // Network error — return 204 (no update) so the app doesn't crash
    return new Response(null, { status: 204 });
  }
}
