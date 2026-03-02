## YYYY-MM-DD - XSS Vulnerability in Renamify
**Vulnerability:** XSS via node IDs in renamify HTML injection.
**Learning:** Avoid unsanitized variable injection into `.innerHTML`.
**Prevention:** Use `document.createElement()` with `.textContent` or escape the string first.
