## 2024-05-24 - Missing ARIA Labels on Spatial Controls
**Learning:** The text alignment grid uses 9 identical `span` dots, relying purely on their visual 3x3 layout to convey meaning (e.g. top-left vs center). Screen readers announce them all as identical empty buttons.
**Action:** Always add descriptive `aria-label` attributes (e.g. "Align Top Left") to controls where meaning is derived purely from visual positioning or layout.
## 2024-05-25 - Missing ARIA Labels on Minimap Zoom Controls
**Learning:** Icon-only or symbol-only (like `+` or `-`) utility buttons for zooming or resizing are often grouped closely together. Relying purely on a `title` attribute for screen readers is insufficient and can lead to confusing announcements.
**Action:** Always provide explicit, descriptive `aria-label` attributes (e.g., "Zoom out" or "Zoom in") to symbol-only control buttons, even if their function seems visually obvious by the `+`/`-` text content.
