# FD Requirements

## Vision

FD (Fast Draft) is a file format and interactive canvas for drawing, design, and animation — built for both humans and AI agents. The `.fd` file is the single source of truth, bidirectionally synced with a visual canvas in real-time.

## Core Requirements

### R1: File Format (`.fd`)

- **R1.1**: Token-efficient text DSL — ~5× fewer tokens than SVG for equivalent content
- **R1.2**: Graph-based document model (DAG) — nodes reference by `@id`, not coordinates
- **R1.3**: Constraint-based layout (`center_in`, `offset`, `fill_parent`) — no absolute coordinates until render time
- **R1.4**: Reusable styles via `style` blocks and `use:` references
- **R1.5**: Animation declarations with triggers (`:hover`, `:press`, `:enter`) and easing
- **R1.6**: Git-friendly plain text — line-oriented diffs work well
- **R1.7**: Comments via `#` prefix
- **R1.8**: Human-readable and AI-writable without special tooling
- **R1.9**: Structured annotations (`##`) — description, accept criteria, status, priority, tags — parsed and round-tripped as first-class metadata
- **R1.10**: First-class edges — `edge @id { from: @a to: @b }` with arrow, curve, label, stroke, and `##` annotations for user flows, wireframes, and state machines
- **R1.11**: Edge trigger animations — edges support `anim :hover { ... }` blocks identical to nodes
- **R1.12**: Edge flow animations — `flow: pulse Nms` (traveling dot) and `flow: dash Nms` (marching dashes) for visualizing data flow direction
- **R1.13**: Generic nodes — `@id { ... }` without explicit kind keyword for abstract/placeholder elements
- **R1.14**: Namespaced imports — `import "path.fd" as ns` for cross-file style/node reuse with `ns.style_name` references
- **R1.15**: Background shorthand — `bg: #FFF corner=12 shadow=(0,4,20,#0002)` for combined fill, corner, and shadow in one line
- **R1.16**: Comment preservation — `# text` lines attached to the following node survive all parse/emit round-trips and format passes

### R2: Bidirectional Sync

- **R2.1**: Canvas → Text: Visual edits (drag, resize, draw) update the `.fd` source in <16ms
- **R2.2**: Text → Canvas: Source edits re-render the canvas in <16ms
- **R2.3**: Incremental: Only re-parse/re-emit changed regions, not the entire document
- **R2.4**: Conflict-free: Both directions funnel through a single authoritative `SceneGraph`

### R3: Human Editing (Canvas)

- **R3.1**: Selection: Click to select, Shift+click to toggle multi-select, marquee drag-to-select (rubber-band box selection on empty canvas) with Shift+marquee additive mode
- **R3.2**: Manipulation: Drag, resize, rotate; shift-constrain to axis
- **R3.3**: Creation: Rectangle, ellipse, text, group tools with keyboard shortcuts (V/R/O/P/T)
- **R3.4**: Freehand: Pen/pencil tool with pressure sensitivity (Apple Pencil Pro)
- **R3.5**: Path editing: Node manipulation, curve handles, boolean operations (future)
- **R3.6**: Canvas controls: Pan, zoom, grid snap
- **R3.7**: Undo/redo: Full command stack, works across both text and canvas edits
- **R3.8**: Properties panel: Apple-style frosted glass inspector for position, size, fill, stroke, corner radius, opacity, and text content — edits propagate bidirectionally
- **R3.9**: Drag-and-drop: Shape palette for dropping Rect, Ellipse, or Text onto canvas
- **R3.10**: Apple Pencil Pro squeeze: Toggle between last two tools
- **R3.11**: Per-tool cursor feedback (crosshair for drawing, text cursor for text, default for select)
- **R3.12**: Annotation pins: Visual badge dots on annotated nodes with inline edit card
- **R3.13**: Light/dark theme toggle — canvas defaults to light mode with a toolbar toggle button (🌙 in light → switch to dark, ☀️ in dark → switch to light); preference persists across sessions via VS Code state
- **R3.14**: View mode toggle — **Design | Spec** segmented control in the canvas toolbar (Design default); Spec View hides the canvas and shows a scrollable overlay of node IDs, `##` annotations, acceptance criteria, status/priority/tag badges, unannotated node chips, and edges; overlay updates live as the `.fd` source changes; also accessible via `FD: Toggle Design/Spec View` command in the editor title bar and Command Palette

### R4: AI Editing (Text)

- **R4.1**: AI reads/writes `.fd` text directly — no binary format needed
- **R4.2**: Semantic node names (`@login_form`, `@submit_btn`) help AI understand intent
- **R4.3**: Style inheritance reduces repetition — AI only specifies overrides
- **R4.4**: Constraints describe relationships ("center in canvas") not pixel positions
- **R4.5**: Annotations (`##`) give AI structured metadata — acceptance criteria, status, priority, tags — on the visual element itself
- **R4.6**: Edges let AI reason about flows and transitions between screens
- **R4.7**: Spec-view export — generate markdown report of `##` annotations (requirements, status, acceptance criteria) from any `.fd` file
- **R4.8**: AI node refinement — restyle selected nodes and replace anonymous IDs (`_anon_N`) with semantic names via configurable AI provider
- **R4.9**: Multi-provider AI — per-provider API keys (`fd.ai.geminiApiKey`, `fd.ai.openaiApiKey`, `fd.ai.anthropicApiKey`), custom model selection per provider, and support for Gemini, OpenAI, Anthropic, Ollama (local), and OpenRouter (multi-model gateway)
- **R4.10**: Auto-format pipeline — `format_document` via LSP; lint diagnostics (anonymous IDs, duplicate `use:`, unused styles) + configurable dedup/hoist transforms via `fd.format.*` settings
- **R4.11**: Inline Spec View — canvas-embedded spec overlay (client-side parser, no roundtrip) showing node structure + annotations; complements the separate `FD: Show Spec View` sidebar panel and `FD: Export Spec to Markdown` export command

### R5: Rendering

- **R5.1**: GPU-accelerated 2D rendering via Vello + wgpu
- **R5.2**: WASM-compatible for web/IDE deployment
- **R5.3**: Native-compatible for desktop/mobile (same Rust code)
- **R5.4**: Shapes: rect, ellipse, path, text
- **R5.5**: Styling: fill, stroke, gradients, shadows, corner radius, opacity
- **R5.6**: Animation: keyframe transitions with easing functions
- **R5.7**: Edge rendering: lines, smooth curves, step routing with arrowheads and midpoint labels
- **R5.8**: Edge animation rendering: trigger-based hover/press effects and continuous flow animations (pulse dots, marching dashes)

### R6: Platform Targets

- **R6.1** (this repo): VS Code / Cursor IDE custom editor extension
- **R6.2** (future): Desktop app via Tauri (macOS, Windows, Linux)
- **R6.3** (future): Mobile app (iOS, Android) via native wgpu
- **R6.4** (future): Web app (standalone browser app)

## Non-Functional Requirements

| Requirement        | Target                                    |
| ------------------ | ----------------------------------------- |
| Parse throughput   | >10 MB/s of `.fd` text                    |
| Render latency     | <16ms per frame (60 FPS)                  |
| Bidirectional sync | <16ms round-trip                          |
| File size          | ~5× smaller than SVG equivalent           |
| Token count        | ~5× fewer tokens than SVG for LLM context |
| Memory             | <50 MB for a 1000-node document           |
| WASM bundle        | <5 MB gzipped                             |

## Tech Stack

| Layer            | Technology                            |
| ---------------- | ------------------------------------- |
| Language         | Rust (edition 2024)                   |
| Rendering        | Vello + wgpu                          |
| Parsing          | winnow                                |
| Graph            | petgraph (DAG)                        |
| String interning | lasso                                 |
| WASM             | wasm-pack + wasm-bindgen              |
| IDE glue         | TypeScript (minimal VS Code API shim) |
| Desktop (future) | Tauri                                 |
