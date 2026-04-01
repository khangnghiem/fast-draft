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
4. **Test**: `cargo test --workspace --quiet` (Fallback to `gh cs ssh` if errors).
5. **UI Bug Verify**: Measure interaction fixes with `execute_browser_javascript` before committing.
6. **Tauri**: `cd fd-desktop/src-tauri && cargo check --quiet && cargo clippy --quiet -- -D warnings && cargo fmt -- --check`
7. **TS tests**: `cd fd-vscode && pnpm test`
8. **E2E Smoke (Quick Snapshot)**: Build WASM (`wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm --quiet && cp -a fd-vscode/webview/wasm/. site/wasm/`). Use `browser_subagent` to simply load the local site, verify it renders, and exit immediately. DO NOT run full `/e2e` interaction testing here to save token quota (short videos act like screenshots).
9. **Report** and STOP for `/yolo local`.

## `/yolo deploy`

10. **Pre-push**: `git config core.hooksPath .githooks`
11. **Check branch**: `git branch --show-current` (never commit to main)
12. **Branch**: `git checkout -b feat/<name>`
13. **Version bump**: In `fd-vscode/package.json` if needed.
14. **Docs**: Update `CHANGELOG.md` and `REQUIREMENTS.md`.
15. **Commit**: `git add -A && git commit -m "..."`
16. **Push**: `git push -u origin HEAD`
17. **PR**: Use GitKraken MCP.
18. **Wait CI**: `gh pr checks <PR_NUM> --watch --fail-fast`
19. **Merge**: `gh pr merge <PR_NUM> --squash --delete-branch`
20. **Sync**: `git checkout main && git pull origin main`
21. **Site Verify**: Wait for `pages.yml` deploy (`gh run list`).
    Use `browser_subagent` to navigate to the live site, verify the new feature visually (quick snapshot), and exit immediately. DO NOT execute full `/e2e` interaction testing to minimize WebP video length and token consumption.
22. **Publish VS Code**: Rebuild WASM, compile TS (`pnpm run compile`), publish to `vsce` and `ovsx` using `.env` tokens.
23. **Report** completion.
