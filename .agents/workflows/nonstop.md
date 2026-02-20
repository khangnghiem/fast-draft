---
description: Continuous autonomous agent — work until all tasks are done, then find more
---

# Nonstop Workflow

> Run the agent continuously until all tasks are completed, tested, and merged. Then proactively find and tackle related work. Designed for extended autonomous sessions (~3 hours).

// turbo-all

## Phase 1: Bootstrap

1. **Sync with origin**:

   ```bash
   git fetch origin main
   ```

2. **Check for open issues/PRs** assigned to you using GitKraken MCP:
   - `issues_assigned_to_me` (provider: github)
   - `pull_request_assigned_to_me` (provider: github)

3. **Scan the codebase** for TODOs, FIXMEs, and incomplete features:

   ```bash
   rg -n "TODO|FIXME|HACK|XXX|UNIMPLEMENTED" --type rust --type ts --type svelte || true
   ```

4. Build a prioritized task list in `task.md`. Rank by:
   - Open issues/PRs needing action (highest)
   - Failing tests or broken builds
   - TODOs/FIXMEs in code
   - Missing tests for existing features
   - Code quality improvements (clippy, docs)

## Phase 2: Execute Loop

> Repeat this loop for each task until all work is done.

5. **Pick the highest-priority task** from `task.md` and mark it `[/]`.

6. **Create a feature branch** (never commit to main):

   ```bash
   git checkout -b <type>/<descriptive-name>
   ```

7. **Implement the fix/feature** following the standard flow:
   - Write tests first (TDD) when applicable
   - Implement changes
   - Keep functions ≤ 30 lines, ≤ 3 args

8. **Verify** — all four must pass:

   ```bash
   cargo check --workspace
   cargo test --workspace
   cargo clippy --workspace -- -D warnings
   cargo fmt --all -- --check
   ```

9. **Fix any failures** before proceeding. If a check fails, fix and re-run.

10. **Commit and push**:

    ```bash
    git add -A
    git commit -m "<type>(<scope>): <description>"
    git push -u origin HEAD
    ```

11. **Create a PR** using GitKraken MCP:
    - `provider`: github
    - `source_branch`: current branch
    - `target_branch`: main
    - Title in conventional commit format
    - Body with summary + verification results

12. **Mark task `[x]`** in `task.md` and return to step 5.

## Phase 3: Proactive Discovery

> When all known tasks are done, look for more work.

13. **Re-scan** for new TODOs, untested code, or missing docs:

    ```bash
    rg -n "TODO|FIXME|HACK|XXX" --type rust --type ts || true
    ```

14. **Check test coverage gaps** — look for public functions without tests:

    ```bash
    cargo test --workspace -- --list 2>&1 | head -50
    ```

15. If new work is found, add to `task.md` and return to **Phase 2**.

16. If no more work is found, **report summary** to user:
    - Total tasks completed
    - PRs created (with URLs)
    - Remaining known issues (if any)
    - Suggestions for future work

## Rules

- **Never commit to `main`** — always use feature branches
- **Never skip CI checks** — all 4 must pass before committing
- **One PR per logical change** — keep PRs focused and reviewable
- **Update `task.md`** continuously as a living progress tracker
- **Ask the user** if a decision requires product/design judgment
