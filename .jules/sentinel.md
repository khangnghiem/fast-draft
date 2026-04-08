## 2026-03-10 - Cross-Site Scripting (XSS) in Renamify Panel
**Vulnerability:** Found an XSS vulnerability in `fd-vscode/src/webview-html.ts` where untrusted node IDs (`p.oldId` and `p.newId`) from the extension's `.fd` files were directly interpolated into `row.innerHTML` in the Renamify panel.
**Learning:** Even though the source is internal extension files, untrusted input rendered directly as `innerHTML` causes an XSS injection risk.
**Prevention:** Avoid `innerHTML` for dynamically generating DOM nodes. Always use safer DOM APIs like `document.createElement()` and `textContent` when rendering untrusted or user-controlled data.
## 2024-05-18 - Missing Sanitization in Inline HTML Rendering Leads to XSS
**Vulnerability:** Untrusted node IDs and file paths within the VS Code Webview HTML (`fd-vscode/src/webview-html.ts`) were concatenated into HTML strings directly without sanitization.
**Learning:** Even internal toolings or simple UI renders built around native data files can be susceptible to XSS if inputs can be controlled (e.g., untrusted files). `replace(/</g, '&lt;').replace(/>/g, '&gt;')` manually is error-prone, insufficient, and easy to overlook when expanding functionality.
**Prevention:** Apply a comprehensive `escapeHtml` function (handling `&`, `<`, `>`, `"`, `'`) consistently to all dynamic data interpolated into HTML templates and markdown conversions to prevent XSS. Avoid writing raw HTML concatenation when possible.
## 2026-04-08 - Comprehensive XSS Prevention in escapeHtml
**Vulnerability:** Multiple implementations of `escapeHtml` across the codebase (e.g., in `site/app.js`, `fd-vscode/webview/main.js`) failed to escape single quotes (`'`), and one DOM-based implementation failed to escape both single and double quotes, creating potential XSS vectors when injecting data into HTML attributes.
**Learning:** Consistently escaping ALL HTML context characters (`&`, `<`, `>`, `"`, `'`) is critical, as data is often reused in various DOM contexts (like inside attributes). Relying on `div.innerHTML` for escaping is insufficient for attribute-level XSS protection.
**Prevention:** Standardize a robust regex-based string replacement approach for `escapeHtml` that handles all five characters, and always cast the input to `String()` first to handle unexpected types gracefully.
