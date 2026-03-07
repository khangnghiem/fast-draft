## 2024-05-15 - XSS in Renamify Webview UI
**Vulnerability:** Unsanitized `.fd` file data (`p.oldId` and `p.newId`) was directly concatenated into the DOM using `innerHTML` in the Renamify panel of the VSCode extension webview.
**Learning:** The VSCode webview environment is susceptible to XSS if user-controlled content from files or AI output isn't safely escaped before injection into the DOM.
**Prevention:** Always use safe DOM APIs like `document.createElement` and `textContent` instead of `innerHTML` when rendering data from untrusted sources, such as files or external APIs.
