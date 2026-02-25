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
   - **Write tests FIRST** (TDD) — follow `/test` workflow conventions:
     - Regression test for bugs, `parse_`/`emit_`/`roundtrip_` for parser changes,
       `tool_`/`sync_`/`layout_` for respective features
     - Skip only for pure docs/CI changes
   - Implement changes to make tests pass
   - Keep functions ≤ 30 lines, ≤ 3 args

8. **Verify** — all four must pass:

   ```bash
   cargo check --workspace
   cargo test --workspace
   cargo clippy --workspace -- -D warnings
   cargo fmt --all -- --check
   ```

9. **Fix any failures** before proceeding. If a check fails, fix and re-run.

10. **E2E UX browser testing** (if `crates/fd-wasm/`, `crates/fd-core/`, `crates/fd-editor/`, `crates/fd-render/`, or `fd-vscode/webview/` changed):

    Run the full `/e2e-ux` workflow using the browser subagent:
    - Build WASM first if Rust crates changed:

      ```bash
      wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm
      ```

    - Open the Codespace in browser via `gh codespace code -c <codespace-name> --web`
    - Execute all 8 phases from `/e2e-ux` (Canvas Load, Drawing Tools, Selection, Inline Editing, Navigation, Panels, Bidi Sync, Keyboard Shortcuts)
    - Screenshot and report results per phase
    - **If any phase fails**: Fix the issue before proceeding

    > **Skip only if** the change is purely Rust internals with no canvas/UI impact (e.g., parser refactors covered by unit tests).

11. **Commit and push**:

    ```bash
    git add -A
    git commit -m "<type>(<scope>): <description>"
    git push -u origin HEAD
    ```

12. **Create a PR** using GitKraken MCP:
    - `provider`: github
    - `source_branch`: current branch
    - `target_branch`: main
    - Title in conventional commit format
    - Body with summary + verification results

13. **Mark task `[x]`** in `task.md` and return to step 5.

## Phase 3: Proactive Discovery

> When all known tasks are done, look for more work.

14. **Re-scan** for new TODOs, untested code, or missing docs:

    ```bash
    rg -n "TODO|FIXME|HACK|XXX" --type rust --type ts || true
    ```

15. **Check test coverage gaps** — look for public functions without tests:

    ```bash
    cargo test --workspace -- --list 2>&1 | head -50
    ```

16. If new work is found, add to `task.md` and return to **Phase 2**.

17. If no more work is found, **report summary** to user:
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
