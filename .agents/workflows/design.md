---
description: Design the visual design and interaction patterns for FD canvas UI
---

# Design Workflow

1. **Define the component/feature**:
   - What does the user see?
   - What interactions are supported (click, drag, hover)?
   - What state transitions occur?

2. **Sketch the layout** using FD format:

   ```
   # Component: <Name>
   # Purpose: <What it does>

   style <design_tokens> { ... }

   group @<component_name> {
     layout: column/row gap=X pad=Y
     # structure here
   }
   ```

3. **Define interaction model**:
   - Hover states → `anim :hover { ... }`
   - Press/click states → `anim :press { ... }`
   - Transitions → easing + duration

4. **Accessibility checklist**:
   - [ ] Color contrast ratio ≥ 4.5:1 for text
   - [ ] Interactive elements have hover/focus states
   - [ ] Font sizes ≥ 12px for body text
   - [ ] Clickable areas ≥ 44×44px (touch targets)

5. **Save to examples/**:

   ```bash
   # Save mockup as .fd file
   cat > examples/design_<feature>.fd << 'EOF'
   # Mockup content
   EOF
   ```

6. **Present design to user** with rationale for key decisions.
