## 2024-03-07 - Button Accessibility Enhancement
**Learning:** Icon-only buttons or minimal-text buttons in VSCode extension webviews and web playgrounds often lack proper `aria-label`s, which significantly hampers screen reader accessibility. Titles alone do not suffice.
**Action:** When adding new UI components, always ensure that any icon-only button contains a clear `aria-label` explaining its function.
