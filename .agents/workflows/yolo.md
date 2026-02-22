---
description: Full pipeline - test, build, commit, PR, and merge in one shot
---

# Yolo Workflow

> Runs the full pipeline automatically. Supports three modes:
>
> `/yolo local` — 🧪 Test → 🔨 Build → ✅ Verify Local **(STOP)**
> `/yolo deploy` — 📝 Commit → 📝 PR → 🔀 Merge → 📦 Publish Extension **(use after `/yolo local`)**
> `/yolo` — 🧪 Test → 🔨 Build → 📝 Commit → 📝 PR → 🔀 Merge → 📦 Publish Extension

// turbo-all

---

## `/yolo local` — Verify Only

1. **Lint**:

   ```bash
   cargo clippy --workspace -- -D warnings
   ```

2. **Format**:

   ```bash
   cargo fmt --all
   ```

3. **Test**:

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

4. **TypeScript tests** (if `fd-vscode/` changed):

   ```bash
   cd fd-vscode && pnpm test
   ```

5. **Report** results to user. **STOP HERE.**

---

## `/yolo deploy` — Commit + PR + Merge

> Use this after `/yolo local` has passed.

5. **Activate pre-push hook** (one-time per clone — blocks accidental pushes to `main`):

   ```bash
   git config core.hooksPath .githooks
   ```

6. **Check branch** (never commit to main):

   ```bash
   git branch --show-current
   ```

7. If on `main`, create a feature branch:

   ```bash
   git checkout -b feat/<descriptive-name>
   ```

8. **Bump Version** (if `fd-vscode/` was changed):
   - Bump the `version` field in `fd-vscode/package.json` appropriately (patch/minor/major).

9. **Stage and commit**:

   ```bash
   git add -A
   git commit -m "<type>(<scope>): <description>"
   ```

10. **Push**:

    ```bash
    git push -u origin HEAD
    ```

11. **Create PR** using GitKraken MCP:
    - `provider`: github
    - `source_branch`: current branch
    - `target_branch`: main
    - Title in conventional format
    - Body summarizing changes + test results

12. **Merge PR** and clean up:

    ```bash
    gh pr merge <PR_NUMBER> --merge --delete-branch
    ```

13. **Sync main**:

    ```bash
    git checkout main
    git pull origin main
    ```

14. **Build & Publish VS Code extension** (if `fd-vscode/`, `crates/fd-wasm/`, `crates/fd-core/`, `crates/fd-editor/`, `crates/fd-render/`, or `tree-sitter-fd/` were changed):

    > ⚠️ **MANDATORY**: Read `.env` for `VSCE_PAT`, `VSX_PAT`, and `GEMINI_API_KEY` BEFORE publishing.
    > Never rely on interactive prompts — always pass tokens via flags.

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

15. Report PR URL, merge status, and publish results to user.

---

## `/yolo` — Full Pipeline

Runs **all steps 1–14** in sequence (local + deploy).
