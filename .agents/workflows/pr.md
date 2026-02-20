---
description: Create a Pull Request to merge feature branch into main
---

# PR Workflow

1. Ensure all tests pass:

   ```bash
   cargo test --workspace
   ```

2. Ensure code compiles with no warnings:

   ```bash
   cargo check --workspace 2>&1 | grep -E "warning|error" | head -20
   ```

3. Check current branch:

   ```bash
   git branch --show-current
   ```

4. Push latest changes:

   ```bash
   git push -u origin HEAD
   ```

5. Create the PR using GitKraken MCP tool:
   - `provider`: github
   - `repository_name`: ftd
   - `repository_organization`: <org from git remote>
   - `source_branch`: current branch
   - `target_branch`: main
   - `title`: conventional format like "feat(core): add FTD parser"
   - `body`: summary of changes, what was tested

6. Report the PR URL to the user.
