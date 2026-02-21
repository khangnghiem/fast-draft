---
description: Define requirements and acceptance criteria for a feature
---

# Spec Workflow

1. **Gather context**: Read `REQUIREMENTS.md` to understand existing requirements:

   ```bash
   cat REQUIREMENTS.md
   ```

2. **Define the feature requirement** using this template:

   ```markdown
   ## FR-XX: <Feature Name>

   **Priority:** High/Medium/Low · **Status:** Planned

   ### Description

   <What this feature does and why>

   ### Acceptance Criteria

   - [ ] AC1: ...
   - [ ] AC2: ...

   ### Dependencies

   - <Other requirements this depends on>
   ```

3. **Identify affected crates**: Which of `fd-core`, `fd-render`, `fd-editor`, `fd-vscode` need changes?

4. **Add to REQUIREMENTS.md**:
   - Append the new requirement section
   - Assign the next FR-XX number

5. **Present to user for review** before proceeding to implementation.
