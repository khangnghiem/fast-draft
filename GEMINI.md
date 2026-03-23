---
trigger: always_on
---

# GEMINI.md - FD Project Configuration

> AI behavior rules for FD (Fast Draft) — a Rust/WASM file format and interactive canvas for drawing, design, and animation.

---

## TIER 0: UNIVERSAL RULES (Always Active)

### 🌐 Language Handling

- User prompts in Vietnamese → Respond in Vietnamese
- Code comments/variables → Always English

### 🧹 Clean Code (MANDATORY)

Write clean code (SRP, DRY, KISS, YAGNI). Use semantic names that reveal intent. Keep functions <30 lines, max 3 args, max 2 nesting levels. Guard clauses for early returns.

### 📁 File Dependency Awareness

Before modifying ANY file:

1. Identify dependent files across crates
2. Update ALL affected files together
3. Never leave broken imports or trait bounds
4. Run `cargo check --workspace` after cross-crate changes

### 🧠 Lessons Learned

Before starting any task, scan `docs/LESSONS.md` for relevant pitfalls. After encountering a repeated mistake, run `/learn` to document it. Critical lessons get promoted to GEMINI.md rules.

### 📋 Requirement Deduplication

Before proposing any new requirement, search the **Requirement Index** at the bottom of `docs/REQUIREMENTS.md` and check `docs/CHANGELOG.md` for overlapping keywords. If a similar requirement exists, **extend it** instead of creating a duplicate. Always update the index when adding new requirements. For complex features, check `docs/specs/` for detailed behavior specifications.

### 🔀 Git Workflow (MANDATORY)

- **Never commit to main** — all changes via feature branches (`feat/`, `fix/`, `refactor/`, `test/`, `docs/`)
- **PR required** — all merges via Pull Request; CI must pass
- **Sync first** — always `git fetch origin main` before creating branches

> [!CAUTION]
> **NEVER stage or commit `.env`, `.env.*`, or any file containing secrets, tokens, or API keys.**

> [!CAUTION]
> **Direct pushes to `main` are blocked by a pre-push git hook** (`.githooks/pre-push`).
> On a fresh clone, run: `git config core.hooksPath .githooks` to activate.

> [!CAUTION]
> **NEVER use `git push --force` or `git push --force-with-lease`.** If there are conflicts, resolve them with `git pull --rebase` or a merge commit. To clean up commit history, use squash merge on the PR.

### 🌐 Browser Subagent (MANDATORY)

- **Reuse open tabs (CRITICAL)** — before calling `browser_subagent`, check the Browser State metadata for existing tabs matching the target hostname. If a matching tab exists:
  1. Pass the **Page ID** to the subagent in the Task description
  2. Instruct the subagent to use `navigate_browser` on that Page ID — **NEVER** `open_browser_url`
  3. Only use `open_browser_url` when **zero** tabs match the target hostname
  - **Template phrase** to include in every subagent Task: _"An existing tab for [hostname] is already open (Page ID: [ID]). Navigate within that tab using navigate_browser. Do NOT open a new tab."_
- **Includes Codespaces** — the same rule applies to GitHub Codespace tabs (`*.github.dev`). Never open a duplicate Codespace tab.
- **Small viewport BEFORE subagent** — resize the browser window to **900×600** as the **first action** inside every `browser_subagent` task, before any other interaction. Recordings capture every frame at viewport resolution; 3008×1575 produces files ~25× larger than 900×600. Never rely on resizing only before screenshots — the recording is already bloated by then.
- **RecordingName convention** — use `{tier}_{phase}` format: `smoke_canvas`, `full_draw_select`, `deploy_verify`. Descriptive names make it easy to audit and clean up large recordings.
- **Minimize subagent duration** — keep subagent tasks focused and fast. Long idle time inside a subagent inflates recording size. Return immediately after the last action.
- **Clean up old recordings** — before E2E runs, delete recordings older than 1 hour: `find ~/.gemini/antigravity/brain/ -name "*.webp" -mmin +60 -delete 2>/dev/null`.

---

## TIER 1: FD STACK RULES

### 🦀 Rust Patterns

| Pattern            | Apply                                                              |
| ------------------ | ------------------------------------------------------------------ |
| **Error handling** | `Result<T, String>` for parser; avoid `unwrap()` in library code   |
| **Ownership**      | Prefer borrowing over cloning; use `&str` over `String` in parsers |
| **Lifetimes**      | Minimize explicit lifetimes; let the compiler infer when possible  |
| **Generics**       | Use sparingly; concrete types when generic adds no value           |
| **Feature flags**  | Gate platform-specific code behind features (`wasm`, `native`)     |

**Crate Structure:**

```
crates/
├── fd-core/       # Data model, parser, emitter, layout solver
│   └── src/
│       ├── model.rs    # SceneGraph, NodeKind, Style, Animation
│       ├── parser.rs   # winnow-based .fd → SceneGraph
│       ├── emitter.rs  # SceneGraph → .fd text
│       ├── layout.rs   # Constraint solver
│       └── id.rs       # NodeId interning via lasso
├── fd-render/     # Vello/wgpu 2D renderer
│   └── src/
│       ├── canvas.rs   # GPU surface setup
│       ├── paint.rs    # Graph → draw commands
│       └── hit.rs      # Point → node lookup
└── fd-editor/     # Bidirectional editor engine
    └── src/
        ├── sync.rs     # Canvas ↔ Text sync engine
        ├── tools.rs    # Select, Rect, Pen tools
        ├── commands.rs # Undo/redo stack
        └── input.rs    # Input event abstraction
```

**Testing:** Every parser feature gets a round-trip test (`parse_<feature>`, `emit_<feature>`, `roundtrip_<feature>`). Test edge cases: empty input, missing optional fields, nested structures.

**Keyboard Shortcuts:** Complete reference in [`docs/SHORTCUTS.md`](docs/SHORTCUTS.md) — tools, edit, z-order, modifiers (⌘+drag, Alt+drag), Zen mode, Apple Pencil Pro. Source of truth: `crates/fd-editor/src/shortcuts.rs`.

### 📝 FD Format Rules

> [!IMPORTANT]
> **Code mode prioritizes AI-agent readability and accuracy over token efficiency.**
> Semantic naming is the single highest-impact factor for AI comprehension (arXiv 2510.02268).

| Rule                        | Description                                                                |
| --------------------------- | -------------------------------------------------------------------------- |
| **Semantic IDs**            | `@login_form` not `@rect_17` — intent over auto-generated names            |
| **Constraints over coords** | `center_in: canvas` not `x: 400 y: 300` — relationships > pixels           |
| **Accurate comments**       | `#` for context — wrong comments hurt more than no comments                |
| **Style reuse**             | Define `style` blocks, reference with `use:` — consistency > ad-hoc        |
| **Spec for intent**         | `spec { ... }` metadata (status, priority, accept) — structured > freeform |
| **Shorthand OK**            | `w:` / `h:` / `#FFF` are fine — unambiguous in context                     |

### 🎨 Rendering Rules

| Rule              | Description                                            |
| ----------------- | ------------------------------------------------------ |
| **Vello + wgpu**  | GPU-accelerated 2D rendering                           |
| **WASM target**   | `wasm32-unknown-unknown` for web/IDE                   |
| **Feature gates** | `#[cfg(target_arch = "wasm32")]` for web-specific code |
| **60 FPS**        | Layout + paint must complete in <16ms                  |

### 📦 Package Manager

> [!CAUTION]
> **NEVER use npm for VS Code extension. Always use pnpm if possible, npm only as fallback.**

### 🔄 DOM vs localStorage State

> [!IMPORTANT]
> **DOM = current visual state. localStorage = user intent.**
> When preserving current position (minimize toggle, reclamp, resize), read from DOM (`classList`, `getBoundingClientRect()`).
> When restoring user preference (page load, clear state), read from localStorage.
> Runtime overrides (auto-overflow, reclamp, panel toggle) can silently diverge DOM from localStorage — never assume they match.

---

## TIER 2: CI/CD

### 🌐 Site & Domain

| Fact | Value |
| ---- | ----- |
| **Live URL** | [https://fast-draft.com](https://fast-draft.com) |
| **Hosting** | Cloudflare Pages (free, 330+ edge PoPs) |
| **DNS** | Cloudflare — CNAME `@` → `fast-draft.pages.dev`, proxy **ON** |
| **Source** | `site/` directory (index.html, style.css, app.js, wasm/) |
| **Headers** | `site/_headers` — WASM cache (1yr immutable) + security headers |
| **Deploy trigger** | Auto on push to `main` via `.github/workflows/pages.yml` |
| **WASM build** | `wasm-pack build crates/fd-wasm --target web --out-dir ../../site/wasm` |
| **Secrets** | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in GitHub repo secrets |

### ⚙️ CI/CD Workflows

| Workflow | Trigger | Purpose |
| -------- | ------- | ------- |
| `ci.yml` | push/PR to `main` | Rust check + test + clippy + fmt, WASM build, VS Code extension compile |
| `pages.yml` | push to `main` | Build WASM → deploy to Cloudflare Pages |
| `release.yml` | `v*` tag | CI gate → VS Code ext publish + fd-lsp binaries + Zed ext → GitHub Release |

All workflows use `Swatinem/rust-cache@v2` with shared cache keys (`ci`, `wasm`).

> [!CAUTION]
> **Never delete or modify `site/_headers`.** It controls WASM caching and security response headers.

### Before Completing Any Task

- [ ] `cargo check --workspace` passes
- [ ] `cargo test --workspace` passes
- [ ] `cargo clippy --workspace -- -D warnings` passes
- [ ] `cargo fmt --all -- --check` passes
- [ ] No panic paths in library code (no `unwrap()` on user input)
- [ ] All dependent files updated across crates
- [ ] If a **big new feature** was completed, add a phase/check to `/e2e` workflow to cover it
