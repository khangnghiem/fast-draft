## 2026-03-10 - Cross-Site Scripting (XSS) in Renamify Panel
**Vulnerability:** Found an XSS vulnerability in `fd-vscode/src/webview-html.ts` where untrusted node IDs (`p.oldId` and `p.newId`) from the extension's `.fd` files were directly interpolated into `row.innerHTML` in the Renamify panel.
**Learning:** Even though the source is internal extension files, untrusted input rendered directly as `innerHTML` causes an XSS injection risk.
**Prevention:** Avoid `innerHTML` for dynamically generating DOM nodes. Always use safer DOM APIs like `document.createElement()` and `textContent` when rendering untrusted or user-controlled data.
## 2024-05-18 - Missing Sanitization in Inline HTML Rendering Leads to XSS
**Vulnerability:** Untrusted node IDs and file paths within the VS Code Webview HTML (`fd-vscode/src/webview-html.ts`) were concatenated into HTML strings directly without sanitization.
**Learning:** Even internal toolings or simple UI renders built around native data files can be susceptible to XSS if inputs can be controlled (e.g., untrusted files). `replace(/</g, '&lt;').replace(/>/g, '&gt;')` manually is error-prone, insufficient, and easy to overlook when expanding functionality.
**Prevention:** Apply a comprehensive `escapeHtml` function (handling `&`, `<`, `>`, `"`, `'`) consistently to all dynamic data interpolated into HTML templates and markdown conversions to prevent XSS. Avoid writing raw HTML concatenation when possible.
## 2026-03-10 - Overly Permissive CORS Configuration
**Vulnerability:** The Cloudflare Pages Function at `functions/api/ai.js` had an overly permissive CORS configuration (`Access-Control-Allow-Origin: *`), potentially allowing external sites to make cross-origin requests.
**Learning:** Hardcoded wildcard `*` CORS configurations expose APIs to misuse from unauthorized domains. Because the API needs to be accessible from both the web playground (`https://fast-draft.com`) and the VS Code extension webviews (`vscode-webview://`), a dynamic CORS handler is required.
**Prevention:** Avoid `*` in CORS origins. Implement dynamic CORS validation that checks the incoming `Origin` header against an explicitly defined whitelist (or prefix list, like `vscode-webview://`). Always include `Vary: Origin` in the response when returning dynamically set `Access-Control-Allow-Origin` headers.
## 2024-05-18 - XSS Fixes in `escapeHtml` implementations
**Vulnerability:** Weak `escapeHtml` functions failing to escape single quotes, alongside vulnerable DOM-based `div.innerHTML` approaches in the browser environment, allowing potential attribute-based Cross-Site Scripting (XSS).
**Learning:** `div.textContent` serialization is not inherently safe for contexts involving HTML attributes, as it fails to properly escape quotes in a unified manner across all browsers. Uncast text parameters can also trigger type exceptions if passed values like `null`.
**Prevention:** Unify all `escapeHtml` utilities to use an explicit `String(text)` cast and explicitly run `.replace` on `&`, `<`, `>`, `"`, and `'`.
