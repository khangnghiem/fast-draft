## 2024-05-02 - Icon-Only Button Accessibility
**Learning:** Found a widespread pattern in `site/index.html` where numerous icon-only buttons (like modals closes, chat actions, floating bar controls) lacked `aria-label`s. This is a common accessibility gap in web apps relying heavily on SVG icons.
**Action:** Always verify icon-only buttons (`<button><svg/></button>` or `<button>✕</button>`) have explicit `aria-label` attributes to ensure screen reader users understand their function.
## 2024-05-09 - Icon-Only Button Accessibility in index.html
**Learning:** Found a widespread pattern in `site/index.html` where numerous icon-only buttons (like modal closes, chat actions, floating bar controls) lacked `aria-label`s. Added labels to these elements to improve accessibility. This validates the previous entry but implements it concretely in `site/index.html`.
**Action:** Always verify icon-only buttons (`<button><svg/></button>` or `<button>✕</button>`) and custom inputs without explicit labels have `aria-label` attributes to ensure screen reader users understand their function.
