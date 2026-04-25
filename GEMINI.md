---
trigger: always_on
---

# GEMINI.md — Fast Draft Agent Surface

---

> [!CAUTION]
> GENERATED FILE — DO NOT EDIT DIRECTLY.
> Edit `.agents/shared/canonical.md` and `.agents/overrides/repo.md`, then rerun the renderer.

---

## Host Adapter

Target host: Gemini CLI consumers.
Express the shared policy below with Gemini CLI conventions and wrappers.
Keep policy meaning aligned with the OpenCode and Claude surfaces.

---

## Shared Canonical Policy

### Language and communication

- If the user writes in Vietnamese, reply in Vietnamese.
- Keep source code, identifiers, comments, and structured project artifacts in English unless the user explicitly asks otherwise.

### Clean code expectations

- Favor SRP, DRY, KISS, and YAGNI.
- Use semantic names that reveal intent.
- Prefer small functions, limited argument lists, shallow nesting, and guard clauses.
- Fix root causes instead of layering one-off patches.

### Dependency-aware changes

Before changing any file:

1. Identify dependent crates, packages, modules, tests, and docs.
2. Update all affected surfaces together.
3. Never leave broken imports, trait bounds, types, or generated outputs behind.
4. After cross-boundary changes, run the relevant validation for the impacted area.

### Lessons and requirement hygiene

- Check `docs/LESSONS.md` for relevant pitfalls before implementation.
- If you uncover a repeated pitfall, document it so the next change starts with the lesson.
- Before adding or rewriting a requirement, search `docs/REQUIREMENTS.md`, `docs/CHANGELOG.md`, and `docs/specs/` first.
- If an existing requirement already covers the behavior, extend it instead of duplicating it.

### Search tool hygiene

- Prefer the host-native content-search tool when searching file contents.
- When shell-based content search is necessary, use `rg` instead of `grep`.
- Use shell `grep` only when `rg` is unavailable or a specific environment constraint requires it, and state the reason briefly.

### Branch, review, and secret safety

- Never work directly on `main`.
- Use a topic branch and land changes through reviewable pull requests.
- Sync from the latest `main` when branching or preparing a pull request.
- Never stage or commit `.env` files, tokens, API keys, or other secrets.

### Rust and workspace patterns

| Pattern | Expectation |
| --- | --- |
| Error handling | Prefer explicit `Result` returns in parser and workspace code, and avoid `unwrap()` on user-controlled paths in library code. |
| Ownership | Prefer borrowing over cloning when it keeps the code clear. |
| Lifetimes | Let the compiler infer lifetimes unless explicit annotations improve correctness or readability. |
| Generics | Use generics only when they add real leverage; prefer concrete types otherwise. |
| Platform gates | Keep platform-specific behavior isolated behind clear feature or target gates. |

- Parser-facing changes should normally add `parse_<x>`, `emit_<x>`, and `roundtrip_<x>` coverage.

### FD authoring rules

> [!IMPORTANT]
> Code-oriented output should optimize for agent readability and correctness before token compression.

| Rule | Guidance |
| --- | --- |
| Semantic IDs | Prefer intent-rich identifiers such as `@login_form` over opaque auto-numbered names. |
| Constraints over coords | Prefer relational layout constraints over brittle pixel-only positioning when the design allows it. |
| Accurate comments | Keep `#` comments truthful and useful; stale comments are worse than none. |
| Theme reuse | Reuse shared theme or style definitions instead of repeating ad-hoc values. |
| Structured intent | Use `spec { ... }` metadata when intent, status, or acceptance details matter. |
| Clear shorthand | Short forms are fine when they stay unambiguous in context. |

### Rendering and interaction quality

- Treat visual bugs as multi-layer problems: confirm model, layout, bounds, and renderer all agree.
- Preserve responsive interaction and stable visual state across resize, drag, hover, and selection flows.
- Prefer browser-level verification for pointer, layout, resize, drag, and paint regressions.
- Keep visual verification short and focused. Reuse an existing browser session or page when the host supports it.
- If a browser rule must reach a secondary executor, place it directly in the verification instructions instead of relying only on a higher-level policy file.

### Completion checklist

- Relevant build, test, lint, and format checks passed, or were skipped with a stated reason.
- Tests were added or updated when behavior changed materially.
- No broken cross-file dependencies remain.
- No avoidable panic paths remain on user-controlled library inputs.
- The completion report clearly states what changed and what was validated.

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

### Docs and workflow map

- `docs/LESSONS.md` — hard-won bug fixes and recurring pitfalls
- `docs/ARCHITECTURE.md` — crate map, data flow, key types, rendering pipeline
- `docs/REQUIREMENTS.md` — feature spec with status tags
- `docs/SHORTCUTS.md` — keyboard shortcuts; source of truth is `crates/fd-editor/src/shortcuts.rs`
- `.agents/workflows/yolo.md` — full yolo pipeline (TDD → build → PR → merge → verify)
- `.agents/workflows/` generally use dual-path format; look for `Antigravity:` and `OpenCode:` labels where present

### User shortcuts

- `yolo <feature>` → follow `.agents/workflows/yolo.md`
- `smoke` → run `just smoke`
