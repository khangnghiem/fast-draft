## 2025-02-24 - DOMPurify Missing in App Panel Markdown Render
**Vulnerability:** XSS vulnerability via DOM injection in `renderSpecsPanel` (site/app.js)
**Learning:** `marked.parse` output was appended directly to `innerHTML` without sanitization. Unlike `site/ai-chat.js`, which securely wrapped `renderedUnsafeHTML` in `DOMPurify.sanitize`, `app.js` blindly passed markdown results.
**Prevention:** Always verify that `DOMPurify.sanitize` (with fallback logic) encapsulates the output of any text-to-HTML parser like `marked.parse` before DOM injection, especially when parsing files from untrusted user content.
