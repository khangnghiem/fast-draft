# FD Requirements

## Vision

FD (Fast Draft) is a file format and interactive canvas for drawing, design, and animation — built for both humans and AI agents. The `.fd` file is the single source of truth, bidirectionally synced with a visual canvas in real-time.

### Four Pillars

| | Pillar | One-liner |
|---|--------|-----------|
| 🔄 | **Design as Code** | Bidirectional sync between text and canvas. Git-friendly by nature. |
| 🤖 | **AI-Native Format** | Semantic IDs, constraint layout, ~6× fewer tokens. Agents read and write it natively. |
| 🧩 | **Living Components** | Styles, specs, and animations travel with every element. Reuse via `style` + `import`. |
| ✏️ | **Prompt as You Draw** | Code, canvas, keyboard, Apple Pencil, touch, or AI — every input composes. |

## Core Requirements

### R1: File Format (`.fd`)

- **R1.1** _(done)_: Token-efficient text DSL — ~5× fewer tokens than SVG for equivalent content
- **R1.2** _(done)_: Graph-based document model (DAG) — nodes reference by `@id`, not coordinates
- **R1.3** _(done)_: Constraint-based layout (`center_in`, `offset`, `fill_parent`) — no absolute coordinates until render time
- **R1.4** _(done)_: Reusable styles via `style` blocks and `use:` references (parser also accepts legacy `theme` keyword)
- **R1.5** _(done)_: Animation declarations with triggers (`:hover`, `:press`, `:enter`) and easing → [spec](specs/animation-system.md)
- **R1.6** _(done)_: Git-friendly plain text — line-oriented diffs work well
- **R1.7** _(done)_: Comments via `#` prefix
- **R1.8** _(done)_: Human-readable and AI-writable without special tooling
- **R1.9** _(done)_: Typed spec annotations (`spec` blocks) — structured `role:`, `trait:`, `intent:` keyword fields plus free-form markdown description; backward-compatible with legacy content; parsed into typed `Spec` struct and round-tripped faithfully
- **R1.10** _(done)_: First-class edges — header syntax `edge @name @from -> @to { ... }` (braceless, anonymous, inline label supported); body-form `edge @id { from: @a to: @b }` still accepted for backward compat; inline constraints (`center_in:`, `offset:`, `fill_parent:`) as node properties; arrow, curve, label, stroke, and `spec` annotations → [spec](specs/edge-system.md)
- **R1.11** _(done)_: Edge trigger animations — edges support `when :hover { ... }` blocks identical to nodes (parser also accepts legacy `anim` keyword) → [spec](specs/edge-system.md)
- **R1.12** _(done)_: Edge flow animations — `flow: pulse Nms` (traveling dot) and `flow: dash Nms` (marching dashes) → [spec](specs/edge-system.md)
- **R1.13** _(done)_: Generic nodes — `@id { ... }` without explicit kind keyword for abstract/placeholder elements
- **R1.14** _(done)_: Namespaced imports — `import "path.fd" as ns` for cross-file style/node reuse with `ns.style_name` references
- **R1.15** _(done)_: Background shorthand — `bg: #FFF corner=12 shadow=(0,4,20,#0002)` for combined fill, corner, and shadow in one line
- **R1.16** _(done)_: Comment preservation — `# text` lines attached to the following node survive all parse/emit round-trips and format passes
- **R1.17** _(done)_: Text alignment — `align: left|center|right [top|middle|bottom]` property; defaults to `center middle`; reusable via `style` blocks and `use:` inheritance
- **R1.18** _(done)_: Mermaid import — parse Mermaid diagram syntax (`flowchart`, `sequenceDiagram`, `stateDiagram`) into equivalent FD nodes + edges; `parse_mermaid()` in fd-core + `import_mermaid()` WASM API
- **R1.19** _(done)_: Edge label offset — `label_offset: <x> <y>` property on edges for draggable text labels; parse/emit roundtrip support
- **R1.20** _(done)_: Edge anchors — `EdgeAnchor` enum (`@node_id` or `x y` coords) for flexible edge endpoints; `text_child: Option<NodeId>` for styled text labels; `create_edge_at()` WASM API; edge-to-edge validation
- **R1.21** _(done)_: Free frame padding — `pad: <N>` property on Free-layout frames insets the content area; children default to padded origin, text centering and `place:` use padded bounds; also accepts `padding:` alias
- **R1.22** _(done)_: Style inheritance — `extends: <parent>` inside `style` blocks; child style inherits all parent properties, child properties override; max depth 8 prevents cycles; works with `use:` resolution and edge styles
- **R1.23** _(planned)_: Component template instantiation — `use: @node_id` to clone a node subtree as a component instance; enables true component reuse beyond flat style application; deferred for post-v1

### R2: Bidirectional Sync

- **R2.1** _(done)_: Canvas → Text: Visual edits (drag, resize, draw) update the `.fd` source in <16ms
- **R2.2** _(done)_: Text → Canvas: Source edits re-render the canvas in <16ms
- **R2.3** _(done)_: Incremental: Block-level hashing in `update_text_range()` skips full re-parse when block hashes are unchanged; falls back to full re-parse for structural changes
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
- **R3.39** _(done)_: Floating toolbar — draggable toolbar with 7 tool buttons (SVG icons); drag handle with grip; snaps to 4 edges within canvas bounds (never behind panels); **toolbar-rect-based snap detection** (projects toolbar bounding rect from cursor + grab offset, snaps when any toolbar edge is within 60px of canvas edge — closest edge wins); **grab-offset preservation** (shadow and snap position respect where user grabbed the grip, not cursor center); free-position snap (anywhere along edge, clamped within canvas); snap shadow shows exact landing position aligned with drag position **and swaps dimensions to match target edge orientation**; free-float on canvas interior (no forced edge dock); auto-dock on overflow; **canvas containment invariant: toolbar must always stay within visible canvas area, re-clamped on panel toggle, window resize, or any layout change**; velocity throw; **grip-anchored minimize** (double-click grip to minimize/expand; grip stays stationary, toolbar shrinks/expands toward it); insert button uses SVG icon (no separator dividers); state persists via localStorage; re-clamps on window resize and panel toggle → [spec](specs/floating-toolbar.md)
- **R3.40** _(done)_: Toolbar tooltips — Apple-style frosted glass tooltips on hover (400ms delay); pill shape with backdrop-filter blur; shows tool name + shortcut; replaces native title attributes → [spec](specs/floating-toolbar.md)
- **R3.41** _(removed)_: ~~Click-to-raise~~ — removed in v0.10.68; caused surprise z-order changes and undo pollution; explicit ⌘] remains for intentional z-order changes
- **R3.42** _(done)_: Drag-to-create — drag a tool button from floating toolbar onto canvas creates shape at drop position; ghost preview (dashed outline matching shape type) follows cursor; `e.preventDefault()` on pointerdown fixes native SVG drag hijacking; smart defaults cascade applied → [spec](specs/floating-toolbar.md)
- **R3.42b** _(done)_: Insert menu — `+` button in toolbar opens frosted glass dropdown (Rectangle, Ellipse, Text, Frame, Arrow); click to create at viewport center; `⌘/` keyboard shortcut toggles menu → [spec](specs/floating-toolbar.md)
- **R3.42c** _(done)_: DTC default fixes — ellipse 80×80 (visual parity with rect 120×80), transparent fill + theme-aware stroke (#333 light / #CCC dark) for shapes, white fill for frames; arrow removed from drag-to-create (kept in insert menu — arrows need anchor points, not bbox); `+` insert button visible when toolbar minimized
- **R3.43** _(done)_: Snap-to-node (⌥ Alt required) — holding ⌥ Alt while dropping near existing node (40px threshold) snaps to adjacent position (20px gap, 4 cardinal dirs); auto-creates edge from existing→new node (arrow:end, curve:smooth); shows frosted-glass edge context menu with arrow/curve/stroke/flow controls; Alt-aware ghost preview with dashed edge line during drag → [spec](specs/floating-toolbar.md)
- **R3.44** _(done)_: Edge text labeling — double-click on edge opens inline text editor for label; dedicated "text consume on drag" dropped in favor of simpler double-click UX → [spec](specs/floating-toolbar.md)
- **R3.45** _(done)_: Auto-expand parent on release — `finalize_child_bounds()` expands parent groups/frames to contain overflowing children after resize or text growth; processes bottom-up for recursive cascade; skips `clip: true` frames; only on pointer-up (avoids chasing-envelope bug)
- **R3.46** _(done)_: Text intrinsic sizing — text node bounds auto-fit to content via Canvas2D `measureText()` bridge; JS measures → WASM `update_text_metrics()` → parent expansion via `finalize_bounds()`; wired into inline editor commit flow; parent resize propagates `max_width` to child text (permanent); `intrinsic_size` heuristic accounts for `max_width` wrap; post-resize JS remeasurement for accurate wrapped height; managed-layout guard prevents `update_text_metrics` from shrinking column/row/grid-stretched text width
- **R3.47** _(done)_: Child containment constraint — child nodes cannot be fully outside their parent; dragging a child completely outside detaches it and reparents to nearest ancestor (enforced by `handle_child_group_relationship` in Rust)
- **R3.48** _(done)_: Eraser tool — swipe-to-delete tool with immediate visual feedback; `EraserTool` thin state tracker (drag lifecycle + erased IDs for undo grouping); FdCanvas manages actual node removal with group-aware detach (reparent child to root before RemoveNode) + cascade-delete empty Group/Frame containers up the ancestor chain
- **R3.54** _(done)_: Alt+drag clone — Alt+click duplicates node in-place (single source of truth in WASM `SelectTool::handle`); Alt pressed mid-drag clones-and-drags (Figma behavior); `alt_duplicated` flag prevents re-duplication; 3px movement threshold defers duplication to prevent accidental clones on Alt keypress; ghost preview shows original positions during clone-drag; clones get independent `Position` from resolved bounds (no inherited positioning constraints — fixes selection coupling and drag inversion); incremental naming (`foo` → `foo_2` → `foo_3`) via `next_clone_name()` graph scan
- **R3.59** _(done)_: Clipboard — ⌘C copies selected node(s) (multi-select supported); ⌘V pastes with +20px cumulative offset (not stacked on top); ⌘X cuts (copy + delete); paste is undoable via `push_undo_snapshot` WASM API
- **R3.60** _(done)_: Alt+drag multi-select — Alt+click/drag duplicates ALL selected nodes (batch clone with ID remapping); deep-copies Group/Frame subtrees; remaps internal constraint references (Offset, CenterIn); duplicates edges where both endpoints are selected
- **R3.61** _(done)_: Esc-to-cancel drag — pressing Esc during a node drag (move/resize/draw) restores the node to its pre-drag position via `abandon_batch()` text snapshot rollback; pressing Esc during toolbar drag-to-create cancels the ghost preview; no undo entry created for cancelled gestures

#### R3b: Drawing Tools

- **R3.3** _(done)_: Rectangle, ellipse, text, group tools with keyboard shortcuts (V/R/O/P/T) → [spec](specs/drawing-tools.md)
- **R3.4** _(done)_: Freehand pen/pencil tool — Catmull-Rom smoothing, pressure-sensitive stroke width (1.0–4.5px range via `pressure_to_stroke_width()`), default `#5E5CE6` stroke on creation → [spec](specs/drawing-tools.md)
- **R3.5** _(planned)_: Path editing — node manipulation, curve handles, boolean operations
- **R3.15** _(done)_: Live preview — canvas-projected WYSIWYG preview during drag-to-create renders the shape on the Canvas2D context in scene coordinates with actual default styles (fill, stroke, corner radius); zoom-aware; replaces DOM ghost → [spec](specs/drawing-tools.md)
- **R3.19** _(done)_: Alt-draw-from-center — Alt/⌥ anchors start point as center (not top-left); works for RectTool and EllipseTool; combinable with Shift for square/circle from center
- **R3.22** _(done)_: Pressure-sensitive stroke width — pen maps average pressure to stroke width on finalization (1.0–4.5px range); `SetStrokeWidth` mutation with undo/redo; 3 unit tests (light/heavy/default) → [spec](specs/drawing-tools.md)
- **R3.23** _(planned)_: Freehand shape recognition — detect near-geometric shapes, offer "Snap to Shape" action → [spec](specs/drawing-tools.md)
- **R3.62** _(done)_: Path command serialization — `d:` inline SVG-like syntax (M/L/Q/C/Z) for pen tool path roundtrip; coordinates rounded to 2 decimals for token efficiency
- **R3.63** _(done)_: Tool locking (sticky mode) — double-press keyboard shortcut (e.g. `R R`) or double-click toolbar button locks the tool so it stays active after placing shapes; select V or Escape to unlock; clear lock on tool switch
- **R3.64** _(done)_: ⌘+drag reparent — holding ⌘/Ctrl while dragging a node onto a container (Rect/Ellipse/Frame/Group) makes it a child; works across all tools; WASM `reparent_into()` API with cycle detection and container validation
- **R3.65** _(done)_: Drag-back-to-cancel — during a draw gesture, dragging back within 5px of the starting point resets the shape; pointer-up then triggers click-to-place (default size) instead of a tiny drawn shape; applies to RectTool and EllipseTool
- **R3.66** _(done)_: iPad interaction polish — persistent smart defaults via localStorage (fill/stroke/strokeWidth/opacity remembered across sessions); dimension tooltip during draw-tool gestures (Rect/Ellipse/Frame); 3-finger double-tap = undo (removed single-tap undo); pencil hover ghost preview for draw tools; Shift+Alt square/circle-from-center combo
- **R3.67** _(done)_: Input-aware Hand tool — Apple Pencil selects/moves (delegates to Select behavior), finger/mouse always pans; visual mode indicator (cursor changes on pen hover); drag-from-toolbar-to-canvas creates shapes in one gesture
- **R3.68** _(done)_: Layer drag-to-reparent — drag layer items to reparent into containers (split-zone: top/bottom 25% = reorder, middle 50% = nest); drag-to-reorder z-order siblings; right-click "Move Into" context menu; drop-to-root (empty space); all operations push undo snapshots; WASM `reorder_child()` + `get_container_ids()` APIs; `reparent_into()` enhanced to accept "root" target
- **R3.69** _(done)_: Layers panel file explorer UX — ⌘+Click multi-select (toggle), ⇧+Click batch-select (range), keyboard shortcuts (Delete/⌘C/⌘X/⌘V/⌘D/⌘A) when panel has focus, context menu with Duplicate/Copy/Paste/Delete actions, position-preserving reparent (fixes text node disappearance and identity duplication); WASM `toggle_select_by_id()`, `add_to_selection()`, `select_multiple_by_ids()` APIs
- **R3.70** _(done)_: Hand tool modifier keys — Alt (Option) on Hand = temp Select + clone (duplicate on click/drag); Cmd (⌘) on Hand = temp Select for move/select/reparent; creates V↔H symmetry (Select+Cmd=pan, Hand+Cmd=select); tool-aware modifier cursor previews (Hand+Cmd shows pointer cursor, not grab); restores Hand tool on pointer-up
- **R3.71** _(done)_: Arrow Shift+drag angle snap — holding Shift while drawing an arrow snaps the endpoint to the nearest 45° increment (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°); complete Shift modifier documentation in SHORTCUTS.md with per-tool constraint table; Frame tool inherits Shift+square from RectTool
- **R3.72** _(done)_: Center-in-parent reparent — opt-in mode for reparent operations via Alt+drop in Layers panel or "⊙ Center in @target" context menu item; strips positional constraints and adds `CenterIn(target)` constraint; default behavior (preserve visual position) unchanged; `reparent_into_centered()` WASM API

#### R3c: Navigation & View

- **R3.6** _(done)_: Pan (Space+drag, middle-click, ⌘-hold, Hand tool), zoom (see R3.20), grid (see R3.21); Hand tool is pan-only (click+drag to pan, no selection or node dragging); two-finger gestures always pan regardless of tool/target; normalized zoom wheel factor (`ZOOM_WHEEL_FACTOR = 1.04`) shared across platforms; smart two-finger disambiguation (50ms delay, 30px min distance, Apple Pencil palm rejection); touch inertia with weighted 3-frame velocity average and 0.95 friction; three-finger swipe undo/redo; long-press context menu (500ms); iPadOS-style gesture hierarchy: 3-finger tap=undo, double-tap=redo, pinch-in=copy, pinch-out=paste, long-press=edit menu; 4-finger tap=zen toggle, swipe up=zoom-to-fit, swipe down=zoom-to-selection, horizontal swipe=tool cycle
- **R3.13** _(done)_: Light/dark theme toggle — navbar ☀️/🌙 button + canvas toolbar icon + `D` shortcut; `prefers-color-scheme` detection on first visit; `localStorage` persistence; FOUC-preventing head script; VS Code extension auto-detects IDE theme
- **R3.14** _(done)_: Design | Spec view toggle — segmented control; Spec View shows annotations overlay; spec badge toggle button (◇) for persistent badge visibility in Design mode; context menu shows View Spec / Remove Spec for annotated nodes; badges use faint/active states based on selection
- **R3.20** _(done)_: Zoom — ⌘+/⌘−, ⌘0 zoom-to-fit, pinch-to-zoom; zoom indicator in toolbar
- **R3.21** _(done)_: Grid overlay — toggleable dot/line grid with adaptive spacing; keyboard shortcut `G`
- **R3.25** _(done)_: Minimap — thumbnail in bottom-right with draggable viewport rectangle (Figma/Miro-style)
- **R3.30** _(done)_: Layer navigation — click layer item → smooth pan to center node (250ms ease-out); auto-zoom for tiny/overflow nodes

#### R3d: Panels & UI

- **R3.7** _(done)_: Undo/redo — full command stack, works across text and canvas edits
- **R3.8** _(done)_: Properties panel — frosted glass inspector for position, size, fill, stroke, corner, opacity; includes Actions section with Group, Ungroup, Duplicate, Frame, Front, Back, Copy PNG, Delete buttons; auto-disables state-dependent actions
- **R3.9** _(done)_: Insert dropdown — `＋ Insert` button in top bar with shape/layout popover; replaces bottom shape palette
- **R3.10** _(done)_: Apple Pencil Pro squeeze — toggle between last two tools; _(planned)_: barrel roll (`UITouch.rollAngle`) for brush rotation and tilt (`azimuthAngle`/`altitudeAngle`) for shading on native iOS
- **R3.11** _(done)_: Per-tool cursor feedback (crosshair, text cursor, default)
- **R3.12** _(done)_: Annotation pins — badge dots on annotated nodes with inline edit card
- **R3.17** _(done)_: Smart guides — alignment snapping with visual guide lines; Ctrl/⌘ to disable
- **R3.18** _(done)_: Dimension tooltip — floating `W × H` badge during draw/resize; `(X, Y)` during move
- **R3.27** _(done)_: Layer rename — double-click layer name for inline rename; renames `@id` document-wide → [spec](specs/inline-editing.md)
- **R3.28** _(done)_: Inline text editing — double-click text to edit, double-click shape to drill into child text (creates one if absent, Figma behavior); Enter confirms, Esc reverts; live sync → [spec](specs/inline-editing.md)
- **R3.29** _(done)_: Animation drop — drag node onto another to assign animations via picker → [spec](specs/animation-system.md)

#### R3e: Export & Media

- **R3.31** _(done)_: Export — PNG (2×), SVG, clipboard; configurable background; ⌘⇧E shortcut
- **R3.32** _(done)_: Image embedding — `image` nodes with `src:` file reference; `ImageFit` enum (cover/contain/fill/none); parser/emitter roundtrip; renderer shows placeholder rect until WASM texture pipeline
- **R3.33** _(done)_: Component libraries — reusable node collections from a library panel; stored as `.fd` files; 3 built-in libraries (UI Kit, Flowchart, Wireframe)
- **R3.34** _(planned)_: Community library directory — searchable gallery for publishing and discovering shared libraries
- **R3.55** _(done)_: Export to Excalidraw JSON — `export_excalidraw(graph)` converts FD scene to Excalidraw's JSON format; rect/ellipse/text/arrow elements mapped correctly; ⌘⇧E shortcut
- **R3.56** _(done)_: Export to HTML+CSS+JS — `export_html(graph)` generates standalone responsive HTML page; shapes → `<div>`, text → `<p>`, constraints → flexbox, animations → CSS transitions
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
- **R4.16** _(done)_: Property aliases — `background:`/`color:` → fill, `border:` → stroke, `apply:` → use; emitter outputs `pad:` canonically; deprecated aliases `rounded:`/`radius:` removed (use `corner:` only)
- **R4.17** _(done)_: Dimension units — `w: 320px` accepted, `px` stripped by parser
- **R4.18** _(done)_: Keyword rename — `theme` → `style` (reusable property bundles), `anim` → `when` for clarity; internal Rust struct `Style` → `Properties`, field `.style` → `.props`; emitter order: spec → children → style → when; old keywords (`theme`, `style` as legacy) accepted for backward compatibility; `spec` → `note` keyword rename; `accept:` → `todo:` rename; raw markdown notes — `Annotation` enum deleted, `note: Option<String>` stores free-form markdown captured verbatim from `note { }` blocks
- **R4.19** _(done)_: ReadMode filtered views — `emit_filtered(graph, mode)` with 8 modes (Full/Structure/Layout/Design/Spec/Visual/When/Edges); CLI `fd-lsp --view <mode>` for AI token savings; VS Code read-only virtual document provider with status bar mode selector
- **R4.20** _(done)_: AI Touch on selection — select nodes on canvas → click "✦ AI Touch" → AI receives `.fd` text of selected nodes via `emit_selection_fd()` WASM API → returns redesigned `.fd` → bidi-sync renders changes live; undo reverts entire AI edit atomically
- **R4.21** _(done)_: **Comprehensibility Score** — `score.rs` computes a 0–100 score across 5 metrics (Semantic Naming, Doc-Comment Density, Style Reuse, Edge Default Coverage, Token Efficiency); exposed via `FdCanvas::compute_score()` WASM API. Metrics:
  - **Semantic naming ratio**: % of non-anonymous `@id`s (target: >80%)
  - **Inline doc-comment density**: % of nodes with `[auto]` or manual `#` comments
  - **Style reuse ratio**: % of styled nodes using `use:` references vs inline styles
  - **Edge default coverage**: % of edges whose props match `edge_defaults {}`
  - **Read token cost**: total tokens in `ReadMode::Full` vs optimal `ReadMode::Structure`
  - Display as a badge in the Canvas toolbar (e.g. `AI: 72/100`) and in `fd-lsp --score`
  - Provide per-metric breakdown for targeted improvement suggestions
- **R4.22** _(done)_: **AI Rate Limiting** — IP-based daily call limit via Cloudflare KV (`RATE_LIMIT` namespace). 10 calls/day/IP free tier (configurable via `AI_DAILY_LIMIT` env var). KV key format `ai:{ip}:{date}` with 24h TTL auto-cleanup. Responses include `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers. 429 response with `Retry-After` when exceeded. Frontend shows remaining-count toast when ≤2 calls left and rate-limit-exceeded toast on 429. Design Review costs 3 credits per review.
- **R4.23** _(done)_: **AI Quality Upgrade** — model upgraded from `@cf/meta/llama-3.1-8b-instruct` to `@cf/meta/llama-3.3-70b-instruct-fp8-fast` on Cloudflare Workers AI. Smart model routing: 8B for refine/renamify (fast, cheap), 70B for review (quality-critical). Enhanced system prompts include FD format syntax guide. Temperature 0.2–0.4 depending on mode.
- **R4.24** _(done)_: **Unified AI Touch Pipeline** — single "✦ AI Touch" button with context-adaptive behavior. **With selection**: two-phase pipeline — Phase 1 (8B model refine, 1 credit) applies styling + naming improvements to selected nodes, Phase 2 (70B model scoped review, 1 credit) scores the result and shows category findings in a frosted glass slide-up panel. Total cost: 2 credits. **Without selection**: full-document design review (3 parallel 70B calls, 3 credits) with per-category scores (Naming, Colors & Visuals, Structure & Layout). Review panel shows score badges (green ≥80, orange ≥50, red <50) with severity-graded findings. Full-doc review also accessible via ☰ settings menu → "Full Design Review".
- **R4.25** _(done)_: **Custom Prompt + Flat Findings** — right-click context menu `✦ AI Touch ▸` with expandable prompt textarea (200 chars max, localStorage persistence). `user_focus` field appended to AI system prompt for both refine and review modes. Review panel flattened from category cards to a single findings list; raw categories logged to console.debug for debugging.

### R5: Rendering

- **R5.1** _(done)_: GPU-accelerated 2D rendering via Vello + wgpu (webview currently uses Canvas2D fallback)
- **R5.2** _(done)_: WASM-compatible for web/IDE deployment
- **R5.3** _(planned)_: Native-compatible for desktop/mobile — same Rust core (`fd-core`, `fd-editor`) compiled to native ARM64/x86 via FFI; rendering via platform-specific `DrawBackend` implementations
- **R5.4** _(done)_: Shapes: rect, ellipse, path, text, frame, generic
- **R5.5** _(done)_: Styling: fill, stroke, gradients, shadows, corner radius, opacity
- **R5.6** _(done)_: Animation: keyframe transitions with easing functions → [spec](specs/animation-system.md)
- **R5.7** _(done)_: Edge rendering: lines, smooth curves, step routing with arrowheads and labels → [spec](specs/edge-system.md)
- **R5.8** _(done)_: Edge animation rendering: trigger effects + flow animations → [spec](specs/edge-system.md)
- **R5.9** _(partial)_: `DrawBackend` trait — pluggable rendering abstraction in `fd-render`; trait defined with ~30 methods mirroring Canvas2D API; `Canvas2dBackend`, `CoreGraphicsBackend`, `VelloBackend` implementations planned; `render2d.rs` refactoring to use `&dyn DrawBackend` is next phase

### R6: Platform Targets

- **R6.1** _(done)_: VS Code / Cursor IDE custom editor extension (published)
- **R6.2** _(done)_: Desktop app via Tauri v2 (macOS, Windows, Linux) — wraps shared `site/` web playground in native window; native file dialogs (⌘O/⌘S/⌘⇧S), recent files list; WASM rendering via Canvas2D in Tauri WebView; `fd-desktop/` crate with 5 IPC commands; `desktop.yml` CI workflow for cross-platform builds
- **R6.3** _(planned)_: iOS app — Swift + Rust via UniFFI; `CoreGraphicsBackend` for rendering; full Apple Pencil Pro support (squeeze R3.10, barrel roll, pressure, tilt, hover via `UIPencilInteraction` + `UITouch`); `InputEvent` mapping in ~50 lines of Swift; prerequisite: R5.9
- **R6.4** _(future)_: Web app (standalone browser app)
- **R6.5** _(done)_: Cloudflare Pages landing site at [fast-draft.com](https://fast-draft.com) with live WASM playground, custom domain, and auto-deploy via GitHub Actions (`pages.yml`) → Cloudflare Pages
- **R6.6** _(done)_: Interactive playground — canvas supports pointer events (select, drag, draw), layers panel (tree view sidebar), properties panel (right sidebar with fill/stroke/opacity/size), right-click context menu (duplicate/delete/z-order/group/copy), floating toolbar with 7 SVG tool buttons, minimap with zoom controls, undo/redo header buttons, clickable zoom reset, FAB, zoom/pan navigation, keyboard shortcuts, undo/redo, and bidirectional code↔canvas sync; zero Rust changes, all in `playground.js`/`index.html`/`style.css`
- **R6.7** _(done)_: Resizable panels — layers and properties panels are drag-to-resize with accent-highlighted handles; double-click handle to collapse (0px); click restore strip to uncollapse; widths persist via `localStorage` (site) / `vscode.setState()` (extension); canvas area dynamically adjusts via CSS variables `--layers-width` / `--props-width`; floating toolbar tracks layers width; at ≤768px viewport, `--layers-width` and `--props-width` reset to `0px` so canvas fills full width; layers panel accessible as slide-in drawer with toggle button and backdrop overlay; canvas-first mobile layout (code editor hidden by default, shown as overlay via toggle); debounced auto-fit on resize + orientation change; desktop Layers toggle `☰` button in toolbar (visible at all viewports); `\` keyboard shortcut toggles Layers panel; Notes panel resize (180–500px drag handle, `--notes-width` CSS variable, localStorage persistence); exclusive right-side panel policy (opening Notes auto-closes AI Chat and vice versa)
- **R6.8** _(done)_: Apple HIG canvas parity — website playground redesigned with Apple HIG design language (frosted glass, blue accent, SF Pro font, hairline borders); horizontal toolbar with text labels + keyboard hints replacing vertical floating toolbar; enriched properties panel with section labels; layers indent guides; dimension tooltip during drag; modifier cursor feedback (⌘=grab, Alt=copy)
- **R6.9** _(done)_: Import CSS — settings menu button triggers file picker for `.css` files; class selectors parsed and converted to FD `style` blocks (`fill`, `corner`, `opacity`, `shadow`, `stroke`, `font`); one-shot conversion with toast feedback; available on both website playground and VS Code extension
- **R6.10** _(done)_: CI/CD hardening — WASM build check in CI (catches `wasm32-unknown-unknown` breakage before merge); `Swatinem/rust-cache@v2` for smarter cargo caching; explicit minimal `permissions` on all workflows; unified `release.yml` with CI gate → parallel extension/LSP/Zed publish → GitHub Release (atomic all-or-nothing); branch protection recommended for `main`
- **R6.11** _(done)_: Code Mode syntax highlighting — FD tokens (keywords, node IDs, properties, strings, hex colors, numbers, comments) colorized in the web playground's Code panel via transparent textarea + `<pre>` overlay pattern; token colors follow VS Code dark+ palette with light theme variants; zero external dependencies; scroll-synced with sub-frame latency
- **R6.12** _(partial — Phase 2 done)_: Shared canvas UI module (`canvas-core`) — ES module package with shared state (zoom/pan/dirty flags), render loop (tween engine, grid, fit-to-content), viewport geometry (resize handles, pinch, nudge), clipboard utilities (extractNodeBlock, paste ID renaming), shortcut constants + help overlay HTML; `playground.js` imports from `canvas-core/`; VS Code extension migration pending (requires esbuild switch)
- **R6.13** _(planned)_: Android app — Kotlin + Rust via JNI/NDK; `AndroidCanvasBackend` for rendering; `MotionEvent` → `InputEvent` mapping; prerequisite: R5.9
- **R6.14** _(planned)_: Cloud file sync — `.fd` plain-text files synced via platform-native backends: iCloud Drive (`UIDocument` + `NSFilePresenter`) on iOS/macOS, Google Drive (Storage Access Framework) on Android, native filesystem on Desktop/VS Code; no custom backend needed for V1; real-time collaboration (CRDT/OT) deferred to V2
- **R6.15** _(done)_: Documentation pages — `/docs/` section on fast-draft.com with Language Reference, Keyboard Shortcuts, and Changelog pages; shared docs stylesheet with dark theme, fixed sidebar, scroll-spy, responsive layout
- **R6.16** _(done)_: Reduce motion accessibility — respects OS `prefers-reduced-motion` via global CSS blanket rule (kills all animations/transitions); manual toggle in ☰ Settings dropdown + `⇧M` shortcut with `localStorage` persistence; JS guards skip inertia, detach animation, and focus pan easing; VS Code extension parity via `reduceMotion` flag in `state.js`
- **R6.17** _(done)_: Panel layout redesign — removed theater opening animation (panels always visible from saved state); left panel tabs consolidated to Code + Inspect (merged Specs+Design); right panel gets Agent + Export tabs; top-corner chrome pills (sidebar toggle top-left, Sign in + Settings dropdown + Hamburger toggle top-right); minimap offset by `--right-panel-actual-width` CSS variable to prevent right panel overlap; panel collapsed state and active tab persisted in localStorage
- **R6.18** _(done)_: UI refinements v2 — Apple-style 28px icon buttons (offset by panel widths, never overlap panels); Layers merged into left panel tabs (Layers/Code/Inspect); right panel tabs Agent/Export/Settings; handwritten Caveat-font onboarding hints on canvas only (no overlay, auto-dismiss 8s, pointer-events none); Agent header deduped; left panel 320px user-resizable; responsive minimap (viewport-proportional, toolbar collision avoidance)
- **R6.19** _(done)_: Chrome layout redesign — theme toggle moved from chrome-left into Settings dropdown (chrome-left is sidebar toggle only); Export tab replaced with floating Share dropdown (↗) in chrome-right; Import CSS and Sign-in moved to Settings dropdown; chrome-right order: Share → Settings → Right Panel toggle
- **R6.20** _(done)_: Right panel Search tab — Export and Settings tabs removed from right panel; new Search tab with live text search through FD code (searches node IDs, text content, style names); results show @id, context snippet, line number; click result to select node on canvas and scroll to line in code editor
- **R6.21** _(done)_: Adaptive sidebar toggle icons — sidebar toggle buttons appear in panel tab headers when panels are open (and hide from chrome); when panels collapse, chrome toggle icons reappear; panel z-index raised to 25 (above chrome at 20) for proper overlay

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

| Layer            | Technology                                                   |
| ---------------- | ------------------------------------------------------------ |
| Language         | Rust (edition 2024)                                          |
| Rendering        | Vello + wgpu (Canvas2D fallback); `DrawBackend` trait (R5.9) |
| Parsing          | winnow                                                       |
| Graph            | petgraph `StableDiGraph`                                     |
| String interning | lasso                                                        |
| WASM             | wasm-pack + wasm-bindgen                                     |
| IDE glue         | TypeScript (shared `fd-canvas-ui` module, R6.12)             |
| Desktop          | Tauri v2 (R6.2)                                              |
| iOS              | Swift + UniFFI + CoreGraphics (R6.3)                         |
| Android          | Kotlin + JNI/NDK (R6.13)                                     |

## Test Matrix

<!-- Maps each requirement to its test functions. If a row is empty, the requirement lacks test coverage. -->

| Requirement | Test Functions                                                                                                                                                                                                                                                     | Coverage                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| R1.1–R1.8   | `parser::tests::parse_*`, `emitter::tests::emit_*`, `roundtrip_*`                                                                                                                                                                                                  | ✅ 76 fd-core + 18 integration |
| R1.9        | `emit_annotations_*`, `roundtrip_preserves_annotations`                                                                                                                                                                                                            | ✅                             |
| R1.10       | `parse_edge_*`, `emit_edge_*`, `roundtrip_edge_*`                                                                                                                                                                                                                  | ✅                             |
| R1.11       | `emit_edge_with_trigger_anim`, `roundtrip_edge_hover_anim`                                                                                                                                                                                                         | ✅                             |
| R1.12       | `emit_edge_flow_*`, `roundtrip_edge_flow_*`                                                                                                                                                                                                                        | ✅                             |
| R1.13       | `emit_generic_node`, `roundtrip_generic_*`                                                                                                                                                                                                                         | ✅                             |
| R1.14       | `parse_import`, `emit_import`, `roundtrip_import`                                                                                                                                                                                                                  | ✅                             |
| R1.15       | `emit_bg_shorthand`, `roundtrip_bg_shorthand`                                                                                                                                                                                                                      | ✅                             |
| R1.16       | `roundtrip_comment_*`                                                                                                                                                                                                                                              | ✅                             |
| R1.17       | `parse_align_*`, `roundtrip_align*`, `style_merging_align`                                                                                                                                                                                                         | ✅                             |
| R2.1–R2.5   | `sync::tests::sync_*`, `bidi_sync::*`, `e2e-ux: Canvas→Code`                                                                                                                                                                                                       | ✅ 12 sync + 9 integ + 4 E2E   |
| R3.1        | `tools::tests::select_tool_*`, `hit::tests::*`                                                                                                                                                                                                                     | ✅ 5 tests + 3 hit tests       |
| R3.2        | `select_tool_drag`, `select_tool_shift_drag_*`, resize integ., `sync_resize_frame_children_reflow`, `sync_resize_frame_centered_text_recenters`, `sync_move_frame_flush_no_jump`, `sync_move_frame_children_follow_after_flush`, `sync_frame_does_not_auto_resize` | ✅ 8 tests                     |
| R3.3        | `rect_tool_*`, `ellipse_tool_*`, `text_tool_*`                                                                                                                                                                                                                     | ✅ 7 tests                     |
| R3.4        | `tool_pen_basic_draw`, `tool_pen_two_points`, `tool_pen_cancel`, `tool_pen_subsampling`                                                                                                                                                                          | ✅ Covered by PenTool unit tests |
| R3.5        | _(planned)_                                                                                                                                                                                                                                                        | —                              |
| R3.6        | E2E UX: zoom/pan/pinch tests in `e2e-ux.test.ts`                                                                                                                                                                                                                   | ✅ 4 E2E tests                 |
| R3.7        | `commands::tests::*`, `undo_redo::*`                                                                                                                                                                                                                               | ✅ 5 unit + 7 integration      |
| R3.8–R3.14  | E2E UX: properties, color, theme, view mode in `e2e-ux.test.ts`                                                                                                                                                                                                    | ✅ 12 E2E tests                |
| R3.16       | `hit_test_resize_handle` (WASM), E2E UX cursor tests                                                                                                                                                                                                               | ✅ 2 WASM tests                |
| R3.17       | E2E UX: grid/snap tests                                                                                                                                                                                                                                            | ⚠️ JS-only                     |
| R3.18       | E2E UX: dimension tooltip tests                                                                                                                                                                                                                                    | ⚠️ JS-only                     |
| R3.20       | E2E UX: zoom calculations, pinch clamp                                                                                                                                                                                                                             | ✅ 4 E2E tests                 |
| R3.21       | E2E UX: grid spacing adaptation                                                                                                                                                                                                                                    | ✅ 3 E2E tests                 |
| R3.24       | `effective_target_*`, `is_ancestor_of`, `hit_test_nested_groups`                                                                                                                                                                                                   | ✅ 5 Rust + 4 E2E tests        |
| R3.25       | E2E UX: minimap scale, click-to-navigate                                                                                                                                                                                                                           | ✅ 2 E2E tests                 |
| R3.26       | E2E UX: arrow nudge 1px/10px                                                                                                                                                                                                                                       | ✅ 2 E2E tests                 |
| R3.27       | E2E UX: rename sanitization, word-boundary                                                                                                                                                                                                                         | ✅ 3 E2E tests                 |
| R3.28       | E2E UX: inline text editing, hex luminance                                                                                                                                                                                                                         | ✅ 3 E2E tests                 |
| R3.29       | E2E UX: animation tween engine                                                                                                                                                                                                                                     | ✅ 2 E2E tests                 |
| R3.30       | _(JS-only, camera animation)_                                                                                                                                                                                                                                      | ⚠️ JS-only                     |
| R4.1–R4.6   | Covered by R1/R2 tests                                                                                                                                                                                                                                             | ✅                             |
| R4.7–R4.11  | _(extension-side, no test)_                                                                                                                                                                                                                                        | ❌                             |
| R3.36       | `layout_text_centered_in_rect`, `layout_text_in_ellipse_*`, `layout_text_explicit_pos_*`                                                                                                                                                                           | ✅ 4 tests                     |
| R3.39–R3.44 | _(JS-only; floating toolbar, snap, edge context menu — no WASM-side tests)_                                                                                                                                                                                        | ⚠️ JS-only                     |
| R3.45       | `sync_resize_child_expands_parent_on_finalize`, `sync_resize_child_within_bounds_no_expand`, `sync_cascade_expand_two_levels`, `sync_cascade_stops_at_clip_frame`                                                                                                  | ✅ 4 tests                     |
| R3.46       | _(JS-side measurement; WASM API `update_text_metrics` untested directly)_                                                                                                                                                                                          | ⚠️ WASM-side only              |
| R1.19       | `roundtrip_edge_label_offset`                                                                                                                                                                                                                                      | ✅ 1 test                      |
| R1.20       | `roundtrip_edge_point_anchors`, `roundtrip_edge_mixed_anchors`, `parse_edge_omitted_anchors_default`                                                                                                                                                               | ✅ 3 tests                     |
| R3.48       | `eraser_tool_lifecycle`, `eraser_tool_clear_resets_state`, `eraser_tool_pointerdown_clears_previous_ids`, `erase_child_preserves_group`, `erase_last_child_leaves_empty_group`, `erase_nested_cascade`                                                             | ✅ 6 tests                     |
| R5.1–R5.8   | `hit::tests::*`, `resolve::tests::*`, `render2d::tests::*`                                                                                                                                                                                                         | ✅ 3 hit + 6 layout + 3 render |

**Total**: 186 Rust tests + 188 TypeScript tests = **374 tests**

## Requirement Index

<!-- AI: Search this index BEFORE proposing new requirements. If a similar tag already exists, extend the existing requirement instead of creating a duplicate. Also check docs/specs/ for detailed spec docs. -->

| Tag                 | Requirements                                                                            |
| ------------------- | --------------------------------------------------------------------------------------- |
| selection           | R2.5, R3.1, R3.16, R3.24                                                                |
| drawing             | R3.3, R3.15, R3.19                                                                      |
| pen / freehand      | R3.4, R3.22, R3.23                                                                      |
| pan                 | R3.6, R3.10                                                                             |
| zoom                | R3.6, R3.20                                                                             |
| grid / snap         | R3.17, R3.21                                                                            |
| cursor              | R3.11, R3.16                                                                            |
| resize              | R3.2, R3.16                                                                             |
| feedback / tooltip  | R3.15, R3.18                                                                            |
| export              | R3.31, R3.55, R3.56, R4.7                                                               |
| minimap             | R3.25                                                                                   |
| nudge               | R3.26                                                                                   |
| rename              | R3.27                                                                                   |
| undo / redo         | R3.7                                                                                    |
| properties          | R3.8                                                                                    |
| drag-drop           | R3.9                                                                                    |
| annotation          | R1.9, R3.12, R4.5                                                                       |
| theme               | R3.13                                                                                   |
| view mode           | R3.14, R4.11                                                                            |
| pressure / pencil   | R3.4, R3.10, R3.22                                                                      |
| ai / refinement     | R4.7, R4.8, R4.9, R4.10, R4.12, R4.13, R4.14, R4.15, R4.16, R4.17, R4.20, R4.21, R4.22, R4.23, R4.24, R4.25, R4.26 |
| rate-limit          | R4.22                                                                                   |
| edge                | R1.10, R1.11, R1.12, R4.6, R5.7, R5.8                                                   |
| import              | R1.14, R1.18                                                                            |
| style / theme       | R1.4, R1.22, R4.3, R4.18                                                                |
| animation           | R1.5, R1.11, R1.12, R3.29, R4.18, R5.6, R5.8                                            |
| rendering           | R5.1, R5.2, R5.4, R5.5, R5.9                                                            |
| platform            | R6.1, R6.2, R6.3, R6.4, R6.5, R6.6, R6.7, R6.8, R6.9, R6.10, R6.11, R6.12, R6.13, R6.14, R6.15, R6.16, R6.17, R6.18 |
| draw-backend        | R5.3, R5.9                                                                              |
| cross-platform      | R5.9, R6.2, R6.3, R6.12, R6.13, R6.14                                                   |
| ios / apple-pencil  | R3.10, R6.3                                                                             |
| android             | R6.13                                                                                   |
| file-sync / cloud   | R6.14                                                                                   |
| shared-ui           | R6.12                                                                                   |
| inline editing      | R3.28                                                                                   |
| text alignment      | R1.17, R3.28, R3.36, R3.37                                                              |
| layout / centering  | R3.36, R3.37                                                                            |
| layers / navigation | R3.30                                                                                   |
| group / drill-down  | R3.24, R3.34                                                                            |
| group / reparent    | R3.34, R3.35, R3.38                                                                     |
| image               | R3.32                                                                                   |
| library             | R3.33, R3.34                                                                            |
| group / frame       | R3.24, R3.34, R1.1                                                                      |

| content-first | R4.12 |
| mermaid | R1.18 |
| floating toolbar | R3.39, R3.40, R3.42, R3.43, R3.44 |
| tooltip | R3.18, R3.40 |
| z-order / raise | R3.41 |
| drag-to-create | R3.42, R3.42b, R3.44 |
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
| resizable panels | R6.7 |
| edge selection | R3.1, R1.10 |
| tool locking / sticky | R3.63 |
| reparent / nesting | R3.34, R3.64, R3.68, R3.72 |
| drag-back-to-cancel | R3.65 |
| smart defaults / ipad | R3.66, R3.42 |
| hand tool / input-aware | R3.67, R3.70, R6.6 |
| drag-from-toolbar | R3.67 |
| layers-panel-ux | R3.69, R3.68, R3.30 |
| hand-tool-modifiers | R3.70, R3.54 |
| arrow-shift-snap / shift-constraint | R3.71, R3.54, R3.66 |
| mcp-server          | R4.25                                                                                   |
| ai-chat / agent     | R4.26                                                                                   |
| collaboration       | R7.1                                                                                    |
| community-library   | R7.2                                                                                    |
| lasso               | R3.73                                                                                   |
| presentation        | R3.74                                                                                   |
| quick-color-picker  | R3.75                                                                                   |
| share-modal         | R3.76                                                                                   |
| image-drop          | R3.77                                                                                   |
| instant-start       | R6.17                                                                                   |

---

## Future Requirements (Deferred)

### R7.1 — Real-Time Collaboration

**Priority**: Low (multi-week project)
**Inspired by**: Excalidraw live collaboration

Requirements:
- WebSocket-based multi-cursor support
- CRDT or OT for conflict-free concurrent editing
- Presence indicators (colored cursors with names)
- Room-based sessions with shareable join links
- Backend infrastructure needed: WebSocket server, session management, state persistence
- Consider Yjs or Automerge for CRDT integration
- Must work with both FD text and canvas sync engine

**Architecture considerations**: FD's bidirectional sync engine already tracks mutations as `GraphMutation`s — these could be serialized and broadcast. The SyncEngine would need to handle remote mutations without triggering re-parse loops.

### R7.2 — Community Library Ecosystem

**Priority**: Low (multi-week project)
**Inspired by**: Excalidraw library panel

Requirements:
- Shareable component libraries (.fdlib format)
- Browse + search community-contributed templates
- One-click import of library items onto canvas
- Library panel UI in sidebar
- Backend infrastructure needed: library registry API, CDN for library assets, user accounts
- Version management for libraries
- Categories: UI kits, icons, wireframes, flowcharts, architecture diagrams

**Format consideration**: Libraries would be `.fd` files bundled with metadata (name, author, tags, preview thumbnail). The FD format already supports styles and components via `use:` and `style` blocks — libraries would extend this pattern.
