---
description: UI/UX design workflow with professional standards and best practices
---

# UI/UX Design Workflow

1. **Understand the target**: What screen/component is being designed?
   - Read relevant requirements from `REQUIREMENTS.md`
   - Identify the user flow this design supports

2. **Design the `.fd` mockup**: Create or modify an `.fd` file in `examples/`:

   ```bash
   # Create a new mockup
   touch examples/<feature_name>.fd
   ```

3. **Follow FD design conventions**:
   - Use semantic `@id` names that describe purpose
   - Use `style` blocks for design tokens (colors, typography)
   - Use `layout: column/row` for structure, not absolute positioning
   - Add `:hover` / `:press` animations for interactive elements
   - Add `#` comments explaining design decisions

4. **Design token standards**:

   ```
   # Design tokens
   style heading { font: "Inter" 600 24; fill: #1A1A2E }
   style body { font: "Inter" 400 14; fill: #333333 }
   style accent { fill: #6C5CE7 }
   style surface { fill: #FFFFFF }
   style muted { fill: #999999 }
   ```

5. **Responsive considerations**:
   - Use constraints (`center_in`, `fill_parent`) over fixed coordinates
   - Groups should use `layout: column/row` with `gap` and `pad`
   - Avoid hardcoded sizes > 400px without `fill_parent`

6. **Present to user**: Show the `.fd` file and describe the design rationale.

7. **Iterate**: Modify based on feedback, re-present until approved.
