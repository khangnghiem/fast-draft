## 2024-05-24 - Missing ARIA Labels on Spatial Controls
**Learning:** The text alignment grid uses 9 identical `span` dots, relying purely on their visual 3x3 layout to convey meaning (e.g. top-left vs center). Screen readers announce them all as identical empty buttons.
**Action:** Always add descriptive `aria-label` attributes (e.g. "Align Top Left") to controls where meaning is derived purely from visual positioning or layout.

## 2024-05-15 - Hidden tooltips remove accessibility labels
**Learning:** Tooltips visually hidden using `visibility: hidden` (like the `.ft-tooltip` elements) are also removed from the accessibility tree. Screen readers ignore them, meaning icon-only buttons relying on these tooltips for context remain completely unlabelled for screen reader users.
**Action:** Always provide an explicit `aria-label` attribute on icon-only buttons, even if they have an internal tooltip element, to ensure screen readers announce their function.
