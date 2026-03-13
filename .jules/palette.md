## 2026-03-11 - Abstract Grid Controls Accessibility
**Learning:** Custom structural UI controls (like a 3x3 alignment grid built from basic CSS shapes rather than standard icons) are easy to overlook for accessibility because they don't look like typical buttons. They lack semantic meaning for screen readers and miss out on native tooltip functionality.
**Action:** Whenever building visual control grids or layouts using empty CSS shapes (`span.align-dot`), explicitly add `aria-label` and `title` attributes for both screen readers and mouse users.
