## 2024-05-24 - Missing ARIA Labels on Spatial Controls
**Learning:** The text alignment grid uses 9 identical `span` dots, relying purely on their visual 3x3 layout to convey meaning (e.g. top-left vs center). Screen readers announce them all as identical empty buttons.
**Action:** Always add descriptive `aria-label` attributes (e.g. "Align Top Left") to controls where meaning is derived purely from visual positioning or layout.

## 2024-05-15 - Explicit ARIA Labels for Icon-Only Buttons
**Learning:** In VS Code webviews, tooltips created using the standard `title` attribute alone are often insufficient for screen readers to properly identify purely icon-based utility buttons (e.g., in floating action bars, minimap controls, or chat headers).
**Action:** Always provide an explicit `aria-label` attribute on `<button>` elements that only contain an icon, a symbol, or an SVG, ensuring full accessibility without relying on hover text.
