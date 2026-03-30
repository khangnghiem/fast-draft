## 2026-03-10 - Cross-Site Scripting (XSS) in Renamify Panel
**Vulnerability:** Found an XSS vulnerability in `fd-vscode/src/webview-html.ts` where untrusted node IDs (`p.oldId` and `p.newId`) from the extension's `.fd` files were directly interpolated into `row.innerHTML` in the Renamify panel.
**Learning:** Even though the source is internal extension files, untrusted input rendered directly as `innerHTML` causes an XSS injection risk.
**Prevention:** Avoid `innerHTML` for dynamically generating DOM nodes. Always use safer DOM APIs like `document.createElement()` and `textContent` when rendering untrusted or user-controlled data.
## 2024-05-18 - Missing Sanitization in Inline HTML Rendering Leads to XSS
**Vulnerability:** Untrusted node IDs and file paths within the VS Code Webview HTML (`fd-vscode/src/webview-html.ts`) were concatenated into HTML strings directly without sanitization.
**Learning:** Even internal toolings or simple UI renders built around native data files can be susceptible to XSS if inputs can be controlled (e.g., untrusted files). `replace(/</g, '&lt;').replace(/>/g, '&gt;')` manually is error-prone, insufficient, and easy to overlook when expanding functionality.
**Prevention:** Apply a comprehensive `escapeHtml` function (handling `&`, `<`, `>`, `"`, `'`) consistently to all dynamic data interpolated into HTML templates and markdown conversions to prevent XSS. Avoid writing raw HTML concatenation when possible.
## 2024-05-18 - Overly Permissive CORS Configuration in Cloudflare Pages Function
**Vulnerability:** The `functions/api/ai.js` API endpoint was configured with an overly permissive CORS policy (`Access-Control-Allow-Origin: *`).
**Learning:** Hardcoded wildcard domains in the response headers of API handlers directly expose endpoints built in serverless environments to unauthorized cross-origin use, consuming API quotas and allowing potentially unintended functional access.
**Prevention:** Instead of using hardcoded wildcards, always dynamically inspect the incoming `request.headers.get('Origin')` against a predefined whitelist of exact domain matches or expected URL prefixes. Provide the exact origin back if validated and ensure the `Vary: Origin` header is set to avoid caching issues on intermediate proxy/CDN layers.
