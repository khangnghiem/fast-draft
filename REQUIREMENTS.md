# FTD Requirements

## Vision

FTD (Fast Draft) is a file format and interactive canvas for drawing, design, and animation — built for both humans and AI agents. The `.ftd` file is the single source of truth, bidirectionally synced with a visual canvas in real-time.

## Core Requirements

### R1: File Format (`.ftd`)

- **R1.1**: Token-efficient text DSL — ~5× fewer tokens than SVG for equivalent content
- **R1.2**: Graph-based document model (DAG) — nodes reference by `@id`, not coordinates
- **R1.3**: Constraint-based layout (`center_in`, `offset`, `fill_parent`) — no absolute coordinates until render time
- **R1.4**: Reusable styles via `style` blocks and `use:` references
- **R1.5**: Animation declarations with triggers (`:hover`, `:press`, `:enter`) and easing
- **R1.6**: Git-friendly plain text — line-oriented diffs work well
- **R1.7**: Comments via `#` prefix
- **R1.8**: Human-readable and AI-writable without special tooling

### R2: Bidirectional Sync

- **R2.1**: Canvas → Text: Visual edits (drag, resize, draw) update the `.ftd` source in <16ms
- **R2.2**: Text → Canvas: Source edits re-render the canvas in <16ms
- **R2.3**: Incremental: Only re-parse/re-emit changed regions, not the entire document
- **R2.4**: Conflict-free: Both directions funnel through a single authoritative `SceneGraph`

### R3: Human Editing (Canvas)

- **R3.1**: Selection: Click to select, multi-select, lasso
- **R3.2**: Manipulation: Drag, resize, rotate
- **R3.3**: Creation: Rectangle, ellipse, text, group tools
- **R3.4**: Freehand: Pen/pencil tool with pressure sensitivity (Apple Pencil Pro)
- **R3.5**: Path editing: Node manipulation, curve handles, boolean operations (future)
- **R3.6**: Canvas controls: Pan, zoom, grid snap
- **R3.7**: Undo/redo: Full command stack, works across both text and canvas edits

### R4: AI Editing (Text)

- **R4.1**: AI reads/writes `.ftd` text directly — no binary format needed
- **R4.2**: Semantic node names (`@login_form`, `@submit_btn`) help AI understand intent
- **R4.3**: Style inheritance reduces repetition — AI only specifies overrides
- **R4.4**: Constraints describe relationships ("center in canvas") not pixel positions

### R5: Rendering

- **R5.1**: GPU-accelerated 2D rendering via Vello + wgpu
- **R5.2**: WASM-compatible for web/IDE deployment
- **R5.3**: Native-compatible for desktop/mobile (same Rust code)
- **R5.4**: Shapes: rect, ellipse, path, text
- **R5.5**: Styling: fill, stroke, gradients, shadows, corner radius, opacity
- **R5.6**: Animation: keyframe transitions with easing functions

### R6: Platform Targets

- **R6.1** (this repo): VS Code / Cursor IDE custom editor extension
- **R6.2** (future): Desktop app via Tauri (macOS, Windows, Linux)
- **R6.3** (future): Mobile app (iOS, Android) via native wgpu
- **R6.4** (future): Web app (standalone browser app)

## Non-Functional Requirements

| Requirement        | Target                                    |
| ------------------ | ----------------------------------------- |
| Parse throughput   | >10 MB/s of `.ftd` text                   |
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
