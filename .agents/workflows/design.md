---
description: Design the user experience and visual system after spec approval.
---

// turbo-all

# /design

$ARGUMENTS

If `$ARGUMENTS` is provided, scope the design to that feature or area.
Otherwise, design everything defined in the approved spec.

> **Prerequisite**: `/spec` must be completed and approved.
> **Output**: `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/USER_JOURNEY.md`
> **Next**: `/build`

## Phase 1: Research & Context

1. Review the approved spec in `docs/REQUIREMENTS.md` and the chosen option from `/spec`.
2. Identify the product type, industry, target users, and relevant design patterns.
3. Reference `GEMINI.md` for stack rules, existing `docs/DESIGN.md` (if present), and relevant **Knowledge Items** for design patterns, accessibility standards, and UX anti-patterns.
4. Research competitive or inspirational designs in the same domain.

## Phase 2: Design Options Presentation

5. Present **at least 3 distinct design directions**. For each, produce:
   - **UI mockup** (preferred): Use `generate_image` tool to create a high-fidelity visual of key screens.
   - **architecture**: A sitemap, component tree, or layout wireframe. Keep the architecture intuitive.

6. Label each design with its style rationale:

| Dimension   | Example Values                                                |
| ----------- | ------------------------------------------------------------- |
| **Style**   | Minimalist clinical, Data-dense dashboard, Wizard-guided flow |
| **Layout**  | Single-page, Multi-tab, Split-pane                            |
| **Density** | Sparse (mobile-first), Dense (power-user), Adaptive           |

7. For each design, include visual examples of:
   - Key interactive states (hover, active, error, loading, empty).
   - Responsive breakpoints (mobile 375px, tablet 768px, desktop 1440px).
   - Light/dark mode variants (if applicable).

8. Provide a **recommendation** at the end with rationale.

## Phase 3: User Selection & Iteration

9. **Wait for user to pick** a design direction (or request a hybrid).
10. Iterate on the chosen design based on user feedback until approved.
    - Each iteration must produce updated visuals (not just text descriptions).

## Phase 4: Documentation

11. Update the following documents with the finalized design:

| Document               | Contents                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `docs/ARCHITECTURE.md` | System architecture, component hierarchy, data flow diagrams                               |
| `docs/DESIGN.md`       | Visual design system: colors, typography, spacing, component catalog, interaction patterns |
| `docs/USER_JOURNEY.md` | Step-by-step user flows with annotated screenshots/diagrams for each key scenario          |

12. **Wait for explicit user approval** before proceeding to `/build`.

---

## Rules

| Rule             | Description                                                                          |
| ---------------- | ------------------------------------------------------------------------------------ |
| **Visual-first** | Every option must include generated mockups. Text-only proposals are not acceptable. |

| **Accessibility** | WCAG AA (4.5:1 contrast), keyboard navigation, and `prefers-reduced-motion` are non-negotiable. |
| **No emoji icons** | Use SVG icon libraries (Heroicons, Lucide, Phosphor) — never emoji as UI elements. |
| **Transitions** | 150–300ms for hover/focus. No instant or >500ms transitions. |
| **Context continuity** | If previous responses in this conversation contain recommendations or an approved plan, follow them as the primary directive. |
