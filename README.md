# Fast Draft

> **Design as Code.** \
> Fast Draft is a file format and canvas for drawing, design, and animation — right inside your code editor. Draw it or code it? Why not both?

**Fast Draft lets you describe designs as simple text — then see and edit them on a live canvas.**

Think of it like Markdown, but for graphics. You write a few lines of text to describe shapes, colors, and layouts. Fast Draft instantly renders them on an interactive canvas where you can drag, resize, and restyle everything visually. Any change you make on the canvas writes back to the text, and vice versa.

Fast Draft has two modes, each designed for a different audience:

- 🤖 **Code Mode** — the AI Interface. LLMs and coding agents read, write, and reason about `.fd` text directly. Uses ~5× fewer tokens than Excalidraw JSON, so entire UIs fit in a single prompt. No screenshots, no pixel coordinates — just structured, semantic text.
- 🎨 **Canvas Mode** — the Human Interface. Designers and architects draw, drag, and resize on a fast, GPU-powered canvas inside VS Code, Cursor, or Zed. No code knowledge needed — just point, click, and create.

Both modes edit the same file. Changes in one instantly appear in the other.

### Why Fast Draft?

| Benefit                        | How                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------- |
| **AI-friendly**                | Compact enough for LLMs to read, write, and reason about entire UIs              |
| **Version-control ready**      | Plain text — `git diff`, `git merge`, code review all work naturally             |
| **Design + specs in one file** | Attach requirements, status, and acceptance criteria directly to visual elements |
| **No context switching**       | Design and code live side-by-side in your editor                                 |

### See it in action

Here's a card component with a hover animation — in just 20 lines:

```
# A card with a button that reacts on hover

style accent {
  fill: #6C5CE7                  # purple fill, reusable across shapes
}

group @card {
  layout: column gap=16 pad=24   # vertical stack with spacing
  bg: #FFF corner=12 shadow=(0,4,20,#0002)

  text @title "Hello World" {
    font: "Inter" 600 24         # Inter font, semi-bold, 24px
    fill: #1A1A2E
  }

  rect @button {
    w: 200 h: 48
    corner: 10
    use: accent                  # inherits the purple fill

    anim :hover {                # animate on hover
      fill: #5A4BD1
      scale: 1.02
      ease: spring 300ms
    }
  }
}

@card -> center_in: canvas       # center the whole card on screen
```

### Add requirements to your designs

FD has a built-in way to attach specifications directly to visual elements using `spec` blocks. This means designers, developers, and AI agents can all see _what_ a component should do, right next to _how_ it looks.

```
rect @login_btn {
  spec {
    "Primary CTA — triggers login API call"
    accept: "disabled state when fields empty"
    accept: "loading spinner during auth"
    status: in_progress
    priority: high
  }
  w: 280 h: 48
  use: accent
}

# Short form for quick notes:
text @title "Welcome" {
  spec "Brand greeting — sets emotional tone"
}
```

| What you write   | What it means                                  |
| ---------------- | ---------------------------------------------- |
| `spec "text"`    | A short description of what the element does   |
| `accept: "text"` | What counts as "done" (acceptance criteria)    |
| `status: draft`  | Current status: `draft`, `in_progress`, `done` |
| `priority: high` | Importance: `high`, `medium`, `low`            |
| `tag: auth, mvp` | Labels for filtering and organization          |

Use `#` for quick throwaway notes (they're discarded when the file is processed). Use `spec` for anything you want to keep — the canvas UI, AI tools, and exports can all read spec blocks.

### Start with ideas, add visuals later

You don't need to pick a shape right away. Write a placeholder element with just a name and spec — it shows up on canvas as a dashed box. When you're ready, upgrade it to a real shape:

```
# Start with just an idea:
@login_btn {
  spec "Primary CTA"
  spec {
    accept: "disabled when fields empty"
    status: draft
  }
}

# Later, add a shape:
rect @login_btn { ... }
```

## Feature Highlights

- ↔️ **Two-way sync** — edit code or canvas, the other updates instantly
- 🧘 **Zen mode** — minimal floating toolbar for distraction-free drawing
- ✏️ **Sketchy rendering** — hand-drawn mode with wobbly, organic lines
- 📐 **Smart guides** — alignment lines appear when shapes line up (like Figma)
- ↔ **Resize handles** — drag corners and edges to resize, hold Shift to keep proportions
- 🎨 **Floating toolbar** — quick access to fill, stroke, opacity on any selection
- 👆 **Touch & gestures** — two-finger pan, pinch-to-zoom, Apple Pencil support
- 🎬 **Drag-and-drop animations** — drag a shape onto another to add hover/press effects
- 📤 **Export** — PNG, SVG, clipboard copy, or raw `.fd` source
- 🤖 **AI Assist** — press ⌘I to improve designs with AI (supports 5 providers)
- 📋 **Spec View** — requirements dashboard with status filters and coverage tracking
- 🎯 **Sticky styles** — your last-used colors and fonts are remembered per tool
- ↗️ **Arrows & connectors** — draw connections between shapes with smooth curves

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

## Editor Support

| Editor           | Syntax Highlighting | LSP | Canvas |
| ---------------- | :-----------------: | :-: | :----: |
| VS Code / Cursor |         ✅          |  —  |   ✅   |
| Zed              |         ✅          | ✅  |   —    |
| Neovim           |         ✅          |  —  |   —    |
| Sublime Text     |         ✅          |  —  |   —    |
| Helix            |         ✅          |  —  |   —    |
| Emacs            |         ✅          |  —  |   —    |

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (edition 2024)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/) (for WASM builds)
- [Node.js](https://nodejs.org/) ≥ 18 (for VS Code extension)
- [pnpm](https://pnpm.io/) (for VS Code extension)
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
cd fd-vscode && pnpm install && pnpm run compile
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
| Zed                       | This repo             | 🟢 Published   |
| Neovim / Helix / Sublime  | This repo             | 🟢 Syntax only |
| Desktop (macOS/Win/Linux) | Separate repo (Tauri) | ⬜ Planned     |
| iOS                       | Separate repo         | ⬜ Planned     |
| Android                   | Separate repo         | ⬜ Planned     |
| Web app                   | Separate repo         | ⬜ Planned     |

## License

MIT — see [LICENSE](LICENSE)
