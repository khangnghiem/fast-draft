## 2026-03-10 - Cross-Site Scripting (XSS) in Renamify Panel
**Vulnerability:** Found an XSS vulnerability in `fd-vscode/src/webview-html.ts` where untrusted node IDs (`p.oldId` and `p.newId`) from the extension's `.fd` files were directly interpolated into `row.innerHTML` in the Renamify panel.
**Learning:** Even though the source is internal extension files, untrusted input rendered directly as `innerHTML` causes an XSS injection risk.
**Prevention:** Avoid `innerHTML` for dynamically generating DOM nodes. Always use safer DOM APIs like `document.createElement()` and `textContent` when rendering untrusted or user-controlled data.

## 2026-03-10 - Cross-Site Scripting (XSS) in Notes Panel
**Vulnerability:** Found an XSS vulnerability in `fd-vscode/src/webview-html.ts` where untrusted node IDs (`nodeId`), file paths (`filePath`), and included paths (`inclPath`) were directly concatenated into an HTML template string and assigned to `body.innerHTML` in the `renderNotesPanel` function.
**Learning:** Even though the source is internal extension files, untrusted input rendered directly into an `innerHTML` string causes an XSS injection risk. The previous XSS in the Renamify panel was mitigated using `textContent` and `createElement`, but similar vulnerabilities can exist in other panels that still rely on `innerHTML` concatenation.
**Prevention:** Avoid `innerHTML` for dynamically generating DOM nodes. If `innerHTML` must be used for performance or legacy reasons, all untrusted or user-controlled variables must be explicitly sanitized using an `escapeHtml` helper function before concatenation. Additionally, take care not to accidentally mutate JS state variables with HTML-escaped content (e.g., `reqId` generation) to preserve functionality.
