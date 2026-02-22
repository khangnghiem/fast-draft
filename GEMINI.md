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

| Principle | Rule                                                 |
| --------- | ---------------------------------------------------- |
| **SRP**   | Single Responsibility — each function does ONE thing |
| **DRY**   | Don't Repeat Yourself — extract duplicates           |
| **KISS**  | Keep It Simple — simplest solution that works        |
| **YAGNI** | You Aren't Gonna Need It — no unused features        |

**Naming:**
| Element | Convention |
|---------|------------|
| Variables | Reveal intent: `node_count` not `n` |
| Functions | Verb + noun: `parse_node()` not `node()` |
| Booleans | Question form: `is_root`, `has_children` |
| Types | PascalCase: `SceneNode`, `NodeKind` |
| Constants | SCREAMING_SNAKE: `MAX_DEPTH` |

**Functions:**

- Max 30 lines, prefer 10-15
- Max 3 arguments, prefer 0-2
- Guard clauses for early returns
- Max 2 levels of nesting

### 📁 File Dependency Awareness

Before modifying ANY file:

1. Identify dependent files across crates
2. Update ALL affected files together
3. Never leave broken imports or trait bounds
4. Run `cargo check --workspace` after cross-crate changes

### 🔀 Git Workflow (MANDATORY)

| Rule                     | Description                                             |
| ------------------------ | ------------------------------------------------------- |
| **Never commit to main** | All changes go through feature branches                 |
| **Branch naming**        | `feat/`, `fix/`, `refactor/`, `test/`, `docs/` prefixes |
| **PR required**          | All merges via Pull Request                             |
| **CI must pass**         | Never force-push or bypass checks                       |
| **Sync before branch**   | Always `git fetch origin main` before creating branches |

**Branch Flow:**

```
main ← PR ← feature-branch ← your commits
```

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

**Testing:**

- Every parser feature gets a round-trip test
- Test names: `parse_<feature>`, `emit_<feature>`, `roundtrip_<feature>`
- Use `assert_eq!` with descriptive messages
- Test edge cases: empty input, missing optional fields, nested structures

### 📝 FD Format Rules

> [!IMPORTANT]
> **Code mode prioritizes AI-agent readability and accuracy over token efficiency.**
> Use full, explicit property names so LLMs and code tools parse `.fd` files without ambiguity.
> Token efficiency remains a secondary goal — keep files concise where it doesn't hurt clarity.

| Rule                        | Description                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| **Explicit names**          | Use `width:` not `w:`, `height:` not `h:` — clarity over brevity |
| **Full hex colors**         | Use `#FFFFFF` not `#FFF` — unambiguous for parsers and agents    |
| **Constraints over coords** | `center_in: canvas` not `x: 400 y: 300`                          |
| **Style reuse**             | Define `style` blocks, reference with `use:`                     |
| **Semantic IDs**            | `@login_form` not `@rect_17`                                     |
| **Comments**                | `#` prefix for documentation                                     |

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

---

## TIER 2: WORKFLOWS (Slash Commands)

| Command   | Purpose                                  | When to Use                   |
| --------- | ---------------------------------------- | ----------------------------- |
| `/spec`   | Requirements + acceptance criteria       | Before design, define scope   |
| `/design` | UI/UX mockups + specs                    | Before implementation         |
| `/uiux`   | UI/UX design with professional standards | Visual design work            |
| `/test`   | Test generation                          | Write tests before code (TDD) |
| `/build`  | Build + test workspace                   | Implementation + verification |
| `/commit` | Stage + commit changes                   | After successful build        |
| `/pr`     | Create Pull Request                      | Ready to merge to main        |
| `/debug`  | Systematic debugging                     | Bug investigation             |
| `/yolo`   | Full pipeline (test→build→commit→pr)     | Small changes, feeling lucky  |

### Test-First Development

1. **Define AC first** — Know what "done" looks like
2. **Write tests for AC** — Before implementation
3. **Cover edge cases** — Empty, malformed, nested, boundary values
4. **Implement** — Make tests pass
5. **Refactor** — Clean up while tests are green

### Before Completing Any Task

- [ ] `cargo check --workspace` passes
- [ ] `cargo test --workspace` passes
- [ ] `cargo clippy --workspace -- -D warnings` passes
- [ ] No panic paths in library code (no `unwrap()` on user input)
- [ ] All dependent files updated across crates

---

## TIER 3: CI/CD

### Branch Sync Protocol

> [!IMPORTANT]
> **ALWAYS sync with origin/main before creating branches or committing.**

```bash
git fetch origin main
git rev-list HEAD..origin/main --count
# If behind:
git rebase origin/main
```

### Required CI Checks

| Check                        | Must Pass |
| ---------------------------- | --------- |
| `cargo check --workspace`    | ✅        |
| `cargo test --workspace`     | ✅        |
| `cargo clippy --workspace`   | ✅        |
| `cargo fmt --all -- --check` | ✅        |

### 📤 Publishing Protocol (MANDATORY)

> [!IMPORTANT]
> **Every release MUST publish to ALL registries. Never publish to just one.**

| Package            | Registry            | Command                            |
| ------------------ | ------------------- | ---------------------------------- |
| **fd-vscode**      | VS Code Marketplace | `pnpm vsce publish`                |
| **fd-vscode**      | Open VSX Registry   | `pnpm ovsx publish`                |
| **fd-core**        | crates.io           | `cargo publish -p fd-core`         |
| **fd-lsp**         | crates.io           | `cargo publish -p fd-lsp`          |
| **tree-sitter-fd** | npm                 | `cd tree-sitter-fd && npm publish` |

**Publish order** (dependencies first):

```
fd-core → fd-lsp → tree-sitter-fd → fd-vscode (Marketplace + Open VSX)
```

**Before publishing:**

- [ ] Read `.env` for registry tokens (`CARGO_REGISTRY_TOKEN`, `NPM_TOKEN`, `VSCE_PAT`, `VSX_PAT`)
- [ ] All CI checks pass
- [ ] Version bumped in all affected `Cargo.toml` / `package.json`
- [ ] CHANGELOG updated
- [ ] Git tag created: `v0.x.y`

### Development Flow

```
/spec → /design → /test → /build → /commit → /pr
```

> [!TIP]
> Start with `/spec` to define requirements, then follow the flow.
