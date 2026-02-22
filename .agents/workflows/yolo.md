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

4. **Report** results to user. **STOP HERE.**

---

## `/yolo deploy` — Commit + PR + Merge

> Use this after `/yolo local` has passed.

5. **Check branch** (never commit to main):

   ```bash
   git branch --show-current
   ```

6. If on `main`, create a feature branch:

   ```bash
   git checkout -b feat/<descriptive-name>
   ```

7. **Bump Version** (if `fd-vscode/` was changed):
   - Bump the `version` field in `fd-vscode/package.json` appropriately (patch/minor/major).

8. **Stage and commit**:

   ```bash
   git add -A
   git commit -m "<type>(<scope>): <description>"
   ```

9. **Push**:

   ```bash
   git push -u origin HEAD
   ```

10. **Create PR** using GitKraken MCP:
    - `provider`: github
    - `source_branch`: current branch
    - `target_branch`: main
    - Title in conventional format
    - Body summarizing changes + test results

11. **Merge PR** and clean up:

    ```bash
    gh pr merge <PR_NUMBER> --merge --delete-branch
    ```

12. **Sync main**:

    ```bash
    git checkout main
    git pull origin main
    ```

13. **Build & Publish VS Code extension** (if `fd-vscode/` was changed):

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

14. Report PR URL, merge status, and publish results to user.

---

## `/yolo` — Full Pipeline

Runs **all steps 1–14** in sequence (local + deploy).
