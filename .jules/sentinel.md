## 2026-03-10 - Cross-Site Scripting (XSS) in Renamify Panel
**Vulnerability:** Found an XSS vulnerability in `fd-vscode/src/webview-html.ts` where untrusted node IDs (`p.oldId` and `p.newId`) from the extension's `.fd` files were directly interpolated into `row.innerHTML` in the Renamify panel.
**Learning:** Even though the source is internal extension files, untrusted input rendered directly as `innerHTML` causes an XSS injection risk.
**Prevention:** Avoid `innerHTML` for dynamically generating DOM nodes. Always use safer DOM APIs like `document.createElement()` and `textContent` when rendering untrusted or user-controlled data.

## 2026-03-10 - Unescaped Quotation Marks in Webview Panels
**Vulnerability:** Found `escapeHtml` and `escapeAttr` implementation vulnerabilities in multiple parts of the application (like `fd-vscode/webview/src/panels.js`), where attributes were generated via `.innerHTML` directly without properly sanitizing `'` causing an XSS vulnerability. Also `escapeHtml` didn't escape single quotes.
**Learning:** Duplicate security utility definitions lead to drift and missed escapes. If quotes are not properly escaped, attribute injection vulnerabilities are introduced.
**Prevention:** Global security helpers `escapeHtml` and `escapeAttr` must be centralized (e.g., in `state.js` in a webview's build order) to prevent logic duplication. They must rigorously escape `&`, `<`, `>`, `"`, and `'`.
