## 2024-05-24 - Missing ARIA Labels on Spatial Controls
**Learning:** The text alignment grid uses 9 identical `span` dots, relying purely on their visual 3x3 layout to convey meaning (e.g. top-left vs center). Screen readers announce them all as identical empty buttons.
**Action:** Always add descriptive `aria-label` attributes (e.g. "Align Top Left") to controls where meaning is derived purely from visual positioning or layout.

## 2024-05-25 - Icon-only tools and utility buttons missing aria-labels
**Learning:** Many interactive controls like toolbar tools (`ft-tool-btn`) and settings menu items (`settings-menu-item`) used `title` or tooltip text for labeling, but missed explicit `aria-label` attributes which are necessary for screen reader accessibility when visually conveyed info isn't part of the actual button text.
**Action:** When adding or updating icon-only buttons or interactive tools, explicitly supply an `aria-label` reflecting the action to ensure full accessibility.
