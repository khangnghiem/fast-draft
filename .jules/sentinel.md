## 2026-03-10 - Cross-Site Scripting (XSS) in Renamify Panel
**Vulnerability:** Found an XSS vulnerability in `fd-vscode/src/webview-html.ts` where untrusted node IDs (`p.oldId` and `p.newId`) from the extension's `.fd` files were directly interpolated into `row.innerHTML` in the Renamify panel.
**Learning:** Even though the source is internal extension files, untrusted input rendered directly as `innerHTML` causes an XSS injection risk.
**Prevention:** Avoid `innerHTML` for dynamically generating DOM nodes. Always use safer DOM APIs like `document.createElement()` and `textContent` when rendering untrusted or user-controlled data.
## 2024-05-18 - Missing Sanitization in Inline HTML Rendering Leads to XSS
**Vulnerability:** Untrusted node IDs and file paths within the VS Code Webview HTML (`fd-vscode/src/webview-html.ts`) were concatenated into HTML strings directly without sanitization.
**Learning:** Even internal toolings or simple UI renders built around native data files can be susceptible to XSS if inputs can be controlled (e.g., untrusted files). `replace(/</g, '&lt;').replace(/>/g, '&gt;')` manually is error-prone, insufficient, and easy to overlook when expanding functionality.
**Prevention:** Apply a comprehensive `escapeHtml` function (handling `&`, `<`, `>`, `"`, `'`) consistently to all dynamic data interpolated into HTML templates and markdown conversions to prevent XSS. Avoid writing raw HTML concatenation when possible.

## 2024-05-24 - Unescaped Single Quotes in HTML Escaping Functions
**Vulnerability:** Multiple custom `escapeHtml` functions across the frontend (`site/`) and VS Code extension webviews failed to escape single quotes (`'`) and did not explicitly cast input to a string.
**Learning:** Incomplete HTML escaping can lead to XSS vulnerabilities, especially when user input is injected into HTML attributes where single quotes could be used as delimiters. Furthermore, failing to cast the input to a string (`String(text)`) before escaping can lead to exceptions or bypasses if non-string objects are passed to the function.
**Prevention:** Use a robust, centralized escaping mechanism or ensure that custom `escapeHtml` functions cast input to a string and escape all relevant characters, including single quotes (`&#39;`) and double quotes (`&quot;`), using regex replacement.
