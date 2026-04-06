---
description: Create or update technical specifications before building.
---

// turbo-all

# /spec

$ARGUMENTS

If `$ARGUMENTS` is provided, scope the spec to that feature or area.
Otherwise, prompt the user for what to specify.

> **Output**: `docs/REQUIREMENTS.md`, `implementation_plan.md` artifact
> **Next**: `/design`

## Phase 1: Discovery

1. Check relevant **Knowledge Items** for past specs, rejected approaches, and established patterns.
2. Analyze the user's initial request or feature description.
3. Ask clarifying questions. **Wait for answers before proceeding.**
   - **What**: Core functionality and expected behavior.
   - **Who**: Target users and their context.
   - **Why**: Business or technical motivation (the problem being solved).
   - **Done Criteria**: How will we know the feature is complete?
4. Synthesize requirements (user stories, scope, acceptance criteria).
   - **User Stories**: `As a [persona], I want [action] so that [benefit]`.
   - **Scope**: Explicitly list In-Scope and Out-of-Scope items.
   - **Acceptance Criteria**: Testable conditions that define "Done" (feeding into `/test`).

## Phase 2: Options Presentation

5. Present **at least 3 distinct options** for the technical approach.
6. For each option, use `generate_image` tool to create a visual illustration (architecture overview, UI wireframe, or data flow diagram). Keep the image intuitive.
7. For each option, clearly document:

| Dimension       | Description                                         |
| --------------- | --------------------------------------------------- |
| **Scalability** | How well it handles growth                          |
| **Risk**        | What could go wrong or break existing functionality |
| **Trade-offs**  | What you gain vs. what you sacrifice                |

8. Provide a **recommendation** with rationale for which option best fits the stated requirements and constraints.

## Phase 3: Documentation & Approval

9. Create an `implementation_plan.md` artifact for user review.
10. Read `docs/REQUIREMENTS.md` (if it exists) and check for:
    - **Conflicts**: Does the new spec contradict existing requirements?
    - **Duplicates**: Is this feature (or a variant) already specified?
    - **Dependencies**: Does this spec depend on or affect existing features?
11. Update `docs/REQUIREMENTS.md` with the finalized specification, resolving any conflicts. Use a trackable ID system (e.g., `FR-XX` or category prefixes like `C/U/O`).
12. **Wait for explicit user approval** before proceeding to `/design`.

---

## Rules

| Rule                | Description                                                |
| ------------------- | ---------------------------------------------------------- |
| **Interactive**     | Requirements MUST come from the user. Never assume.        |
| **Traceable**       | Every acceptance criterion must be testable in `/build`.   |
| **Non-destructive** | Merge and resolve by default. Decommission only on explicit user request. |
| **Context continuity** | If previous responses in this conversation contain recommendations or an approved plan, follow them as the primary directive. |
