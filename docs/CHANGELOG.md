# FD Changelog

> Tracks requirement completion status across the entire FD project.
> For VS Code extension release notes, see [`fd-vscode/CHANGELOG.md`](../fd-vscode/CHANGELOG.md).

## Completed Requirements

### v0.8.56

- **BUG FIX**: Children inside Column/Row/Grid layouts no longer overflow their parent group — layout solver now skips `Position` constraints for children in managed layouts (the layout mode owns positioning)
- **BUG FIX**: Group auto-sizing now uses resolved bounds directly instead of adding stale Position offsets, fixing incorrect bounding boxes after constraints shift children
- **BUG FIX**: Moving a child outside its parent group now expands the group to contain it — `MoveNode` handler recomputes parent group bounds after every move
- **LAYOUT**: Added `recompute_group_auto_sizes` final pass in `resolve_layout` — ensures free-layout groups correctly contain children with Position constraints
- **TESTING**: 3 new regression tests — `layout_column_ignores_position_constraint`, `layout_group_auto_size_contains_all_children`, `sync_move_expands_parent_group`
- **EXAMPLES**: Cleaned stale `x`/`y` coordinates from `dashboard_card.fd` children inside column layout

### v0.8.55

- **BUG FIX**: Drag actions (move, resize, draw) now undo/redo as a single step — rewrote batch undo to use text-snapshot approach: `begin_batch()` captures full FD text before gesture, `end_batch()` captures after, undo restores the before-snapshot atomically via `set_text()` instead of replaying per-mutation inverses which could drift
- **UX**: Coordinates and dimensions are now rounded to 2 decimal places — eliminates floating-point noise from accumulated drag deltas
- **TESTING**: 2 new tests — `batch_undo_is_single_step`, `batch_redo_reapplies_all`, `empty_batch_no_undo_entry`

### v0.8.54

- **BUG FIX**: Drag actions (move, resize, draw) now undo/redo as a single step — previously every pointer-move during a drag pushed a separate undo entry, requiring dozens of Cmd+Z to revert one drag gesture. Implemented `begin_batch()`/`end_batch()` on `CommandStack` to squash all mutations between PointerDown and PointerUp into one atomic command.
- **UX**: Coordinates and dimensions are now rounded to 2 decimal places — eliminates floating-point noise (e.g. `x: 100.00000762939453`) from accumulated drag deltas in the emitted `.fd` text.
- **TESTING**: 2 new tests — `batch_undo_is_single_step`, `batch_redo_reapplies_all`
- **CONFIG**: Added browser subagent tab reuse rule to `GEMINI.md`

### v0.8.53

- **SECURITY**: Fixed Stored XSS vulnerability in webview initialization — replaced manual backtick escaping with `JSON.stringify` + unicode escaping for `initialText`, preventing injection via crafted `.fd` file content
- **PERF**: Optimized `Color::from_hex` parser — zero-allocation byte parsing with `r * 17` hex digit expansion, replacing regex-based approach
- **A11Y**: Onboarding cards now use semantic `<button>` elements instead of `<div>` — adds keyboard navigation, focus-visible outline, and screen reader support
- **REFACTOR**: Modularized `extension.ts` (3882 → 1026 lines) — extracted HTML/CSS template into `webview-html.ts`, diagnostics into `diagnostics.ts`, document symbols into `document-symbol.ts`, panels into `panels/spec-view.ts` and `panels/tree-preview.ts`; consolidated API calls into reusable `callAiApi` helper; extracted magic numbers into named constants

### v0.8.52

- **BUG FIX**: Column layout elements no longer render in reversed order on the WASM canvas — replaced platform-dependent `petgraph` neighbor order hack (`.reverse()`) with deterministic `NodeIndex` sorting (`.sort()`), which is insertion-order-stable across both native x86_64 and wasm32 targets
- **UX**: Column layout now stretches text children to fill parent content width (CSS `align-items: stretch` behavior)
- **UX**: Context-aware text alignment defaults — text inside shapes (rect/ellipse/frame) defaults to center alignment; standalone text defaults to left alignment
- **TESTING**: New `layout_dashboard_card_with_center_in` regression test verifying child ordering and bounds after `center_in: canvas` constraint resolution

### Fix Nested Group Auto-Sizing

- **BUG FIX**: Groups inside Column/Row/Grid layouts now take up their correct resolved size — previously `intrinsic_size()` returned `(0,0)` for groups, causing siblings to overlap. Layout solver now uses a two-pass approach: pass 1 recurses to resolve nested group sizes bottom-up, pass 2 repositions children using their actual dimensions with `shift_subtree` to maintain correct absolute positions for all descendants.
- **TESTING**: New regression tests `layout_nested_group_auto_size` and `layout_group_child_inside_column_parent` in `layout.rs`

### Remove R7 Collaboration

- **REMOVED**: R7 (Collaboration) — removed `R7.1` (real-time multiplayer) and `R7.2` (shareable links) from requirements; deleted 👥 Share button, shareDialog handler, collaborative cursor CSS/JS placeholder from `extension.ts` and `main.js`; removed R7 section + index entry from `REQUIREMENTS.md`

### Requirements Overhaul

- **DOCS**: Restructured `REQUIREMENTS.md` — inline status tags on all 60+ requirements, R3 reorganized into 5 sub-categories (R3a–R3e: Selection, Drawing, Navigation, Panels, Export)
- **DOCS**: Created `docs/specs/` with 5 detailed spec docs: `selection.md`, `drawing-tools.md`, `inline-editing.md`, `edge-system.md`, `animation-system.md`
- **DOCS**: Removed 134 duplicate lines (completion checklist + test matrix) from CHANGELOG — now tracked inline in REQUIREMENTS.md
- **DOCS**: Updated GEMINI.md Requirement Deduplication rule to reference `docs/specs/`

### Docs Restructure

- **DOCS**: Moved `REQUIREMENTS.md` and `EDITORS.md` from project root into `docs/` directory
- **DOCS**: Added `docs/ARCHITECTURE.md` — crate map, dependency graph, data flow, key types, rendering pipeline
- **DOCS**: Updated all cross-references in workflows (`commit.md`, `yolo.md`, `uiux.md`, `spec.md`), `fd-vscode/README.md`, and zed-extensions submodule
- **DOCS**: Noted Chrome browser subagent availability in `.agents/workflows/e2e.md`

### v0.8.49

- **BUG FIX**: Groups are now draggable again when selected — restored deferred drill-down logic so clicking inside a selected group keeps the group selected for drag; only drills into the child on click-without-drag (pointer-up at same position)

### v0.8.48

- **BUG FIX**: Clicking a child node now selects the child directly instead of its parent group — removed `effective_target` bubble-up behavior and drill-down state machine (`pending_drill_target`); groups are still selectable by clicking their own unoccupied area or via marquee selection
- **TESTING**: Updated `test_effective_target_returns_leaf` and `test_effective_target_nested_returns_leaf` to verify direct child selection

### v0.8.47

- **BUG FIX**: Dragging a child group no longer moves its parent group — `effective_target()` now stops bubbling at selected group boundaries (returns the **lowest** unselected group instead of the highest), enabling correct Figma-style nested group drill-down and drag
- **TESTING**: New regression test `test_effective_target_child_group_drag`

### v0.8.46

- **FEATURE**: Touch & Gesture Optimization for tablet/iPad input.
- **UX**: Two-finger pan (no Space key needed), pinch-to-zoom with smooth inertia, long-press opens context menu.
- **UX**: Three-finger swipe left/right for undo/redo.
- **UX**: Palm rejection when Apple Pencil is detected.

### v0.8.44

- **FEATURE**: One-Click Export Menu — replaced the single PNG export button with a multi-format dropdown.
- **FEATURE**: SVG Export — generate perfect vector SVG files directly from the canvas via a native Rust implementation.
- **UX**: Support copying raw `.fd` source code to clipboard via the export menu to easily paste to AI assistants.

### v0.8.43

- **FEATURE**: Copy Selection as PNG — instantly export selected components to the system clipboard as a transparent PNG.
- **UX**: Trigger via `Cmd+Shift+C` (Mac) / `Ctrl+Shift+C` (Win/Linux) or the "⋯" overflow menu in the Floating Action Bar.

### v0.8.42

- **FEATURE**: Empty-state onboarding overlay — appears on empty canvas with "Start drawing" animated heading, 3 quick-start cards (📐 Shapes, ✏️ Sketch, 📝 Text), and `?` shortcut hint
- **UX**: Cards activate the corresponding tool and dismiss the overlay; also dismissed on any canvas click or keypress
- **FEATURE**: `examples/welcome.fd` — interactive tutorial with 3 step cards, hover animations, playground area; auto-opens on first-ever extension activation
- **UX**: First-activation detection via globalState `fd.welcomed` flag — only shows once

### v0.8.41

- **FIX**: Paste now recursively renames ALL `@ids` in the pasted block (not just the root) — prevents ID collisions when pasting groups with children
- **UX**: Pasted nodes share a consistent `_cpXXXX` suffix for traceability

### v0.8.40

- **FEATURE**: Smart Defaults (Sticky Styles) — changing fill/stroke/strokeWidth/opacity/fontSize on any node stores it as the default for future shapes of that tool (Excalidraw-style)
- **FEATURE**: Style Picker — Alt+click a node to copy its entire style (fill, stroke, opacity, font) as defaults for all tools (eyedropper for styles, not just colors)
- **UX**: Defaults captured from both Floating Action Bar and Properties panel changes; applied automatically on new shape creation
- **UX**: Per-tool session memory — rect remembers rect defaults, text remembers text defaults, etc. Resets on reload

### v0.8.39

- **FEATURE**: Contextual Floating Toolbar — glassmorphism pill bar appears above selected nodes with: fill color swatch, stroke color swatch, stroke width input, opacity slider, font size (text nodes only), and ⋯ overflow menu (Group, Ungroup, Duplicate, Delete)
- **UX**: Bar follows selection position in scene→screen coords, hides during drag, auto-shows on selection
- **UX**: Overflow menu closes on external click; FAB pointerdown stops propagation to prevent deselection
- **DOCS**: `docs/SHORTCUTS.md` — comprehensive 8-section keyboard shortcut reference for AI agents

### v0.8.38

- **FEATURE**: ⌘+drag on drawing tools = temporary Select (Screenbrush-style) — move objects or marquee select without leaving the drawing tool; auto-restores on pointer up
- **FEATURE**: Alt+drag = clone and drag — duplicates the node in-place then drags the clone (original stays put)
- **API**: `duplicate_selected_at(dx, dy)` — parameterized duplication with custom offset (0,0 for clone-in-place, 20,20 for ⌘D)
- **SHORTCUT**: ⌘+A select all already working (documented)

### v0.8.37

- **FEATURE**: Z-order shortcuts — ⌘[ send backward, ⌘] bring forward, ⌘⇧[ send to back, ⌘⇧] bring to front (implemented in Rust SceneGraph)
- **FEATURE**: Frame tool — F key, toolbar button, reuses RectTool with frame semantics
- **FEATURE**: 0 key resets zoom to 100%
- **SHORTCUT**: ⌘D duplicate, ⌘G group, ⌘⇧G ungroup, Del/Backspace delete — all already mapped, now documented
- **SHORTCUT**: F key added to double-press tool lock (FF locks Frame tool)
- **UI**: Comprehensive help dialog (?) with 6 categories: Tools, Edit, Transform, View, Modifiers, Apple Pencil Pro

### v0.8.36

- **FEATURE**: Sticky Tool Mode — double-click a tool icon or press its shortcut twice (RR, OO, PP, AA, TT) to lock the tool; it stays active after placing shapes. 🔒 badge appears on locked tool button. Single-click or press V/Escape to unlock.
- **UX**: Excalidraw-style rapid shape placement without re-selecting the tool each time

### v0.8.35

- **FEATURE**: Zen Mode — minimal Excalidraw-like toolbar layout; floating pill bar at bottom center with 6 drawing tools (Select, Rect, Ellipse, Pen, Arrow, Text); hides Layers, Properties, Minimap, Shape Palette panels
- **UX**: 🧘 Zen / 🔧 Full toggle button in top-right corner; state persists across sessions
- **SHORTCUT**: `L` key toggles Layers panel on demand (works in both Zen and Full modes)
- **UI**: Toolbar items marked `zen-full-only` hide cleanly in Zen mode; sketchy toggle stays visible in both modes

### v0.8.34

- **FEATURE**: Sketchy / hand-drawn rendering mode — toggle via ✏️ toolbar button; rects get wobbly corners with double-stroke, ellipses use overlapping jittery arcs, straight edges get midpoint displacement; deterministic jitter seeded by position (shapes don't dance on re-render); cosmetic only — underlying geometry stays precise
- **UX**: State persists across sessions via webview state
- **TESTING**: 3 new tests — `sketchy_jitter_deterministic`, `sketchy_jitter_bounded`, `sketchy_jitter_varies_with_index`

### v0.8.33

- **FEATURE**: Arrow/Connector drawing tool — press `A` to activate, click-drag from one node to another to draw an edge (smooth curve with arrowhead); live dashed preview line during drag; auto-switch back to Select after drawing
- **CORE**: `AddEdge`/`RemoveEdge` mutations with full undo/redo support
- **TESTING**: 5 new tests — `arrow_tool_creates_edge_between_nodes`, `arrow_tool_same_node_no_edge`, `arrow_tool_no_source_no_edge`, `arrow_tool_preview_line_during_drag`, `resolve_arrow_shortcut`

### v0.8.32

- **UX**: Single-click shape creation now centers the shape at the click point (Excalidraw behavior) — previously the top-left corner was placed at click; rect default size changed from 100×100 to 120×80; ellipse default remains 100×100 centered
- **TESTING**: 3 new unit tests — `rect_tool_click_creates_centered`, `ellipse_tool_click_creates_centered`, `rect_tool_drag_still_works`

### v0.8.31

- **TESTING**: Added 3-level nested group drill-down tests — `test_effective_target_3_level_drill_down` in `model.rs` (verifies click 1→outer, click 2→inner, click 3→leaf), `hit_test_nested_groups` in `hit.rs` (verifies deepest node returned through nested groups), and drill-down simulation + `findSymbolAtLine` resolution tests in `e2e-ux.test.ts`
- **TESTING**: Expanded E2E UX test suite from 52 to 71 tests (+19) — added coverage for complex card document parsing, Drawio-style edge annotations, frame nodes, 3-level nested groups, spec fold ranges, panel column resolution, layer ordering, and rename sanitization edge cases
- **TESTING**: Browser E2E validation of 6 real-world scenarios (Figma card build, Drawio rapid shapes, Sketch multi-select, Figma duplicate, Excalidraw rapid draw, Miro navigation) via Codespace

### v0.8.30

- **BUG FIX**: Fixed `parseSpecNodes` annotation bleed — `lines.indexOf()` found the first occurrence of identical spec block lines, causing annotations from earlier nodes to leak into later nodes; switched to indexed `for` loop (fixes Spec View filtering accuracy)
- **TESTING**: Added 52 E2E UX behavior tests in `e2e-ux.test.ts` covering 17 categories: select/move, copy/paste, group/ungroup, layer rename, inline text editing, zoom/pan, grid overlay, properties panel, drag-and-drop, arrow-key nudge, color swatches, selection bar, spec view, animation tweens, minimap, export PNG, and error resilience — simulating behaviors from Figma, Sketch, Miro, Freeform, Drawio, and Excalidraw
- **DOCS**: Added TODO for recursive child ID rename on copy/paste of group nodes

### v0.8.29

- **BREAKING**: Deprecated `label` style property on shapes — inline text on rect/ellipse/frame is now represented as a `text` child node instead of a `label:` property; parser silently ignores `label:` in old files for backwards compatibility
- **WASM**: `get_selected_node_props` now returns text child content as `label` prop; `set_node_prop("label")` creates/updates/removes a `text` child node
- **Renderer**: Removed `draw_shape_label` calls from shape rendering — text children render themselves as normal `Text` nodes
- **UI**: Removed Label section from properties panel — shapes' text is edited via double-click inline editor (creates text child automatically)
- **Examples**: Converted all `label: "..."` usage in `dark_theme.fd` to `text` child nodes

### v0.8.28

- **BUG FIX**: Dragging a selected child node within a group now moves only the child, not the whole group — if the raw hit node is already selected (user drilled in), `effective_target` is skipped to preserve the child selection for drag

### v0.8.27

- **UX**: Groups are now directly clickable in Canvas — clicking empty space within a group's bounding box selects it, removing the need for marquee (drag) selection; clicking on a child still selects the child (then promotes to group via `effective_target`)

### v0.8.26

- **BUG FIX**: Moving a selected group now correctly moves the entire group instead of drilling into a child — pointer-down on a child of an already-selected group keeps the group selected for dragging; pointer-up without drag (click) drills into the child for sub-selection (Figma-standard click-vs-drag distinction)
- **CORE**: New `SceneGraph::is_ancestor_of` helper for parent-chain traversal
- **Tests**: New `test_is_ancestor_of` covering direct parent, grandparent, non-ancestor, and self cases

### v0.8.25

- **BUG FIX**: Double-clicking a node with `:press` animations no longer causes a visual shape jump — the inline editor now calls `clear_pressed()` to suppress the press animation state before opening the textarea overlay
- **BUG FIX**: Inline editor textarea now matches the node's actual border-radius — ellipses use `50%`, rects use their actual corner radius (was hardcoded `8px` for all shapes), text nodes use `4px`

### v0.8.24

- **BUG FIX**: Fixed an issue where deleting a node on canvas wouldn't update Code mode visually. The internal IDE text sync now computes accurate character bounds instead of relying on a naive line count (`document.lineCount`), eliminating silent replacement failures in VS Code when the active document shrinks.

### v0.8.23

- **UX**: Group Node Visibility & Drill-down (R3.24) — Group nodes now render a dashed blue border on hover and a solid blue border with a `"Group @id"` badge when selected.
- **UX**: Clicking a child node of an unselected group now selects the parent Group by default. Clicking the child node again (when the group is already selected) "drills down" to select the child, matching standard design tool (Figma/Sketch) behavior.
- **WASM**: Added `effective_target` to `SceneGraph` for drill-down hit testing and wired it into pointer and marquee selection events.

### v0.8.22

- **BUG FIX**: Fixed an issue where deleting a node in the Canvas would mess up the Z-order of other nodes. Replacing `petgraph::DiGraph` with `petgraph::stable_graph::StableDiGraph` prevents node index swapping on deletion.

### v0.8.20

- **UX**: Reduced auto-zoom-in aggressiveness for layer focus (R3.30) — target node now fills ~10% of viewport width instead of 25%, preserving more surrounding context

### v0.8.19

- **NEW**: Smart focus on layer click — clicking a layer item in the Layers panel now smoothly pans the camera to center the node (250ms ease-out animation); auto-zooms in if both dimensions are < 20px on screen (truly invisible), auto-zooms out if the node overflows the viewport (15% padding); skips pan if the node center is already within 20% of the viewport center; thin shapes (lines) are left at current zoom unless they overflow

### v0.8.21

- **BUG FIX**: `set_node_prop` no longer flattens inherited styles — all style property handlers now modify `node.style` directly instead of calling `resolve_style()`, which was baking `use:` referenced properties into inline styles and corrupting the emitted text

### v0.8.18

- **BUG FIX**: Node name no longer disappears after double-click → click outside — inline editor `commit()` now skips `set_node_prop` when value is unchanged, preventing `SetStyle` from flattening inherited styles and `SetText` from triggering unnecessary re-emission

### v0.8.17

- **BUG FIX**: Layer rename now syncs to Code Mode — added a `committed` guard flag to prevent double invocation of the `commit()` closure (Enter removes the input from DOM, triggering blur's `setTimeout(commit, 100)` which could race and skip `syncTextToExtension()`); also checks `set_text()` return value so parse errors don't silently swallow the rename

### v0.8.16

- **UX**: Resize handle cursor feedback — hovering over the 8 resize handles now shows the appropriate directional cursor (`nwse-resize`, `nesw-resize`, `ns-resize`, `ew-resize`) instead of the default pointer, matching Figma/Sketch behavior

### v0.8.15

- **UX**: AI Refine error messages now include an **"Open Settings"** action button — clicking it opens VS Code settings filtered to `fd.ai` for quick API key configuration or provider switching
- **UX**: Error messages are now provider-agnostic — each warns which key is missing and reminds users they can switch to any of the 5 supported providers (Gemini, OpenAI, Anthropic, Ollama, OpenRouter)

### v0.8.14

- **BUG FIX**: Layer selection now works — click handler pre-sets `lastLayerHash` before calling `render()`, so `refreshLayersPanel()` skips DOM rebuild and preserves the click handler's DOM references for visual highlight update
- **BUG FIX**: Ellipse inline editor no longer deforms the shape — uses standard `8px` border-radius instead of `50%`, matching Figma's approach of a clean rectangular overlay that doesn't clip content

### v0.8.13

- **BUG FIX**: Layer selection in canvas mode now works — `refreshLayersPanel()` skips DOM rebuild when source + selection unchanged, preventing click handlers from being destroyed mid-interaction
- **BUG FIX**: Selection info bar now shows correct dimensions — was reading `props.w/h` (undefined) instead of `props.width/height`; also uses bounds fallback for groups/text/path nodes
- **UI**: Shape palette moved from left-side vertical bar to bottom-center horizontal pill (Apple FreeForm style)
- **UI**: Shape palette expanded with Frame, Line, and Arrow tools (was only Rectangle, Ellipse, Text)
- **UI**: Selection info bar relocated from bottom-center to top-right to avoid overlap with new bottom toolbar
- **WASM**: `create_node_at` now supports `frame` kind — creates a 200×150 frame container with light fill and border

### v0.8.12

- **UX fix**: Inline editor on ellipse nodes now uses `border-radius: 50%` instead of `4px` — the textarea overlay matches the circular shape instead of appearing as a rectangle

### v0.8.11

- **REFACTOR**: Renamed `Constraint::Absolute` → `Constraint::Position` — clarifies parent-relative semantics (was misleadingly named "absolute")
- **UX**: Emitter now outputs `x:` / `y:` inline instead of top-level `@id -> absolute:` arrows — saves ~4 tokens per positioned node, symmetric round-trip with parser
- **COMPAT**: Parser accepts both `absolute` and `position` keywords in constraint arrows for backwards compatibility
- **Tests**: New `roundtrip_inline_position` test verifying symmetric `x:/y:` parse↔emit

### v0.8.10

- **UX**: Zoom-to-fit now caps at 200% — small designs (single icon, one button) no longer blow up to 1000% on initial load or ⌘0; large designs still zoom out to fit as before
- **UX fix**: Inline editor text now vertically centered inside textarea — dynamic `padding-top` based on textarea height vs text height; respects `textVAlign` (top/middle/bottom)
- **UX**: Zoom while panning — scrolling the wheel during Space+drag now zooms instead of scrolling, matching Figma behavior

### v0.8.9

- **NEW — R3.28**: 3×3 text alignment system — `align: left|center|right top|middle|bottom` property in `.fd` format
- **NEW**: Text nodes default to `center middle` alignment (matching Figma) instead of top-left
- **NEW**: 3×3 alignment grid picker in the properties panel — click a cell to set text alignment, active cell highlighted with accent
- **NEW**: Inline editor textarea respects node's horizontal text alignment via CSS `text-align`
- **WASM**: `textAlign`/`textVAlign` exposed in node props and settable via `set_node_prop`
- **Parser/Emitter**: Full `align:` round-trip support with test
- **Renderer**: `draw_text` uses 9-position alignment based on `TextAlign × TextVAlign`
- **Bugfix**: `emit_style_block` now emits `align:` in `style { }` blocks (was only emitted on nodes)
- **Tests**: 4 new tests — `parse_align_center_only`, `roundtrip_align_in_style_block`, `style_merging_align`, `sync_set_style_alignment`
- **Docs**: Added R1.17 (text alignment format property), updated R3.28 cross-ref, added `text alignment` tag to requirement index

### v0.8.8

- **UX fix**: Inline editor background now matches node context — shape nodes use their fill color, text nodes use themed background (`#1E1E2E` dark / `#FFFFFF` light), shapes without fill use themed fallback; eliminates the white-over-dark-node bug
- **NEW**: Live text sync — typing in the inline editor updates Code Mode in real time (every keystroke syncs via `set_node_prop`)
- **NEW**: Esc to cancel — pressing Escape reverts the text to the original value before editing started and syncs
- **UX**: Enter confirms and closes the editor (unchanged), click-outside also commits (unchanged)

### v0.8.7

- **NEW**: Drag-and-drop animation picker — drag a node onto another node to assign animations via a glassmorphism popover with 11 presets across 3 trigger groups (Hover, Press, Enter)
- **NEW**: Magnetic glow ring — purple pulsing border appears on the target node during drag-over
- **NEW**: Live animation preview — hovering picker presets plays a tween preview on the target node in real-time
- **NEW**: WASM API: `add_animation_to_node`, `get_node_animations_json`, `remove_node_animations`, `hit_test_at`
- **NEW**: `SetAnimations` mutation with full undo/redo support
- **INFRA**: WASM rebuild with animation APIs

### v0.8.6

- **UX fix**: Inline text editor now uses the node's fill color as background with auto-contrasting text color (was hardcoded white overlay that hid the node)
- **UX fix**: Double-clicking empty canvas to create text now works — text nodes get proper initial bounds (80×24) so the inline editor opens correctly
- **UX**: Editor font now matches the node's font family, weight, and size scaled to zoom level
- **INFRA**: WASM rebuild with text node bounds fix in `AddNode` mutation

### v0.8.5

- **BREAKING**: Removed all `##` annotation syntax from `.fd` files — unified under `spec` blocks (`spec "desc"` inline / `spec { ... }` block form). The parser already treated `##` as plain comments, so annotations using `##` were silently lost during parsing. All 7 affected `.fd` files (2 test fixtures + 5 design docs) migrated.
- **DOCS**: Updated `REQUIREMENTS.md`, `SKILL.md` to reference `spec` blocks instead of `##`

### v0.8.4

- **NEW**: Multi-ungroup — selecting 2+ items where some are groups now enables Ungroup, which dissolves all selected groups at once (Figma behavior)
- **INFRA**: WASM rebuild with multi-group `ungroup_selected()` in Rust

### v0.8.3

- **UX**: Group/Ungroup context menu items are now context-sensitive — Group disabled with <2 items selected, Ungroup disabled when selected node isn't a group (matches Figma/Sketch)

### v0.8.2

- **UX fix**: Canvas content now centers in the visible area to the right of the layers panel, instead of behind it — `zoomToFit`, `zoomToSelection`, and initial load all account for the 232px overlay
- **UX**: Initial load now auto-centers content via `zoomToFit()` instead of starting at origin

### v0.8.1

- **UX**: Spec View now strips type keywords (`group`, `rect`, `text`, `ellipse`, `path`, `frame`) from node declarations — `group @checkout_page {` renders as `@checkout_page {` in Code Mode when Spec View is active
- **UX**: Uses non-destructive VS Code editor decorations to visually hide keywords without modifying document text
- **NEW**: `transformSpecViewLine()` utility function for programmatic line transforms

### v0.8.0

- **NEW**: ⌘I / Ctrl+I keyboard shortcut to add/edit spec annotation on selected node
- **NEW**: Status filter tabs in Spec Summary (All / Draft / In Prog / Done) with per-filter counts
- **NEW**: Spec coverage % indicator in header — shows annotated/total nodes ratio
- **NEW**: Export spec report ↗ button — copies full markdown spec report to clipboard
- **NEW**: Bulk status dropdown — set Draft/In Progress/Done on all visible specs at once
- **UX**: Empty state message now mentions ⌘I shortcut

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

- **R1.1 fix**: Fixed node/edge drag jitter and reverse-direction movement — `MoveNode` now correctly converts absolute screen coords to parent-relative before storing in `Constraint::Position`, and strips conflicting positioning constraints (`CenterIn`, `Offset`, `FillParent`). Skips full layout re-resolve for move-only batches to prevent constraint values from overwriting in-place bounds updates.

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

> Requirement status and test coverage are now tracked inline in [REQUIREMENTS.md](REQUIREMENTS.md).
