## 2024-05-24 - Missing ARIA Labels on Spatial Controls
**Learning:** The text alignment grid uses 9 identical `span` dots, relying purely on their visual 3x3 layout to convey meaning (e.g. top-left vs center). Screen readers announce them all as identical empty buttons.
**Action:** Always add descriptive `aria-label` attributes (e.g. "Align Top Left") to controls where meaning is derived purely from visual positioning or layout.

## 2024-05-25 - Missing ARIA Labels on Icon-Only Toolbar Buttons
**Learning:** Icon-only toolbar buttons rely on SVG icons and tooltips which screen readers may not announce consistently, leading to empty or unhelpful announcements.
**Action:** Always add descriptive `aria-label` attributes to icon-only interactive elements like tool buttons, even if they have visual tooltips or title attributes.
