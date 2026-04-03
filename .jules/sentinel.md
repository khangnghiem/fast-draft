## 2026-03-10 - Cross-Site Scripting (XSS) in Renamify Panel
**Vulnerability:** Found an XSS vulnerability in `fd-vscode/src/webview-html.ts` where untrusted node IDs (`p.oldId` and `p.newId`) from the extension's `.fd` files were directly interpolated into `row.innerHTML` in the Renamify panel.
**Learning:** Even though the source is internal extension files, untrusted input rendered directly as `innerHTML` causes an XSS injection risk.
**Prevention:** Avoid `innerHTML` for dynamically generating DOM nodes. Always use safer DOM APIs like `document.createElement()` and `textContent` when rendering untrusted or user-controlled data.
## 2024-05-18 - Missing Sanitization in Inline HTML Rendering Leads to XSS
**Vulnerability:** Untrusted node IDs and file paths within the VS Code Webview HTML (`fd-vscode/src/webview-html.ts`) were concatenated into HTML strings directly without sanitization.
**Learning:** Even internal toolings or simple UI renders built around native data files can be susceptible to XSS if inputs can be controlled (e.g., untrusted files). `replace(/</g, '&lt;').replace(/>/g, '&gt;')` manually is error-prone, insufficient, and easy to overlook when expanding functionality.
**Prevention:** Apply a comprehensive `escapeHtml` function (handling `&`, `<`, `>`, `"`, `'`) consistently to all dynamic data interpolated into HTML templates and markdown conversions to prevent XSS. Avoid writing raw HTML concatenation when possible.
## 2024-04-03 - Dynamic CORS Origin Whitelisting in Cloudflare Pages
**Vulnerability:** Overly permissive CORS wildcard (`*`) allowed any external site to send requests to the Fast Draft AI endpoints, leading to unauthorized usage, CSRF risks, and unmanaged rate limits.
**Learning:** Cloudflare Pages Functions request handlers export signatures can omit `context` (e.g., `export async function onRequestOptions()`). To access `context.request.headers` for dynamic CORS logic instead of static `CORS_HEADERS`, `context` must explicitly be added back into the signature.
**Prevention:** Avoid static global objects with wildcard origins (`'*'`) when setting `Access-Control-Allow-Origin`. Use a strict list and dynamically match incoming origin via `context.request.headers.get('Origin')`.
