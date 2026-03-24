---
description: Full pipeline - test, build, commit, PR, and merge in one shot
---

# Yolo Workflow

> Runs the full pipeline automatically. Supports three modes:
>
> `/yolo local` — 🧪 TDD → 🔨 Build → 🌐 E2E Smoke → ✅ Verify Local **(STOP)**
> `/yolo deploy` — 📝 Commit → 📝 PR → 🔀 Merge → 📦 Publish Extension **(use after `/yolo local`)**
> `/yolo` — 🧪 TDD → 🔨 Build → 🌐 E2E Smoke → 📝 Commit → 📝 PR → 🔀 Merge → 📦 Publish Extension

// turbo-all

---

## `/yolo local` — TDD + Verify

1. **Write / update tests** (TDD — MANDATORY before any other step):
   Follow the `/test` workflow conventions:
   - Identify what changed (new feature, bug fix, refactor)
   - Write or update tests in the relevant crate's `mod tests`:
     - Parser → `parse_<feature>` + `roundtrip_<feature>`
     - Emitter → `emit_<feature>` + `roundtrip_<feature>`
     - Layout → `layout_<feature>` or `resolve_<feature>`
     - Sync → `sync_<direction>_<feature>`
     - Tools → `tool_<name>_<behavior>`
     - Hit test → `hit_<behavior>`
     - WASM API → Integration tests in `crates/fd-wasm/`
   - Include edge cases: empty input, nested structures, boundary values
   - For bug fixes: write a regression test that reproduces the bug FIRST

   > **Skip only if** the change is purely docs, CI config, or formatting.

2. **Lint**:

   ```bash
   cargo clippy --workspace -- -D warnings
   ```

3. **Format**:

   ```bash
   cargo fmt --all
   ```

4. **Test** (confirm all tests pass — old and new):

   ```bash
   cargo test --workspace
   ```

   > **If errors appear**: SSH into the Codespace for a clean Linux environment before investigating locally:
   >
   > ```bash
   > gh cs list
   > gh cs ssh -c <codespace-name> -- "cargo test --workspace 2>&1 | tail -80"
   > ```
   >
   > Requires `gh auth refresh -h github.com -s codespace` (one-time setup).

5. **Bug-fix browser verification** (MANDATORY if fixing a UI interaction bug):

   Use `browser_subagent` + `execute_browser_javascript` to reproduce the **exact user-reported behavior** with quantitative measurement BEFORE committing. Generic "page loads" checks do NOT count.

   Template — measure element position before/after interaction:
   ```javascript
   const el = document.getElementById('target');
   const before = el.getBoundingClientRect();
   // ... trigger interaction (double-click, drag, resize, etc.) ...
   const after = el.getBoundingClientRect();
   // Compare: centerX, centerY, width, height, classes
   ```

   The test must **FAIL on old code** and **PASS on new code**. If you can't run locally, deploy first then verify on production — but never mark a UI bug as fixed without empirical browser measurement.

   > **Skip only if** the change is purely Rust/logic with no visual/interaction impact.

6. **Tauri desktop check** (excluded from workspace — run separately):

   ```bash
   cd fd-desktop/src-tauri && cargo check && cargo clippy -- -D warnings && cargo fmt -- --check
   ```

7. **TypeScript tests** (if `fd-vscode/` changed):

   ```bash
   cd fd-vscode && pnpm test
   ```

8. **E2E smoke test** (if `crates/fd-wasm/`, `crates/fd-core/`, `crates/fd-editor/`, `crates/fd-render/`, or `fd-vscode/webview/` changed):

   Build WASM first if Rust crates changed:

   ```bash
   wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm
   ```

   Then run the **3-check smoke** from `/e2e` (Smoke tier). If the Codespace tab is
   already open and you pushed code earlier in this conversation, skip the sync steps.
   - **If any check fails**: Fix before proceeding

   > **Skip only if** the change is purely Rust internals with no canvas/UI impact.
   > For full UX testing (all 9 phases), run `/e2e` with full tier or via `/nonstop`.

9. **Report** results to user. **STOP HERE.**

---

## `/yolo deploy` — Commit + PR + Merge

> Use this after `/yolo local` has passed.

10. **Activate pre-push hook** (one-time per clone — blocks accidental pushes to `main`):

   ```bash
   git config core.hooksPath .githooks
   ```

11. **Check branch** (never commit to main):

   ```bash
   git branch --show-current
   ```

12. If on `main`, create a feature branch:

```bash
git checkout -b feat/<descriptive-name>
```

13. **Bump Version** (if `fd-vscode/` was changed):
    - Bump the `version` field in `fd-vscode/package.json` appropriately (patch/minor/major).

14. **Update docs** (MANDATORY — both files, every time):
    - `docs/CHANGELOG.md` — add entry under the current version section for each meaningful change
    - `docs/REQUIREMENTS.md` — for **every** CHANGELOG entry, check if it introduces, extends, or modifies a requirement:
      - New feature → add a new `R*.N` entry and update the Requirement Index
      - Behavior change → update the existing requirement's wording
      - Bug fix on an existing requirement → no change needed (already documented)
      - Search the Requirement Index for overlap before adding new entries

15. **Stage and commit**:

    ```bash
    git add -A
    git commit -m "<type>(<scope>): <description>"
    ```

16. **Push**:

    ```bash
    git push -u origin HEAD
    ```

17. **Create PR** using GitKraken MCP:
    - `provider`: github
    - `source_branch`: current branch
    - `target_branch`: main
    - Title in conventional format
    - Body summarizing changes + test results

18. **Wait for CI** to pass:

    ```bash
    gh pr checks <PR_NUMBER> --watch --fail-fast
    ```

19. **Merge PR** and clean up:

    ```bash
    gh pr merge <PR_NUMBER> --squash --delete-branch
    ```

20. **Sync main**:

    ```bash
    git checkout main
    git pull origin main
    ```

21. **Verify site deploy** (if `site/`, `crates/fd-wasm/`, or `crates/fd-core/` changed):

    Wait for the `pages.yml` deploy workflow to complete:

    ```bash
    sleep 30 && gh run list --workflow=pages.yml --limit 1 --json status,conclusion
    ```

    If `conclusion` is `success`:

    **a)** Run the `/e2e` **Site Deploy Verification** tier (generic 3-check: site loads, playground visible, WASM renders).

    **b)** Run the `/e2e` **Production Feature Verification** tier — **reuse the fast-draft.com tab** from step (a). Design 2–3 feature-specific tests for the change you just deployed. Use `execute_browser_javascript` on `fast-draft.com` to make quantitative DOM/state measurements. Generic "page loads" checks do NOT satisfy this step.

    > **Skip** if the change is docs-only, CI config, or VS Code extension-only.

22. **Build & Publish VS Code extension** (if `fd-vscode/`, `crates/fd-wasm/`, `crates/fd-core/`, `crates/fd-editor/`, `crates/fd-render/`, or `tree-sitter-fd/` were changed):

    > ⚠️ **MANDATORY**: Read `.env` for `VSCE_PAT`, `VSX_PAT`, and `GEMINI_API_KEY` BEFORE publishing.
    > Never rely on interactive prompts — always pass tokens via flags.

    **Rebuild WASM** (MANDATORY if any Rust crate changed):

    ```bash
    wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm
    ```

    Then compile TypeScript:

    ```bash
    cd fd-vscode && pnpm run compile
    ```

    Then publish to **BOTH** registries (read tokens from `.env`):

    ```bash
    cd fd-vscode && pnpm vsce publish
    ```

    ```bash
    cd fd-vscode && pnpm ovsx publish -p <VSX_PAT from .env>
    ```

    > Skip publish if the change is local-only or version wasn't bumped.
    > **NEVER** publish to only one registry — both Marketplace AND Open VSX are required.

23. Report PR URL, merge status, deploy verification, and publish results to user.

---

## `/yolo` — Full Pipeline

Runs **all steps 1–23** in sequence (local + deploy).
