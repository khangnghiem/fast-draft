## 2024-05-24 - Fix XSS Vulnerability in Renamify Proposals
**Vulnerability:** Untrusted node IDs were being concatenated and injected into the DOM via `innerHTML` in the VS Code webview's Renamify proposals panel. This presented a Cross-Site Scripting (XSS) vulnerability if malicious node IDs were rendered.
**Learning:** In the VS Code extension webview template string (`fd-vscode/src/webview-html.ts`), elements injected via script tag interpolation are vulnerable to DOM-based XSS if user input (e.g. from `.fd` files) is parsed and rendered with `innerHTML`.
**Prevention:** Avoid `innerHTML` for displaying untrusted data. Build DOM elements explicitly with `document.createElement()` and use safe APIs like `textContent` for node IDs, or safely escape them before embedding in HTML strings.
