1. **Add `aria-label` to icon-only buttons in `fd-vscode/src/webview-html.ts`**
   - Identify all icon-only buttons (e.g., Delete button, tool buttons like Select, Rect, Ellipse, Pen, Arrow, Text, Frame, Eraser, Zen mode, Settings menu, Minimap zoom controls, alignment buttons, panel close buttons).
   - Add appropriate `aria-label` attributes to these buttons for better screen reader accessibility.
2. **Add `aria-label` to inputs missing them**
   - Check input fields, especially icon-only or generic ones (like color pickers or numeric inputs for sizes), and ensure they have `aria-label`s.
3. **Verify keyboard accessibility**
   - Ensure the modified buttons have `aria-label` matching their `title` or intent.
4. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**
   - Run tests and linting.
5. **Create a PR with changes and update `.Jules/palette.md` with the learning if applicable.**
