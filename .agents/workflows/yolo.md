---
description: Full pipeline - test, build, commit, PR, and merge in one shot
---

# Yolo Workflow

> Runs the full pipeline automatically. Supports three modes:
>
> `/yolo local` — 🧪 TDD → 🔨 Build → 🌐 E2E UX → ✅ Verify Local **(STOP)**
> `/yolo deploy` — 📝 Commit → 📝 PR → 🔀 Merge → 📦 Publish Extension **(use after `/yolo local`)**
> `/yolo` — 🧪 TDD → 🔨 Build → 🌐 E2E UX → 📝 Commit → 📝 PR → 🔀 Merge → 📦 Publish Extension

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

5. **TypeScript tests** (if `fd-vscode/` changed):

   ```bash
   cd fd-vscode && pnpm test
   ```

6. **E2E UX browser testing** (if `crates/fd-wasm/`, `crates/fd-core/`, `crates/fd-editor/`, `crates/fd-render/`, or `fd-vscode/webview/` changed):

   Run the full `/e2e-ux` workflow using the browser subagent:
   - Build WASM first if Rust crates changed:

     ```bash
     wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm
     ```

   - Open the Codespace in browser via `gh codespace code -c <codespace-name> --web`
   - Execute all 8 phases from `/e2e-ux` (Canvas Load, Drawing Tools, Selection, Inline Editing, Navigation, Panels, Bidi Sync, Keyboard Shortcuts)
   - Screenshot and report results per phase
   - **If any phase fails**: Fix the issue before proceeding to deploy

   > **Skip only if** the change is purely Rust internals with no canvas/UI impact (e.g., parser refactors covered by unit tests).

7. **Report** results to user. **STOP HERE.**

---

## `/yolo deploy` — Commit + PR + Merge

> Use this after `/yolo local` has passed.

8. **Activate pre-push hook** (one-time per clone — blocks accidental pushes to `main`):

   ```bash
   git config core.hooksPath .githooks
   ```

9. **Check branch** (never commit to main):

   ```bash
   git branch --show-current
   ```

10. If on `main`, create a feature branch:

```bash
git checkout -b feat/<descriptive-name>
```

11. **Bump Version** (if `fd-vscode/` was changed):
    - Bump the `version` field in `fd-vscode/package.json` appropriately (patch/minor/major).

12. **Update docs** (MANDATORY — both files, every time):
    - `docs/CHANGELOG.md` — add entry under the current version section for each meaningful change
    - `REQUIREMENTS.md` — for **every** CHANGELOG entry, check if it introduces, extends, or modifies a requirement:
      - New feature → add a new `R*.N` entry and update the Requirement Index
      - Behavior change → update the existing requirement's wording
      - Bug fix on an existing requirement → no change needed (already documented)
      - Search the Requirement Index for overlap before adding new entries

13. **Stage and commit**:

    ```bash
    git add -A
    git commit -m "<type>(<scope>): <description>"
    ```

14. **Push**:

    ```bash
    git push -u origin HEAD
    ```

15. **Create PR** using GitKraken MCP:
    - `provider`: github
    - `source_branch`: current branch
    - `target_branch`: main
    - Title in conventional format
    - Body summarizing changes + test results

16. **Merge PR** and clean up:

    ```bash
    gh pr merge <PR_NUMBER> --merge --delete-branch
    ```

17. **Sync main**:

    ```bash
    git checkout main
    git pull origin main
    ```

18. **Build & Publish VS Code extension** (if `fd-vscode/`, `crates/fd-wasm/`, `crates/fd-core/`, `crates/fd-editor/`, `crates/fd-render/`, or `tree-sitter-fd/` were changed):

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

19. Report PR URL, merge status, and publish results to user.

---

## `/yolo` — Full Pipeline

Runs **all steps 1–19** in sequence (local + deploy).
