---
trigger: always_on
---

# GEMINI.md — Fast Draft Agent Surface

---

> [!CAUTION]
> GENERATED FILE — DO NOT EDIT DIRECTLY.
> Edit `.agents/shared/canonical.md` and `.agents/overrides/repo.md`, then run `npm run render:agent-surfaces`; verify with `npm run verify:agent-surfaces`.

---

## Host Adapter

Target host: Gemini CLI consumers.
Express the shared policy below with Gemini CLI conventions and wrappers.
Keep policy meaning aligned with the OpenCode and Claude surfaces.

---

## Shared Canonical Policy

### Communication

- If the user writes in Vietnamese, reply in Vietnamese.
- Keep code, identifiers, comments, and project artifacts in English unless explicitly asked otherwise.

### Clean code expectations

- Favor SRP, DRY, KISS, and YAGNI with semantic names and guard clauses.
- Micro-style limits: keep functions around 30 lines or less when practical, prefer at most 3 parameters, and keep nesting to 2 levels; allow exceptions when readability or type constraints demand it.

### Change discipline

- Before edits, identify affected crates, packages, modules, generated outputs, tests, and docs; update dependent surfaces together.
- Use host-native file/content search first; use `rg` for shell content search.
- Check `docs/LESSONS.md` for relevant pitfalls before implementation.
- Before adding or rewriting requirements, inspect `docs/REQUIREMENTS.md`, `docs/CHANGELOG.md`, and `docs/specs/`; extend existing requirements instead of duplicating them.
- Work on topic branches and reviewable PRs; never stage `.env`, tokens, credentials, or other secrets.

### Bounded exploration

- For broad discovery, set scope and budgets up front, search narrowly, read only high-value files, and stop when results stop narrowing.
- Default budget: ≤12 searches, ≤8 reads, ≤4 rounds; ask before exceeding it.
- Return evidence, confidence, files searched/read, gaps, and next queries instead of chasing exhaustive certainty.

### Rust and FD-specific rules

- Parser-facing changes should normally add `parse_<x>`, `emit_<x>`, and `roundtrip_<x>` coverage.
- Prefer explicit `Result` returns in parser/workspace code; parser code may use `Result<T, String>` when appropriate; avoid `unwrap()` on user-controlled library inputs.
- Prefer borrowed `&str` over owned `String` for parser inputs/internal views when clear.
- Keep platform-specific behavior isolated behind clear feature or target gates.
- FD authoring: prefer semantic IDs, relational constraints over brittle coordinates, shared themes/styles, truthful `#` comments, and `spec { ... }` metadata when acceptance intent matters.

### Rendering and interaction quality

- Treat visual bugs as model + layout + bounds + renderer problems; verify the layer that owns the state.
- Keep renderer/platform-specific behavior behind clear target gates such as `#[cfg(target_arch = "wasm32")]`, and preserve `<16ms` layout/paint/sync budgets for interactive canvas paths where relevant.
- Browser-level checks are expected for pointer, layout, resize, drag, hover, selection, and paint regressions.
- Keep visual verification short and focused on the changed behavior.
- Browser/agent protocol: reuse an existing browser agent/session when available and pass its reuse id; start by asking it to inspect the current page before acting, wait for user/app state instead of reloading unless requested, and keep UI checks narrowly scoped.

### Memory harness

- If `.memory/config.yml` exists, start by running `git -C ~/.config/agent-memory pull --ff-only` and `agentmem repo read-config`; continue with local memory if the pull fails and fresh cross-machine context is not required.
- For every new feature, bug, refactor, or investigation, search memory first with 2–4 concrete terms via `agentmem repo search` plus relevant project/global lessons.
- Use `.scratch/` only for ephemeral notes; promote durable lessons through `agentmem promote`, never by bypassing the scratch → project/global → canonical flow.
- `/memory-sync` is only for `~/.config/agent-memory`; keep it separate from project git operations.
- Secret hygiene applies to both the project repo and memory repo.

### Completion

- Run the relevant build, test, lint, format, or browser check for the touched area; state any skipped validation and why.
- Report changed files, commands run, command results, and remaining risks.

---

## Repo Override Appendix

### Commands

| Action | Command |
|--------|---------|
| Quick gate | `just smoke` |
| Test all | `just test` or `cargo test --workspace` |
| Single test | `cargo test -p fd-core test_name` |
| Lint | `cargo clippy --workspace -- -D warnings` |
| Format check | `cargo fmt --all -- --check` |
| Auto-fix fmt+lint | `just fix` |
| Extended tests | `just extended` (nextest + proptest) |
| Local WASM sync | `wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm --quiet && cp -a fd-vscode/webview/wasm/. site/wasm/` |
| VS Code TS | `cd fd-vscode && pnpm install && pnpm test` |
| Tauri check | `cd fd-desktop/src-tauri && cargo check && cargo clippy -- -D warnings && cargo fmt -- --check` |
| Version sync | `node scripts/bump-version.mjs` |

> **No `just wasm` or `just ci` recipe exists.** Build WASM manually. CI lives in `.github/workflows/ci.yml`.

### Workspace map

- Rust crates: `fd-core` (parser/emitter/layout/lint/format/score), `fd-editor` (SyncEngine/tools/undo/input), `fd-render` (DrawBackend/hit testing/Vello), `fd-wasm` (FdCanvas/Canvas2D/SVG/HTML export), `fd-lsp`, `fdraft` CLI.
- Dependency flow: `fd-core → fd-editor → fd-wasm`, `fd-core → fd-render → fd-wasm`, `fd-core → fd-lsp`.
- Frontend/tools: `site/` web playground (`app.js`, `canvas-core/`), `fd-vscode/` extension (`src/extension.ts`, `webview/`), `fd-desktop/` Tauri app, `fd-mcp/` TypeScript MCP server, `fd-shell/` stub, `crates/site/` wasm-pack output only.

### WASM build sync

- Local recommended flow builds `fd-vscode/webview/wasm` first, then copies to `site/wasm`; do not skip the copy or the site can serve stale WASM:

```sh
wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm --quiet
cp -a fd-vscode/webview/wasm/. site/wasm/
```

- CI workflows build directly to `site/wasm` (`wasm-pack build crates/fd-wasm --target web --out-dir ../../site/wasm`). Keep both output dirs in sync when changing local artifacts.

### Git and secrets

- Never push to `main`; use branch → PR → merge via `gh pr merge`.
- Before branch or PR prep, run `git fetch origin main` so work starts from current `main`.
- Branch prefixes: `feat/`, `fix/`, `refactor/`, `test/`, `docs/`.
- Fresh clone hook setup: `git config core.hooksPath .githooks`.
- Direct pushes to `main` are blocked by `.githooks/pre-push`.

### Package managers

| Directory | Manager |
|-----------|---------|
| `fd-vscode/` | pnpm (**never npm**) |
| `fd-desktop/` | npm |
| `site/` | npm |
| `tree-sitter-fd/` | npm |
| Root `package.json` | npm (Playwright only) |

### Key gotchas

1. **`wasm-opt -O2` strips Canvas2D calls** — keep `-O1` in `crates/fd-wasm/Cargo.toml`.
2. **Cache-bust all static assets** — every `import`, `modulepreload`, and `<script>` needs `?v=`; CI replaces it with the git SHA on deploy.
3. **`target/` is huge** — never copy the whole project root out of a remote workspace.
4. **Bounds ownership chain** — JS `measureText` → SyncEngine mutation → `resolve_subtree` → `resolve_layout`; lower-authority sources must not overwrite higher-authority bounds.
5. **Assigning `canvas.width` clears pixels** — repaint synchronously after resize.
6. **SVG/image pointer drags need `e.preventDefault()` on `pointerdown`** or the browser hijacks dragging.
7. **DOM is truth for current visual state; localStorage is truth for user intent** — do not swap them.
8. **Rebuild the spatial index after bounds mutations** unless rendering is also skipped.
9. **Hover state comes from pointer move** — do not set `hovered_id` on pointer down or up.
10. **Snapshot undo can clobber bounds** — use `Command::Single` for single-action operations instead of batch snapshots.

### Testing and verification

- Local pre-completion checklist when relevant: `cargo check --workspace`, `cargo test --workspace`, `cargo clippy --workspace -- -D warnings`, and `cargo fmt --all -- --check`.
- Parser features: add `parse_<x>`, `emit_<x>`, and `roundtrip_<x>` coverage.
- Canvas interaction regressions usually need browser E2E; unit tests miss much of the pointer → WASM → render path.
- OpenCode browser flow: run `npx serve site -l 8081`, then `node tests/<script>.mjs`.
- Existing browser scripts: `tests/check_errors.mjs`, `tests/check_drag.mjs`, `tests/check_wasm.mjs`.
- New browser scripts should follow the existing Playwright `import { chromium } from 'playwright'` pattern; use `page.evaluate()` for assertions and `page.screenshot()` only when visual evidence matters.
- VS Code extension tests: `cd fd-vscode && pnpm test` (vitest).
- `fd-mcp` does not currently expose a test script.

### Useful docs and workflows

- `docs/LESSONS.md` — recurring project pitfalls.
- `docs/ARCHITECTURE.md` — crate map, data flow, key types, rendering pipeline.
- `docs/REQUIREMENTS.md` — feature specs.
- `docs/CHANGELOG.md` — recent requirement and behavior changes.
- `docs/SHORTCUTS.md` — shortcut docs; source of truth is `crates/fd-editor/src/shortcuts.rs`.
- `.agents/workflows/yolo.md` — full OpenCode yolo pipeline (TDD → build → PR → merge → verify).
- Backend debugging: use `npx wrangler pages dev` or Cloudflare dashboard logs for `functions/api/ai.js`; for stuck agents see `docs/observability.md` and run `node scripts/observer-dump.mjs --stuck-only --format table`.

### Memory Workflow — Fast Draft specifics

**Write path:**
1. Agent writes lesson to `memory/lessons.md` (L2) or `~/.config/agent-memory/global/` (L4)
2. `omega backup --format=markdown` exports OMEGA index to Markdown
3. `git commit && git push` for cross-machine sync

**Read path:**
1. Session starts
2. OMEGA imports Markdown files into SQLite index
3. Agent queries OMEGA for semantic search

**Migration:**
- Run `./scripts/migrate-agentmem-to-omega.sh` once per machine
- Archive old `agentmem` CLI after migration is verified

**Project ID:** `khangnghiem__fast-draft`; config: `.memory/config.yml`; canonical scope includes `AGENTS.md`, key `docs/`, `docs/specs/`, and `openspec/`.
- Per-project memory: `~/.config/agent-memory/projects/khangnghiem__fast-draft/`.
- CLI: `omega` (replaces `agentmem`); see `memory/config.yml` for OMEGA configuration.
- Route Fast Draft lessons (bounds ownership, pointer hijack, WASM sync) to the project lessons subtree unless they generalize.
- `/memory-status` is read-only; `/memory-sync` syncs only `~/.config/agent-memory`, never project changes.
- `.github/workflows/memory-scratch-guard.yml` rejects PRs that add files under `.scratch/`.

### User shortcuts

- `yolo <feature>` → follow `.agents/workflows/yolo.md`.
- `smoke` → run `just smoke`.
- Local caveman helpers: `/caveman`, `/caveman-help`, `/caveman-review`, `/caveman-commit`, `/caveman:compress <file>`.
- `/memory-status` → inspect Fast Draft memory state without writes.
- `/memory-sync` → push durable agent-memory changes only; never project changes.
