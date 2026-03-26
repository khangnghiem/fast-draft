## 2024-05-24 - Missing ARIA Labels on Spatial Controls
**Learning:** The text alignment grid uses 9 identical `span` dots, relying purely on their visual 3x3 layout to convey meaning (e.g. top-left vs center). Screen readers announce them all as identical empty buttons.
**Action:** Always add descriptive `aria-label` attributes (e.g. "Align Top Left") to controls where meaning is derived purely from visual positioning or layout.

## 2024-05-25 - Missing ARIA Labels on Minimap Zoom Controls
**Learning:** The minimap zoom controls (+, -, 100%) in both the standalone site and VS Code webview rely purely on title attributes and visual text for meaning. While visual text exists, standard screen reader behavior often ignores or misinterprets symbols like "+" or "-".
**Action:** Added explicit `aria-label` attributes to the zoom controls (Zoom in, Zoom out, Reset zoom) to ensure screen readers announce their function clearly, regardless of the visual symbol used.
