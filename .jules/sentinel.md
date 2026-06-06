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
## 2024-05-18 - Prevent XSS Attribute Breakout in escapeHtml
**Vulnerability:** Several `escapeHtml` implementations used DOM manipulation (`document.createElement('div').innerHTML`) or incomplete string replacement, failing to escape single and double quotes.
**Learning:** Incomplete escaping allows XSS payloads to break out of HTML attributes (e.g., `<input value="${escapeHtml(userInput)}">`).
**Prevention:** Always use `String(text)` cast combined with a comprehensive replace chain for `&`, `<`, `>`, `"`, and `'` (e.g., `&#039;`) in custom string escaping functions.
## 2026-03-10 - HTML Escaping with innerHTML and Structural Tags
**Vulnerability:** In `site/app.js`, `innerHTML` was used with a regex HTML escaping fallback for rendering untrusted markdown elements when `DOMPurify` wasn't loaded globally.
**Learning:** For rendering structural tags like `<div>` using `innerHTML`, an HTML escaping fallback breaks layout rendering by displaying raw HTML strings to the user, potentially causing cascading logical errors (like `querySelectorAll` failing to find target IDs).
**Prevention:** Avoid using HTML string replacements as a fallback for structural layouts assigned to `innerHTML`. Instead, gracefully default back to the unescaped state if sanitization dependencies are missing, or avoid assigning structural tags dynamically to `innerHTML` completely in favor of native DOM elements.
