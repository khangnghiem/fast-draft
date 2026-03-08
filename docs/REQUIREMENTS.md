# FD Requirements

## Vision

FD (Fast Draft) is a file format and interactive canvas for drawing, design, and animation — built for both humans and AI agents. The `.fd` file is the single source of truth, bidirectionally synced with a visual canvas in real-time.

## Core Requirements

### R1: File Format (`.fd`)

- **R1.1** _(done)_: Token-efficient text DSL — ~5× fewer tokens than SVG for equivalent content
- **R1.2** _(done)_: Graph-based document model (DAG) — nodes reference by `@id`, not coordinates
- **R1.3** _(done)_: Constraint-based layout (`center_in`, `offset`, `fill_parent`) — no absolute coordinates until render time
- **R1.4** _(done)_: Reusable themes via `theme` blocks and `use:` references (parser also accepts legacy `style` keyword)
- **R1.5** _(done)_: Animation declarations with triggers (`:hover`, `:press`, `:enter`) and easing → [spec](specs/animation-system.md)
- **R1.6** _(done)_: Git-friendly plain text — line-oriented diffs work well
- **R1.7** _(done)_: Comments via `#` prefix
- **R1.8** _(done)_: Human-readable and AI-writable without special tooling
- **R1.9** _(done)_: Structured annotations (`spec` blocks) — description, accept criteria, status (todo/doing/done/blocked), priority, tags — parsed and round-tripped as first-class metadata
- **R1.10** _(done)_: First-class edges — `edge @id { from: @a to: @b }` with arrow, curve, label, stroke, and `spec` annotations → [spec](specs/edge-system.md)
- **R1.11** _(done)_: Edge trigger animations — edges support `when :hover { ... }` blocks identical to nodes (parser also accepts legacy `anim` keyword) → [spec](specs/edge-system.md)
- **R1.12** _(done)_: Edge flow animations — `flow: pulse Nms` (traveling dot) and `flow: dash Nms` (marching dashes) → [spec](specs/edge-system.md)
- **R1.13** _(done)_: Generic nodes — `@id { ... }` without explicit kind keyword for abstract/placeholder elements
- **R1.14** _(done)_: Namespaced imports — `import "path.fd" as ns` for cross-file style/node reuse with `ns.style_name` references
- **R1.15** _(done)_: Background shorthand — `bg: #FFF corner=12 shadow=(0,4,20,#0002)` for combined fill, corner, and shadow in one line
- **R1.16** _(done)_: Comment preservation — `# text` lines attached to the following node survive all parse/emit round-trips and format passes
- **R1.17** _(done)_: Text alignment — `align: left|center|right [top|middle|bottom]` property; defaults to `center middle`; reusable via `theme` blocks and `use:` inheritance
- **R1.18** _(done)_: Mermaid import — parse Mermaid diagram syntax (`flowchart`, `sequenceDiagram`, `stateDiagram`) into equivalent FD nodes + edges; `parse_mermaid()` in fd-core + `import_mermaid()` WASM API
- **R1.19** _(done)_: Edge label offset — `label_offset: <x> <y>` property on edges for draggable text labels; parse/emit roundtrip support
- **R1.20** _(done)_: Edge anchors — `EdgeAnchor` enum (`@node_id` or `x y` coords) for flexible edge endpoints; `text_child: Option<NodeId>` for styled text labels; `create_edge_at()` WASM API; edge-to-edge validation
- **R1.21** _(done)_: Free frame padding — `pad: <N>` property on Free-layout frames insets the content area; children default to padded origin, text centering and `place:` use padded bounds; also accepts `padding:` alias

### R2: Bidirectional Sync

- **R2.1** _(done)_: Canvas → Text: Visual edits (drag, resize, draw) update the `.fd` source in <16ms
- **R2.2** _(done)_: Text → Canvas: Source edits re-render the canvas in <16ms
- **R2.3** _(planned)_: Incremental: Only re-parse/re-emit changed regions, not the entire document
- **R2.4** _(done)_: Conflict-free: Both directions funnel through a single authoritative `SceneGraph`
- **R2.5** _(done)_: Selection sync — clicking anywhere inside a node/edge block in the text editor selects it on canvas and pans to focus; clicking a node on canvas reveals and highlights its `@id` line in the text editor (including re-clicks on already-selected nodes); all clicks sync the Layers panel highlight with scroll-into-view; Code→Canvas focus is debounced (150ms); edge IDs sync across Layers↔Code; all sync logic consolidated in `syncSelection(id, source)`

### R3: Human Editing (Canvas)

#### R3a: Selection & Manipulation

- **R3.1** _(done)_: Click to select, Shift+click multi-select, marquee drag-to-select with Shift+marquee additive mode → [spec](specs/selection.md)
- **R3.2** _(done)_: Drag, resize, rotate; Shift-constrain to axis → [spec](specs/selection.md)
- **R3.16** _(done)_: 8-point resize grips (4 corners + 4 midpoints); directional cursors on hover → [spec](specs/selection.md)
- **R3.24** _(done)_: Group transparency — groups are purely organizational; clicking a child inside a group always selects the child directly (Figma behavior) → [spec](specs/selection.md)
- **R3.26** _(done)_: Arrow-key nudge — 1px (Shift = 10px); matches Figma/Sketch standard
- **R3.34** _(done)_: Group reparent on drag-out — child fully outside group bounds detaches to nearest containing ancestor; partial overlap expands group → [spec](specs/group-reparent.md)
- **R3.35** _(done)_: Detach snap animation — purple glow on near-detach, rubber-band line, scale pop + glow on detach; all animations <200ms → [spec](specs/group-reparent.md)
- **R3.36** _(done)_: Auto-center text in shapes — single text child inside rect/ellipse/frame auto-expands bounds to parent; renderer's center/middle alignment visually centers the label
- **R3.37** _(removed)_: ~~Center-snap for text nodes~~ — replaced by R3.38 context menu; center-snap guides removed to reduce visual noise
- **R3.38** _(removed)_: ~~Context-menu reparent on drop~~ — reverted; dragging a node onto a container no longer offers reparent
- **R3.39** _(done)_: Floating toolbar — draggable bottom toolbar with 7 tool buttons (SVG icons); drag handle toggles top/bottom position (80px threshold); double-click collapses to circle; state persists via VS Code webview state → [spec](specs/floating-toolbar.md)
- **R3.40** _(done)_: Toolbar tooltips — Apple-style frosted glass tooltips on hover (400ms delay); pill shape with backdrop-filter blur; shows tool name + shortcut; replaces native title attributes → [spec](specs/floating-toolbar.md)
- **R3.41** _(removed)_: ~~Click-to-raise~~ — removed in v0.10.68; caused surprise z-order changes and undo pollution; explicit ⌘] remains for intentional z-order changes
- **R3.42** _(done)_: Drag-to-create — drag a tool button from floating toolbar onto canvas creates shape at drop position; ghost preview (dashed outline matching shape type) follows cursor; ScreenBrush-style defaults (transparent fill, #333 stroke 2.5); smart defaults cascade applied → [spec](specs/floating-toolbar.md)
- **R3.43** _(done)_: Snap-to-node (⌥ Alt required) — holding ⌥ Alt while dropping near existing node (40px threshold) snaps to adjacent position (20px gap, 4 cardinal dirs); auto-creates edge from existing→new node (arrow:end, curve:smooth); shows frosted-glass edge context menu with arrow/curve/stroke/flow controls; Alt-aware ghost preview with dashed edge line during drag → [spec](specs/floating-toolbar.md)
- **R3.44** _(partial)_: Text consume on drag — Text tool dropped near edge (≤30px) inserts child text node in edge block; shape reparent on drop removed; hit priority: edge > empty canvas → [spec](specs/floating-toolbar.md)
- **R3.45** _(done)_: Auto-expand parent on release — `finalize_child_bounds()` expands parent groups/frames to contain overflowing children after resize or text growth; processes bottom-up for recursive cascade; skips `clip: true` frames; only on pointer-up (avoids chasing-envelope bug)
- **R3.46** _(done)_: Text intrinsic sizing — text node bounds auto-fit to content via Canvas2D `measureText()` bridge; JS measures → WASM `update_text_metrics()` → parent expansion via `finalize_bounds()`; wired into inline editor commit flow; parent resize propagates `max_width` to child text (permanent); `intrinsic_size` heuristic accounts for `max_width` wrap; post-resize JS remeasurement for accurate wrapped height
- **R3.47** _(done)_: Child containment constraint — child nodes cannot be fully outside their parent; dragging a child completely outside detaches it and reparents to nearest ancestor (enforced by `handle_child_group_relationship` in Rust)
- **R3.48** _(done)_: Eraser tool — swipe-to-delete tool with immediate visual feedback; `EraserTool` thin state tracker (drag lifecycle + erased IDs for undo grouping); FdCanvas manages actual node removal with group-aware detach (reparent child to root before RemoveNode) + cascade-delete empty Group/Frame containers up the ancestor chain
- **R3.54** _(done)_: Alt+drag clone — Alt+click duplicates node in-place (single source of truth in WASM `SelectTool::handle`); Alt pressed mid-drag clones-and-drags (Figma behavior); `alt_duplicated` flag prevents re-duplication; 3px movement threshold defers duplication to prevent accidental clones on Alt keypress; ghost preview shows original positions during clone-drag; clones get independent `Position` from resolved bounds (no inherited positioning constraints — fixes selection coupling and drag inversion); incremental naming (`foo` → `foo_2` → `foo_3`) via `next_clone_name()` graph scan
- **R3.59** _(done)_: Clipboard — ⌘C copies selected node(s) (multi-select supported); ⌘V pastes with +20px cumulative offset (not stacked on top); ⌘X cuts (copy + delete); paste is undoable via `push_undo_snapshot` WASM API
- **R3.60** _(done)_: Alt+drag multi-select — Alt+click/drag duplicates ALL selected nodes (batch clone with ID remapping); deep-copies Group/Frame subtrees; remaps internal constraint references (Offset, CenterIn); duplicates edges where both endpoints are selected
- **R3.61** _(done)_: Esc-to-cancel drag — pressing Esc during a node drag (move/resize/draw) restores the node to its pre-drag position via `abandon_batch()` text snapshot rollback; pressing Esc during toolbar drag-to-create cancels the ghost preview; no undo entry created for cancelled gestures

#### R3b: Drawing Tools

- **R3.3** _(done)_: Rectangle, ellipse, text, group tools with keyboard shortcuts (V/R/O/P/T) → [spec](specs/drawing-tools.md)
- **R3.4** _(partial)_: Freehand pen/pencil tool — Catmull-Rom smoothing done, pressure captured but not yet mapped to stroke width → [spec](specs/drawing-tools.md)
- **R3.5** _(planned)_: Path editing — node manipulation, curve handles, boolean operations
- **R3.15** _(planned)_: Live preview — dashed outline ghost during drag-to-create; smooth curve during pen draw → [spec](specs/drawing-tools.md)
- **R3.19** _(done)_: Alt-draw-from-center — Alt/⌥ anchors start point as center (not top-left); works for RectTool and EllipseTool; combinable with Shift for square/circle from center
- **R3.22** _(planned)_: Pressure-sensitive stroke width — pen maps pressure to thickness in real-time → [spec](specs/drawing-tools.md)
- **R3.23** _(planned)_: Freehand shape recognition — detect near-geometric shapes, offer "Snap to Shape" action → [spec](specs/drawing-tools.md)
- **R3.62** _(done)_: Path command serialization — `d:` inline SVG-like syntax (M/L/Q/C/Z) for pen tool path roundtrip; coordinates rounded to 2 decimals for token efficiency

#### R3c: Navigation & View

- **R3.6** _(done)_: Pan (Space+drag, middle-click, ⌘-hold), zoom (see R3.20), grid (see R3.21)
- **R3.13** _(done)_: Light/dark theme toggle — toolbar button, preference persists via VS Code state
- **R3.14** _(done)_: Design | Spec view toggle — segmented control; Spec View shows annotations overlay; spec badge toggle button (◇) for persistent badge visibility in Design mode; context menu shows View Spec / Remove Spec for annotated nodes; badges use faint/active states based on selection
- **R3.20** _(done)_: Zoom — ⌘+/⌘−, ⌘0 zoom-to-fit, pinch-to-zoom; zoom indicator in toolbar
- **R3.21** _(done)_: Grid overlay — toggleable dot/line grid with adaptive spacing; keyboard shortcut `G`
- **R3.25** _(done)_: Minimap — thumbnail in bottom-right with draggable viewport rectangle (Figma/Miro-style)
- **R3.30** _(done)_: Layer navigation — click layer item → smooth pan to center node (250ms ease-out); auto-zoom for tiny/overflow nodes

#### R3d: Panels & UI

- **R3.7** _(done)_: Undo/redo — full command stack, works across text and canvas edits
- **R3.8** _(done)_: Properties panel — frosted glass inspector for position, size, fill, stroke, corner, opacity; includes Actions section with Group, Ungroup, Duplicate, Frame, Front, Back, Copy PNG, Delete buttons; auto-disables state-dependent actions
- **R3.9** _(done)_: Insert dropdown — `＋ Insert` button in top bar with shape/layout popover; replaces bottom shape palette
- **R3.10** _(done)_: Apple Pencil Pro squeeze — toggle between last two tools
- **R3.11** _(done)_: Per-tool cursor feedback (crosshair, text cursor, default)
- **R3.12** _(done)_: Annotation pins — badge dots on annotated nodes with inline edit card
- **R3.17** _(done)_: Smart guides — alignment snapping with visual guide lines; Ctrl/⌘ to disable
- **R3.18** _(done)_: Dimension tooltip — floating `W × H` badge during draw/resize; `(X, Y)` during move
- **R3.27** _(done)_: Layer rename — double-click layer name for inline rename; renames `@id` document-wide → [spec](specs/inline-editing.md)
- **R3.28** _(done)_: Inline text editing — double-click to edit; Enter confirms, Esc reverts; live sync → [spec](specs/inline-editing.md)
- **R3.29** _(done)_: Animation drop — drag node onto another to assign animations via picker → [spec](specs/animation-system.md)

#### R3e: Export & Media

- **R3.31** _(done)_: Export — PNG (2×), SVG, clipboard; configurable background; ⌘⇧E shortcut
- **R3.32** _(done)_: Image embedding — `image` nodes with `src:` file reference; `ImageFit` enum (cover/contain/fill/none); parser/emitter roundtrip; renderer shows placeholder rect until WASM texture pipeline
- **R3.33** _(done)_: Component libraries — reusable node collections from a library panel; stored as `.fd` files; 3 built-in libraries (UI Kit, Flowchart, Wireframe)
- **R3.34** _(planned)_: Community library directory — searchable gallery for publishing and discovering shared libraries
- **R3.55** _(planned)_: Export to Excalidraw JSON — `export_excalidraw(graph)` converts FD scene to Excalidraw's JSON format; rect/ellipse/text/arrow elements mapped correctly; ⌘⇧X shortcut
- **R3.56** _(planned)_: Export to HTML+CSS+JS — `export_html(graph)` generates standalone responsive HTML page; shapes → `<div>`, text → `<p>`, constraints → flexbox, animations → CSS transitions
- **R3.57** _(planned)_: Fine pen tools — `taper_start`, `taper_end`, `smoothing` properties on pen strokes; variable stroke width rendering; settings in properties panel
- **R3.58** _(planned)_: Animation timeline — visual keyframe panel showing `when` blocks as timeline tracks; drag endpoints to adjust duration; scrub to preview animation state

### R4: AI Editing (Text)

- **R4.1** _(done)_: AI reads/writes `.fd` text directly — no binary format needed
- **R4.2** _(done)_: Semantic node names (`@login_form`, `@submit_btn`) help AI understand intent
- **R4.3** _(done)_: Style inheritance reduces repetition — AI only specifies overrides
- **R4.4** _(done)_: Constraints describe relationships ("center in canvas") not pixel positions
- **R4.5** _(done)_: Annotations (`spec` blocks) give AI structured metadata on visual elements
- **R4.6** _(done)_: Edges let AI reason about flows and transitions between screens
- **R4.7** _(done)_: Spec-view export — generate markdown report of `spec` annotations from any `.fd` file
- **R4.8** _(done)_: AI node refinement — restyle selected nodes, replace anonymous IDs via configurable provider
- **R4.9** _(done)_: Multi-provider AI — Gemini, OpenAI, Anthropic, Ollama, OpenRouter with per-provider API keys
- **R4.10** _(done)_: Auto-format pipeline — `format_document` via LSP; lint diagnostics + configurable transforms; canonical node ordering (Group/Frame → Rect → Ellipse → Text → Path → Generic)
- **R4.11** _(done)_: Inline Spec View — canvas-embedded spec overlay with node structure + annotations
- **R4.12** _(done)_: Content-first ordering — emitter outputs children before appearance properties inside node blocks; complex documents get `# ─── Section ───` separators (Styles, Layout, Constraints, Flows)
- **R4.13** _(done)_: Font weight names — parser/emitter use `bold`, `semibold`, `regular` etc. instead of numeric codes
- **R4.14** _(done)_: Color hint comments — emitter appends `# red`, `# purple` etc. after hex colors
- **R4.15** _(done)_: Named colors — `fill: purple` etc. accepted (17 Tailwind palette colors)
- **R4.16** _(done)_: Property aliases — `background:`/`color:` → fill, `rounded:`/`radius:` → corner
- **R4.17** _(done)_: Dimension units — `w: 320px` accepted, `px` stripped by parser
- **R4.18** _(done)_: Keyword rename — `theme` → `style` (reusable property bundles), `anim` → `when` for clarity; internal Rust struct `Style` → `Properties`, field `.style` → `.props`; emitter order: spec → children → style → when; old keywords (`theme`, `style` as legacy) accepted for backward compatibility
- **R4.19** _(done)_: ReadMode filtered views — `emit_filtered(graph, mode)` with 8 modes (Full/Structure/Layout/Design/Spec/Visual/When/Edges); CLI `fd-lsp --view <mode>` for AI token savings; VS Code read-only virtual document provider with status bar mode selector
- **R4.20** _(planned)_: AI Assist on selection — select nodes on canvas → click "✦ AI Assist" → AI receives `.fd` text of selected nodes → returns redesigned `.fd` → bidi-sync renders changes live; undo reverts entire AI edit atomically
- **R4.21** _(planned)_: **Comprehensibility Score** — compute a 0–100 score measuring how easily AI agents can understand an FD document. Metrics:
  - **Semantic naming ratio**: % of non-anonymous `@id`s (target: >80%)
  - **Inline doc-comment density**: % of nodes with `[auto]` or manual `#` comments
  - **Theme reuse ratio**: % of styled nodes using `use:` references vs inline styles
  - **Edge default coverage**: % of edges whose props match `edge_defaults {}`
  - **Read token cost**: total tokens in `ReadMode::Full` vs optimal `ReadMode::Structure`
  - Display as a badge in the Canvas toolbar (e.g. `AI: 72/100`) and in `fd-lsp --score`
  - Provide per-metric breakdown for targeted improvement suggestions

### R5: Rendering

- **R5.1** _(done)_: GPU-accelerated 2D rendering via Vello + wgpu (webview currently uses Canvas2D fallback)
- **R5.2** _(done)_: WASM-compatible for web/IDE deployment
- **R5.3** _(future)_: Native-compatible for desktop/mobile (same Rust code)
- **R5.4** _(done)_: Shapes: rect, ellipse, path, text, frame, generic
- **R5.5** _(done)_: Styling: fill, stroke, gradients, shadows, corner radius, opacity
- **R5.6** _(done)_: Animation: keyframe transitions with easing functions → [spec](specs/animation-system.md)
- **R5.7** _(done)_: Edge rendering: lines, smooth curves, step routing with arrowheads and labels → [spec](specs/edge-system.md)
- **R5.8** _(done)_: Edge animation rendering: trigger effects + flow animations → [spec](specs/edge-system.md)

### R6: Platform Targets

- **R6.1** _(done)_: VS Code / Cursor IDE custom editor extension (published)
- **R6.2** _(future)_: Desktop app via Tauri (macOS, Windows, Linux)
- **R6.3** _(future)_: Mobile app (iOS, Android) via native wgpu
- **R6.4** _(future)_: Web app (standalone browser app)
- **R6.5** _(done)_: GitHub Pages landing site at [fast-draft.com](https://fast-draft.com) with live WASM playground, custom domain (Cloudflare DNS), and auto-deploy via GitHub Actions (`pages.yml`)
- **R6.6** _(done)_: Interactive playground — canvas supports pointer events (select, drag, draw), floating toolbar with 7 SVG tool buttons (matching VS Code extension), minimap with zoom controls (bottom-right, click-to-pan, +/−/reset), undo/redo header buttons, clickable zoom reset, floating action bar (FAB), zoom/pan navigation, keyboard shortcuts, undo/redo, and bidirectional code↔canvas sync; zero Rust changes, all in `playground.js`/`index.html`/`style.css`

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

See [ARCHITECTURE.md](ARCHITECTURE.md) for full crate map, dependency graph, data flow, and rendering pipeline.

| Layer            | Technology                            |
| ---------------- | ------------------------------------- |
| Language         | Rust (edition 2024)                   |
| Rendering        | Vello + wgpu (Canvas2D fallback)      |
| Parsing          | winnow                                |
| Graph            | petgraph `StableDiGraph`              |
| String interning | lasso                                 |
| WASM             | wasm-pack + wasm-bindgen              |
| IDE glue         | TypeScript (minimal VS Code API shim) |
| Desktop (future) | Tauri                                 |

## Test Matrix

<!-- Maps each requirement to its test functions. If a row is empty, the requirement lacks test coverage. -->

| Requirement | Test Functions                                                                                                                                                                                                                  | Coverage                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| R1.1–R1.8   | `parser::tests::parse_*`, `emitter::tests::emit_*`, `roundtrip_*`                                                                                                                                                               | ✅ 76 fd-core + 18 integration |
| R1.9        | `emit_annotations_*`, `roundtrip_preserves_annotations`                                                                                                                                                                         | ✅                             |
| R1.10       | `parse_edge_*`, `emit_edge_*`, `roundtrip_edge_*`                                                                                                                                                                               | ✅                             |
| R1.11       | `emit_edge_with_trigger_anim`, `roundtrip_edge_hover_anim`                                                                                                                                                                      | ✅                             |
| R1.12       | `emit_edge_flow_*`, `roundtrip_edge_flow_*`                                                                                                                                                                                     | ✅                             |
| R1.13       | `emit_generic_node`, `roundtrip_generic_*`                                                                                                                                                                                      | ✅                             |
| R1.14       | `parse_import`, `emit_import`, `roundtrip_import`                                                                                                                                                                               | ✅                             |
| R1.15       | `emit_bg_shorthand`, `roundtrip_bg_shorthand`                                                                                                                                                                                   | ✅                             |
| R1.16       | `roundtrip_comment_*`                                                                                                                                                                                                           | ✅                             |
| R1.17       | `parse_align_*`, `roundtrip_align*`, `style_merging_align`                                                                                                                                                                      | ✅                             |
| R2.1–R2.5   | `sync::tests::sync_*`, `bidi_sync::*`, `e2e-ux: Canvas→Code`                                                                                                                                                                    | ✅ 12 sync + 9 integ + 4 E2E   |
| R3.1        | `tools::tests::select_tool_*`, `hit::tests::*`                                                                                                                                                                                  | ✅ 5 tests + 3 hit tests       |
| R3.2        | `select_tool_drag`, `select_tool_shift_drag_*`, resize integ., `sync_resize_frame_children_reflow`, `sync_resize_frame_centered_text_recenters`, `sync_move_frame_flush_no_jump`, `sync_move_frame_children_follow_after_flush` | ✅ 7 tests                     |
| R3.3        | `rect_tool_*`, `ellipse_tool_*`, `text_tool_*`                                                                                                                                                                                  | ✅ 7 tests                     |
| R3.4        | _(pen tool — captures pressure, no unit test)_                                                                                                                                                                                  | ⚠️ No pen tool tests           |
| R3.5        | _(planned)_                                                                                                                                                                                                                     | —                              |
| R3.6        | E2E UX: zoom/pan/pinch tests in `e2e-ux.test.ts`                                                                                                                                                                                | ✅ 4 E2E tests                 |
| R3.7        | `commands::tests::*`, `undo_redo::*`                                                                                                                                                                                            | ✅ 5 unit + 7 integration      |
| R3.8–R3.14  | E2E UX: properties, color, theme, view mode in `e2e-ux.test.ts`                                                                                                                                                                 | ✅ 12 E2E tests                |
| R3.16       | `hit_test_resize_handle` (WASM), E2E UX cursor tests                                                                                                                                                                            | ⚠️ WASM-side only              |
| R3.17       | E2E UX: grid/snap tests                                                                                                                                                                                                         | ⚠️ JS-only                     |
| R3.18       | E2E UX: dimension tooltip tests                                                                                                                                                                                                 | ⚠️ JS-only                     |
| R3.20       | E2E UX: zoom calculations, pinch clamp                                                                                                                                                                                          | ✅ 4 E2E tests                 |
| R3.21       | E2E UX: grid spacing adaptation                                                                                                                                                                                                 | ✅ 3 E2E tests                 |
| R3.24       | `effective_target_*`, `is_ancestor_of`, `hit_test_nested_groups`                                                                                                                                                                | ✅ 5 Rust + 4 E2E tests        |
| R3.25       | E2E UX: minimap scale, click-to-navigate                                                                                                                                                                                        | ✅ 2 E2E tests                 |
| R3.26       | E2E UX: arrow nudge 1px/10px                                                                                                                                                                                                    | ✅ 2 E2E tests                 |
| R3.27       | E2E UX: rename sanitization, word-boundary                                                                                                                                                                                      | ✅ 3 E2E tests                 |
| R3.28       | E2E UX: inline text editing, hex luminance                                                                                                                                                                                      | ✅ 3 E2E tests                 |
| R3.29       | E2E UX: animation tween engine                                                                                                                                                                                                  | ✅ 2 E2E tests                 |
| R3.30       | _(JS-only, camera animation)_                                                                                                                                                                                                   | ⚠️ JS-only                     |
| R4.1–R4.6   | Covered by R1/R2 tests                                                                                                                                                                                                          | ✅                             |
| R4.7–R4.11  | _(extension-side, no test)_                                                                                                                                                                                                     | ❌                             |
| R3.36       | `layout_text_centered_in_rect`, `layout_text_in_ellipse_*`, `layout_text_explicit_pos_*`                                                                                                                                        | ✅ 4 tests                     |
| R3.39–R3.44 | _(JS-only; floating toolbar, snap, edge context menu — no WASM-side tests)_                                                                                                                                                     | ⚠️ JS-only                     |
| R3.45       | `sync_resize_child_expands_parent_on_finalize`, `sync_resize_child_within_bounds_no_expand`, `sync_cascade_expand_two_levels`, `sync_cascade_stops_at_clip_frame`                                                               | ✅ 4 tests                     |
| R3.46       | _(JS-side measurement; WASM API `update_text_metrics` untested directly)_                                                                                                                                                       | ⚠️ WASM-side only              |
| R1.19       | `roundtrip_edge_label_offset`                                                                                                                                                                                                   | ✅ 1 test                      |
| R1.20       | `roundtrip_edge_point_anchors`, `roundtrip_edge_mixed_anchors`, `parse_edge_omitted_anchors_default`                                                                                                                            | ✅ 3 tests                     |
| R3.48       | `eraser_tool_lifecycle`, `eraser_tool_clear_resets_state`, `eraser_tool_pointerdown_clears_previous_ids`, `erase_child_preserves_group`, `erase_last_child_leaves_empty_group`, `erase_nested_cascade`                          | ✅ 6 tests                     |
| R5.1–R5.8   | `hit::tests::*`, `resolve::tests::*`, `render2d::tests::*`                                                                                                                                                                      | ✅ 3 hit + 6 layout + 3 render |

**Total**: 182 Rust tests + 188 TypeScript tests = **370 tests**

## Requirement Index

<!-- AI: Search this index BEFORE proposing new requirements. If a similar tag already exists, extend the existing requirement instead of creating a duplicate. Also check docs/specs/ for detailed spec docs. -->

| Tag                 | Requirements                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| selection           | R2.5, R3.1, R3.16, R3.24                                                 |
| drawing             | R3.3, R3.15, R3.19                                                       |
| pen / freehand      | R3.4, R3.22, R3.23                                                       |
| pan                 | R3.6, R3.10                                                              |
| zoom                | R3.6, R3.20                                                              |
| grid / snap         | R3.17, R3.21                                                             |
| cursor              | R3.11, R3.16                                                             |
| resize              | R3.2, R3.16                                                              |
| feedback / tooltip  | R3.15, R3.18                                                             |
| export              | R3.31, R3.55, R3.56, R4.7                                                |
| minimap             | R3.25                                                                    |
| nudge               | R3.26                                                                    |
| rename              | R3.27                                                                    |
| undo / redo         | R3.7                                                                     |
| properties          | R3.8                                                                     |
| drag-drop           | R3.9                                                                     |
| annotation          | R1.9, R3.12, R4.5                                                        |
| theme               | R3.13                                                                    |
| view mode           | R3.14, R4.11                                                             |
| pressure / pencil   | R3.4, R3.10, R3.22                                                       |
| ai / refinement     | R4.7, R4.8, R4.9, R4.10, R4.12, R4.13, R4.14, R4.15, R4.16, R4.17, R4.20, R4.21 |
| edge                | R1.10, R1.11, R1.12, R4.6, R5.7, R5.8                                    |
| import              | R1.14, R1.18                                                             |
| style / theme       | R1.4, R4.3, R4.18                                                        |
| animation           | R1.5, R1.11, R1.12, R3.29, R4.18, R5.6, R5.8                             |
| rendering           | R5.1, R5.2, R5.4, R5.5                                                   |
| platform            | R6.1, R6.2, R6.3, R6.4, R6.5, R6.6                                       |
| inline editing      | R3.28                                                                    |
| text alignment      | R1.17, R3.28, R3.36, R3.37                                               |
| layout / centering  | R3.36, R3.37                                                             |
| layers / navigation | R3.30                                                                    |
| group / drill-down  | R3.24, R3.34                                                             |
| group / reparent    | R3.34, R3.35, R3.38                                                      |
| image               | R3.32                                                                    |
| library             | R3.33, R3.34                                                             |
| group / frame       | R3.24, R3.34, R1.1                                                       |

| content-first | R4.12 |
| mermaid | R1.18 |
| floating toolbar | R3.39, R3.40, R3.42, R3.43, R3.44 |
| tooltip | R3.18, R3.40 |
| z-order / raise | R3.41 |
| drag-to-create | R3.42, R3.44 |
| snap / auto-edge | R3.43 |
| text consume | R3.44 |
| default styles | R3.42 |
| auto-expand | R3.45 |
| text sizing | R3.46, R3.36 |
| child containment | R3.47 |
| edge label | R1.10, R1.19, R1.20 |
| edge anchor | R1.20 |
| eraser / delete | R3.48 |
| excalidraw export | R3.55 |
| html export | R3.56 |
| fine pen / taper | R3.57, R3.4, R3.22 |
| animation timeline | R3.58, R1.5 |
| ai assist canvas | R4.20, R4.8 |
| alt-drag / clone | R3.54 |
| clipboard / copy-paste | R3.59 |
| alt-drag multi-select | R3.60 |
| esc-cancel / cancel-drag | R3.61 |
| path / d: commands | R3.62, R3.4 |
| padding / spacing | R1.21 |
