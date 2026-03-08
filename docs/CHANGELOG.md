# FD Changelog

> Tracks requirement completion status across the entire FD project.
> For VS Code extension release notes, see [`fd-vscode/CHANGELOG.md`](../fd-vscode/CHANGELOG.md).

<!-- KEYWORD INDEX — grep to find relevant sections:
  Current v0.10.x (recent, individual entries)    → L8-431
  Epoch v0.9.x (eraser, text fixes)               → L433-449
  Epoch v0.8.70-99 (canvas UX, toolbar, groups)    → L451-497
  Epoch v0.8.30-69 (zen, shortcuts, AI, spec)      → L499-540
  Epoch v0.6.32-v0.8.29 (core editing, frames)     → L542-572
  toolbar, drag, resize, pointer    → search v0.10.x entries
  frame, child, containment         → search v0.10.x entries
  eraser, delete, swipe             → search v0.9.x epoch
  group, drill-down, selection      → search v0.8.70-99 epoch
-->

## Completed Requirements

### v0.10.85 — Edge Selection (R3.1)

- **FEATURE (R3.1)**: Edges are now selectable on canvas — click an edge stroke (5px hit radius) to select, Shift+click for multi-select, marquee box selection includes edges; selected edges show #4FC3F7 highlight stroke; Delete/Backspace removes selected edges via `RemoveEdge` mutation (undoable); properties panel shows edge-specific properties (from/to, arrow, curve, stroke, flow)
- **CORE**: New `hit_test_edge()` in `hit.rs` — point-to-curve distance testing for all 3 curve types: Straight (line segment), Smooth (quadratic Bézier flattened to 8 segments), Step (3-segment orthogonal path); closest-edge wins when multiple overlap
- **CORE**: New `hit_test_rect_edges()` in `hit.rs` — marquee rectangle intersection testing for edges using segment-vs-rect cross-product orientation test
- **WASM**: `hit_test()` falls back to edges when no node is hit (nodes take priority); `select_by_id()` accepts edge IDs; `delete_selected()` emits `RemoveEdge` for edge IDs; `edge_props_json()` serializes edge properties for the inspector panel
- **RENDER**: `draw_edges()` renders 3px-wider #4FC3F7 highlight stroke on selected edges
- **TESTING**: 6 new tests — `point_to_segment_dist_basic`, `point_to_segment_dist_endpoint`, `hit_test_edge_straight`, `hit_test_edge_point_anchors`, `hit_test_edge_step`, `hit_test_rect_edges_marquee`

### v0.10.84 — Canvas UI Parity: Site ↔ VSCode (R6.8)

- **UX (R6.8)**: Floating scroll toolbar — replaced static top toolbar with wooden scroll handles, paper rolls, and SVG icon tool buttons matching VSCode extension's scroll toolbar design
- **UX (R6.8)**: Settings menu inside canvas — moved settings from outer toolbar to a hamburger (☰) icon inside the canvas wrapper; frosted glass dropdown with toggle switches for dark mode, sketchy mode, grid, zen mode, and export actions
- **UX (R6.8)**: Light/dark theme toggle — canvas chrome (toolbar, panels, FAB, minimap) now supports both themes via `.dark-canvas` CSS class; light theme is default with CSS variables, dark overrides scoped to class
- **UX (R6.8)**: Frosted glass FAB — floating action bar upgraded with `backdrop-filter: blur(20px)`, stroke-width number input, opacity slider with percentage readout, and red delete button
- **UX (R6.8)**: Minimap zoom pill — replaced simple zoom buttons with Google Maps-style pill (`[− 100% +]`) overlaid on minimap; frosted glass background
- **UX (R6.8)**: Zen mode toggle button — dedicated button in canvas area for quick Zen mode activation
- **SITE**: All changes in `site/index.html`, `site/style.css`, `site/playground.js` — no Rust crate changes

### v0.10.83 — CI/CD Hardening (R6.10)

- **CI (R6.10)**: Added WASM build check to CI — `wasm-pack build crates/fd-wasm` now runs on every push/PR to `main`, catching WASM-breaking Rust changes before merge (previously only caught at deploy time in `pages.yml`)
- **CI (R6.10)**: Replaced manual `actions/cache` with `Swatinem/rust-cache@v2` across all workflows — smarter per-crate caching with partial restore keys; ~30–60s faster CI runs; shared cache keys (`ci`, `wasm`) reduce cache duplication
- **CI (R6.10)**: Added explicit `permissions: contents: read` to `ci.yml` and `pages.yml` — minimal token scope prevents accidental write access in CI jobs
- **CI (R6.10)**: Unified release workflow — merged `publish.yml` + `release.yml` into a single `release.yml` with job dependency graph: CI gate → extension publish + LSP binary builds + Zed extension (parallel) → GitHub Release; atomic all-or-nothing release prevents half-published states
- **CLEANUP**: Deleted `publish.yml` (absorbed into unified `release.yml`)

### v0.10.82 — Complete `theme` → `style` Keyword Cleanup (R4.18)

- **CLEANUP (R4.18)**: Replaced all remaining `theme` keywords with `style` across the entire codebase — playground examples in `site/playground.js` (3 example strings, 6 occurrences), 3 library `.fd` files (`wireframe`, `flowchart`, `ui-kit`), 9 benchmark `.fd` files, 3 design doc `.fd` files, 3 example `.fd` files; also updated `# ─── Themes ───` section headers to `# ─── Styles ───` in all 13 affected files
- **DOCS (R4.18)**: Updated `LIBRARIES.md` (code examples + convention table), `ARCHITECTURE.md` (SceneGraph/SceneNode field descriptions), `REQUIREMENTS.md` (R1.4, R1.17, R4.21 wording) to reflect `style` as the primary keyword with `theme` as legacy alias

### v0.10.81 — Simplify "Under the Hood" Section

- **SITE**: Removed redundant ASCII architecture diagram — crate cards already conveyed the same info; eliminates responsive breakage on narrow screens
- **SITE**: Merged 5 crate cards into 3 logical groups (Core Engine, GPU Renderer, Canvas Editor) with data flow pipeline one-liners (e.g. `.fd text → Parser → SceneGraph → Emitter → .fd text`)
- **SITE**: Simplified subtitle from "Five Rust crates, one TypeScript extension, zero compromises" to "Rust + WASM, from parser to pixel."
- **CLEANUP**: Removed `.arch-diagram` and `.arch-ascii` CSS (~18 lines); added `.crate-flow` monospace style for pipeline one-liners

### v0.10.80 — Migrate to Cloudflare Pages (R6.5)

- **INFRA (R6.5)**: Migrated site hosting from GitHub Pages to Cloudflare Pages — 330+ edge PoPs (was ~10 Fastly), HTTP/3+QUIC, custom response headers, unlimited bandwidth; hybrid deploy: GitHub Actions builds WASM → `wrangler-action@v3` pushes to CF Pages
- **PERF**: Added `site/_headers` — WASM binary cached for 1 year (`Cache-Control: immutable`); security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`) on all responses
- **CLEANUP**: Removed `site/CNAME` (not needed for CF Pages custom domain binding)
- **DOCS**: Updated `GEMINI.md` Tier 2 table, `REQUIREMENTS.md` R6.5

### v0.10.79 — Cross-Framework Property Aliases (R4.16)

- **FEATURE (R4.16)**: `border:` accepted as alias for `stroke:` — CSS/Tailwind's most common expectation for outline/border styling; emitter outputs canonical `stroke:`
- **FEATURE (R4.16)**: `apply:` accepted as alias for `use:` — Tailwind's `@apply` convention for referencing style blocks; emitter outputs canonical `use:`
- **EMITTER (R4.16)**: Standalone padding now emits `padding:` instead of `pad:` — `padding` is the universal term across CSS, Flutter, SwiftUI, and Compose; parser still accepts both `pad:` and `padding:`
- **TESTING**: 3 new tests — `parse_property_alias_border` (border→stroke roundtrip), `parse_property_alias_apply` (apply→use roundtrip), `roundtrip_padding_canonical` (padding: survives parse/emit)

### v0.10.78 — Import CSS Styles (R6.9)

- **FEATURE (R6.9)**: "Import CSS" button in canvas settings menu (⚙️) — click to select a `.css` file; class selectors are parsed and converted to FD `style` blocks using `parseCssToFdStyles()`, then prepended to the editor with a section header comment
- **CSS→FD MAPPING**: `background-color`/`background` → `fill`; `color` → `fill`; `border-radius` → `corner`; `opacity` → `opacity`; `box-shadow` → `shadow`; `border` → `stroke`; `font-family`/`font-size`/`font-weight` → `font`; unsupported properties silently ignored
- **UX**: Class names sanitized to FD identifiers (`.btn-primary` → `btn_primary`); RGB/RGBA colors auto-converted to hex; toast shows import count or "No mappable CSS classes found"
- **SITE**: `parseCssToFdStyles()` + `rgbToHex()` in `playground.js`; hidden `<input type="file" accept=".css">` element; `import-css` case in settings menu handler
- **EXTENSION**: Same `parseCssToFdStyles()` + `rgbToHex()` in `main.js`; Import CSS button + hidden file input in `webview-html.ts`; handler wired in `setupSettingsMenu()`

### v0.10.77 — Apple HIG Canvas Parity (R6.8)

- **UX (R6.8)**: Website playground canvas redesigned with Apple HIG design language — frosted glass toolbar, panels, and overlays using `backdrop-filter: blur(20px) saturate(180%)`; blue accent `#007AFF` replacing purple `#6C5CE7`; SF Pro system font stack; `0.5px` hairline borders; Apple-style color tokens (`--fd-*` CSS variables)
- **UX (R6.8)**: Horizontal frosted toolbar replaces vertical floating toolbar — tool buttons with text labels + keyboard shortcut hint badges (`V`, `R`, `O`, `T`, `A`, `P`, `E`); segmented control active state with blur shadow; undo/redo buttons + zoom pill in right zone
- **UX (R6.8)**: Properties panel enriched — `props-inner` wrapper with section labels ("Position & Size", "Appearance"), kind badge (blue capsule), Apple-style input fields
- **UX (R6.8)**: Layers panel indent guides — thin vertical lines (`::before` pseudo-element) showing hierarchy depth; Apple blue accent on selected items
- **UX (R6.8)**: Dimension tooltip — `W × H` tooltip appears below dragged/resized nodes during pointer interaction; frosted glass pill with monospace font
- **UX (R6.8)**: Modifier cursor feedback — ⌘/Meta shows grab cursor, Alt/Option shows copy cursor; matches VS Code extension behavior
- **SITE**: All canvas components (minimap, FAB, context menu, minimap zoom) updated to Apple HIG frosted glass tokens

### v0.10.76 — Resizable Panels (R6.7)

- **UX (R6.7)**: Layers panel is now resizable — drag the right edge handle to resize between 120–360px (site) or 140–400px (VS Code); handle highlights with accent color on hover/drag; double-click handle to collapse panel to 0px; click thin restore strip to uncollapse
- **UX (R6.7)**: Properties panel is now resizable — same drag/collapse mechanism on the left edge; canvas area dynamically adjusts via CSS variables `--layers-width` / `--props-width`
- **UX (R6.7)**: Panel widths persist across sessions — site uses `localStorage`, VS Code uses `vscode.setState()`; collapsed state also persisted
- **UX (R6.7)**: Floating toolbar offset dynamically tracks layers panel width — `left: calc(var(--layers-width) + 12px)` replaces hardcoded `192px`
- **SITE**: `setupPanelResize()` in `playground.js` — pointer capture drag handler, MutationObserver for props visibility, localStorage persistence
- **EXTENSION**: `setupPanelResize()` in `panels.js` — same drag handler pattern with `vscode.setState()` persistence; `getLayersPanelWidth()` in `navigation.js` already reads `offsetWidth` dynamically, so all zoom/fit/snap calculations auto-adapt

### v0.10.75 — Context Menu (R6.6)

- **UX (R6.6)**: Right-click context menu on playground canvas — glassmorphic dropdown with 8 actions: Duplicate, Delete, Bring Forward, Send Backward, Group, Ungroup, Copy as .fd; auto-selects node under cursor via `hit_test_at()`; dismisses on outside click, Escape, or pointerdown
- **SITE**: `setupContextMenu(editor)` wires contextmenu event, action dispatch via `handle_key` / `group_selected` / `ungroup_selected` / `duplicate_selected` / `delete_selected`, and viewport-aware positioning

### v0.10.74 — Properties Panel (R6.6)

- **UX (R6.6)**: Properties panel (right sidebar) in playground canvas — 200px panel showing selected node's ID, kind, position (X/Y readonly), size (W/H editable), fill color, stroke color + width, corner radius, opacity slider, duplicate + delete actions
- **SITE**: `updatePropertiesPanel()` reads `get_selected_node_props()` JSON; input handlers call `set_node_prop(key, value)` with debounce; minimap shifts right when panel is visible
- **SITE**: Panel hidden by default, appears on node selection (pointerup, layer click, render loop throttle)

### v0.10.74 — Remove Redundant Auto-Comments on Text Nodes (R4.21)

- **CLEANUP (R4.21)**: Text nodes no longer get `# [auto] label: "..."` comments — text content is already visible inline in the node declaration (e.g. `text @title "Dashboard"`), making the auto-comment 100% redundant; saves ~6% tokens in typical files; container, styled-shape, and edge-connection auto-comments are preserved
- **TESTING**: Updated `emit_no_auto_comment_text_node` (asserts text nodes produce no `[auto]`), `roundtrip_auto_comments_not_duplicated` (uses group node which still gets auto-comments)

### v0.10.73 — Layers Panel (R6.6)

- **UX (R6.6)**: Layers panel (tree view sidebar) in playground canvas — 180px left sidebar with glassmorphic background showing hierarchical document tree parsed from FD text; displays node kind icons (◻ group, ▢ rect, ○ ellipse, T text, ⟶ edge, ◆ style), click-to-select, and chevron expand/collapse for groups
- **SITE**: Ported `parseLayerTree()` and `renderLayerNode()` from VS Code extension `panels.js`; `refreshLayersPanel()` with diff-based skip (text + selectedId); throttled at ~10fps in render loop
- **SITE**: Canvas and floating toolbar offset by 180px to accommodate sidebar; `resizeCanvas()` and `FdCanvas` init adjusted for panel width

### v0.10.72 — Undo/Redo Buttons + Canvas Header Cleanup (R6.6)

- **UX (R6.6)**: Undo/redo buttons in playground canvas header — ↶ and ↷ ghost buttons with keyboard shortcut tooltips; calls `fdCanvas.undo()` / `fdCanvas.redo()` and syncs canvas + code editor
- **UX (R6.6)**: Clickable zoom indicator — clicking the zoom percentage in the header resets to 100% and pans to origin (0,0); hover shows subtle background highlight
- **SITE**: New `.canvas-header-actions` flex group, `.ch-btn` ghost buttons with border, `.ch-sep` vertical divider; `.zoom-indicator` now has `cursor: pointer` and hover state

### v0.10.71 — Minimap + Zoom Controls (R6.6)

- **UX (R6.6)**: Minimap in playground canvas — glassmorphic 150×100px thumbnail in bottom-right showing scaled scene overview with purple node rects and blue viewport rectangle; click/drag on minimap pans the canvas to that scene position
- **UX (R6.6)**: Zoom control buttons embedded in minimap — `−` (÷1.25), zoom percentage (click to reset 100%/0,0), `+` (×1.25); all zoom centered on canvas midpoint; synced with header zoom indicator and Ctrl+scroll zoom
- **SITE**: `renderMinimap()` extracts `@id` tokens from FD text, queries `get_node_bounds()` per node, computes scene bounding box, renders scaled rects + viewport rect; throttled to ~10fps in render loop
- **SITE**: `updateZoomIndicator()` now also syncs `#zoom-reset-btn` text

### v0.10.70 — Floating Toolbar on Playground Canvas (R6.6)

- **UX (R6.6)**: Floating toolbar on playground canvas — vertical glassmorphic toolbar on left side of canvas with 7 SVG tool buttons (Select, Rect, Ellipse, Text, Arrow, Pen, Eraser) matching the VS Code extension's floating toolbar; replaces inline header tool buttons
- **SITE**: Removed inline `#canvas-tools` div from `.editor-header`; added `#floating-toolbar` inside `#canvas-wrapper` with `position: absolute; left: 12px; top: 50%; transform: translateY(-50%)`; `.ft-btn` buttons styled as 32×32 rounded with accent highlight on active; SVG icons from `fd-vscode/src/webview-html.ts`
- **SITE**: Updated `playground.js` selectors from `.canvas-tool` to `.ft-btn` in `updateToolbar()` and click handler

### v0.10.69 — Rename `theme` → `style` Keyword (R4.18)

- **RENAME (R4.18)**: `theme` keyword → `style` — reusable property bundles now use the universal CSS/Figma term; emitter outputs `style` keyword and `# ─── Styles ───` section header; parser still accepts `theme` for backward compatibility
- **RENAME (R4.18)**: Internal Rust struct `Style` → `Properties` — better reflects the struct's role as a collection of visual properties (fill, stroke, font, etc.); field accessor `.style` → `.props` across all crates
- **COMPAT**: Parser accepts both `theme` and `style` keywords, and both `# ─── Themes ───` and `# ─── Styles ───` section separators; existing `.fd` files parse without changes
- **DOCS**: Updated `GEMINI.md` (style reuse rule), `REQUIREMENTS.md` (R4.18), `SKILL.md` (style grammar)

### v0.10.68 — Remove Click-to-Raise (R3.41)

- **REMOVED (R3.41)**: Click-to-raise — selecting a node via click no longer auto-brings it forward one z-level; this caused surprise z-order changes and silent `.fd` text reordering, polluted undo stack, and was a recurring bug surface (3+ patches for group-raise, idempotency, and dead-zone guards); explicit ⌘] / ⌘⇧] remain for intentional z-order changes
- **CORE**: Removed `prev_selected` snapshot, auto `bring_forward` block, and `zorder_changed` tracking from `pointer_up` in `lib.rs` (~33 lines)

### v0.10.67 — Free Frame Padding (R1.21)

- **FEATURE (R1.21)**: `pad:` property for Free-layout frames — insets the content area so children, text centering, and `place:` positioning all respect padding; standalone `pad: N` or inline `layout: column pad=N` both work; `pad: 0` is default and omitted from emitted output
- **CORE**: `LayoutMode::Free` now carries `{ pad: f32 }` matching Column/Row/Grid; manual `Default` impl returns `pad: 0.0`; layout solver computes padded content area for child defaults, text auto-centering, and `place:` alignment
- **PARSER**: New `"pad"` / `"padding"` standalone property arms for frames; updates all layout variants
- **DOCS**: Updated FD format SKILL.md with `pad:` in frame grammar and 2 new best practices (always use padding, prefer managed layouts); demo.fd sidebar converted to `layout: column gap=8 pad=16`
- **TESTING**: 6 new tests — `parse_free_frame_pad`, `roundtrip_free_frame_pad`, `parse_free_frame_pad_zero_omitted`, `layout_free_frame_pad_insets_children`, `layout_free_frame_pad_text_centered_in_padded_area`, `layout_free_frame_pad_zero_matches_no_pad`

### v0.10.66 — Interactive Playground (R6.6)

- **FEATURE (R6.6)**: Playground canvas is now fully interactive — pointer events (click to select, drag to move/resize, draw shapes) wired through WASM `handle_pointer_down/move/up` APIs; bidirectional sync with `suppressSync` echo prevention ensures canvas→code and code→canvas stay in sync
- **UX (R6.6)**: 7-tool toolbar in canvas header — Select (↖), Rect (□), Ellipse (○), Text (T), Arrow (→), Pen (✎), Eraser (◎); active tool highlighted with accent purple; auto-switches back to Select after drawing gesture
- **UX (R6.6)**: Floating action bar (FAB) — frosted-glass popup above selected nodes with Fill/Stroke color pickers and Delete button; positioned relative to node bounds accounting for zoom/pan
- **UX (R6.6)**: Zoom/pan navigation — scroll wheel pans, Ctrl/⌘+scroll zooms, Space+drag for hand-tool pan, middle-click pan; zoom indicator shows current level in canvas header
- **UX (R6.6)**: Keyboard shortcuts — V/R/O/T/A/P/E for tool switching, Delete/Backspace to remove nodes, ⌘Z/⌘⇧Z for undo/redo; focus management ensures shortcuts fire on canvas (not textarea)
- **SITE**: Zero Rust changes — all interactivity implemented in `playground.js` (~330 lines), `index.html` (toolbar + FAB markup), `style.css` (+95 lines)

### v0.10.65 — Playground-First Landing Page (R6.5)

- **UX (R6.5)**: Playground now visible on landing — embedded live playground directly in the hero section; users see code editor + canvas split-pane within the first viewport without scrolling
- **UX (R6.5)**: Removed `100vh` hero minimum height — hero now uses content-driven height with compact padding (`80px 24px 48px`), pushing interactive content above the fold
- **UX (R6.5)**: Removed redundant Code Preview section — the static syntax showcase (40 lines HTML + 50 lines CSS) is superseded by the live editable playground
- **PERF (R6.5)**: Added WASM preload hints in `<head>` — `<link rel="modulepreload">` for `fd_wasm.js` and `<link rel="preload" as="fetch">` for `fd_wasm_bg.wasm`; reduces perceived playground load time by ~1–2s on typical connections
- **UX (R6.5)**: Replaced loading spinner with animated skeleton — shimmering placeholder shapes (rect, circle, lines) mirror expected canvas content while WASM initializes; CSS-only animation, no additional JS
- **SITE**: Updated nav links — removed "Try Playground" (playground is now hero content); kept Features, Benchmarks, Architecture, Install Extension

### v0.10.64 — Fix Edge Flow Animation Freeze

- **FIX**: Edge flow animations (`flow: pulse`, `flow: dash`) now animate continuously when idle — previously froze until mouse interaction because the JS render loop's dirty-flag optimization had no knowledge of WASM-side time-dependent flow effects; added `has_active_flows()` WASM API that checks if any edge has a flow animation, cached in JS on scene change, and included in the render loop condition
- **WASM**: New `has_active_flows()` on `FdCanvas` — returns `true` if any edge in the scene graph has `flow.is_some()`
- **JS**: `hasFlowEdges` flag in `state.js` refreshed via `bumpGeneration()` and on initial load; render loop condition extended to `renderDirty || activeTweens.length > 0 || erasePoofs.length > 0 || hasFlowEdges`

### v0.10.63 — Demo Cleanup + Test Coverage

- **DOCS**: Rewrote `examples/demo.fd` from 562 lines of testing debris to a polished 236-line product dashboard showcase — demonstrates styles, edge_defaults, specs, animations, flows, frames with column layout, and semantic naming throughout
- **TEST**: Added `sync_bring_forward_already_front_is_noop` — z-order edge case: bring_forward on frontmost child is a no-op
- **TEST**: Added `sync_clone_name_sequence` — chained duplication produces `card`, `card_2`, `card_3`, `card_4` correctly
- **TEST**: Added `sync_near_detach_warning_zone` — exercises near-detach evaluation code path without panic
- **TEST**: Added `eraser_tool_hover_only_no_crash` — hover-only (no drag) produces no mutations and no crash
- **TEST**: Added `select_tool_reclick_keeps_selection` — re-clicking an already-selected node keeps it selected

### v0.10.62 — Fix Shift+Drag Bugs (R3.54)

- **FIX (R3.54)**: Near-origin jitter — Shift+drag axis constraint now uses a 4px dead-zone threshold before locking; within the dead-zone, movement is free (unconstrained); once past 4px, axis locks to horizontal or vertical and **stays locked** for the entire drag; previously the axis flipped every frame when `total_dx ≈ total_dy ≈ 0`
- **FIX (R3.54)**: Multi-select Shift+drag — Shift+clicking an already-selected node now defers the deselection to PointerUp, so Shift+drag can constrain axis movement of the full multi-selection; previously the clicked node was immediately deselected in PointerDown (toggle behavior), causing only the remaining nodes to move
- **CORE**: New `locked_axis: Option<bool>` field on `SelectTool` — `None` = undecided (below threshold), `Some(true)` = horizontal, `Some(false)` = vertical; reset on PointerUp and Esc-cancel
- **CORE**: New `shift_toggled_off: Option<NodeId>` field on `SelectTool` — tracks deferred deselection; cleared on PointerUp (fires deselect) or on drag start (cancels deselect since user intends to drag)
- **TESTING**: 3 new regression tests — `select_tool_shift_drag_dead_zone` (free move → axis lock → stays locked), `select_tool_shift_drag_multi_select_moves_all` (3 nodes all receive MoveNode), `select_tool_shift_click_deselects_on_pointerup` (deferred deselect fires correctly)

### v0.10.61 — Fix Alt+Drag Clone Bugs (R3.54)

- **FIX (R3.54)**: Selection coupling — cloning a node via Alt+drag no longer causes the clone and original to select together; root cause: clone inherited original's `Position` constraint, giving both identical resolved bounds → hit-test couldn't distinguish them; fix: `clone_node_recursive` now strips all positioning constraints and assigns a fresh `Position` from resolved bounds + offset
- **FIX (R3.54)**: Drag inversion — dragging the original after cloning no longer moves only the clone; same root cause as selection coupling (overlapping bounds from shared `Position` constraint)
- **FIX (R3.54)**: `DuplicateNode` mutation in `sync.rs` now also strips positioning constraints and uses resolved bounds + 20px offset, matching the WASM Alt+drag fix
- **UX**: Incremental clone naming — `rect_0` → `rect_2` → `rect_3` instead of `rect_0_copy_42`; new `next_clone_name()` scans graph for existing `{stem}_N` patterns and picks `max(N)+1`
- **TESTING**: 3 new regression tests — `sync_duplicate_position_independent` (moving original doesn't move clone), `sync_duplicate_incremental_naming` (card → card_2 → card_3 → card_4), `sync_duplicate_no_overlapping_bounds` (clone offset by 20px)

### v0.10.60 — Format Precision & AI Comprehensibility (R4.21)

- **FEATURE (R4.21)**: Comprehensibility Score requirement — R4.21 documents a planned 0–100 score measuring AI comprehensibility (semantic naming ratio, comment density, style reuse, edge default coverage, token cost)
- **CORE**: 1-decimal precision — `format_num` emits 1dp instead of 2dp for coordinates, dimensions, and scales (token efficiency)
- **CORE**: Edge defaults — `edge_defaults {}` block defines document-level default stroke/arrow/curve; individual edges skip matching properties
- **CORE**: ReadMode::Diff — `snapshot_graph()` creates hash-based snapshot; `emit_diff(graph, &snapshot)` outputs `+`/`~`/`-` prefixed changes
- **CORE**: Inline doc-comments — emitter generates `# [auto]` comments (text labels, child counts, style refs, edge connections); parser skips `[auto]` on round-trip
- **EXTENSION**: Edge-based naming — `ai-renamify.ts` adds `edgeTargets` to `NodeContext`; anonymous nodes connected to named nodes get `_to_target` suffix
- **EXTENSION**: Unified Refactor command — `ai-refactor.ts` orchestrates Renamify + style hoisting; `fd.refactor` command registered in palette
- **TESTING**: 14 new tests — F1 precision (2), F2 edge defaults (3), F5 snapshot/diff (4), F6 auto-comments (4), comprehensibility score (1)

### v0.10.59 — Path Serialization + Image Embedding + Parent-Aware Pen (R3.32, R3.62)

- **FEATURE (R3.62)**: Path command serialization — `d:` inline property uses SVG-like syntax (`M`, `L`, `Q`, `C`, `Z`) for pen tool path roundtrip; coordinates rounded to 2 decimals for token efficiency
- **FEATURE (R3.32)**: Image node support — new `NodeKind::Image` with `ImageSource::File`, `ImageFit` enum (cover/contain/fill/none); parser recognizes `image` keyword with `src:` and `fit:` properties; emitter serializes image nodes; renderers draw placeholder rect until WASM texture pipeline
- **FEATURE**: Parent-aware pen tool — `PenTool` now accepts `set_parent(id)` to create path nodes inside frames/groups instead of always at root level
- **CORE**: `ImageSource` and `ImageFit` enums added to `model.rs`; exhaustive `NodeKind::Image` match arms across 10 files (emitter, layout, transform, paint, render2d, svg, hover, lib.rs)
- **WASM**: Image props exposed in `get_selected_node_props` (kind, width, height, src, fit); `collect_node_tree` returns `"image"` kind; SVG export emits `<rect data-src="...">` placeholder
- **LSP**: Hover info for `image` keyword and `@id` hover shows src/dimensions/fit
- **TESTING**: 8 new roundtrip tests — 4 path (`roundtrip_path_with_commands`, `_cubic_and_close`, `_quad`, `_empty_commands`) + 4 image (`roundtrip_image_basic`, `_with_fit`, `_in_frame`, `_with_styles`)

### v0.10.58 — Mermaid Import + Detach Snap + Alt-Draw-From-Center (R1.18, R3.35, R3.19)

- **NEW (R1.18)**: Mermaid flowchart import — `parse_mermaid()` in fd-core parses `flowchart TD/LR` syntax into FD nodes + edges; supports node shapes (`[rect]`, `(rounded)`, `((circle))`, `{diamond}`), edge types (`-->`, `---`, `-->|label|`), subgraphs as frames; auto-layout grid positioning; `import_mermaid()` WASM API merges into current document
- **DONE (R3.35)**: Detach snap animation — purple glow + rubber-band line on near-detach; `playDetachAnimation()` with scale pop + glow overlay on structural detach (250ms); `evaluate_near_detach` WASM API returns parent/child centers for JS rendering
- **DONE (R3.19)**: Alt-draw-from-center — holding Alt/⌥ during RectTool/EllipseTool draw anchors the start point as center; combinable with Shift for constrained square/circle from center

### v0.10.57 — Remove Mid-Drag Alt Duplication (R3.54)

- **FIX (R3.54)**: Pressing Alt mid-drag no longer triggers node duplication — clone only activates when Alt is held at pointer-down time and the user drags ≥3px; previously pressing Alt while already dragging would clone instantly since the pointer was already in motion, exceeding the 3px threshold on the next frame
- **CORE**: Removed mid-drag `alt_press_pos` assignment from `handle_pointer_move` — `alt_press_pos` is now exclusively set in `handle_pointer_down`

### v0.10.56 — Alt+Drag 3px Threshold + Ghost Preview (R3.54)

- **FIX (R3.54)**: Alt+drag no longer clones immediately on Alt keypress — duplication is deferred until the pointer moves ≥3px from the Alt press position (Figma-style threshold); prevents accidental clones when pressing Alt during a drag or on click
- **UX (R3.54)**: Ghost preview during Alt+drag — translucent dashed outlines (#4FC3F7, 30% opacity) show the original node positions while dragging clones, providing clear visual feedback that duplication occurred
- **CORE**: New `alt_press_pos: Option<(f32, f32)>` field tracks the scene-space position where Alt was first detected; threshold check uses squared distance (≥9.0) for performance
- **CORE**: New `alt_clone_origins: Vec<(f32, f32, f32, f32)>` captures original node bounds at duplication time; exposed to JS via `get_alt_drag_ghost()` WASM API returning JSON array
- **JS**: Ghost state tracked in `altDragGhosts[]`; read from WASM during pointermove, rendered after scene paint, cleared on pointerup and Esc-cancel

### v0.10.55 — Fix Shift-Constraint Bugs (R3.54)

- **FIX (R3.54)**: Shift+drag axis-lock no longer jitters during diagonal movement — constraint now uses total displacement from drag origin (Figma-style) instead of per-frame delta, which was too small (~1-3px) and caused the locked axis to flip every frame
- **FIX (R3.54)**: Shift+draw Rect in northwest direction no longer jumps — origin (top-left corner) now computed from constrained square dimensions instead of raw cursor position; previously `x.min(start_x)` ignored the Shift-expanded size
- **FIX (R3.54)**: Shift+draw Ellipse in northwest direction — same origin fix as Rect (identical code pattern)
- **CORE**: Added `drag_start_x`/`drag_start_y` fields to `SelectTool` for tracking total drag displacement
- **TESTING**: 4 new regression tests — `select_tool_shift_drag_no_jitter_on_diagonal` (3-frame multi-move), `select_tool_shift_drag_locks_vertical`, `rect_tool_shift_draw_northwest_correct_origin`, `ellipse_tool_shift_draw_northwest_correct_origin`

### v0.10.54 — Esc-to-Cancel Drag (R3.61)

- **FEATURE (R3.61)**: Pressing Esc during a node drag (move/resize/draw) now cancels the gesture and restores the node to its pre-drag position — uses `abandon_batch()` on `CommandStack` to restore the text snapshot captured at `begin_batch()`, producing a pixel-perfect rollback with no undo entry
- **FEATURE (R3.61)**: Pressing Esc during toolbar drag-to-create cancels the gesture — ghost preview removed, all dtc state cleaned up
- **CORE**: New `abandon_batch()` on `CommandStack` — restores `batch_snapshot` text, resets `batch_depth` and `batch_dirty`; no undo entry created for cancelled gestures
- **WASM**: New `cancel_drag()` API — calls `abandon_batch()`, resets all tool drag states (SelectTool, RectTool, EllipseTool, PenTool, ArrowTool, EraserTool), clears interaction state, re-resolves layout
- **CORE**: New `is_drawing()` and `cancel()` methods on `RectTool`, `EllipseTool`, `PenTool` for querying and resetting drawing state
- **TESTING**: New `abandon_batch_restores_position` test — verifies 3 MoveNode mutations are fully reverted and no undo entry is created

### v0.10.53 — Click-to-Highlight Code (R2.5)

- **UX (R2.5)**: Clicking an already-selected node on the canvas now re-highlights its `@id` line in the code editor — previously only the first click (selection change) triggered the highlight; re-clicks on the same node were silently ignored by the dedup guard; this implements the "show me the code" intent for spatial navigation
- **ARCH**: Split canvas→code notification into two paths in `pointer.js`: selection-change triggers full `syncSelection()` (panels + code + dedup), re-click of same node posts `nodeSelected` directly (code highlight only, no redundant panel rebuilds)

### v0.10.52 — Renamify Tests + Heuristic Renamer (R4.20)

- **TESTING (R4.20)**: 50 new unit tests for Renamify in `ai-renamify.test.ts` — `parseRenamifyResponse` (17 tests: valid/malformed JSON, conflict resolution, sanitization, order), `applyGlobalRenames` (13 tests: declarations, constraints, edges, word-boundary safety), `buildRenamifyPrompt` (7 tests: prompt structure), `heuristicRename` (13 tests: text extraction, parent context, shape detection, conflicts)
- **FEATURE (R4.20)**: Heuristic renamer (`heuristicRename`) — no-API fallback that generates semantic names from FD document context: text content (`"Login"` → `login_label`), parent group name (`rect` inside `@sidebar` → `sidebar_rect`), shape detection (equal w/h ellipse → `circle`, wide rect → `bar`); wired as automatic fallback when no AI API key is configured
- **FIX**: `stripMarkdownFences` now supports `json`, `javascript`, `typescript`, `html`, `css` language tags — previously only matched `fd|text|plaintext`, causing partial stripping of ` ```json ``` ` fences that broke `parseRenamifyResponse`
- **INFRA**: Added `__mocks__/vscode.ts` stub and `vitest.config.ts` alias for `vscode` module resolution in test environment

### v0.10.51 — Alt+Drag Multi-Select (R3.60)

- **FEATURE (R3.60)**: Alt+drag now duplicates ALL selected nodes (was single-node only); `duplicate_selected_at` loops all selected with `clone_node_recursive`
- **FEATURE (R3.60)**: Deep copy — Alt+drag on Group/Frame recursively clones all descendants, preserving parent–child hierarchy via `clone_node_recursive`
- **FEATURE (R3.60)**: Internal reference remapping — cloned nodes' constraints (`Offset.from`, `CenterIn`) are remapped to point at sibling clones, not originals
- **FEATURE (R3.60)**: Edge duplication — edges where both endpoints are in the cloned set are duplicated with remapped anchors via `clone_edges_between`
- **WASM**: Lifted `selected.len() == 1` guards on both Alt+click (L287) and Alt+mid-drag (L352) to `!selected.is_empty()`

### v0.10.50 — Copy/Paste Improvements (R3.59)

- **FEATURE (R3.59)**: Paste offset — ⌘V now places pasted nodes +20px from the original (cumulative: +20, +40, +60… per successive paste); offset resets on new ⌘C; previously pasted nodes landed directly on top of the original
- **FEATURE (R3.59)**: Multi-select copy — ⌘C copies all selected nodes (was single-node only); uses `get_selected_ids()` and extracts text blocks for each
- **FEATURE (R3.59)**: ⌘X (cut) keyboard shortcut — copy + delete in one action; previously only available via context menu
- **FEATURE (R3.59)**: Paste undo — ⌘Z now correctly reverts a paste operation via text snapshot pushed to the undo stack; new `push_undo_snapshot` WASM API
- **WASM**: New `push_undo_snapshot(text_before, text_after)` API — allows JS-driven operations to register undoable snapshots without going through the mutation system
- **CORE**: New `push_snapshot()` on `CommandStack` — public method for external callers to push text snapshot undo entries

### v0.10.49 — Fix Alt+Drag Architecture (R3.54)

- **FIX (R3.54)**: Alt+drag no longer causes jumping/jittery behavior — unified duplication onto `FdCanvas::duplicate_selected_at(0,0)` which properly transfers selection to the clone; previously SelectTool emitted `DuplicateNode` but never updated selection, causing `MoveNode` to move the original instead of the clone
- **FIX (R3.54)**: Alt pressed mid-drag now works correctly — FdCanvas intercepts Alt modifier in `handle_pointer_move` before SelectTool, calls `duplicate_selected_at(0,0)` to clone-in-place with proper selection transfer
- **ARCH**: SelectTool no longer handles Alt duplication; FdCanvas is the single owner of Alt+dup logic since it can coordinate selection state, undo batching, and layout resolve
- **FIX**: Removed JS-side `select_by_id(hitId)` pre-selection on Alt+click in `pointer.js`/`main.js` — was fighting with WASM SelectTool handling

### v0.10.48 — Fix Alt+Drag Mid-Drag Activation (R3.54)

- **FIX (R3.54)**: Alt+drag to duplicate now works when Alt/Option is pressed mid-drag — macOS Option key pressed during active pointer capture was not updating `e.altKey` on `pointermove` events in Electron/VS Code webviews; added global modifier state tracking via `keydown`/`keyup`/`blur` listeners and wired `(e.altKey || modAltHeld)` across all pointer event handlers (down/move/up)
- **ROBUSTNESS**: Also tracks `modCtrlHeld`, `modMetaHeld`, `modShiftHeld` for consistent modifier detection across all pointer phases; state resets on `window.blur` to prevent stale modifiers after Alt+Tab

### v0.10.47 — Fix Alt+Drag Double-Duplicate + Mid-Drag Clone

- **FIX (R3.54)**: Alt+drag no longer duplicates a node twice — removed redundant JS-side `duplicate_selected_at(0,0)` call from `pointer.js`; WASM `SelectTool::handle()` is now the single source of truth for Alt+click duplication
- **FEATURE (R3.54)**: Pressing Alt mid-drag now triggers clone-and-drag (Figma behavior) — if you start dragging a node normally and press Alt during the drag, the original stays in place and you continue dragging a clone; `alt_duplicated` flag prevents re-duplication on subsequent move events
- **TESTING**: New `select_tool_mid_drag_alt_produces_duplicate` test — verifies DuplicateNode + MoveNode on first Alt move, and MoveNode-only on subsequent moves

### v0.10.46 — Ghost Resizes Dynamically During Zoom

- **FIX (R3.39)**: Drag-to-create ghost now resizes in real-time when zooming mid-drag — scroll-wheel zoom during a drag updates ghost width/height every frame to match the current zoom level

### v0.10.45 — Ghost Scales with Zoom Level

- **FIX (R3.39)**: Drag-to-create ghost now scales with canvas zoom — at 200% zoom the ghost is 2× larger, at 50% it's half-sized, matching how the created shape will actually appear on screen

### v0.10.44 — Alt-Gated Snap-to-Node + Auto-Edge

- **UX (R3.43)**: Snap-to-node + auto-edge on toolbar drag-to-create now requires ⌥ Alt modifier — without Alt, shapes drop freely at the cursor position without snapping or creating edges; reduces false positives in flowchart workflows
- **UX (R3.43)**: Alt-aware ghost preview during drag — when ⌥ Alt is held near a node, ghost snaps to the nearest cardinal position and a dashed edge preview line (accent color) renders from target node center to ghost center with endpoint indicator circle
- **DOCS**: Updated `floating-toolbar.md` (R3.43 section) and `SHORTCUTS.md` (floating toolbar table) to document ⌥ Alt requirement

### v0.10.43 — Fix Toolbar Snap & Ghost Shape Bugs (4 Fixes)

- **FIX (R3.39)**: Toolbar now lands at the exact ghost position — `pointerup` reuses `getSnapPosition()` instead of computing a separate `vw`/`vh` position that could diverge
- **FIX (R3.39)**: Ghost shapes now match WASM `create_node_at` defaults — rect: 100×80 (was 120×80), ellipse: 100×80 oval (was 100×100 circle), frame: 200×150 (was 140×100)
- **FIX (R3.39)**: Toolbar tooltips now visible in horizontal mode — changed `.scroll-paper-body` from `overflow: hidden` to `overflow: visible`
- **FIX (R3.39)**: Vertical toolbar tooltips now appear to the right instead of above, preventing overlap

### v0.10.42 — Fix Toolbar Ghost Orientation on Cross-Side Drag

- **FIX (R3.39)**: Snap guide ghost now correctly shows vertical orientation when dragging toolbar to the opposite left/right edge — previously the ghost appeared horizontal because `getSnapPosition()` used live `offsetWidth`/`offsetHeight` which flip with toolbar orientation; now captures canonical (horizontal-layout) dimensions at drag start and uses those for ghost sizing regardless of current state

### v0.10.41 — Fix Text Wrap Regressions (3 Bugs)

- **FIX (R3.46)**: Text height no longer reverts on pointer release — `set_text()` now skips re-parse and `resolve()` when incoming text is identical to current text, preventing JS-measured bounds from being overwritten by heuristic (KI Lesson #9)
- **FIX (R3.46)**: Wrap threshold no longer triggers prematurely — `intrinsic_size` with `max_width` now returns single-line placeholder height; JS `measureText()` is the sole authority for wrapped height; removed heuristic multi-line estimation from `sync.rs` ResizeNode handler
- **TESTING**: Updated 3 tests — `layout_text_max_width_wraps_height` (single-line placeholder), `sync_resize_parent_sets_child_text_max_width` (width-only), `sync_resize_text_preserves_height` (renamed, height unchanged)

### v0.10.40 — Text Wrap Boundary Expansion + Parent Resize Propagation

- **FEATURE (R3.46)**: Text nodes with `max_width` now correctly expand their bounding box vertically to enclose wrapped text — `intrinsic_size` heuristic in `layout.rs` accounts for `max_width` and estimates multi-line height
- **FEATURE (R3.46)**: Resizing a parent shape smaller than child text's bounds now auto-sets `max_width` on the child text (Option A: permanent), causing auto-wrap and vertical expansion — propagation logic in `sync.rs` handles Rect/Ellipse/Frame parents, respects layout padding, skips explicitly positioned children
- **FEATURE (R3.46)**: Direct text node resize now estimates wrapped height from content length instead of using drag height — more accurate immediate feedback during resize
- **WASM**: New `get_text_children(node_id)` API — returns JSON array of text child IDs for JS remeasurement after parent resize
- **WASM**: `get_node_props` now returns `maxWidth` for text nodes — enables JS `measureAndUpdateTextBounds` to detect wrap constraints
- **JS**: Post-resize text remeasurement — `pointer.js` now calls `measureAndUpdateTextBounds` on text nodes and text children after any interaction that changes the canvas
- **TESTING**: 3 new regression tests — `layout_text_max_width_wraps_height`, `sync_resize_parent_sets_child_text_max_width`, `sync_resize_text_estimates_wrapped_height`

### v0.10.39 — Fix FAB Popup on Layers/Code Selection

- **FIX (R3.8)**: Floating Action Bar (fill/stroke/opacity controls) no longer pops up when selecting a node via Layers panel or Code cursor — FAB is now canvas-contextual only; Properties panel is the correct surface for non-canvas interactions

### v0.10.38 — Properties Panel Actions + FAB Cleanup

- **UX (R3.8)**: Added "Actions" section to the Properties panel — 8 buttons in a 2-column grid (Group, Ungroup, Duplicate, Frame, Front, Back, Copy PNG, Delete) with keyboard shortcut hints; Group/Frame buttons auto-disable when <2 nodes selected; Ungroup auto-disables when no group is selected; matches Figma right-inspector pattern
- **CLEANUP**: Removed FAB overflow menu (⋯ button + 5-item dropdown) — all actions now in Properties panel + context menu + keyboard shortcuts; declutters the Floating Action Bar to style-only controls
- **CLEANUP**: Removed `fab-overflow-menu` reference from `hideFloatingBar()` in context-menu.js

### v0.10.37 — Fix Default Style Chain + Drag-to-Create UX

- **FIX (R3.52)**: New shapes (canvas-drawn and click-to-create) now render with transparent fill + bordered stroke — previously `RectTool`/`EllipseTool` created bare nodes with no style, renderer defaulted `None` fill to grey `#CCCCCC`, and `set_node_prop("fill", "none")` silently failed because `Color::from_hex("none")` returned None.
- **FIX**: `set_node_prop("fill")` now handles `"none"` and `"transparent"` values — clears fill to `None` instead of silently returning false.
- **FIX**: Renderer `apply_fill()` no longer paints grey for `None` fill — `draw_rect`/`draw_ellipse` now guard `ctx.fill()` with `style.fill.is_some()`, matching `draw_path`'s existing behavior.
- **UX**: Cancel/re-drag on toolbar re-entry — dragging a tool back over the toolbar cancels the operation (ghost removed); dragging out again reactivates it.
- **NEW**: Alignment guides during drag-to-create — pink snap lines (Keynote/Freeform-style) appear when the ghost shape aligns with existing nodes, via new `compute_guides_for_rect()` WASM API.
- **TESTING**: 2 new tests — `rect_tool_creates_with_default_stroke`, `ellipse_tool_creates_with_default_stroke`.

### v0.10.36 — Snap Guide: Ghost Rectangle + Closest-Edge Detection

- **IMPROVE**: Snap guide now shows a ghost rectangle matching toolbar size at exact landing position (not a thin edge line).
- **FIX**: Snap detection uses closest-edge comparison instead of if-else chain — top snap is now reachable without dragging to the very edge.
- **FIX**: Left snap guide accounts for Layers panel width (232px offset).

### v0.10.35 — Fix Toolbar Drag Jump + Snap Guide Preview

- **FIX**: Toolbar no longer jumps on initial click — position normalization deferred from `pointerdown` to `pointerup`; uses `transform: translate()` during drag only.
- **FEATURE**: Snap destination preview — dashed border guide appears at the target edge (top/bottom/left/right) while dragging the toolbar, providing visual feedback before releasing.

### v0.10.34 — Fix Context Menu Shown on Launch

- **FIX**: Close context menu, floating action bar, and edge context menu at end of `main()` init to prevent stale menus appearing on canvas launch.

### v0.10.33 — Fix Init Crash: setupSelectionBar + CSP Inline Styles

- **FIX (R3.42)**: Remove call to non-existent `setupSelectionBar()` in `main()` — this crashed WASM init and prevented `setupFloatingToolbar()` (including drag-to-create) from ever executing. Dead code from a prior refactor.
- **FIX**: Add `'unsafe-inline'` to CSP `style-src` — JS-set inline styles (ghost preview, toolbar drag, minimap overlays) were being silently blocked by Content Security Policy.

### v0.10.32 — Fix Drag-to-Create: Prevent Native Drag Hijack on SVG Icons

- **FIX (R3.42)**: Drag-to-create now works — added `e.preventDefault()` in tool button `pointerdown` handler to prevent browser-native drag-and-drop on `<svg>` icons inside `<button>` elements, which was hijacking all `pointermove` events before the drag threshold could be reached (7th fix attempt — previous 6 fixed event routing but not the native drag takeover)
- **FIX (R3.42)**: Added CSS `pointer-events: none; -webkit-user-drag: none` on `.ft-tool-btn svg` as belt-and-suspenders protection against native SVG drag

### v0.10.31 — Fix Pointer Event Regressions (from v0.10.30)

- **FIX (R3.42)**: Drag-to-create from toolbar no longer triggers context menu — canvas `pointerup` handler now skips entirely when `canvasPointerId === -1` (no canvas `pointerdown` started the interaction); previously, drag-to-create's `pointerup` handler cleared `dtcTool` before the canvas handler ran, allowing fallthrough
- **FIX (R3.39)**: Floating toolbar is now draggable again — canvas `pointermove` handler now checks `ftDragging` (hoisted from closure to module scope) to skip processing during toolbar drag; prevents cursor interference and WASM hover calls during toolbar repositioning

### v0.10.30 — Fix Drag-to-Create from Toolbar (Remove setPointerCapture)

- **FIX (R3.42)**: Drag-to-create from floating toolbar now works reliably — removed all `canvas.setPointerCapture` calls from `pointer.js` which stole pointer events from the toolbar's document-level `pointermove`/`pointerup` listeners, preventing ghost preview from appearing and shapes from being created on drop
- **REFACTOR (R3.39)**: Canvas pointer event handling now uses document-level listeners with `canvasPointerId` tracking — same pattern already proven by toolbar drag and drag-to-create handlers; eliminates entire class of "pointer capture steals events from sibling overlays" bugs
- **FIX (R3.39)**: Toolbar guard in canvas `pointerdown` replaced from fragile `getBoundingClientRect()` comparison to robust `e.target.closest('#floating-toolbar')` DOM ancestry check — works regardless of toolbar orientation, transforms, or rolled-up state
- **REFACTOR**: `dtcTool` and `dtcActive` hoisted from `setupFloatingToolbar()` closure to module scope in `navigation.js` — enables cross-module coordination with canvas pointer handlers

### v0.10.29 — Consolidated `syncSelection()` + Edge Sync

- **REFACTOR (R2.5)**: All selection sync logic consolidated into one `syncSelection(id, source)` function in `sync.js` — previously scattered across 4 files (pointer.js, panels.js, shortcuts.js, sync.js); single source of truth for Canvas↔Layers↔Code synchronization; future panels stay in sync automatically
- **UX (R2.5)**: Edge selection now syncs across Layers and Code panels — clicking an edge `⟶` in Layers highlights the edge's `@id` line in Code; clicking a Code line with `edge @id` highlights it in Layers and scrolls into view; Canvas edge selection is a no-op (gracefully handled, waiting for WASM edge highlight support)

### v0.10.28 — Cross-Panel Selection Sync

- **UX (R2.5)**: Clicking a node in any panel now syncs selection across all three panels (Code, Canvas, Layers):
  1. **Layers scroll-into-view**: When a node is selected via Canvas click or Code cursor, the Layers panel now scrolls the selected item into view (`scrollIntoView({ block: 'nearest', behavior: 'smooth' })`)
  2. **Code→Canvas focus**: Clicking a node line in Code now pans/zooms the Canvas to focus on the node (via `focusOnNode()`), matching the existing Layers→Canvas behavior
  3. **Debounced Code sync**: Code→Canvas focus uses a 150ms debounce to prevent animation jitter when rapidly arrowing through lines

### v0.10.27 — Fix Toolbar Drag (v2 — 3-Layer Defense)

- **FIX (R3.39)**: Toolbar drag now actually works — previous fix (v0.10.23) was ineffective because canvas `pointerdown` intercepted events over the toolbar area. Applied 3 defensive fixes:
  1. Canvas `pointerdown` guard: skips events whose coordinates fall inside the toolbar bounding rect
  2. Canvas CSS `position: relative; z-index: 1` for proper stacking context (toolbar z-index: 25)
  3. `releasePointerCapture` on every canvas `pointerup` to prevent stale captures from blocking toolbar events

### v0.10.23 — Fix Toolbar Drag "Select All" + Unmovable Toolbar

- **FIX (R3.39)**: Dragging the floating toolbar no longer triggers browser text selection ("select all") — added `user-select: none` and `touch-action: none` to `#floating-toolbar` CSS
- **FIX (R3.39)**: Toolbar is now draggable from anywhere on its body — replaced scroll-handle-only `pointerdown` with a toolbar-wide handler that initiates drag from the toolbar background, paper body, and scroll handles (tool buttons excluded to preserve click-to-select and drag-to-create)

### v0.10.26 — Absolute Positioning in Managed Layouts

- **FEATURE (R3.2)**: Children inside Column/Row/Grid frames can now be freely moved — dragging a managed-layout child adds a `Position` constraint that pulls it out of the layout flow (Figma-style "Absolute Position" toggle)
- **FIX (R3.2)**: Position constraints now apply inside managed layouts — `resolve_constraints_top_down` no longer skips Position for managed children; Column/Row/Grid layouts filter out positioned children from their flow instead
- **TESTING**: Updated `layout_column_position_constraint_becomes_absolute` + `sync_move_managed_layout_child_converts_to_absolute` tests

### v0.10.25 — Fix Frame Resize Children Jump

- **FIX (R3.2)**: Resizing a Free-layout frame/rect/ellipse no longer resets child bounds — `resolve_children` Free branch now uses `or_insert` to preserve existing cached bounds (JS-measured text sizes, explicit positions) during `resolve_subtree`; managed layouts (Column/Row/Grid) still use `insert` for correct re-flow
- **TESTING**: `resolve_subtree_preserves_cached_bounds_and_recenters` regression test — verifies JS-measured child sizes survive parent resize while auto-centering still works

### v0.10.23 — Fix Canvas Resize + Text Editing Shape Preservation

- **FIX (R3.2, R3.28)**: Resizing parent shapes (rect/ellipse/frame) is now smooth — `apply_mutations` in `lib.rs` now skips the full `resolve_layout()` call for resize-only mutation batches (same as move-only batches). Previously, `resolve()` created a fresh HashMap that discarded all in-place bounds updates including JS-measured text sizes, causing a "resize fight" that snapped shapes back every frame
- **FIX (R3.28)**: Frame resize and child movement now works — same root cause as above; `resolve_subtree` in `SyncEngine::apply_mutation` handles subtree re-layout during drag, `resolve()` was undoing it
- **FIX (R3.28)**: Inline text editor now renders correctly before textarea appears — added `render()` call after `clear_pressed()` in `openInlineEditor` to flush bounds changes from `measureAndUpdateTextBounds` to the canvas
- **TESTING**: Updated `resolve_subtree_recenters_child_after_resize` regression test

### v0.10.20 — Child Placement & Auto-Center Multi-Child

- **FEATURE (R3.36)**: New `place:` property — 9-position child alignment within parent (top-left, center, bottom-right, etc.); supports both compound (`top-left`) and two-arg (`left top`) syntax
- **IMPROVEMENT (R3.36)**: Lifted single-child restriction for auto-centering — all text children in shape parents (Rect/Ellipse/Frame) without explicit Position constraint are now auto-centered
- **LAYOUT**: Priority order: explicit `Position` constraint > `place:` > auto-center > parent origin
- **PARSER**: `parse_place_value` with hyphenated keyword support; `place:` is distinct from `align:` (text rendering alignment)
- **TESTING**: 9 new/updated tests — 4 parser tests + 5 layout tests

### v0.10.19 — Fix Parent Frame Resize Children

- **FIX (R3.2)**: Resizing a parent frame/rect/ellipse now re-resolves children during drag — Column/Row/Grid children re-flow to fit new dimensions, centered text re-centers within resized parent; previously children stayed at old positions until pointer-up flush
- **CORE**: New `resolve_subtree(graph, idx, bounds, viewport)` in `layout.rs` — lightweight single-subtree re-resolve (reuses `resolve_children` + `resolve_constraints_top_down` + `recompute_group_auto_sizes`) called from `ResizeNode` handler
- **TESTING**: 4 new regression tests — `sync_resize_frame_children_reflow` (Column re-stack), `sync_resize_frame_centered_text_recenters` (text re-center), `sync_move_frame_flush_no_jump` (no visual jump on flush), `sync_move_frame_children_follow_after_flush` (children relative positions preserved)

### v0.10.18 — Modifier Key Cursor Feedback

- **UX (R3.48)**: Holding a bare modifier key now shows a cursor preview — Cmd/⌘ → grab (pan), Alt/Option → copy (duplicate), Ctrl → red eraser (delete); cursor appears immediately on keydown, clears on keyup or click; handles edge cases (window blur, tab-away, active pointer interaction)
- **CSS**: 3 new cursor classes (`modifier-cmd`, `modifier-alt`, `modifier-ctrl`) with `!important` to override tool-specific cursors during modifier hold
- **DOCS**: Updated `SHORTCUTS.md` with Alt (hold) and Ctrl (hold) cursor preview entries

### v0.10.17 — Fix Text Child Movement in Managed Layouts

- **FIX (R3.34)**: Moving a text child inside a frame with `layout: column/row/grid` is now a no-op — the layout solver owns child placement in managed layouts, so dragging individual children was causing snap-back, useless `x:/y:` properties, and frame expansion weirdness; matches Figma behavior where auto-layout children cannot be freely repositioned
- **CORE**: Made `is_parent_managed()` public in `layout.rs` so `sync.rs` can check layout mode before applying `MoveNode`
- **TESTING**: New `sync_move_managed_layout_child_noop` regression test — verifies bounds unchanged and no Position constraint added when moving a Column-layout child

### v0.10.16 — Fix Floating Toolbar Drag

- **FIX (R3.39)**: Floating toolbar is now draggable again — three compounding bugs fixed: (1) document-level `pointermove`/`pointerup` handlers now filter by `e.pointerId` to prevent cross-handler interference with drag-to-create; (2) `pointerdown` on scroll handles now normalizes toolbar position to absolute `px` values, eliminating CSS anchor conflicts between hardcoded `left: 244px` and JS-set `vw`/`vh` units; (3) `.scroll-handle` hit area expanded from 6px wood-core to 16px min-width with padding
- **UX (R3.39)**: Dragging the toolbar now shows visual feedback — lifted shadow (`0 8px 32px`) and slight opacity reduction (0.92) during drag, cleared on release

### v0.10.15 — Apple Preview-Style Text Editing

- **FIX (R3.28)**: Text nodes now show only 2 horizontal resize handles (MiddleLeft + MiddleRight) instead of 8-point handles — matches Apple Preview / Figma behavior where text height is intrinsic (auto-sized from font content); selection border reduced from 2px to 1px for text nodes
- **FIX (R3.28)**: Inline text editor now uses minimal Apple Preview-style overlay — thin 1px border, no box-shadow, no border-radius (was 2px outline + drop shadow + 8px radius); shape labels retain their visible styling
- **FIX (R3.46)**: Text bounding box padding reduced from 4px to 2px per side — matches renderer's `draw_text` y-offset (+2.0), eliminating oversized height boundary that made text boxes extend well below visible content
- **FIX (R3.28)**: Text node resize hit-test and cursor feedback now restricted to MiddleLeft/MiddleRight — `hit_test_resize_handle` (WASM), `getResizeHandleCursor` (JS), and `draw_selection_handles` (renderer) all filter handles by `NodeKind::Text`
- **FIX (R3.28)**: Inline editor minimum height now uses `lineHeight + 4px` instead of arbitrary `28px` — font calculation moved above screen-space computation so `lineHeight` is available for tight height sizing

### v0.10.14 — Inline Editor Zero-Jump Editing

- **FIX (R3.28)**: Inline text editor now visually matches canvas-rendered text with zero jump — replaced `border` with `outline` (outlines don't affect layout), fixed vertical padding to match Canvas2D `text_baseline` positioning exactly (`top` → scaled 2px offset, `middle` → symmetric padding, `bottom` → bottom-anchored), matched font-family fallback chain to renderer (`"Inter, sans-serif"`)

### v0.10.13 — Fix Text Rendering Mismatch + Bounding Box Sizing

- **FIX (R3.28)**: Inline text editor now visually matches canvas-rendered text — textarea positioning, padding, and line-height aligned with Canvas2D `draw_text`: line-height reduced from `fontSize*1.4` to `fontSize*1.2`, left padding removed (0px), top padding set to 2px matching renderer's `b.y+2.0` offset, textarea positioned exactly at node bounds
- **FIX (R3.46)**: Text bounding box now fully wraps content — JS `measureAndUpdateTextBounds` uses `fontSize*1.2` as minimum height floor (tight glyph metrics can be smaller than visual font height for descender-less text); WASM `update_text_metrics` padding increased from 2px to 4px per side

### v0.10.12 — Transparent Defaults + Copy/Paste Style

- **UX (R3.52)**: Newly created rect/ellipse shapes now default to transparent fill with visible stroke — removes the opaque white rectangle that previously obscured content underneath; consistent with Excalidraw/ScreenBrush behavior
- **UX (R3.52)**: Stroke color is now theme-contextual — dark stroke (`#333`) on light canvas, light stroke (`#A0A0B0`) on dark canvas; adapts via `self.dark_mode` flag in WASM `create_node_at`
- **NEW (R3.53)**: Copy Style (⌥⌘C) / Paste Style (⌥⌘V) — copies the selected node's full `Style` (fill, stroke, corner radius, opacity, font, shadow) to a clipboard, then applies it to another selected node; toast feedback "Style copied" / "Style pasted"
- **CORE**: `style_clipboard: Option<Style>` field on `FdCanvas` for cross-node style transfer via `CopyStyle` / `PasteStyle` `ShortcutAction` dispatch
- **TESTING**: New `resolve_copy_paste_style` test — verifies ⌥⌘C → CopyStyle, ⌥⌘V → PasteStyle, ⌘C → Copy (no alt regression)

### v0.10.11 — Fix Nested Group Drill-Down

- **FIX (R3.24)**: Clicking a node nested inside multiple groups (e.g., `OuterGroup > InnerGroup > Rect`) now correctly drills down through the hierarchy — first click selects outer group, second click selects inner group, third click selects the leaf node; previously clicks oscillated between the two groups forever because `effective_target` required cumulative selection `[outer, inner]` but `SelectTool` replaced selection to `[inner]`; fixed by using `rposition` (deepest match) instead of linear scan
- **TESTING**: 2 new regression tests — `test_effective_target_nested_drill_down_three_levels` (4 levels: A→B→C→leaf), non-cumulative selection assertion in `test_effective_target_nested_groups_selects_topmost`

### v0.10.10 — Fix Drag-to-Create from Toolbar

- **FIX (R3.39)**: Drag-to-create now works in VS Code webview — moved `pointermove`/`pointerup` listeners from button-level to document-level; same root cause as v0.10.8 (toolbar drag handles): `setPointerCapture` silently fails in VS Code webview iframes, so pointer events stopped firing when cursor left the toolbar button

### v0.10.9 — Remove Onboarding Overlay

- **REMOVED (R3.51)**: Removed the "Start drawing" / "Create something beautiful" onboarding overlay — it obstructed the canvas with a z-index 950 full-screen backdrop that flashed on every file open (even non-empty files like `dark_theme.fd`); the floating scroll toolbar with tooltips and `?` shortcut help already provide sufficient tool discovery
- **CLEANUP**: ~85 lines CSS, 22 lines HTML, ~57 lines JS removed from `webview-html.ts` and `main.js`

### v0.10.8 — Fix Floating Toolbar Drag Handles

- **FIX (R3.39)**: Floating toolbar drag handles now work reliably in VS Code webview — moved `pointermove`/`pointerup` listeners from handle elements to document level; `setPointerCapture` silently fails in VS Code webview iframes, causing drag events to stop when pointer leaves the small handle element

### v0.10.7 — Eraser Context Menu Fix + Lock Icon + Undo Dismissal

- **FIX (R3.48)**: Ctrl+click eraser no longer opens context menu on macOS — `contextmenu` event is now suppressed when eraser tool is active (temp or permanent)
- **UX (R3.49)**: Floating toolbar tool buttons now show 🔒 lock badge at top-right when tool is locked (double-press) — matches existing top toolbar behavior
- **FIX (R3.50)**: Undo/redo now dismisses open context menus and annotation cards — prevents stale popups after graph state changes

### v0.10.6 — Fix Eraser Tool Crash

- **FIX (R3.48)**: Pressing E (eraser tool) no longer crashes/freezes the canvas — `handle_pointer_move` in WASM had `unreachable!()` for eraser when not dragging; replaced with `vec![]` no-op for hover state
- **UX (R3.48)**: Added eraser button to floating toolbar — 8th tool button with eraser SVG icon and tooltip showing shortcut `E`
- **UX (R3.48)**: Added `e: "eraser"` to JS `toolShortcuts` map — double-press `EE` now locks the eraser tool (consistent with `RR`, `OO`, etc.)
- **UX (R3.48)**: Added `tool-eraser` CSS cursor — red X-crosshair SVG cursor appears when eraser is active
- **UX (R3.48)**: Added `E → Eraser` entry to keyboard shortcuts help overlay (`?`)

### v0.10.5 — Fix Duplicate Section Separators

- **FIX (R4.12)**: Section separator comments (`# ─── Layout ───`, `# ─── Themes ───`, etc.) no longer duplicate on each parse→emit round-trip — parser now skips emitter-generated separators via `is_section_separator()` check in `collect_leading_comments`; user comments are preserved
- **TESTING**: 2 new regression tests — `roundtrip_no_duplicate_separators` (3 round-trips verifying exactly 1 separator each), `roundtrip_user_comments_not_stripped`

### v0.10.4 — Visual Child Highlight

- **UX (R3.24)**: Clicking a child inside a group now highlights the **child** visually (blue border + resize handles) while logically selecting the **group** for operations (drag, delete, duplicate) — gives immediate visual feedback about the clicked element without breaking group behavior
- **CORE**: Added `visual_highlight: Vec<NodeId>` to `SelectTool` — tracks which nodes the renderer highlights, separate from `selected` (logical selection for operations)
- **CORE**: `render()` now passes `visual_highlight` to `render_scene()` instead of `selected`; all callsites that modify `selected` now sync `visual_highlight` (marquee, delete, duplicate, group, ungroup, deselect, add_node, select_by_id)
- **TESTING**: New `test_visual_highlight_differs_from_selected` — verifies the contract that `effective_target` returns the group while the raw hit (the child) is used for visual highlighting

### v0.10.3 — Canvas Interaction Fixes

- **FIX (R3.16)**: Shapes (rect, ellipse) can now be drawn in all directions — dragging north or west now correctly repositions the origin via `MoveNode` alongside `ResizeNode`; previously shapes only drew toward south-east
- **FIX (R1.19)**: Standalone arrows — arrows can now be drawn without connecting to a source or target node; uses `EdgeAnchor::Point` for unconnected endpoints; minimum 10px drag distance required to create
- **FIX (R1.19)**: Arrow preview line is now solid — removed dashed `setLineDash` from arrow preview rendering in `main.js`
- **UX (R3.24)**: Arrow target highlight — hovering over a node during arrow drag now shows a blue glow ring (#4FC3F7) around the potential target; WASM `get_arrow_preview` now includes `target_id` in JSON response
- **FIX (R3.24)**: Groups no longer have resize handles — `hit_test_resize_handle` returns `None` for Group nodes; group size derives purely from children
- **TESTING**: 6 new tests — `rect_tool_draw_northwest_emits_move`, `ellipse_tool_draw_northwest_emits_move`, `rect_tool_draw_southeast_no_extra_move`, `arrow_tool_standalone_creates_edge`, `arrow_tool_too_short_creates_nothing`, `arrow_tool_connected_still_works`; updated `arrow_tool_no_source_no_edge` → `arrow_tool_half_connected_point_to_node`

### v0.10.2 — Group Render + Text Bounds Fix

- **FIX (R5.4)**: Groups no longer appear as solid rectangles — selected groups now show dashed border instead of solid stroke + 8-point resize handles; matches Figma behavior where groups are purely organizational
- **FIX (R3.28)**: Inline text editor now preserves text style on double-click — WASM `get_selected_node_props` always returns resolved font properties (fontSize, fontFamily, fontWeight) including defaults, preventing mismatched rendering
- **FIX (R3.46)**: Text boundary tighter — WASM padding reduced from 4px→2px per side; JS `measureAndUpdateTextBounds` uses precise Canvas2D glyph metrics (`actualBoundingBoxAscent + Descent`) instead of `fontSize * 1.4` approximation

### v0.10.1 — Empty Parent Cleanup on Detach

- **FIX (R3.34)**: Detaching the last child from a Group/Frame now auto-removes the empty container — `remove_empty_ancestors()` in `sync.rs` cascade-deletes all now-childless Group/Frame ancestors up the chain (matches eraser's `cascade_empty_groups` behavior)
- **FIX (R4.10)**: Emitter now strips childless Group/Frame nodes during format — containers with no children, no annotations, no styles, and no animations are omitted from `.fd` output; styled/annotated empty containers are preserved
- **CORE**: New `has_inline_styles()` helper in `emitter.rs` — checks if a `Style` has any non-default properties without requiring `PartialEq` on float-containing types
- **TESTING**: 6 new tests — `sync_detach_last_child_removes_empty_group`, `sync_detach_last_child_removes_empty_frame`, `sync_detach_nested_cascade_removes_empty_ancestors`, `emit_strips_empty_frame`, `emit_keeps_styled_empty_frame`, `emit_keeps_group_with_children`; updated `roundtrip_empty_group` to verify stripping behavior

### v0.9.9 — Visible Delete Button

- **UX (R3.48)**: Added visible delete button (✕ icon) to the floating action bar — appears when a node is selected, red hover feedback (#FF3B30), calls `delete_selected()` on click
- **Tests**: All eraser/shortcut/sync tests confirmed passing (eraser_tool_lifecycle, erase_child_preserves_group, erase_nested_cascade, etc.)

### v0.9.8 — Ctrl → Temporary Eraser Override

- **UX (R3.48)**: Hold Ctrl + click/drag from any tool to temporarily switch to eraser; release Ctrl or pointer-up restores original tool
- **FIX**: Split `e.ctrlKey` from `e.metaKey` in pointerdown — Cmd=temp-select (Screenbrush), Ctrl=temp-eraser (new). Previously both triggered temp-select.
- **Keyup**: Control keyup now restores from temp eraser; Meta keyup handles Cmd-hold separately

### v0.9.7 — Eraser Poof Animation

- **UX (R3.48)**: Erasing a node now shows a brief red "poof" animation — a fading red rounded rect (150ms, 30% alpha → 0, slight scale-up) at the deleted node's position
- **WASM API**: `get_node_bounds_json(id)` — returns node bounds as JSON for JS to capture BEFORE eraser deletion
- **JS**: `erasePoofs[]` state array, capture on pointerdown + pointermove, render loop draws overlays respecting pan+zoom; animation loop keeps running while poofs are active

### v0.9.6 — Group-Aware Eraser

- **FIX (R3.48)**: Erasing a child inside a Group/Frame now detaches the child first, then deletes only the child — group and siblings survive; previously `RemoveNode` could leave broken groups
- **NEW**: `cascade_empty_groups()` — after erasing the last child, empty Group/Frame containers are automatically cascade-deleted up the ancestor chain (handles nested groups)
- **CORE**: `erase_node_immediately()` upgraded with pre-detach (reparent to root) + `expand_group_to_children()` to shrink parent bounds + post-delete cascade
- **TESTING**: 3 new tests — `erase_child_preserves_group`, `erase_last_child_leaves_empty_group`, `erase_nested_cascade`

### v0.9.5 — Near-Detach Visual Fix

- **FIX**: Removed confusing purple dashed rubber-band + glow ring when dragging text near the edge of its parent shape (rect/ellipse); near-detach preview now only shows for Group/Frame containers
- **CORE**: `evaluate_near_detach()` in `sync.rs` simplified to `matches!(parent_kind, Group | Frame)`; actual detach behavior in `handle_child_group_relationship()` unchanged

### v0.9.4 — Duplicate Naming + Figma-Style Group Selection

- **FIX**: Alt+drag duplicate now derives name from original — `@login_button` → `@login_button_copy_N` instead of anonymous `@_rect_N`; strips recursive `_copy_` suffixes to prevent name growth; consistent with copy/paste `_cpXXXX` convention
- **CORE**: Both `duplicate_selected_at` (WASM) and `DuplicateNode` mutation (sync engine) use `NodeId::with_prefix` for derived naming
- **UX (R3.24)**: Restored Figma-style group selection with progressive drill-down — first click selects topmost group ancestor, each subsequent click drills one level deeper; replaces transparent-group model from v0.8.98
- **CORE**: `effective_target()` now walks group ancestors top-down, returning the deepest unselected group
- **TESTING**: New `sync_duplicate_derives_name_from_original` test; updated 3 `effective_target` tests for drill-down behavior

### v0.9.2 — Eraser Tool

- **NEW (R3.48)**: Eraser tool — swipe-to-delete tool that tracks drag lifecycle and erased IDs for undo grouping; `EraserTool` struct with `clear()` method; `ToolKind::Eraser` variant; FdCanvas manages actual node removal (group-aware detach); `set_tool("eraser")` and keyboard/toolbar integration ready
- **WASM**: `EraserTool` field added to `FdCanvas` with full match coverage across all pointer handlers
- **SHORTCUT**: `E` key activates Eraser tool; `ShortcutAction::ToolEraser` enum, `dispatch_action` arm, and `action_to_name` mapping added
- **FIX**: Eraser no longer auto-switches to Select on pointer-up — drawing tools (Rect, Ellipse, etc.) still auto-switch, but Eraser stays active for continuous use
- **IMMEDIATE DELETE**: Eraser pointer handlers now perform hit-test + `RemoveNode` on contact — nodes disappear instantly during drag; text sync batched to pointer-up via `erase_pending_flush` flag; `erase_node_immediately()` helper routes through command stack for undo support
- **SYNC**: `detach_child_from_group` and `expand_group_to_children` made public in `sync.rs`; `bounds_mut()` accessor added to `SyncEngine`
- **TESTING**: 3 new tests — `eraser_tool_lifecycle`, `eraser_tool_clear_resets_state`, `eraser_tool_pointerdown_clears_previous_ids`; test for `resolve_tool_shortcuts` updated for E key

### v0.9.1 — Revert Text-to-Child Drag

- **REMOVED (R3.38)**: Reverted drop context menu reparent system — dragging a node onto a container no longer shows "Make child of @target" popup; ~160 lines of JS removed (`detectDropTarget`, `showDropContextMenu`, `closeDropContextMenu`, `reparentNodeIntoContainer`)
- **REMOVED (R3.44)**: Text tool's shape-reparent on drop removed — dragging Text tool onto a shape now creates a standalone text node at the drop position instead of reparenting inside the shape
- **KEPT**: Layout solver text-centering for manually-authored text children inside shapes remains functional

### v0.9.0 — Text Boundary + Inline Editor Fix

- **BUG FIX**: Text node boundaries now tightly wrap content — `measureAndUpdateTextBounds` was calling non-existent `get_node_props(nodeId)` WASM API, silently failing. Added `get_node_props(node_id)` to the WASM API and fixed the function
- **BUG FIX**: Inline editor commit now properly re-measures text bounds — `propKey === "text"` was wrong (dblclick handler passes `"content"`), so text bounds never updated after editing
- **UX**: Text bounds are now measured on initial canvas load and after every external text sync, ensuring tight bounding boxes from the start
- **WASM**: New `get_node_props(node_id)` API — query text/font properties for any node by ID without selecting it

### v0.8.99 — Inline Editor Alignment Fix

- **BUG FIX**: Inline text editor no longer forces `center`/`middle` alignment when double-clicking standalone text nodes — `get_selected_node_props` WASM API now always returns the effective alignment with parent-context-aware defaults (standalone = left/top, inside shape = center/middle), matching the WASM renderer exactly
- **UX**: The textarea overlay now perfectly preserves the original text position and alignment during editing, preventing visual jumps on commit

### v0.8.98 — Transparent Group Drag (Figma Behavior)

- **FIX (R3.24)**: Groups are now fully transparent for selection — clicking a child inside a group always selects the child directly (no more "click group first, click again to drill in"); matches Figma behavior where groups are purely organizational
- **REMOVED**: Drill-down deferral logic (`pending_drill_target`) — no longer needed since groups don't capture clicks; simplified `handle_pointer_down` and `handle_pointer_up` in WASM layer
- **CORE**: `effective_target()` in `model.rs` now returns the clicked leaf directly, ignoring Group ancestors
- **TESTING**: Updated `test_effective_target_group_transparent` and `test_effective_target_nested_groups_transparent`

### v0.8.97 — Context Menu Reparent + Child Containment

- **BREAKING (R3.37, R3.38)**: Replaced auto text-adoption-on-drag system with explicit context menu — dropping a node onto a container shows "Make child of @target" popup; auto-reparent + center-snap guides removed (~150 lines of fragile JS deleted)
- **FIX**: Floating toolbar no longer moves when clicking/dragging tool buttons — added `stopPropagation()` on tool button `pointerdown` to prevent scroll-handle drag activation
- **UX (R3.47)**: Child containment constraint documented — children fully outside parent bounds auto-detach (already enforced by `handle_child_group_relationship` in Rust)
- **UX**: Drop context menu uses glassmorphism design matching existing context menu — fade-in animation, click-outside/Escape dismiss, styled with design tokens

### v0.8.96 — Fix Selection Lost After Drag

- **BUG FIX (R2.5)**: Fixed selection clearing after drag-and-release — `textChanged` handler in `extension.ts` now suppresses `onDidChangeTextEditorSelection` during `applyEdit` via `suppressCursorSync` flag; previously the cursor sync round-trip sent an empty `selectNode` back to the canvas, clearing the selection after every drag gesture

### v0.8.95 — Text Hug-Contents + Detach Fix

- **FIX (R3.36)**: Text nodes now use "hug-contents" sizing — standalone and in-shape text nodes use their intrinsic size (tight bounding box) instead of expanding to fill their parent shape; selection rectangles accurately wrap the text content
- **FIX**: Text centering within parent shapes — text is centered via layout positioning (intrinsic size positioned at parent center) instead of expanding bounds to match parent; visual result is identical but selection and hit-testing are correct
- **FIX**: Improved `intrinsic_size()` heuristic — uses `chars().count()` instead of `len()` for UTF-8 correctness, adds `1.4×` line-height multiplier for more accurate text height estimation
- **FIX**: Synced detach heuristic — `handle_child_group_relationship()` and `evaluate_near_detach()` now use font-aware intrinsic size matching `intrinsic_size()` instead of crude `len * 8.0` / `16.0` constants
- **TESTING**: Updated 4 layout tests to assert centered position + tight bounds; all 139 workspace tests pass
- **CLEANUP**: Removed deprecated annotation badge dot at top-right corner of nodes — `hit_test_badge()` click interception from `main.js`, dead `draw_annotation_badge` function from `render2d.rs`, `badge_border` theme field, and `hit_test_badge` WASM API; annotation system (⌘I, context menu) still works via hover tooltip and spec view

### v0.8.94 — Label→Text Child Migration + Edge Text Detach

- **BREAKING**: Removed `Edge.label: Option<String>` — `label: "text"` now auto-creates a text child node (`_edgeid_label`)
- **FEATURE**: Nested `text @id "content" {}` blocks inside `edge {}` for styled edge labels
- **FEATURE**: `find_edge_for_text(text_id)` WASM API — lookup which edge owns a text child
- **FEATURE**: `detach_text_from_edge(text_id)` WASM API — detach text child from parent edge
- **FEATURE**: Edge text drag-to-detach in canvas — text >40px from edge midpoint auto-detaches on drop
- **MIGRATION**: 8 `.fd` files roundtrip-migrated from `label:` to nested `text` child blocks
- **TESTING**: All 277 tests pass with label field removed; roundtrip tests updated

### v0.8.93 — EdgeAnchor + Text Child

- **FEATURE**: `EdgeAnchor` enum — edge endpoints can now be `@node_id` (connected) or `x y` coordinates (standalone/dangling arrows)
- **FEATURE**: `create_edge_at(x1, y1, x2, y2)` WASM API — create standalone edges with point anchors
- **FEATURE**: `Edge.text_child: Option<NodeId>` — edges can reference a real text node in the scene graph for styled edge labels (rendered at midpoint with text node's font/fill)
- **SAFETY**: Edge-to-edge connections rejected in `create_edge()` — validates that from/to are not edge IDs
- **TESTING**: 3 new roundtrip tests: `roundtrip_edge_point_anchors`, `roundtrip_edge_mixed_anchors`, `parse_edge_omitted_anchors_default`

### v0.8.92 — Group vs Frame Refactoring (Figma Alignment)

- **REFACTOR**: `NodeKind::Group` is now a unit variant — purely organizational container (like Figma Group); no own styles, layout modes, or visual rendering; auto-sizes to children bounding box
- **REFACTOR**: `layout:` directives inside `group {}` blocks are parsed but silently ignored (backward compat); layout modes only apply to `frame` nodes
- **CLEANUP**: Removed `draw_group_bg()` dead code from Canvas2D renderer
- **LSP**: Updated group/frame hover descriptions to clarify semantic distinction
- **EXAMPLES**: Migrated `checkout_flow.fd`, `constraints.fd`, and `nested_layout.fd` test fixture from `group + layout:` to `frame + layout:`
- **TESTING**: 10 tests migrated from group+layout to frame+layout; all 142 Rust tests pass

### v0.8.91 — Canvas Interaction Fixes

- **FIX**: Resize handles now work in all 8 directions — `ResizeNode` handler in `sync.rs` now updates cached bounds so `resize_origin` stays accurate across frames
- **FIX**: Hover scale animation capped at 700ms total (200ms ease-in, 300ms hold, 200ms ease-out) instead of persisting indefinitely — implemented time envelope in `render2d.rs` with smoothstep interpolation
- **FIX**: New shapes (rect, ellipse) now created with white fill + bezeled stroke by default, matching ScreenBrush aesthetic
- **FIX**: Annotation badge corner dots already removed — WASM rebuild propagates fix

### v0.8.90 — Scroll Toolbar Bug Fixes

- **FIX**: Removed dead inline script in `webview-html.ts` that conflicted with `main.js` scroll toolbar logic — script referenced non-existent `#ft-drag-handle` and used wrong CSS class (`collapsed` vs `rolled-up`)
- **FIX**: Toolbar now snaps closer to the bottom — CSS default changed from `bottom: 56px` to `bottom: 12px`, drag snap default changed from `4vh` to `1.5vh`
- **FIX**: Drag-to-create from toolbar buttons now works on touch devices — added `touch-action: none` to `.ft-tool-btn`

### v0.8.88 — Text Reparent Fix + Figma-Style Group Selection

- **BUG FIX (R3.38)**: Fixed text reparent silently failing — `evaluateTextAdoption()` was gated on `&& changed` from WASM, causing `textDropTarget` to null out on frames where the pointer didn't move enough to trigger a model change; moved text adoption evaluation outside the `changed` gate so it runs on every pointermove frame
- **BUG FIX (R3.38)**: Fixed animation picker intercepting text drops — added `&& !textDropTarget` guard to the animation drop handler in `pointerup`, so text reparent takes priority over animation binding when both targets are set
- **BUG FIX**: Groups no longer jump to front on click-select — `bring_forward` now skips `NodeKind::Group` nodes, keeping groups behind their children in z-order
- **UX (R3.24)**: Re-implemented Figma-style group selection — `effective_target` now bubbles hits up to the outermost unselected Group ancestor; first click selects the group, second click (group already selected) drills into the child; existing `pending_drill_target` logic handles the drill-down
- **TESTING**: 5 new tests — `test_effective_target_bubbles_to_group`, `test_effective_target_nested_groups`, `test_effective_target_no_group`, `sync_move_group_propagates_to_children`, `sync_move_nested_group_propagates`

### v0.8.87 — Three-Zone Toolbar + Inline Zen Toggle (Option C)

- **UX**: Restructured top toolbar into three zones — LEFT (✦ AI Touch, ✦ Renamify), CENTER (All|Design|Spec view toggle), RIGHT (status, Zen toggle, ☰ settings) — balanced layout replacing the old flat left-aligned arrangement
- **UX**: Moved Zen toggle from floating top-right pill into the toolbar's right zone as icon-only button (🧘↔🔧) — cleaner UI, accessible via title attribute
- **CLEANUP**: Removed dead CSS (`.tool-sep`, floating `#zen-toggle-btn`, `.zen-icon`, duplicate `#spec-overlay` rule), removed `flex:1` spacer div

### v0.8.89 / v0.1.6 — Canvas Bug Fixes Batch

- **FIX**: Remove animation picker on drag-onto-node — no more glow ring or animation assignment prompt when dragging nodes onto other nodes
- **FIX**: Remove top-right annotation badge circles from all nodes — cleaner canvas
- **FIX**: Resize handles now respond reliably — hit radius increased from 5px to 8px in both JS and WASM
- **FIX**: Text boundary tightened to just cover actual text — padding reduced from 8px to 4px per side
- **VERIFIED**: Inline editor preserves text styles on double-click commit — `SetText` mutation leaves style untouched
- **VERIFIED**: Multi-select drag moves all selected nodes at the same speed — Rust `SelectTool` applies identical `(dx,dy)` delta to all selected nodes

### v0.8.86 / v0.1.4 — Auto-Expand + Text Sizing + Edge Label Offset

- **FEATURE (R3.45)**: Auto-expand parent on release — `finalize_child_bounds()` expands parent groups/frames to contain overflowing children after resize or text growth; processes bottom-up for recursive cascade; skips `clip: true` frames; runs only on pointer-up to avoid chasing-envelope bug
- **FEATURE (R3.46)**: Text intrinsic sizing via JS `measureText()` bridge — `update_text_metrics()` WASM API receives measured dimensions from Canvas2D, updates text node bounds with 8px padding; `measureAndUpdateTextBounds()` JS helper wired into inline editor commit flow; calls `finalize_bounds()` for parent cascade
- **FEATURE (R1.19)**: Edge label offset — `label_offset: <x> <y>` property on edges for draggable text labels; full parse/emit roundtrip support
- **WASM**: 3 new APIs — `finalize_bounds()`, `update_text_metrics()`, `label_offset` parsing
- **CORE**: `PartialEq` derive on `ResolvedBounds`; `collect_groups_bottom_up()` helper for post-order group traversal
- **TESTING**: 5 new Rust tests — `sync_resize_child_expands_parent_on_finalize`, `sync_resize_child_within_bounds_no_expand`, `sync_cascade_expand_two_levels`, `sync_cascade_stops_at_clip_frame`, `roundtrip_edge_label_offset`

### v0.8.85 — Type-Prefixed Anonymous IDs

- **REFACTOR**: Replaced `_anon_N` anonymous IDs with type-prefixed `_kind_N` pattern (e.g. `_rect_0`, `_text_1`, `_group_2`) — clearer at a glance which component an auto-generated ID refers to
- **CORE**: `NodeId::anonymous(kind)` now takes a `&str` kind parameter; added `NodeKind::kind_name()` returning the FD keyword; `is_anonymous_id()` helper checks against all known prefixes
- **PARSER**: Both node blocks and edge blocks pass their kind string to `anonymous()`
- **WASM**: All 4 call sites updated — `duplicate_selected_at`, `group_selected`, `create_node_at`, `set_text`
- **LINT**: `lint_anonymous_ids` uses new `is_anonymous_id()` pattern matcher
- **LSP**: `compute_symbols` uses `kind_name()` and `is_anonymous_id()` for symbol filtering
- **TS**: Removed `findAnonNodeIds`, updated `ANONYMOUS_ID_REGEX` and AI refine prompt; 191 TS tests pass
- **ZED**: All changes mirrored in zed-extensions copy

### v0.8.84 — Zoom Inside Minimap (Google Maps-style)

- **UX**: Moved zoom controls `[− 100% +]` from defunct bottom-left widget into the minimap as a floating frosted-glass pill overlay — compact, always-visible zoom level with `stopPropagation()` to prevent minimap pan on button click
- **CLEANUP**: Removed 60 lines of dead CSS for old `#bottom-left-controls` (replaced by V12 scroll toolbar)
- **TESTING**: 3 new e2e tests — pill layout fits minimap, event isolation via stopPropagation, percentage display

### v0.8.83 — Scroll Toolbar Redesign (V12)

- **UX**: Redesigned floating toolbar into a "Scroll Toolbar" with wooden handles and paper rolls that dynamically adjust width asymmetrically based on the active tool
- **UX**: Dual orientation — toolbar defaults to horizontal at bottom-left, but snaps vertically when dragged to the left or right edges
- **UX**: Drag-and-snap — dragging the wooden handles snaps the toolbar to canvas edges using relative positioning
- **CLEANUP**: Removed the old `#selection-bar` entirely

### v0.8.82 — Text Snap/Reparent Redesign

- **UX (R3.37, R3.38)**: Unified center-snap and text-drop-target into single `evaluateTextAdoption()` system — eliminates race between centering and reparenting; one decision point for visual feedback
- **BUG FIX**: Fixed detach-after-reparent race condition — `evaluate_drop()` is now skipped when a text reparent already happened in the same pointer-up, preventing immediate re-detach of just-adopted nodes
- **UX**: Conditional auto-centering — text dropped on a shape with no existing text child auto-centers (position stripped); text dropped on a shape _with_ existing text children keeps its explicit position
- **UX**: Group nodes now work as drop targets for text reparenting (was previously limited to rect/ellipse/frame only)
- **WASM**: New `has_text_child(node_id)` API — checks if a node has text children (used for conditional centering); new `parent_of(node_id)` API — returns parent ID (used to skip self-parent adoption)
- **TESTING**: 2 new sync tests — `sync_text_detach_from_shape`, `sync_text_stays_when_overlapping`

### v0.8.81 — Arrow Head Tangent Alignment

- **BUG FIX (R5.7)**: Fixed arrowhead misalignment on Smooth and Step edge curves — arrowheads now follow the curve's tangent direction at the endpoint instead of the straight-line center-to-center angle; Smooth uses quadratic bezier control point tangent, Step uses horizontal last-segment direction
- **CLEANUP**: Suppressed pre-existing `clippy::type_complexity` warning on `evaluate_near_detach` return type

### v0.8.80 / v0.1.2 — Drag-and-Drop Detach Fix

- **BUG FIX**: Fixed an issue where text nodes inside shapes would not detach when dragged out. The overlap test now uses intrinsic visual bounds.
- **DOCS**: Added `LESSONS.md` entry on "Invisible Bounding Boxes".
- **TESTING**: Playwright E2E-UX tests passed perfectly.

### v0.8.79 — Text Drop-to-Consume on Shapes & Edges

- **UX**: Dragging Text tool onto a shape (rect/ellipse/frame) reparents it as a child node inside the shape using existing R3.38 logic — auto-centers, strips position constraints
- **UX**: Dragging Text tool near an edge (≤30px) inserts a child text node inside the edge block in FD source — uses point-to-segment distance for edge detection
- **UX**: Hit priority: Shape > Edge > Empty canvas

### v0.8.78 — Snap-to-Node + Auto-Edge on Drag-to-Create

- **UX**: Dragging a shape from toolbar near an existing node snaps to adjacent position (20px gap, 40px threshold, 4 cardinal dirs); auto-creates edge from existing→new node with arrow:end + curve:smooth; shows frosted-glass edge context menu at edge midpoint with Arrow/Curve/Stroke/Flow controls; Esc or click-outside dismisses
- **WASM**: New `create_edge(from_id, to_id)` API creates edges programmatically with auto-generated ID

### v0.8.77 — Drag-to-Create from Toolbar

- **UX**: Drag a tool button from the floating toolbar onto the canvas to create a shape at the drop location — ghost preview (dashed outline matching shape type) follows cursor during drag; 5px threshold disambiguates click vs drag; screen→scene coordinate conversion respects zoom+pan; applies sticky smart defaults on creation; capture-phase click suppression prevents tool activation after drag

### v0.8.76 — ScreenBrush Default Styles

- **UX**: New shapes default to ScreenBrush-style transparent fill + thick bezeled stroke (#333333, width 2.5, round caps/joins); rects also get 8px corner radius. Cascade: sticky defaults (per-tool) take priority → WASM fallbacks only when no sticky style exists. Hit-testing unaffected — uses bounding-box containment

### v0.8.75 — SVG Toolbar Icons

- **UX**: Replaced all 7 Unicode glyph icons in floating toolbar with clean inline SVGs (18×18 viewBox, stroke-based, `currentColor`) — cursor arrow (Select), rounded rect (Rectangle), circle (Ellipse), pencil (Pen), diagonal arrow (Arrow), T-bar (Text), nested rects (Frame); fixes cross-platform rendering issues (⊞ displayed incorrectly on some systems)

### v0.8.74 — Auto Bring Forward on Select

- **UX**: Clicking to select a node automatically brings it forward one z-level — reuses existing `bring_forward` from ⌘]; only triggers on fresh click-select (<5px movement), not on re-click of already-selected nodes or drag operations; prevents z-fighting by skipping if already selected

### v0.8.73 — Frosted Glass Tooltips

- **UX**: Apple-style frosted glass tooltips on all 7 floating toolbar buttons — `backdrop-filter: blur(12px)`, glassmorphic pill with 400ms hover delay, monospace shortcut key badge; replaces ugly native `title` tooltips; hidden in collapsed mode and during click

### v0.8.72 — Fix Group Detach on Drag Out

- **BUG FIX (R3.34)**: Fixed "chasing envelope" bug — dragging a child incrementally outside a group now correctly detaches it. Previously, `expand_group_to_children` grew the parent to contain the moving child on every drag frame, making escape impossible. Fix: skip group expansion during continuous drag; only detach or keep in-place
- **UX**: Snappy detach animation — teal glow ring (250ms pop) appears on the detached node when it leaves a group, giving visual feedback that reparenting occurred
- **WASM**: New `get_last_detach_info()` API — returns `{detached, nodeId, fromGroupId}` one-shot event for JS animation trigger
- **TESTING**: New `sync_incremental_drag_detaches_child` regression test — simulates 30 small moves proving detach works with real drag gestures; renamed `sync_move_partial_overlap_expands_group` → `sync_move_partial_overlap_keeps_child` (group no longer expands during drag)
- **BUG FIX**: Floating toolbar drag handle (#ft-drag-handle) now functional — pointerdown/pointermove/pointerup handlers with 5px threshold disambiguate click vs drag; position saved via `vscodeApi.setState()` and restored on load
- **UX**: Floating toolbar collapse toggle — single-click on drag handle toggles `.collapsed` class (iPad-style minimize to active-tool circle); collapsed state persists to webview state

### v0.8.71 — ✦ Renamify (Batch AI Rename)

- **NEW (R4.20)**: ✦ Renamify — batch AI rename for anonymous node IDs (`@rect_1`, `@ellipse_3`, etc.) → semantic names (`@login_button`, `@hero_card`); toolbar button + command palette
- **UX**: Diff-preview panel with frosted-glass overlay — shows `@old → @new` with checkboxes; Accept All / Accept Selected / Cancel
- **UX**: Button shows "⏳ Analyzing…" while AI is working; single ⌘Z undoes all renames atomically
- **CORE**: `findAnonymousNodeIds` detects `@kind_N` + `@_anon_N` patterns; `sanitizeToFdId` normalizes AI-proposed names to valid snake_case; `applyGlobalRenames` updates all `@id` references
- **AI**: Focused rename-only JSON prompt (no full document rewrite) — faster and more reliable than refine-all approach
- **TESTING**: 22 new tests — `findAnonymousNodeIds` (9), `findAllNodeIds` (3), `sanitizeToFdId` (10); 188 total TS tests pass

### v0.8.70 — Canvas UX Overhaul

- **FIX (R2.5)**: Layer–canvas selection sync — clicking a node on canvas now always highlights it in the Layers panel; fixed generation-counter optimization that skipped `.selected` CSS class update when only selection changed (no structural edit)
- **FIX (R3.17)**: Smart guides snap threshold increased from 1px to 5px — guides now appear at usable distances during drag, matching industry-standard (Figma ~5px) behavior
- **UX (R4.8)**: AI Touch toolbar icons changed from ✨ to ✦ (4-point star) for "AI Touch" and ✦✦ (double star) for "AI Touch All" — clearer visual distinction
- **UX (R3.14)**: Spec badge pins removed — spec info now appears as a hover tooltip on annotated nodes with glassmorphic styling showing status, priority, and description
- **UX (R3.14)**: "Show Specs" added to right-click context menu for nodes with spec annotations
- **NEW (R3.37)**: Center-snap for text nodes — dragging text near a shape's center shows purple crosshair guides; releasing snaps text to exact center with coordinate update
- **NEW (R3.38)**: Text drag-to-consume — dragging a text node onto a shape reparents it as a child, auto-centered inside the shape; position constraints stripped automatically
- **DOCS**: Added 2 lessons to `LESSONS.md` — layer panel selection sync, smart guide threshold

- **Parser hardening**: Added 13 new round-trip tests covering empty groups, 3-level nesting, unicode text (emoji/CJK), spec blocks with all fields, path nodes, linear/radial gradients, shadow, opacity, clip frames, multiple animations, inline spec shorthand, and all layout modes (column/row/grid)
- **LSP completions**: Overhauled `completion.rs` — added `frame`, `edge`, `import`, `spec` snippets to top-level; `shadow:`, `clip:`, `x:`, `y:`, `align:` properties to node body; value completions for `fill` (named colors + hex palette), `align`, `clip`, `arrow`, `curve`; 9 total tests
- **Error recovery**: All 6 parser error sites now include 1-based line numbers and 40-char context snippets (UTF-8 safe) — e.g. `line 12: node error — expected 'kind @id { ... }', got '...'`
- **Example files**: Created 3 new showcase examples: `responsive_dashboard.fd` (constraint-based dashboard), `animated_onboarding.fd` (3-step flow with edge/pulse animations), `design_tokens.fd` (design system with 7 styles + component patterns)

---

<!-- ARCHIVED EPOCHS — agents: read summaries only, expand <details> only if needed -->

### Epoch: v0.9.x — Interaction Overhaul (10 releases)

Eraser tool (swipe-to-delete, group-aware, poof animation, Ctrl+click temp eraser), text editing fixes (boundary/inline alignment), group detach fix (near-detach visual feedback), duplicate naming, Figma-style group drill-down, text reparent revert, text-to-child drag context menu.

<details>
<summary>Full v0.9.x entries (v0.9.0–v0.9.9)</summary>

- **v0.9.9**: Visible delete button (✕) in floating action bar
- **v0.9.8**: Ctrl → temporary eraser override from any tool
- **v0.9.7**: Eraser poof animation (red fading rect)
- **v0.9.6**: Group-aware eraser (detach child first, cascade empty groups)
- **v0.9.5**: Near-detach visual fix (removed confusing rubber-band for non-Group parents)
- **v0.9.4**: Alt+drag duplicate derives name from original, restored Figma drill-down
- **v0.9.2**: Eraser tool (EraserTool struct, E key, toolbar, immediate delete)
- **v0.9.1**: Reverted drop context menu reparent system (~160 lines removed)
- **v0.9.0**: Text boundary + inline editor fix (measureAndUpdateTextBounds fix)

</details>

### Epoch: v0.8.70–v0.8.99 — Canvas UX & Design Polish (30 releases)

Canvas UX overhaul (layer sync, smart guides 5px, center-snap, text-consume), scroll toolbar redesign (V12 wooden handles), SVG toolbar icons, frosted glass tooltips, auto bring-forward on select, sketchy rendering mode, arrow/connector tool, Figma group drill-down iterations (5+ attempts), toolbar consolidation, status rename, spec badges, style/when rename, ReadMode filtered views, component libraries, GitHub Pages playground.

<details>
<summary>Full v0.8.70–v0.8.99 entries</summary>

- **v0.8.99**: Inline editor alignment fix
- **v0.8.98**: Transparent group drag (Figma behavior)
- **v0.8.97**: Context menu reparent + child containment
- **v0.8.96**: Fix selection lost after drag
- **v0.8.95**: Text hug-contents + detach fix
- **v0.8.94**: Label→text child migration + edge text detach
- **v0.8.93**: EdgeAnchor + text child
- **v0.8.92**: Group vs frame refactoring (Figma alignment)
- **v0.8.91**: Canvas interaction fixes (resize handles all 8 dirs, hover scale cap)
- **v0.8.90**: Scroll toolbar bug fixes
- **v0.8.89**: Canvas bug fixes batch (animation picker removed, handle radius, text bounds)
- **v0.8.88**: Text reparent fix + Figma group selection
- **v0.8.87**: Three-zone toolbar + inline Zen toggle
- **v0.8.86**: Auto-expand parent + text sizing + edge label offset
- **v0.8.85**: Type-prefixed anonymous IDs (\_rect_N, \_text_N)
- **v0.8.84**: Zoom inside minimap (Google Maps-style)
- **v0.8.83**: Scroll toolbar redesign (V12 wooden handles)
- **v0.8.82**: Text snap/reparent redesign
- **v0.8.81**: Arrow head tangent alignment
- **v0.8.80**: Drag-and-drop detach fix
- **v0.8.79**: Text drop-to-consume on shapes & edges
- **v0.8.78**: Snap-to-node + auto-edge on drag-to-create
- **v0.8.77**: Drag-to-create from toolbar
- **v0.8.76**: ScreenBrush default styles
- **v0.8.75**: SVG toolbar icons
- **v0.8.74**: Auto bring forward on select
- **v0.8.73**: Frosted glass tooltips
- **v0.8.72**: Fix group detach on drag out (chasing envelope)
- **v0.8.71**: ✦ Renamify (batch AI rename)
- **v0.8.70**: Canvas UX overhaul (layer sync, smart guides, center-snap, parser hardening)

</details>

### Epoch: v0.8.30–v0.8.69 — Features & Foundations (40 releases)

Zen mode, sketchy/hand-drawn rendering, Figma-style keyboard shortcuts (z-order ⌘[/⌘], frame F, duplicate ⌘D, group ⌘G), sticky tool lock (double-press), modifier keys (⌘+drag temp-select, Alt+drag clone), floating action bar, smart defaults (sticky styles), batch undo/redo, nested group auto-sizing, column layout fixes, AI Touch, spec view, toolbar consolidation, benchmark examples, autoformat ordering, ReadMode, component libraries, GitHub Pages.

<details>
<summary>Full v0.8.30–v0.8.69 entries</summary>

- **v0.8.68**: AI Touch + 3-mode view toggle
- **v0.8.67**: ReadMode filtered views + read-only code view
- **v0.8.66**: Toolbar consolidation (+ Insert dropdown)
- **v0.8.65**: Status rename (draft→todo, in_progress→doing, +blocked)
- **v0.8.64**: Spec badge improvements
- **v0.8.62**: Sort fix + LSP style/when + tree-sitter regen
- **v0.8.60**: Text centering in nested layouts
- **v0.8.59**: Content-first emitter ordering + section separators
- **v0.8.58**: Text auto-centering in shapes
- **v0.8.57**: Group reparent on drag-out
- **v0.8.56**: Canvas→code selection sync + managed layout fixes
- **v0.8.55/54**: Batch undo/redo (single step per drag gesture)
- **v0.8.53**: Security (XSS fix), modularized extension.ts (3882→1026 lines)
- **v0.8.52**: Column layout render order fix (petgraph → StableDiGraph)
- **v0.8.49–48**: Group selection fixes
- **v0.8.47**: Nested group drill-down fix
- **v0.8.46**: Touch & gesture optimization (2-finger pan, pinch-to-zoom)
- **v0.8.44**: One-click export menu + SVG export
- **v0.8.43**: Copy selection as PNG (⌘⇧C)
- **v0.8.42**: Onboarding overlay + welcome.fd
- **v0.8.41**: Recursive ID rename on paste
- **v0.8.40**: Smart defaults (sticky styles per tool)
- **v0.8.39**: Contextual floating toolbar (glassmorphism)
- **v0.8.38**: ⌘+drag temporary select, Alt+drag clone
- **v0.8.37**: Z-order shortcuts, frame tool, help dialog
- **v0.8.36**: Sticky tool mode (double-press to lock)
- **v0.8.35**: Zen mode
- **v0.8.34**: Sketchy rendering mode
- **v0.8.33**: Arrow/connector drawing tool
- **v0.8.32**: Single-click centered shape creation
- **v0.8.31–30**: Testing expansion (E2E UX tests, nested group tests)

</details>

### Epoch: v0.6.32–v0.8.29 — Core Editing (30 releases)

Core editing infrastructure: inline text editing (double-click, Esc cancel, live sync), label→text child migration, inline editor styling (fill match, font match, zoom scaling), resize handles, smart alignment guides, drag-and-drop animation picker, copy/paste, zoom-to-selection, color swatches, layer visibility toggle, minimap, grid overlay, arrow-key nudge, layer rename, spec/annotation system (⌘I, spec view, badges), auto-reveal canvas, cursor→canvas sync, group/ungroup undo/redo, frame node type.

<details>
<summary>Full v0.6.32–v0.8.29 entries</summary>

- **v0.8.29**: Deprecated label property → text child nodes
- **v0.8.28–26**: Group selection fixes (child drag, drill-down, group drag)
- **v0.8.25**: Press animation fix on double-click
- **v0.8.24**: Fix delete→code sync
- **v0.8.23**: Group node visibility & drill-down
- **v0.8.22**: Z-order fix (StableDiGraph)
- **v0.8.20–19**: Zoom/focus improvements
- **v0.8.21–18–17**: Style/text sync fixes
- **v0.8.16**: Resize handle cursor feedback
- **v0.8.15**: AI assist settings button
- **v0.8.14–13**: Layer selection fixes
- **v0.8.12**: Ellipse inline editor border-radius
- **v0.8.11**: Constraint::Absolute → Position rename
- **v0.8.10**: Zoom cap at 200%, inline editor centering
- **v0.8.9**: 3×3 text alignment system
- **v0.8.8**: Inline editor background match, live text sync
- **v0.8.7**: Animation picker (drag-and-drop)
- **v0.8.6**: Inline editor font/bounds fix
- **v0.8.5**: Removed ## annotation syntax → spec blocks
- **v0.8.4–3**: Multi-ungroup, context-aware group/ungroup
- **v0.8.2–1–0**: Canvas centering, spec view keyword stripping, spec system
- **v0.7.9–8–7–6–5–4–3**: Spec panel, smart guides, resize handles, copy/paste, zoom-to-selection, grid, minimap, nudge, layer rename
- **v0.7.0**: spec block syntax (BREAKING)
- **v0.6.41–32**: Core fixes (undo/redo, frame node type, canvas auto-reveal, cursor sync)

</details>

> Requirement status and test coverage are now tracked inline in [REQUIREMENTS.md](REQUIREMENTS.md).
