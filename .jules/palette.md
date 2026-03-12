## 2025-03-12 - Missing ARIA labels on visual grid buttons
**Learning:** Visual-only alignment grid controls (`.align-cell`) using just `data-h` and `data-v` attributes and dots for styling are completely inaccessible to screen readers because they lack visible text and `title` attributes.
**Action:** Always add explicit `aria-label` attributes to purely visual/icon-only controls that don't have text or title attributes, especially when they are part of a spatial/grid interface.
