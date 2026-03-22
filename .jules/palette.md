## 2024-05-24 - Missing ARIA Labels on Spatial Controls
**Learning:** The text alignment grid uses 9 identical `span` dots, relying purely on their visual 3x3 layout to convey meaning (e.g. top-left vs center). Screen readers announce them all as identical empty buttons.
**Action:** Always add descriptive `aria-label` attributes (e.g. "Align Top Left") to controls where meaning is derived purely from visual positioning or layout.

## 2024-05-25 - Missing ARIA Labels on Icon-Only Floating Buttons
**Learning:** Icon-only utility buttons located in floating toolbars and context panels (like the floating action bar delete button, minimap zoom controls, and AI chat actions) rely solely on icons (e.g., `🗑`, `✕`, `→`, `-`, `+`) and `title` attributes. Screen readers may not consistently announce `title` attributes or might announce confusing symbols instead of meaningful actions.
**Action:** Always explicitly define `aria-label` attributes for icon-only buttons in floating toolbars, overlays, and side panels to ensure screen readers announce clear, actionable text (e.g., "Delete selected" instead of just announcing the trash icon).
