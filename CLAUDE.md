# CLAUDE.md - FD Project Configuration

> AI rules for FD (Fast Draft) — Rust/WASM file format + interactive canvas for drawing, design, animation.

---

## TIER 0: UNIVERSAL RULES (Always Active)

### Language Handling

- User prompts in Vietnamese → Respond in Vietnamese
- Code comments/variables → Always English

### Clean Code (MANDATORY)

Write clean code (SRP, DRY, KISS, YAGNI). Semantic names reveal intent. Functions <30 lines, max 3 args, max 2 nesting levels. Guard clauses for early returns.

### File Dependency Awareness

Before modifying ANY file:

1. Identify dependent files across crates
2. Update ALL affected files together
3. Never leave broken imports or trait bounds
4. Run `cargo check --workspace` after cross-crate changes

### Lessons Learned

Before any task, scan `docs/LESSONS.md` for pitfalls. Repeated mistake → document it. Critical lessons promoted to CLAUDE.md rules.

### Requirement Deduplication

Before proposing new requirement, search **Requirement Index** in `docs/REQUIREMENTS.md`, check `docs/CHANGELOG.md` for overlapping keywords. Similar requirement exists → **extend it**, not duplicate. Update index. Complex features → check `docs/specs/`.

### Git Workflow (MANDATORY)

- **Never commit to main** — all changes via feature branches (`feat/`, `fix/`, `refactor/`, `test/`, `docs/`)
- **PR required** — merges via PR; CI must pass
- **Sync first** — `git fetch origin main` before creating branches

> [!CAUTION]
> **NEVER stage or commit `.env`, `.env.*`, or files with secrets/tokens/API keys.**

> [!CAUTION]
> **Direct pushes to `main` blocked by pre-push hook** (`.githooks/pre-push`).
> Fresh clone: `git config core.hooksPath .githooks`

---

## TIER 1: FD STACK RULES

### Rust Patterns

| Pattern            | Apply                                                              |
| ------------------ | ------------------------------------------------------------------ |
| **Error handling** | `Result<T, String>` for parser; avoid `unwrap()` in library code   |
| **Ownership**      | Prefer borrowing over cloning; use `&str` over `String` in parsers |
| **Lifetimes**      | Minimize explicit lifetimes; let compiler infer when possible       |
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

**Testing:** Every parser feature gets round-trip test (`parse_<feature>`, `emit_<feature>`, `roundtrip_<feature>`). Edge cases: empty input, missing optional fields, nested structures.

**Keyboard Shortcuts:** Full reference in [`docs/SHORTCUTS.md`](docs/SHORTCUTS.md) — tools, edit, z-order, modifiers (⌘+drag, Alt+drag), Zen mode, Apple Pencil Pro. Source of truth: `crates/fd-editor/src/shortcuts.rs`.

### FD Format Rules

> [!IMPORTANT]
> **Code mode prioritizes AI-agent readability + accuracy over token efficiency.**
> Semantic naming = highest-impact factor for AI comprehension (arXiv 2510.02268).

| Rule                        | Description                                                                |
| --------------------------- | -------------------------------------------------------------------------- |
| **Semantic IDs**            | `@login_form` not `@rect_17` — intent over auto-generated names            |
| **Constraints over coords** | `center_in: canvas` not `x: 400 y: 300` — relationships > pixels           |
| **Accurate comments**       | `#` for context — wrong comments hurt more than no comments                |
| **Theme reuse**             | Define `theme` blocks, reference with `use:` — consistency > ad-hoc        |
| **Spec for intent**         | `spec { ... }` metadata (status, priority, accept) — structured > freeform |
| **Shorthand OK**            | `w:` / `h:` / `#FFF` are fine — unambiguous in context                     |

### Rendering Rules

| Rule              | Description                                            |
| ----------------- | ------------------------------------------------------ |
| **Vello + wgpu**  | GPU-accelerated 2D rendering                           |
| **WASM target**   | `wasm32-unknown-unknown` for web/IDE                   |
| **Feature gates** | `#[cfg(target_arch = "wasm32")]` for web-specific code |
| **60 FPS**        | Layout + paint <16ms                                    |

### Package Manager

> [!CAUTION]
> **NEVER use npm for VS Code extension. Use pnpm, npm only as fallback.**

### Browser Subagent Rule

> [!CAUTION]
> **Tab reuse STRICTLY MANDATORY.** Duplicate tabs + long sessions = exponential token burn (WebP video context-stacking).
>
> - **Subagent Tool Protocol:** Pass `ReusedSubagentId` parameter to maintain browser instance. Omission = fresh instance, floods context with duplicate videos.
> - **Strict Avoidance Prompting:** Start every subagent `Task` with: `"CRITICAL: Call list_browser_pages immediately. If target URL (*.github.dev, localhost, fast-draft.com) exists, use switch_page. NEVER use open_url or navigate unless absolutely missing. Close stray/redundant tabs."`
> - **Wait, Don't Reload:** Tab loading → `wait` up to 30s instead of opening new tab.
> - **Speed is Token-Critical:** Simple UI verifications → keep interactions short (load, verify, exit). Screenshots sufficient.

---

## TIER 2: CI/CD

### Backend Debugging (Modal)
- Debug backend tests/AI generation via Modal CLI (`modal app logs <app-name>` or `modal env`). Modal tokens in `.env`.

### Before Completing Any Task

- [ ] `cargo check --workspace` passes
- [ ] `cargo test --workspace` passes
- [ ] `cargo clippy --workspace -- -D warnings` passes
- [ ] `cargo fmt --all -- --check` passes
- [ ] No panic paths in library code (no `unwrap()` on user input)
- [ ] All dependent files updated across crates

---

## Skills

Caveman skills from `JuliusBrussee/caveman`:

- `/caveman` — terse response mode (lite/full/ultra/wenyan variants)
- `/caveman-commit` — compressed Conventional Commits messages
- `/caveman-review` — one-line PR review comments
- `/caveman:compress <file>` — compress .md memory files to save tokens
- `/caveman-help` — quick reference card