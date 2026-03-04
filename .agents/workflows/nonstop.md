---
description: Continuous autonomous agent — work until all tasks are done, then find more
---

# Nonstop Workflow

> Phased autonomous work loop with context budgets.
> Prevents context overflow by separating research, execution, and E2E testing.

// turbo-all

---

## Phase 1: Scan (lightweight discovery)

> **Context budget: minimal.** Use outlines and greps, not full file reads.

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

4. **Grep LESSONS.md** for keywords related to your work area — do NOT read the full file:

   ```bash
   grep -n "keyword1\|keyword2" docs/LESSONS.md | head -10
   ```

5. Build a prioritized task list in `task.md`. Rank by:
   - Open issues/PRs needing action (highest)
   - Failing tests or broken builds
   - TODOs/FIXMEs in code
   - Missing tests for existing features
   - Code quality improvements (clippy, docs)

---

## Phase 2: Plan

> Write specific file:line targets. Don't load entire large files.

6. For each task, identify **exactly which files and functions** need changes.
   Use `view_file_outline` instead of reading full files.

7. If the task is complex (>3 files, >100 lines changed), write a brief plan in
   the task artifact before starting implementation.

---

## Phase 3: Execute Loop

> Repeat this loop for each task until all work is done.

8. **Pick the highest-priority task** from `task.md` and mark it `[/]`.

9. **Create a feature branch** (never commit to main):

   ```bash
   git checkout -b <type>/<descriptive-name>
   ```

10. **Implement the fix/feature** following the standard flow:
    - **Write tests FIRST** (TDD) — follow `/test` workflow conventions:
      - Regression test for bugs, `parse_`/`emit_`/`roundtrip_` for parser changes,
        `tool_`/`sync_`/`layout_` for respective features
      - Skip only for pure docs/CI changes
    - Implement changes to make tests pass
    - Keep functions ≤ 30 lines, ≤ 3 args

11. **Verify** — all four must pass:

    ```bash
    cargo check --workspace
    cargo test --workspace
    cargo clippy --workspace -- -D warnings
    cargo fmt --all -- --check
    ```

12. **Fix any failures** before proceeding. If a check fails, fix and re-run.

13. **Commit and push**:

    ```bash
    git add -A
    git commit -m "<type>(<scope>): <description>"
    git push -u origin HEAD
    ```

14. **Create a PR** using GitKraken MCP:
    - `provider`: github
    - `source_branch`: current branch
    - `target_branch`: main
    - Title in conventional commit format
    - Body with summary + verification results

15. **Mark task `[x]`** in `task.md` and return to step 8.

---

## Phase 4: E2E Gate

> **Only if canvas/WASM/webview code changed.**
> E2E browser tests require clean context — **tell the user to start a new conversation** if context is heavy.

16. Check if any of these directories were modified:
    `crates/fd-wasm/`, `crates/fd-core/`, `crates/fd-editor/`, `crates/fd-render/`, `fd-vscode/webview/`

17. If yes, build WASM first:

    ```bash
    wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm
    ```

18. **Assess context load.** If this conversation has loaded many large files
    (>3000 total lines of source code viewed), **notify the user**:

    > "Context is heavy. Please start a new conversation and run `/e2e` for clean E2E testing."

    If context is light, run `/e2e` inline (smoke tier for routine PRs, full tier for major features).

> **Skip E2E only if** the change is purely Rust internals with no canvas/UI impact (e.g., parser refactors covered by unit tests).

---

## Phase 5: Proactive Discovery

> When all known tasks are done, look for more work.

19. **Re-scan** for new TODOs, untested code, or missing docs:

    ```bash
    rg -n "TODO|FIXME|HACK|XXX" --type rust --type ts || true
    ```

20. **Check test coverage gaps** — look for public functions without tests:

    ```bash
    cargo test --workspace -- --list 2>&1 | head -50
    ```

21. If new work is found, add to `task.md` and return to **Phase 3**.

22. If no more work is found, **report summary** to user:
    - Total tasks completed
    - PRs created (with URLs)
    - Remaining known issues (if any)
    - Suggestions for future work

---

## Rules

- **Never commit to `main`** — always use feature branches
- **Never skip CI checks** — all 4 must pass before committing
- **One PR per logical change** — keep PRs focused and reviewable
- **Update `task.md`** continuously as a living progress tracker
- **Ask the user** if a decision requires product/design judgment
- **Context budget** — prefer `view_file_outline` over full reads, limit CHANGELOG to recent entries
- **Split conversations** when context gets heavy — especially before E2E browser testing
