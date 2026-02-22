---
description: Create a Pull Request and merge feature branch into main
---

# PR Workflow

// turbo-all

1. **Activate pre-push hook** (one-time per clone):

   ```bash
   git config core.hooksPath .githooks
   ```

2. Ensure all tests pass:

   ```bash
   cargo test --workspace
   ```

3. Ensure code compiles with no warnings:

   ```bash
   cargo check --workspace 2>&1 | grep -E "warning|error" | head -20
   ```

4. Check current branch — must NOT be `main`:

   ```bash
   git branch --show-current
   ```

5. Push latest changes:

   ```bash
   git push -u origin HEAD
   ```

6. Create the PR using GitKraken MCP tool:
   - `provider`: github
   - `repository_name`: fast-draft
   - `repository_organization`: khangnghiem
   - `source_branch`: current branch
   - `target_branch`: main
   - `title`: conventional format like `feat(core): add FD parser`
   - `body`: summary of changes, what was tested

7. Merge the PR and delete the branch:

   ```bash
   gh pr merge <PR_NUMBER> --merge --delete-branch
   ```

8. Sync local main:

   ```bash
   git checkout main
   git pull origin main
   ```

9. Report the PR URL and merge status to the user.
