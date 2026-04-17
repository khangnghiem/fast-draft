---
description: Full pipeline - test, build, commit, PR, and merge in one shot
---

# Yolo Workflow

> Runs the full pipeline automatically.
> `/yolo local` — TDD → Build → Smoke → Verify
> `/yolo deploy` — Commit → PR → Merge → Publish
> `/yolo` — Runs both

// turbo-all

## `/yolo local`

1. **Smart Skip Evaluation**:
   Check what changed: `git diff --name-only origin/main...HEAD`
   - If ONLY `docs/`, `site/*.css`, or `*.md` changed → Skip Rust Tests (4), Tauri (6), TS (7), WASM (8, 22).
   - If NO `crates/` changed → Skip Rust Tests (4), WASM build (8, 22).
   - If NO `fd-vscode/` changed → Skip VSCA publish (22).

2. **TDD (Tests)**: Write/update tests in `mod tests` for what changed.
3. **Lint & Format**: `cargo clippy --workspace --quiet -- -D warnings` and `cargo fmt --all`
4. **Test**: `cargo test --workspace --quiet`
5. **UI Bug Verify**: Measure interaction fixes visually before committing.
   - Antigravity: use `execute_browser_javascript` to inspect DOM/WASM state
   - OpenCode: write a Playwright script using `page.evaluate()` (see `tests/check_drag.mjs` for pattern)
6. **Tauri**: `cd fd-desktop/src-tauri && cargo check --quiet && cargo clippy --quiet -- -D warnings && cargo fmt -- --check`
7. **TS tests**: `cd fd-vscode && pnpm install && pnpm test`
8. **Tier 1 E2E Smoke**: Build WASM (`wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm --quiet && cp -a ../../fd-vscode/webview/wasm/. site/wasm/`).
   - Antigravity: use `browser_subagent` to load the local site and execute the Tier 1 checks from `/e2e`
   - OpenCode: `npx serve site -l 8081 &` → run Playwright test script in `tests/` (e.g. `node tests/check_wasm.mjs`) → `kill %1`
9. **Report** and STOP for `/yolo local`.

## `/yolo deploy`

10. **Pre-push**: `git config core.hooksPath .githooks`
11. **Check branch**: `git branch --show-current` (never commit to main)
12. **Branch**: `git checkout -b feat/<name>`
13. **Version bump**: In `fd-vscode/package.json` if needed, then run `node scripts/bump-version.mjs` to sync it to `site/index.html`.
14. **Docs**: Update `CHANGELOG.md` and `REQUIREMENTS.md`.
15. **Commit**: `git add -A && git commit -m "..."`
16. **Push**: `git push -u origin HEAD`
17. **PR**: `gh pr create --fill`
18. **Wait CI**: `gh pr checks $(git branch --show-current) --watch --fail-fast`
19. **Merge**: `gh pr merge $(git branch --show-current) --squash --delete-branch`
20. **Sync**: `git checkout main && git pull origin main`
21. **Site Verify**: Wait for `pages.yml` deploy (`gh run watch $(gh run list --workflow=pages.yml -L 1 --json databaseId -q ".[0].databaseId")`).
   - Antigravity: use `browser_subagent` to navigate to the live site and execute Tier 2 JS Assertions from `/e2e`
   - OpenCode: `npx serve site -l 8081 &` → run Playwright test script in `tests/` (e.g. `node tests/check_errors.mjs`) → `kill %1`
22. **Publish VS Code**: `cd fd-vscode && pnpm install && pnpm run compile && source ../.env && npx vsce publish --no-dependencies -p $VSCE_PAT && npx ovsx publish --no-dependencies -p $VSX_PAT`
23. **Report** completion.
