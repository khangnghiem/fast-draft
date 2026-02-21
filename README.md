# FD — Fast Draft

> A token-efficient file format and interactive canvas for drawing, design, and animation. Built in Rust + WASM. Bidirectional: edit the code or the canvas, both stay in sync.

## What is FD?

FD is two things:

1. **A file format** (`.fd`) — a compact text DSL for describing 2D graphics, layouts, and animations. Designed to be 5× more token-efficient than SVG while remaining human-readable and AI-friendly.

2. **An interactive canvas** — a GPU-accelerated editor that renders `.fd` files and lets you manipulate them visually. Changes flow bidirectionally: edit the text → canvas updates; drag on canvas → text updates.

### Example `.fd` File

```
# FD v1

style accent {
  fill: #6C5CE7
}

group @card {
  layout: column gap=16 pad=24
  bg: #FFF corner=12 shadow=(0,4,20,#0002)

  text @title "Hello World" {
    font: "Inter" 600 24
    fill: #1A1A2E
  }

  rect @button {
    w: 200 h: 48
    corner: 10
    use: accent

    anim :hover {
      fill: #5A4BD1
      scale: 1.02
      ease: spring 300ms
    }
  }
}

@card -> center_in: canvas
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  .fd file (text DSL)                                │
├─────────────────────────────────────────────────────┤
│  fd-core      Parser ↔ SceneGraph (DAG) ↔ Emitter  │
│                Layout solver (constraints → coords)  │
├─────────────────────────────────────────────────────┤
│  fd-render    Vello + wgpu → GPU canvas             │
│                Hit testing (point → node)             │
├─────────────────────────────────────────────────────┤
│  fd-editor    Bidi sync engine                      │
│                Tools (select, rect, pen, text)        │
│                Undo/redo command stack                │
├─────────────────────────────────────────────────────┤
│  fd-vscode    VS Code Custom Editor (WASM webview)  │
└─────────────────────────────────────────────────────┘
```

## Crate Structure

| Crate        | Purpose                                               |
| ------------ | ----------------------------------------------------- |
| `fd-core`   | Data model, parser, emitter, constraint layout solver |
| `fd-render` | Vello/wgpu 2D renderer + hit testing                  |
| `fd-editor` | Bidirectional sync, tool system, undo/redo, input     |
| `fd-vscode` | VS Code extension (custom editor provider)            |

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (edition 2024)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/) (for WASM builds)
- [Node.js](https://nodejs.org/) ≥ 18 (for VS Code extension)
- VS Code or Cursor IDE

### Build

```bash
# Check all crates compile
cargo check --workspace

# Run tests
cargo test --workspace

# Build WASM (for IDE extension)
wasm-pack build crates/fd-render --target web

# Build VS Code extension
cd fd-vscode && npm install && npm run compile
```

### Development

```bash
# Run tests with output
cargo test --workspace -- --nocapture

# Watch mode (requires cargo-watch)
cargo watch -x 'test --workspace'

# Test VS Code extension
cd fd-vscode && code --extensionDevelopmentPath=.
```

## Key Design Decisions

| Decision       | Choice                | Why                                                        |
| -------------- | --------------------- | ---------------------------------------------------------- |
| Format         | Text DSL (not binary) | Git-friendly, AI-readable, token-efficient                 |
| Document model | DAG via petgraph      | Nodes reference by ID; supports groups, styles, animations |
| Layout         | Constraint-based      | No absolute coords → compact, semantic, AI-friendly        |
| Rendering      | Vello + wgpu          | GPU-accelerated, WASM + native from same code              |
| Parsing        | winnow                | Zero-alloc streaming; fast incremental re-parse            |
| Sync           | Single SceneGraph     | Both directions mutate one graph → no conflicts            |

## Platform Roadmap

| Platform                  | Repo                  | Status         |
| ------------------------- | --------------------- | -------------- |
| VS Code / Cursor IDE      | This repo             | 🟡 In progress |
| Desktop (macOS/Win/Linux) | Separate repo (Tauri) | ⬜ Planned     |
| iOS                       | Separate repo         | ⬜ Planned     |
| Android                   | Separate repo         | ⬜ Planned     |
| Web app                   | Separate repo         | ⬜ Planned     |

## License

MIT — see [LICENSE](LICENSE)
