## 2026-05-16 - Add ARIA Labels to Icon-Only Buttons
**Learning:** Adding ARIA labels to icon-only buttons improves accessibility for screen readers. Using `npx prettier --write` formatting across an entire file like `site/index.html` causes large irrelevant diffs, so it's better to stick to small, targeted diffs and format only the changed lines when possible.
**Action:** Use targeted commands like `sed` and ensure no full-file formatting is committed that expands the diff beyond the <50 line constraint.
