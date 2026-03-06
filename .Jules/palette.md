## 2025-01-20 - [ARIA Labels for Custom Webview UI Components]
**Learning:** Icon-only interactive elements in the custom UI of `fd-vscode/src/webview-html.ts` (like `zen-toggle-btn`, `settings-menu-btn`, and alignment grid cells) lack screen reader compatibility because they rely solely on visual cues or title attributes instead of explicit ARIA labels.
**Action:** Always ensure that icon-only buttons (`.tool-btn`, `.align-cell`, etc.) in custom webview interfaces include descriptive `aria-label` attributes to maintain accessibility standards alongside visual design.
