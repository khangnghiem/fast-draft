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
| **Theme reuse**             | Define `theme` blocks, reference with `use:` — consistency > ad-hoc        |
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

### 🌐 Browser Subagent Rule

> [!IMPORTANT]
> **Tab reuse is MANDATORY.** Before navigating anywhere, always `list_browser_pages` first.
>
> - **Subagent Tool Rule:** To actually reuse an existing tab/context across different agent turns, you MUST provide the `ReusedSubagentId` parameter when calling `browser_subagent` (using the ID from the previous browser recording). If you omit `ReusedSubagentId`, a completely fresh, duplicate browser session is spun up.
> - If a tab with the same or similar URL exists → **switch to it** (do NOT open a new tab).
> - **Codespace rule:** If any tab URL matches `*.github.dev` → that IS the codespace. Use it directly. **NEVER** navigate to `github.com/codespaces` to click "open" — this creates a duplicate tab.
> - If the codespace tab is loading/restarting, **wait up to 30 seconds** (use `wait` or retry with delays) before concluding it's unavailable.

---

## TIER 2: CI/CD

### Before Completing Any Task

- [ ] `cargo check --workspace` passes
- [ ] `cargo test --workspace` passes
- [ ] `cargo clippy --workspace -- -D warnings` passes
- [ ] `cargo fmt --all -- --check` passes
- [ ] No panic paths in library code (no `unwrap()` on user input)
- [ ] All dependent files updated across crates
