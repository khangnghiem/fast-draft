## 2024-05-01 - DOM Injection in Webview from Untrusted Files
**Vulnerability:** Untrusted string data (`oldId`, `newId` from parsed `.fd` files) was injected directly into the DOM using `row.innerHTML` in the renamify webview panel, creating an XSS vulnerability.
**Learning:** Even internal VSCode webviews are susceptible to XSS if they render user-controlled configuration files without proper escaping. Using `.innerHTML` to construct UI elements dynamically from file data is a common pitfall.
**Prevention:** Avoid `.innerHTML` entirely when handling data parsed from files. Instead, use safe DOM APIs like `document.createElement`, `textContent`, and `appendChild` to construct UI trees, guaranteeing that untrusted data is treated strictly as text.
