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
| Build WASM | `wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm --quiet && cp -a fd-vscode/webview/wasm/. site/wasm/` |
| VS Code TS | `cd fd-vscode && pnpm install && pnpm test` |
| Tauri check | `cd fd-desktop/src-tauri && cargo check && cargo clippy -- -D warnings && cargo fmt -- --check` |
| Version sync | `node scripts/bump-version.mjs` |

> **No `just wasm` or `just ci` recipe exists.** WASM must be built manually with the command above. CI lives in `.github/workflows/ci.yml`.

### Architecture snapshot

**Rust crates** (workspace `Cargo.toml`):

- `fd-core` — SceneGraph DAG (petgraph), parser (winnow), emitter, layout solver, lint, format, score
- `fd-editor` — SyncEngine, tools, undo/redo, shortcuts, input
- `fd-render` — DrawBackend trait, hit testing, Vello/wgpu paint (unused in WASM)
- `fd-wasm` — WASM bridge (`FdCanvas`), Canvas2D renderer, SVG/HTML export
- `fd-lsp` — Language Server (diagnostics, hover, completion, symbols)
- `fdraft` — CLI binary

**Dependency flow**: `fd-core → fd-editor → fd-wasm`, `fd-core → fd-render → fd-wasm`, `fd-core → fd-lsp`

**Frontend and tools**:

- `site/` — web playground (vanilla JS, no framework); `app.js` is entry and `canvas-core/` is shared ES module code
- `fd-vscode/` — VS Code extension (TypeScript); `src/extension.ts` is the host and `webview/` is the canvas UI
- `fd-desktop/` — Tauri v2 app wrapping `site/`
- `fd-mcp/` — MCP server (TypeScript) for AI agent integration
- `fd-shell/` — stub only
- `crates/site/` — wasm-pack output directory, not a Rust crate

### WASM build sync rule

Both output directories must stay in sync. **Never skip the copy step** or the site will serve stale WASM:

```
wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm --quiet
cp -a fd-vscode/webview/wasm/. site/wasm/
```

### Git workflow specifics

- Never push to `main`; use branch → PR → merge via `gh pr merge`.
- Branch prefixes: `feat/`, `fix/`, `refactor/`, `test/`, `docs/`
- Fresh clone hook setup: `git config core.hooksPath .githooks`
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
2. **Cache-bust all static assets** — every `import`, `modulepreload`, and `<script>` needs a `?v=` query string; CI replaces it with the git SHA on deploy.
3. **`target/` is huge** — never copy the whole project root out of a remote workspace.
4. **Bounds ownership chain** — JS `measureText` → SyncEngine mutation → `resolve_subtree` → `resolve_layout`; never let a lower-authority source overwrite a higher one.
5. **Assigning `canvas.width` clears pixels** — repaint synchronously after resize.
6. **Pointer-driven drag interactions on SVG or image content need `e.preventDefault()` on `pointerdown`** or the browser hijacks drag behavior.
7. **DOM is truth for current visual state; localStorage is truth for user intent** — do not swap them.
8. **Rebuild the spatial index after bounds mutations** unless rendering is also skipped.
9. **Hover state comes from pointer move** — do not set `hovered_id` on pointer down or up.
10. **Snapshot undo can clobber bounds** — use `Command::Single` for single-action operations instead of batch snapshots.

### Testing and verification

- Rust parser features should get `parse_<x>`, `emit_<x>`, and `roundtrip_<x>` coverage.
- Canvas interaction regressions usually need browser E2E; unit tests often miss the pointer → WASM → render path.
- VS Code extension tests: `cd fd-vscode && pnpm test` (vitest)
- `fd-mcp` does not currently expose a test script.

### E2E (browser) testing

| Agent | Method |
|-------|--------|
| Antigravity | `browser_subagent` with tab reuse via `ReusedSubagentId` |
| OpenCode | Playwright scripts in `tests/` — `npx serve site -l 8081` then `node tests/<script>.mjs` |

**Existing browser scripts**: `tests/check_errors.mjs`, `tests/check_drag.mjs`, `tests/check_wasm.mjs`

**Typical local browser flow**:

1. `npx serve site -l 8081`
2. `node tests/<script>.mjs`

When adding a new browser script, follow the existing `import { chromium } from 'playwright'` pattern. Use `page.evaluate()` for assertions and `page.screenshot()` for visual checks.

### Backend debugging

- Use `npx wrangler pages dev` or the Cloudflare dashboard to inspect logs for `functions/api/ai.js`.
- Agent stuck? See `docs/observability.md` and run `node scripts/observer-dump.mjs --stuck-only --format table`.

### Docs and workflow map

- `docs/LESSONS.md` — hard-won bug fixes and recurring pitfalls
- `docs/ARCHITECTURE.md` — crate map, data flow, key types, rendering pipeline
- `docs/REQUIREMENTS.md` — feature spec with status tags
- `docs/SHORTCUTS.md` — keyboard shortcuts; source of truth is `crates/fd-editor/src/shortcuts.rs`
- `.agents/workflows/yolo.md` — full yolo pipeline (TDD → build → PR → merge → verify)
- `.agents/workflows/` generally use dual-path format; look for `Antigravity:` and `OpenCode:` labels where present

### Memory harness — Fast Draft specifics

- **Project ID**: `khangnghiem__fast-draft`
- **Config**: [`.memory/config.yml`](../../.memory/config.yml) (committed). Canonical scope = `AGENTS.md`, `docs/{ARCHITECTURE,REQUIREMENTS,LESSONS,SHORTCUTS,CHANGELOG}.md`, `docs/specs/`, `openspec/`. `web_capture_target: project`.
- **Per-project subtree**: `~/.config/agent-memory/projects/khangnghiem__fast-draft/` (lessons, sessions, drafts, transcripts, web, attachments, inbox).
- **CLI**: `agentmem` alias → `~/.config/agent-memory/bin/agentmem`. MCP wrapper: `~/.config/agent-memory/bin/agentmem-mcp` (stdio).
- **Lesson routing**: prefer the per-project `lessons/` for fast-draft-internal pitfalls (bounds ownership chain, pointer-event hijack, WASM build sync). Promote to global only when the pattern generalizes.
- **Automatic retrieval**: at session start, pull agent-memory and read config; before planning any new feature/fix, search canonical docs and project/global lessons using task keywords.
- **Memory commands**: OpenCode-native prompts live in `.opencode/commands/`; Claude Code prompts live in `.claude/commands/`, with matching Claude skills in `.claude/skills/`. `/memory-status` is read-only state inspection. `/memory-sync` syncs only `~/.config/agent-memory`; keep project `/sync-push` separate.
- **First-time setup**: see [`MEMORY_INIT.md`](../../MEMORY_INIT.md) for the project-agnostic adoption guide. The `~/.config/agent-memory/projects/khangnghiem__fast-draft/README.md` documents fast-draft-specific quirks.
- **CI guard**: `.github/workflows/memory-scratch-guard.yml` rejects PRs that add files under `.scratch/`.

### User shortcuts

- `yolo <feature>` → follow `.agents/workflows/yolo.md`
- `smoke` → run `just smoke`
- `/memory-status` → inspect Fast Draft memory state without writes
- `/memory-sync` → push durable agent-memory changes only; never project changes
