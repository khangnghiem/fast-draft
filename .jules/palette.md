## 2024-05-02 - Icon-Only Button Accessibility
**Learning:** Found a widespread pattern in `site/index.html` where numerous icon-only buttons (like modals closes, chat actions, floating bar controls) lacked `aria-label`s. This is a common accessibility gap in web apps relying heavily on SVG icons.
**Action:** Always verify icon-only buttons (`<button><svg/></button>` or `<button>✕</button>`) have explicit `aria-label` attributes to ensure screen reader users understand their function.
