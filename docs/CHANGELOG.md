# FD Changelog

> Tracks requirement completion status across the entire FD project.
> For VS Code extension release notes, see [`fd-vscode/CHANGELOG.md`](../fd-vscode/CHANGELOG.md).

## Completed Requirements

### v0.7.9

- **NEW**: Spec Summary Panel — layers panel becomes requirements overview in Spec mode, showing all annotated nodes as cards with description, status/priority badges, accept criteria, and tags
- **NEW**: Click-to-select in spec summary navigates to node on canvas + opens annotation editing card
- **NEW**: Empty state guidance ("No spec annotations yet — Right-click a node → Add Annotation")
- **UX**: Apple-style color-coded badges: draft=grey, in_progress=yellow, done=green, priority high=red/medium=orange/low=green

### v0.7.8

- **NEW**: Smart alignment guides (R3.17) — magenta dashed guide lines appear during drag/resize when node edges or centers align with other nodes (Figma/Sketch behavior)
- **NEW**: Alignment detection across 9 reference point pairs per axis (left/center/right × top/center/bottom)
- **INFRA**: WASM rebuild with smart guide computation in Rust

### v0.7.7

- **NEW**: Interactive resize handles (R3.16) — 8-point resize grips (4 corners + 4 midpoints) on selected nodes, drag to resize with opposite corner anchored
- **NEW**: Shift+resize constrains to square proportions
- **NEW**: Min size 4px prevents nodes from collapsing to zero
- **INFRA**: WASM rebuild with resize handle hit-testing in Rust

### v0.7.6

- **NEW**: Double-click canvas creates text node — clicking empty space creates a text node and opens inline editor immediately (Figma behavior)
- **NEW**: Copy/paste nodes — `⌘C` copies selected node's `.fd` block to clipboard, `⌘V` pastes with auto-generated unique ID
- **NEW**: Select all — `⌘A` selects first node (multi-select needs WASM API extension)
- **UX**: Updated keyboard shortcuts help panel with new entries

### v0.7.5

- **NEW**: Zoom to selection — `⌘1` / `Ctrl+1` centers and zooms to fit the selected node
- **NEW**: Color swatches palette — 12 preset colors + recent colors in properties panel (click to apply fill)
- **NEW**: Selection info bar — bottom-center pill showing `@id · kind · W×H · (X, Y)` when a node is selected
- **NEW**: Layer visibility toggle — eye icon (👁) on hover in layers panel, click to dim node to 15% opacity

### v0.7.4

- **R3.21**: Grid overlay — toggleable dot grid (becomes line grid at high zoom) with adaptive spacing; keyboard shortcut `G` and toolbar ⊞ button; state persists across sessions
- **NEW**: PNG export — export canvas as high-quality 2× PNG with save dialog; toolbar 📥 button
- **NEW**: Minimap navigation — thumbnail in bottom-right showing full scene with draggable viewport rectangle for pan navigation (Figma/Miro-style)
- **NEW**: Arrow-key nudge — arrow keys move selected node 1px (Shift+arrow = 10px), matching Figma/Sketch standard UX
- **NEW**: Layer rename — double-click a layer name in the layers panel for inline rename (renames `@id` across the entire document)

### v0.7.3

- **R1.1 fix**: Fixed node/edge drag jitter and reverse-direction movement — `MoveNode` now correctly converts absolute screen coords to parent-relative before storing in `Constraint::Absolute`, and strips conflicting positioning constraints (`CenterIn`, `Offset`, `FillParent`). Skips full layout re-resolve for move-only batches to prevent constraint values from overwriting in-place bounds updates.

### v0.7.0 (**BREAKING**)

- **R1.9**: Replaced `##` annotation syntax with `spec` node blocks — `spec "desc"` (inline) and `spec { ... }` (block form). Updated parser, emitter, tree-sitter grammar, VS Code extension, and all 13 example files.
- **GEMINI.md**: Updated FD Format Rules table to reflect `spec` syntax.

### v0.6.41

- **R1.1 fix**: Fixed Group/Ungroup undo/redo — `GroupNodes` now initializes `ResolvedBounds` so subsequent `MoveNode` doesn't clobber constraints to `(0,0)`
- **R1.1 fix**: `SceneGraph::remove_node` wrapper keeps `id_index` consistent when petgraph swaps indices on removal
- **R1.1**: `compute_inverse` now supports `GroupNodes` ↔ `UngroupNode` for full undo/redo round-trips

### v0.6.40

- **R4.11 fix**: Fixed a bug where properties like `fill` or `font` were incorrectly displayed inside nodes in Code Spec View instead of being hidden.

### v0.6.39

- **R1.1**: New `frame` node type — visible container with declared `w:`/`h:`, optional `clip: true`, fill/stroke/corner, layout modes (column/row/grid)
- **R1.1**: `group` nodes now auto-size to the union bounding box of their children (was hardcoded 200×200)
- **R3.1**: Groups skip self-hit-testing (only children are clickable); frames are clickable via background

### v0.6.38

- **R6.1**: Code Mode now always regains focus after canvas reveal — refocuses text editor after `vscode.openWith` since webview panels can steal focus despite `preserveFocus: true`

### v0.6.37

- **R6.1 fix**: Consolidated canvas open/reveal into a single `onDidChangeActiveTextEditor` handler — eliminates race condition with `onDidOpenTextDocument`, and moves canvas to the other column if it ends up in the same column as the text editor

### v0.6.36

- **R6.1**: Canvas is now always revealed when switching `.fd` tabs — opens a new canvas in the other column if none exists (previously only revealed existing canvas tabs)

### v0.6.35

- **R6.1 fix**: Fixed canvas duplication bug where auto-reveal opened a second Canvas Mode in the text editor's column; now correctly finds the canvas tab's actual column and only reveals if not already active

### v0.6.34

- **R6.1**: Auto-reveal canvas — switching to an `.fd` file tab now automatically reveals (or opens) the Canvas Mode panel in the other editor column without stealing focus

### v0.6.32

- **R2.5 fix**: Cursor→canvas selection sync now works from any line inside a node block (property lines, style lines, animation lines), not just the `@id` declaration line — uses `findSymbolAtLine` symbol tree lookup instead of simple regex
- **R3.14**: Layers panel restyled with Figma/Apple design language (sticky header, indent guides, chevron toggles, hover/selection states)
- **Workflow**: `/yolo` and `/commit` workflows now include a mandatory docs update step before committing

### R1: File Format (`.fd`)

- [x] **R1.1**: Token-efficient text DSL
- [x] **R1.2**: Graph-based document model (DAG)
- [x] **R1.3**: Constraint-based layout
- [x] **R1.4**: Reusable styles via `style` blocks
- [x] **R1.5**: Animation declarations with triggers
- [x] **R1.6**: Git-friendly plain text
- [x] **R1.7**: Comments via `#` prefix
- [x] **R1.8**: Human-readable and AI-writable
- [x] **R1.9**: Structured annotations (`spec` blocks)
- [x] **R1.10**: First-class edges
- [x] **R1.11**: Edge trigger animations
- [x] **R1.12**: Edge flow animations
- [x] **R1.13**: Generic nodes
- [x] **R1.14**: Namespaced imports
- [x] **R1.15**: Background shorthand
- [x] **R1.16**: Comment preservation

### R2: Bidirectional Sync

- [x] **R2.1**: Canvas → Text sync (<16ms)
- [x] **R2.2**: Text → Canvas sync (<16ms)
- [ ] **R2.3**: Incremental parse/emit (currently full re-parse — fast enough for typical docs)
- [x] **R2.4**: Conflict-free via single authoritative SceneGraph

### R3: Human Editing (Canvas)

- [x] **R3.1**: Selection (click, shift, marquee)
- [x] **R3.2**: Manipulation (drag, resize, shift-constrain)
- [x] **R3.3**: Creation (rect, ellipse, text, pen + shortcuts)
- [x] **R3.4**: Freehand pen tool (Catmull-Rom smoothing) — _pressure captured but not yet mapped to stroke width_
- [ ] **R3.5**: Path editing (future — boolean operations)
- [x] **R3.6**: Canvas controls — pan (Space+drag, middle-click, ⌘-hold)
- [x] **R3.7**: Undo/redo command stack
- [x] **R3.8**: Properties panel (frosted glass inspector)
- [x] **R3.9**: Drag-and-drop shape palette
- [x] **R3.10**: Apple Pencil Pro squeeze toggle
- [x] **R3.11**: Per-tool cursor feedback
- [x] **R3.12**: Annotation pins (badge dots + inline card)
- [x] **R3.13**: Light/dark theme toggle
- [x] **R3.14**: View mode toggle (Design | Spec)
- [ ] **R3.15**: Live preview outlines
- [ ] **R3.16**: Resize handles (8-point grips)
- [ ] **R3.17**: Smart guides (alignment snapping)
- [ ] **R3.18**: Dimension tooltip
- [ ] **R3.19**: Alt-draw-from-center
- [ ] **R3.20**: Zoom (⌘+/−, pinch, fit)
- [x] **R3.21**: Grid overlay
- [ ] **R3.22**: Pressure-sensitive stroke width
- [ ] **R3.23**: Freehand shape recognition

### R4: AI Editing (Text)

- [x] **R4.1**: AI reads/writes `.fd` directly
- [x] **R4.2**: Semantic node names
- [x] **R4.3**: Style inheritance
- [x] **R4.4**: Constraint relationships
- [x] **R4.5**: Annotations as structured metadata
- [x] **R4.6**: Edges for AI flow reasoning
- [x] **R4.7**: Spec-view export (markdown report)
- [x] **R4.8**: AI node refinement (Gemini)
- [x] **R4.9**: Multi-provider AI (Gemini configured, OpenAI/Anthropic settings present)
- [x] **R4.10**: Auto-format pipeline (`format_document` via LSP)
- [x] **R4.11**: Inline Spec View

### R5: Rendering

- [x] **R5.1**: GPU-accelerated 2D — Vello + wgpu crate exists; webview currently uses Canvas2D fallback
- [x] **R5.2**: WASM-compatible (wasm-pack build)
- [ ] **R5.3**: Native desktop/mobile (future)
- [x] **R5.4**: Shapes (rect, ellipse, path, text)
- [x] **R5.5**: Styling (fill, stroke, gradients, shadows, corner radius, opacity)
- [x] **R5.6**: Animation (keyframe transitions)
- [x] **R5.7**: Edge rendering (lines, curves, arrows, labels)
- [x] **R5.8**: Edge animation rendering (pulse dots, marching dashes)

### R6: Platform Targets

- [x] **R6.1**: VS Code / Cursor IDE extension (published)
- [ ] **R6.2**: Desktop app via Tauri (future)
- [ ] **R6.3**: Mobile app (future)
- [ ] **R6.4**: Web app (future)

## Test Matrix

<!-- Maps each requirement to its test functions. If a row is empty, the requirement lacks test coverage. -->

| Requirement | Test Functions                                                    | Coverage                    |
| ----------- | ----------------------------------------------------------------- | --------------------------- |
| R1.1–R1.8   | `parser::tests::parse_*`, `emitter::tests::emit_*`, `roundtrip_*` | ✅ 42 tests                 |
| R1.9        | `emit_annotations_*`, `roundtrip_preserves_annotations`           | ✅                          |
| R1.10       | `parse_edge_*`, `emit_edge_*`, `roundtrip_edge_*`                 | ✅                          |
| R1.11       | `emit_edge_with_trigger_anim`, `roundtrip_edge_hover_anim`        | ✅                          |
| R1.12       | `emit_edge_flow_*`, `roundtrip_edge_flow_*`                       | ✅                          |
| R1.13       | `emit_generic_node`, `roundtrip_generic_*`                        | ✅                          |
| R1.14       | `parse_import`, `emit_import`, `roundtrip_import`                 | ✅                          |
| R1.15       | `emit_bg_shorthand`, `roundtrip_bg_shorthand`                     | ✅                          |
| R1.16       | `roundtrip_comment_*`                                             | ✅                          |
| R2.1–R2.4   | `sync::tests::sync_*`, `bidi_sync::*`                             | ⚠️ 5 unit + 2 integration   |
| R3.1        | `tools::tests::select_tool_*`                                     | ⚠️ 3 tests, missing marquee |
| R3.2        | `tools::tests::select_tool_drag`, `select_tool_shift_drag_*`      | ⚠️ Missing resize           |
| R3.3        | `tools::tests::rect_tool_*`, `ellipse_tool_*`                     | ⚠️ Missing text tool test   |
| R3.4        | _(none)_                                                          | ❌ No pen tool tests        |
| R3.5        | _(future)_                                                        | —                           |
| R3.6        | _(JS-only, no test)_                                              | ❌                          |
| R3.7        | `commands::tests::*`, `undo_redo::*`                              | ✅ 5 unit + 4 integration   |
| R3.8–R3.14  | _(JS-only, no test)_                                              | ❌                          |
| R3.15–R3.23 | _(not yet implemented)_                                           | —                           |
| R4.1–R4.6   | Covered by R1/R2 tests                                            | ✅                          |
| R4.7–R4.11  | _(extension-side, no test)_                                       | ❌                          |
| R5.1–R5.8   | `hit::tests::*`, `resolve::tests::*`                              | ⚠️ 6 tests                  |
