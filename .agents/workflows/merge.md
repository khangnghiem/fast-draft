---
description: Merge an existing PR into main and sync local branch
---

# Merge Workflow

> Use this after a PR has been created (via `/pr`) and is ready to merge.

// turbo-all

1. **Activate pre-push hook** (one-time per clone — blocks accidental direct pushes to main):

   ```bash
   git config core.hooksPath .githooks
   ```

2. Verify the PR is ready (CI green, no blocking reviews):

   ```bash
   gh pr view <PR_NUMBER> --json state,statusCheckRollup
   ```

3. Merge the PR and delete the source branch:

   ```bash
   gh pr merge <PR_NUMBER> --merge --delete-branch
   ```

4. Sync local `main`:

   ```bash
   git checkout main
   git pull origin main
   ```

5. Confirm the merge commit appears in log:

   ```bash
   git log --oneline -5
   ```

6. Report merge status and commit SHA to the user.
