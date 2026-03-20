## 2026-03-10 - Cross-Site Scripting (XSS) in Renamify Panel
**Vulnerability:** Found an XSS vulnerability in `fd-vscode/src/webview-html.ts` where untrusted node IDs (`p.oldId` and `p.newId`) from the extension's `.fd` files were directly interpolated into `row.innerHTML` in the Renamify panel.
**Learning:** Even though the source is internal extension files, untrusted input rendered directly as `innerHTML` causes an XSS injection risk.
**Prevention:** Avoid `innerHTML` for dynamically generating DOM nodes. Always use safer DOM APIs like `document.createElement()` and `textContent` when rendering untrusted or user-controlled data.
## 2024-05-18 - Missing Sanitization in Inline HTML Rendering Leads to XSS
**Vulnerability:** Untrusted node IDs and file paths within the VS Code Webview HTML (`fd-vscode/src/webview-html.ts`) were concatenated into HTML strings directly without sanitization.
**Learning:** Even internal toolings or simple UI renders built around native data files can be susceptible to XSS if inputs can be controlled (e.g., untrusted files). `replace(/</g, '&lt;').replace(/>/g, '&gt;')` manually is error-prone, insufficient, and easy to overlook when expanding functionality.
**Prevention:** Apply a comprehensive `escapeHtml` function (handling `&`, `<`, `>`, `"`, `'`) consistently to all dynamic data interpolated into HTML templates and markdown conversions to prevent XSS. Avoid writing raw HTML concatenation when possible.
## 2026-03-10 - Overly Permissive CORS Configuration for Cloudflare Workers AI Endpoint
**Vulnerability:** The AI endpoint (`functions/api/ai.js`) was configured with `Access-Control-Allow-Origin: '*'`, which allows any website on the internet to call the endpoint directly, bypassing potential intended origin restrictions and contributing to potential resource abuse or Cross-Site Request Forgery (CSRF).
**Learning:** Hardcoding a wildcard origin `*` for Cloudflare Workers functions exposes the API and rate limit controls to unintended usage and malicious origins.
**Prevention:** Always implement dynamic CORS by checking the `Origin` header of the incoming request against a strict whitelist of exact domain matches (like `https://fast-draft.com`) and specific required prefixes (like `vscode-webview://`), while including the `Vary: Origin` header in the response.
