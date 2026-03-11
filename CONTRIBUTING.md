# Contributing to Fast Draft

Thanks for your interest in contributing! This guide covers architecture, build setup, and development workflow.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  .fd file (text DSL)                                │
├─────────────────────────────────────────────────────┤
│  fd-core        Parser ↔ SceneGraph (DAG) ↔ Emitter │
│                  Layout solver (constraints → coords) │
├─────────────────────────────────────────────────────┤
│  fd-render      Vello + wgpu → GPU canvas           │
│                  Hit testing (point → node)           │
├─────────────────────────────────────────────────────┤
│  fd-editor      Bidi sync engine                    │
│                  Tools (select, rect, pen, text)      │
│                  Undo/redo command stack               │
├─────────────────────────────────────────────────────┤
│  tree-sitter-fd Tree-sitter grammar for editors     │
├─────────────────────────────────────────────────────┤
│  fd-vscode      VS Code Custom Editor (WASM webview)│
│  editors/       Zed, Neovim, Sublime, Helix, Emacs  │
└─────────────────────────────────────────────────────┘
```

## Crate Structure

| Crate            | Purpose                                               |
| ---------------- | ----------------------------------------------------- |
| `fd-core`        | Data model, parser, emitter, constraint layout solver |
| `fd-render`      | Vello/wgpu 2D renderer + hit testing                  |
| `fd-editor`      | Bidirectional sync, tool system, undo/redo, input     |
| `tree-sitter-fd` | Tree-sitter grammar (used by Zed, Neovim, etc.)       |
| `fd-vscode`      | VS Code extension (custom editor provider)            |

## Key Design Decisions

| Decision       | Choice                | Why                                                        |
| -------------- | --------------------- | ---------------------------------------------------------- |
| Format         | Text DSL (not binary) | Git-friendly, AI-readable, token-efficient                 |
| Document model | DAG via petgraph      | Nodes reference by ID; supports groups, styles, animations |
| Layout         | Constraint-based      | No absolute coords → compact, semantic, AI-friendly        |
| Rendering      | Vello + wgpu          | GPU-accelerated, WASM + native from same code              |
| Parsing        | winnow                | Zero-alloc streaming; fast incremental re-parse            |
| Sync           | Single SceneGraph     | Both directions mutate one graph → no conflicts            |

## Prerequisites

- [Rust](https://rustup.rs/) (edition 2024)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/) (for WASM builds)
- [Node.js](https://nodejs.org/) ≥ 18 (for VS Code extension)
- [pnpm](https://pnpm.io/) (for VS Code extension — **never use npm**)
- VS Code or Cursor IDE

## Build

```bash
# Check all crates compile
cargo check --workspace

# Run tests
cargo test --workspace

# Lint
cargo clippy --workspace -- -D warnings

# Format check
cargo fmt --all -- --check

# Build WASM (for IDE extension + web playground)
wasm-pack build crates/fd-wasm --target web --out-dir ../../site/wasm

# Build VS Code extension
cd fd-vscode && pnpm install && pnpm run compile
```

## Development

```bash
# Run tests with output
cargo test --workspace -- --nocapture

# Watch mode (requires cargo-watch)
cargo watch -x 'test --workspace'

# Test VS Code extension
cd fd-vscode && code --extensionDevelopmentPath=.
```

## Git Workflow

- **Never commit to main** — all changes via feature branches (`feat/`, `fix/`, `refactor/`, `test/`, `docs/`)
- **PR required** — all merges via Pull Request; CI must pass
- **Sync first** — always `git fetch origin main` before creating branches
- Activate pre-push hook: `git config core.hooksPath .githooks`

## Before Submitting a PR

- [ ] `cargo check --workspace` passes
- [ ] `cargo test --workspace` passes
- [ ] `cargo clippy --workspace -- -D warnings` passes
- [ ] `cargo fmt --all -- --check` passes
- [ ] No `unwrap()` on user input in library code
- [ ] All dependent files updated across crates
