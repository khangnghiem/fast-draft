## 2024-05-24 - Missing ARIA Labels on Spatial Controls
**Learning:** The text alignment grid uses 9 identical `span` dots, relying purely on their visual 3x3 layout to convey meaning (e.g. top-left vs center). Screen readers announce them all as identical empty buttons.
**Action:** Always add descriptive `aria-label` attributes (e.g. "Align Top Left") to controls where meaning is derived purely from visual positioning or layout.

## 2024-05-25 - Missing ARIA Labels on Icon-only Controls
**Learning:** The UI has many toolbars and floating action bars with icon-only buttons (e.g. tools, minimap zoom, chat actions). These rely purely on `title` attributes, SVG icons, or visual positioning. While visually apparent and offering native tooltips for mouse users, `title` is often ignored or inconsistently read by screen readers depending on configuration, leaving these users without necessary interaction context.
**Action:** Always add explicit `aria-label` attributes to any icon-only, functionally meaningful button (like tool toggles, zoom controls, or close actions) to ensure consistent screen reader interpretation regardless of the presence of a visual tooltip.
