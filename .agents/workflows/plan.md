---
description: Unified planning workflow to visually and concisely prepare for feature execution
---

# /plan - Visual Feature Prep

$ARGUMENTS 

> **Purpose**: A lightweight, visual-first planning step required before diving into complex UI features, layout changes, or pointer event handling. 

// turbo-all

1. **Understand Context**: Quickly read relevant files or PRs related to the feature. Use `grep_search` to find existing components.

2. **Generate Visuals**: Use `generate_image` or Mermaid diagrams to visualize the feature before writing code.
   - For UI/UX changes: `generate_image` a quick mockup of the proposed state.
   - For logic/interaction changes: Create a Mermaid flowchart showing state transitions or data flow.

3. **Establish Acceptance Criteria**: 
   Provide a concise list of 2-3 acceptance criteria (must pass for the feature to be considered "done"). Keep them simple and actionable.

4. **Define the Steps**: 
   Outline the high-level steps required to implement the feature across the relevant crates (`fd-core`, `fd-render`, `fd-editor`, `fd-vscode`).

5. **Wait for Approval**: Present the plan to the user for confirmation BEFORE any implementation begins. Do not modify `REQUIREMENTS.md` unless explicitly told to.
