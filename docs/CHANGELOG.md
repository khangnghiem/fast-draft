# FD Changelog

> Tracks requirement completion status across the entire FD project.
> For VS Code extension release notes, see [`fd-vscode/CHANGELOG.md`](../fd-vscode/CHANGELOG.md).

<!-- KEYWORD INDEX — rg to find relevant sections:
  Current v0.11.x (recent, individual entries)    → L8-431
  Epoch v0.9.x (eraser, text fixes)               → L433-449
  Epoch v0.8.70-99 (canvas UX, toolbar, groups)    → L451-497
  Epoch v0.8.30-69 (zen, shortcuts, AI, spec)      → L499-540
  Epoch v0.6.32-v0.8.29 (core editing, frames)     → L542-572
  toolbar, drag, resize, pointer    → search v0.11.x entries
  frame, child, containment         → search v0.11.x entries
  eraser, delete, swipe             → search v0.9.x epoch
  group, drill-down, selection      → search v0.8.70-99 epoch
-->

## Completed Requirements

### v0.11.336 — Layer Locking and Shortcut Parity

- **Selection Locking (`Cmd+Shift+L`)**: Implemented a core locking mechanism for the Fast Draft canvas. Users can now press `Cmd+Shift+L` to toggle the locked state of their current selection. The lock state is universally preserved within the `.fd` file data model.
- **Visual Feedback**: The Layers panel dynamic `<li class="layer-item">` component has been upgraded to conditionally inject a subtle lock icon (`.layer-lock`) aligned to the right side of locked nodes.

### v0.11.335 — Context Menu Text Selection Fix (UI Polish)

- **Text Selection Prevention**: Added `user-select: none` to the `.ctx-menu` container in `site/css/menus.css`. This prevents the browser from highlighting text within the context menu when users double-click or drag over menu items, ensuring compliance with Apple HIG native-app interaction standards.

### v0.11.334 — Default Tool Startup Optimization (R3.6)

- **Default Tool Select**: Optimized the Time-To-First-Design (TTFD) by defaulting to the Select tool on app startup instead of the Hand tool. Altered the core WASM initialization (`crates/fd-wasm/src/lib.rs`) alongside the UI configuration (`site/index.html` and `fd-vscode/src/webview-html.ts`) for parity across web and VS Code. Navigation remains fully accessible via Spacebar/Middle-click/Right-click panning.

### v0.11.333 — Premium Touch Context Menu (R3.6)

- **Touch Collision Guard**: Modified the touch-and-hold (long-press) logic to only trigger when the active tool is 'Select' or 'Eraser', completely resolving the gesture collision with the Hand tool panning on mobile.
- **Hold Ring Animation**: Injected a 500ms CSS `.touch-hold-ring` radial pulse animation that triggers upon `touchstart` to provide immediate Apple HIG-compliant visual feedback during the long-press gesture.
- **Anti-Occlusion Positioning**: Refactored the context menu initialization (`openContextMenuAt`) to offset the actual spawn target dynamically (`-60px` Y, `+20px` X) for touch screens, overcoming physical finger occlusion.
- **Touch Target Scaling**: Context menu items now dynamically adopt larger 44px minimum touch targets and hide keyboard shortcuts when spawned via touch events (`isTouch` flag).

### v0.11.332 — Unified Pill Handle & Multi-Gesture Minimize

- **Pill Handle**: Replaced the 6-dot Unicode `⡀` grip with a pure CSS `<div class="toolbar-pill-bar">` element across all platforms. The pill is 32×4px horizontally and automatically becomes 4×32px when the toolbar docks vertically, matching Apple HIG grabber conventions.
- **Swipe Gesture (All Platforms)**: Added `touchstart`/`touchend` listeners to the grip. A short flick along the toolbar’s minor axis (>30px perpendicular, <80px parallel, <350ms) triggers the existing Hybrid Cascade minimize/expand logic.
- **Mobile Single-Tap**: On touch devices, a single tap (<12px displacement, <350ms) on the pill toggles minimize state — no double-tap required.
- **Mobile Pill Visibility**: Removed `display: none` on mobile; the pill is now absolutely positioned centered above the toolbar row with a 6px 12px touch target.
- **Platform Gesture Matrix**: Desktop = double-click + short-drag; iPadOS = double-tap + swipe + full drag; iOS = single-tap + swipe (no drag).

### v0.11.331 — Mobile Grid Blocker & Toolbar UX Refinement

- **Mobile Canvas Grid Fix**: Fixed the persistent "invisible blocker" issue on mobile web where the canvas was forced into a second column, leaving a dead zone on the left. The fix ensures `#canvas-content > *` spans `grid-column: 1 / -1` via CSS grid overrides.
- **Toolbar Refinement**: Removed the redundant "Insert" dropdown menu from the floating toolbar. Refactored the minimization animation using `max-width` transitions for a premium "pulling" effect.
- **Toolbar Grip Rotation**: Added a 90-degree CSS `transform: rotate(90deg)` to the 6-dot grip handle when the toolbar is docked to vertical edges.

### v0.11.329 — Fix Mobile Safari Canvas Artifact (Bug Fix)

- **Mobile Safari Canvas Artifact**: Bound `fdCanvas.cancel_drag()` to `visibilitychange` instead of just `blur`. This permanently fixes the "stale marquee / blue vignette" shadow bug where swiping up on iOS to background the app would hijack `pointerup` and swallow `blur`, leaving the blue selection box stuck indefinitely when returning to the app.

### v0.11.328 — Fix Mobile Safari AFK Canvas Vignette (Bug Fix)

- **AFK Marquee Clear**: Solved a bug where switching tabs or letting the screen sleep on mobile Safari (triggering a `blur` event) would cause a giant blue vignette / shadow to permanently lock over the canvas when returning. Root cause: The WASM rendering engine's internal interaction state (like the selection marquee `marquee_start`) was not properly cancelled when the JS event loop cleared its pointers.
- **Cancellation Propagation**: Added explicit invocation of `fdCanvas.cancel_drag();` directly inside `app.js`'s global `window.addEventListener('blur', ...)` hook. This guarantees that any incomplete WASM tool dragging (marquee, pen, arrow) is instantly aborted, preventing sticky ghost visuals.

### v0.11.327 — Fix Mobile Safari Ghost Shadow (Bug Fix)

- **Mobile Canvas Shadow Fix**: Eliminated a persistent GPU compositing ghost shadow that blocked the canvas on mobile Safari when side panels were collapsed. Root cause: `backdrop-filter: blur(24px)` on `#left-panel` and `#right-panel` created WebKit GPU layers that weren't properly invalidated when panels slid off-screen via `transform: translateX()`.
- **Opaque Mobile Panels**: Replaced semi-transparent `var(--fd-surface)` + blur with fully opaque `var(--fd-bg)` background on mobile. Panels are full-height overlays on mobile so translucency was invisible — removing it eliminates GPU compositing cost.
- **Visibility Hidden on Close**: Added `visibility: hidden` to closed panels with proper transition timing (`0s delay` on open, `0.25s delay` on close matching slide-out duration). Forces WebKit to fully release the GPU compositing layer.
- **Backdrop Blur Removal**: Removed `backdrop-filter: blur(2px)` from `#mobile-layers-backdrop` overlay, replaced with slightly darker opaque background.

### v0.11.326 — Sync Agent Panel to VS Code & E2E Validation (R4.26)

- **VS Code Extension Sync:** Backported the "Design Agent" renaming, elevated model selector UI (`Llama 8B/70B`), and emoji-less semantic chip logic (`Suggest Variants`, `Edit Style`, etc.) to the `fd-vscode` webview container.
- **E2E Workflow Update:** Added test criteria to Phase 2 of `e2e.md` to formally verify the Design Agent slide-out behavior and title rendering.

### v0.11.325 — Context Engineering UI Foundation (R4.26)

- **Agent Panel Redesign:** Refactored the AI chat panel to match early context engineering vision. Renamed to "Design Agent", shrunk zero-state hero icon, constrained text to single lines. 
- **Model Selector UI:** Added a pill-shaped model selector (Llama 8B / 70B) directly inside an elevated, premium input container inspired by Cursor/Windsurf.
- **Emoji-less Quick Actions:** Replaced emoji-heavy chips with cleaner string labels (`Suggest Variants`, `Edit Style`, `Align Objects`).
- **Context Engineering Specs:** Documented the full PydanticAI-based context engineering pipeline, Pydantic Graph knowledge base, and streaming SSE responses into `REQUIREMENTS.md` as R4.26.

### v0.11.324 — Fix Canvas Zoom Drift on App Switch (Bug Fix)

- **Canvas Viewport Stability**: Fixed a critical coordinate pipeline bug on macOS where switching applications (⌘+Tab) while the trackpad retained inertia caused phantom `wheel` events to silently corrupt the canvas `zoomLevel` and pan offsets in the background.
- **Focus Suppression Window**: Implemented a targeted 150ms suppression window inside the `focus` handler to block buffered trackpad momentum events from firing instantly upon tab refocus. The `wheel` handler proactively drops these stale events, preserving accurate zoom state and eliminating the "45-degree southeast" drawing offset experienced when reviving a backgrounded editor.

### v0.11.323 — AI Agent Panel Complete Apple HIG Redesign (R6.18)

- **UX Polish:** Completely refactored the AI Agent panel UI to replicate modern, premium design aesthetics (specifically Apple HIG and Cursor).
- **Centered Zero-State Hero:** Moved the Quick-Action chips inside the vertically-centered "Welcome" hero wrapper, featuring an enlarged 56x56 icon, unified padding, and refined text hierarchy.
- **Elevated Input Container:** Restructured the input area into an elevated, squircle container pattern (`.ai-chat-input-container`).
- **Inline Send & Context:** Moved the "Send" button inline inside the new input container. Relocated the "Context Badge" to be an inline, dismissable tag above the textarea.
- **Header Clean-up:** Relocated the "Clear Context" button into the chat header replacing visual clutter.
- **Smarter JS State Handling:** Adjusted the `ai-chat.js` logic to recreate the Quick-Action chips dynamically within the welcome state after "Clear Chat" is manually triggered.

### v0.11.322 — Apple HIG Sparkle Hero Fix (R6.18)

- **Bugfix (UI):** Solved an issue where the Apple HIG Sparkle Hero layout was missing in local and production environments because CSS sub-imports (`@import`) were locked to an older cache string (`v=0.11.308`), bypassing the global Github Action cache buster for sub-stylesheets. Force-bumped the static cache strings to synchronize variables and `ai.css` loading. Added the new Lucide-style star SVG directly into the DOM to work seamlessly with the gradient box.

### v0.11.321 — Apple HIG Sparkle Hero Zero-State (R6.18)

- **UX Polish:** Completely redesigned the AI Agent empty state. Replaced the unstyled text header inherited from prior token optimizations with a custom Apple HIG "Sparkle Hero" interface. Reduced the heavy default margins/padding and introduced an SVG sparkle icon with a gradient fill, paired with a subtle, intentional 14px "How can I help with your design?" prompt to bridge the gap gracefully into the Quick-Action chips.

### v0.11.320 — Agent Panel UI Simplification (R6.18)

- **UX Polish:** Decluttered the AI Chat welcome state in both the playground and VS Code webview. Replaced the verbose onboarding paragraphs with a minimalist `<h2>How can I help?</h2>` header. Context-aware AI suggestions are now exclusively provided by the existing dynamic Quick-Action chips, significantly reducing vertical UI noise and aligning with modern AI chat UX standards.

### v0.11.319 — ⌘+Drag Nest+Center Gesture (R3.38, R3.64)

- **REMOVED**: Post-drop context menu for reparenting — dragging a node onto a container no longer shows "Nest into @target" / "Center in @target" popup. ~50 lines of JS deleted (`showDropContextMenu`) from VSCode webview; ~50 lines from site `app.js`.
- **NEW**: **⌘+Drag Nest+Center** — holding ⌘ (Mac) or Ctrl (Win/Linux) while dragging a node (including text) onto a different container (rect, ellipse, frame, group — excluding text targets) automatically reparents the dragged node as a child of the target and centers it within the container. All descendants maintain their relative positions to the dragged node. Uses existing `reparent_into_centered` WASM API.
- **Progressive Disclosure**: ⌘+drag starts as "move with children" (existing R3.64 behavior). During drag, the engine detects containers under the cursor — when positioned over a valid target, a nest will occur on drop. Releasing on empty space keeps the standard move-with-children behavior. Toast confirms: "Nested + centered into @target".
- **Text Target Guard**: Text nodes cannot be nest targets (only rect, ellipse, frame, group). Text nodes CAN be dragged into containers.

Files: `fd-vscode/webview/src/pointer.js`, `fd-vscode/webview/main.js`, `site/app.js`

### v0.11.318 — Minimap Zoom Sync Fix (Bug Fix)

- **UI Synchronization**: Fixed a bug where the minimap zoom indicator (`updateZoomIndicator()`) was not being invoked during the **Zoom Scrub** (`Cmd`/`Meta` + right-click drag) gesture. The minimap now correctly reflects real-time zoom modifications, providing synced UI feedback matching the Apple HIG standard.

### v0.11.317 — Restore Canvas Right-Click Context Menu (Bug Fix)

- **Gesture Context Menu Resolution**: Fixed a major regression where right-clicking on the canvas (`pointerup` gesture) threw a silent `ReferenceError: openContextMenuAt is not defined` instead of opening the context menu. The target function was trapped inside the closure scope of `setupContextMenu`. Hoisted it to the module root.
- **Early DOM Event Stabilization**: Resolved crash loops during headless E2E verification caused by startup race conditions. Fixed a `resizeCanvas` ReferenceError (called by early tab-switch events before WASM init was complete) by forward-declaring a top-level dummy function constraint, and utilized `?.` optional chaining to stabilize the mobile menu toggle listener (`Cannot read properties of null`) when UI panels restructure.

### v0.11.316 — Deep Select and Clone with Children (R3.2)

- **Deep Select (⌘+Alt click)**: Added `⌘+Alt+Click` to bypass group selection and immediately select the deep leaf child under the cursor, replicating standard design tool direct-select interaction.
- **Clone with Children (⌘+Alt drag)**: Added `⌘+Alt+Drag` to duplicate a selected node and all its recursive descendants, immediately picking up the new clone hierarchy for dragging.
- **Disambiguation Logic**: Refined `SelectTool` pointer modifier evaluation so standard Multi-Select (`⌘`) does not conflict with Deep Select (`⌘+Alt`). Adjusted WASM raycasting (`hit_test_all_at` / `handle_pointer_down`) to short-circuit structural tree-walking when `meta && alt` is depressed.

### v0.11.315 — Empty Text Node Cleanup (Bug Fix)

- **Empty Text Node Deletion**: Inline editing now automatically deletes the underlying text node if its content evaluates to an empty string on commit or cancel (Escape). This prevents "ghost" empty text nodes from accumulating when a user initiates a text edit (e.g., by double-clicking a shape) but decides not to type anything.
- **Initial Shape Text**: Changed the default placeholder text for freshly spawned shape text children and edge labels from `"Text"`/`"Label"` to an empty string `""`. This leverages the new deletion logic so that dismissing the editor immediately removes the unedited node, closely mirroring standard design tools like Figma.

### v0.11.314 — Canvas Drawing Offset Fix & Coordinate Pipeline Refactor

- **Canvas Drawing Offset (Bug Fix)**: Permanently resolved the recurring bug where newly drawn shapes would incorrectly snap to the canvas origin (0,0) instead of the cursor drag position.
- **Round-Once-On-Exit Architecture**: Refactored the `SyncEngine` coordinate mutation pipeline to completely eliminate "scattered rounding" (`(x * 100).round() / 100`). The engine now processes all positional updates using raw `f32` precision.
- **Serialization Boundary Precision**: `emitter.rs` now acts as the sole rounding boundary in the system. The `format_num` helper was updated to emit text at 2 decimal places (`.2dp`), ensuring clean `.fd` files without polluting internal math precedence.
- **Regression Guard**: Added strict e2e and unit tests (`draw_rect_at_coordinate_preserves_position`) simulating pointer drag lifecycle events to guarantee coordinate fidelity for all future mutations.

### v0.11.313 — Cmd/Ctrl Click Multi-Selection Fix

- **Canvas Multi-Selection Fix**: Fixed a bug where holding Cmd or Ctrl while clicking a node on the canvas failed to add it to the existing selection. The `FdCanvas::handle_pointer_down` lifecycle in `fd-wasm` now correctly appends to the `visual_highlight` vector instead of outright replacing it when modifier keys (`shift`, `meta`, `ctrl`) are active, matching standard design tool behavior.
- **Deselection Clean-up**: Added a `retain` filter in `handle_pointer_up` to prune unselected items from `visual_highlight` when the pointer interaction concludes, maintaining exact parity between mutated state and visual indicators.

### v0.11.312 — Context Menu Enhancements (R3.78)

- **Context Menu Spec**: Created `docs/specs/context-menu.md` detailing the unified menu matrix (nodes, edges, empty space). Replaced verbose interaction descriptions in `REQUIREMENTS.md` with a direct link to the specification.
- **Scroll Persistence**: Fixed the bug where scrolling the canvas caused the context menu to disappear. The menu stays open during view adjustments.
- **Empty Space Document Macros**: Right-clicking empty space in the Layers panel now reveals document-level operations (Format Document, Dedup Node IDs, Select All, Add Node).
- **Smart Right-Click Pan**: Right-clicking on the canvas uses a distance+time gesture threshold. A short click opens the context menu (Node/Edge/Empty), but holding and dragging >5px instantly transitions to the Hand tool (pan mode).
- **Edge Context Menu**: Edges now have full context menu support (Cut/Copy/Duplicate/Delete/Reverse/Label Edit).

### v0.11.311 — Duplicate ID Warning System & Agent Panel Redesign (R3.27, R6.18)

- **Duplicate ID Warnings (R3.27)**: Multi-layered feedback system to prevent model structural ambiguity explicitly flagged by the new `lint_duplicate_ids` rule.
  - **Canvas Renderer**: Nodes sharing an identical `@id` now render with a high-contrast `#FF3B30` dashed red border and red selection handles.
  - **Layers Panel**: Injects a `⚠️` warning badge inline for nodes that violate ID uniqueness.
- **Agent Panel Redesign (R6.18)**: Modernized the AI Agent right-panel with session-based chat tabs (History/New), interactive zero-state hero pills, and Git-style contextual feedback.
- **Coordinate Math Fix**: Fixed mathematical rounding desynchronization in `SyncEngine` for stable `ResizeNode` child propagation.
### v0.11.310 — Cmd/Ctrl Drag to Move Children (R3.2)

- **UX Behavior Change**: Dragging a parent node **without** modifier keys now moves ONLY the parent — children stay stationary. Hold **Cmd** (macOS) or **Ctrl** (Windows/Linux) while dragging to move all descendants recursively with the parent. This can be toggled mid-drag: start dragging normally, then press Cmd/Ctrl to engage children-follow mode.
- **No Conflict with Multi-Select**: Cmd+click (without drag) still adds/removes nodes from multi-selection as before. The `with_children` flag activates only when `MoveNode` mutations are generated during `PointerMove` drag events.
- **Engine**: Added `with_children: bool` field to `GraphMutation::MoveNode`. Descendant propagation in `SyncEngine::apply_mutation_with_co_selected` is now gated on this flag.
- **Tests**: Added `sync_default_drag_parent_does_not_move_children` test verifying the new default behavior, and updated existing children-follow tests to use `with_children: true`.

Files: `crates/fd-editor/src/sync.rs`, `crates/fd-editor/src/tools.rs`, `crates/fd-editor/src/commands.rs`, `crates/fd-editor/src/sync_tests.rs`, `crates/fd-editor/src/tools_tests.rs`, `crates/fd-wasm/src/keyboard.rs`

### v0.11.309 — Layers Panel Stabilization & Parent-Child Drag Fixes (R3.2, R3.27, R3.69, R6.18)

- **Parent-Child Drag Stabilization (R3.2)**: Fixed a layout desynchronization bug where child nodes drifted visually when their parent container was resized via corner grips. The `ResizeNode` mutation now propagates inverse `dx`/`dy` translation elements directly down to children utilizing `CenterIn`, ensuring stable internal coordinates.
- **Layers Panel UX (R3.69)**: Added a persistent, hover-activated "Trash Bin" button inline with layer items for immediate deletion without opening context menus. Restored the native string-select cursor for standard row interaction instead of the pan hand.
- **Inline Rename Strict Protection (R3.27)**: Double-clicking to rename layers now triggers a `has_node()` evaluation via the WASM bridge, strictly blocking node ID collisions. This directly resolves the "Phantom Deletion" bug where ambiguous IDs triggered the `Delete` key stroke to remove the wrong target.
- **Bottom-Anchored Chrome (R6.18)**: Re-engineered CSS flex-box order to reliably pin both the `{"}"} Code` pane header and the Layer pane utility actions (`🪄 AI Touch`, selection count) to the bottom of the bounding element.

### v0.11.308 — Multi-Target Edge Shorthand (R3.43)

- **Edge Fan-out Syntax**: Implemented and verified multi-target shorthand for graph edges (`edge @a -> @b, @c { ... }`). The parser safely expands this into multiple independent `Edge` structs during the AST parsing phase, removing the need for topology changes in the `SceneGraph` while dramatically reducing token overhead for AI agents writing graphs.
- **Robust ID Generation**: Suffix generation automatically handles anonymous (`_edge_`) and specifically named edges (e.g., `@flow` becomes `@flow_1`, `@flow_2`).

### v0.11.305 — Canvas "Center In" Bug Fix (R3.39)

- **Layout Resolution Sync**: Fixed a visual desynchronization bug where the "Center in another node" context menu action successfully applied the `center_in:` constraint to the DSL but failed to visually move the node on the canvas. 
- **WASM Lifecycle Harden**: Bundled the post-mutation flush lifecycle (`mark_dirty`, `resolve`, `flush_to_text`, `rebuild_spatial_index`) into a unified `sync_mutation_cycle()` method on `FdCanvas` to prevent future layout-staleness bugs across all coordinate CRUD operations.

### v0.11.307 — Action Bar Redesign (R3.68 Addendum)

- **UX**: Replaced the "✦ Format" text button with a minimalist "Ghost Icon Action Bar" across the user interface.
- **Layers Count**: The header dynamically updates its selection count (`X / Y selected`) in real-time as users interact with the canvas via standard `fd-selection-changed` events.
- **Code Editor Action Bar**: Elegantly segmented formatting operations directly into the `{ } Code` tab view using a sticky fixed header to preserve symmetry with the Layers tab, eliminating floating-overlay visual bugs. The `🪄 AI Touch` operation remains logically distinct on the Layers panel for manipulating components.
### v0.11.306 — Format Pipeline and Node ID Deduplication (R3.68)

- **Format Pipeline Extension**: Refactored the 'Layers' header in the left sidebar into a unified **✦ Format** action button. Triggering this runs a complete `format_and_dedup` pass (structural cleanup, ID deduplication, style hoisting, semantic sorting).
- **Node ID Deduplication**: Added a safe `dedup_node_ids` pass to the core AST transform pipeline. Detects duplicate `@id` bindings across the graph, iteratively suffixes collisions (`@box_2`), and safely updates all cross-references (Constraints, Arrow anchor links, etc.) without destroying layout integrity.
- **Save-hook Integration**: The format pipeline is now attached to the `beforeunload` persistence hook, assuring documents are structurally sanitized before saving to local storage.


### v0.11.304 — VS Code Canvas Preview Side (R6.18)

- **Canvas Preview Column**: Modified `FdEditorProvider` in `fd-vscode/src/extension.ts` to open the FD Canvas preview in ViewColumn.Two (the right split) by default, instead of ViewColumn.One. The source code document is now preserved in ViewColumn.One, creating a standard Code (Left) | Visual (Right) side-by-side experience.

### v0.11.303 — Edge Text Selection & Duplicate Label Fix (R3.43)

- **Layout**: Added `resolve_edge_text_children()` pass in `fd-core/layout.rs` — positions edge text labels at the edge midpoint so the spatial index and hit-testing can find them where they're visually drawn
- **WASM API**: Added `get_edge_text_child_id(edge_id)` and `create_edge_text_child(edge_id, content)` to `fd-wasm/crud.rs` — model-backed, idempotent edge label management
- **JS fix**: Replaced fragile regex-based edge label creation in `inline-edit.js` with WASM API calls — eliminates duplicate text node bug on double-click
- **Root cause (Bug 1)**: Edge text children were added to the graph at root level but the layout engine never positioned them at the edge midpoint; bounds remained at (0,0), making them invisible to hit-testing
- **Root cause (Bug 2)**: The JS double-click handler used raw regex on FD source text to find/create labels, bypassing the WASM engine's `Edge.text_child` field, causing orphaned duplicates

### v0.11.302 — Arrowhead Polish & Edge Drag Optimization (R3.42)

1. **Arrowhead Visual Polish** — The structural arrowhead drawing logic in `render2d.rs` was refined to retract the edge stroke path dynamically based on stroke width and tangent angle. This prevents the stroke's flat/round cap from bulging out past the tip of the geometric triangle arrowhead.
2. **Edge Drag 60fps Optimization** — Bypassed synchronous constraint layout `resolve()` and exhaustive quadtree spatial index rebuilding during active Arrow dragging and Pen drawing. Discovered that `UpdateEdge` and `UpdatePath` were missing from the WASM `all_drag_ops` fast-path whitelist, causing complete O(N) layout recalculations every single mouse frame. Adding them to the exclusion array restored butter-smooth 60fps edge manipulation since edges do not project bounds into grid systems.

Files: `crates/fd-wasm/src/render2d.rs`, `crates/fd-wasm/src/lib.rs`

### v0.11.301 — Arrow Tool Defaults & Edge Snapping (R3.42)

1. **Default Arrow Styling** — The Arrow tool now automatically applies a default `stroke` (`#6B7080`) and `width` (`2.0`) to newly authored connections.
2. **Edge Repointing Node Snapping** — Modified `SelectTool` to dynamically detect hovered nodes (`hit_node`) during edge dragging and trigger `EdgeAnchor::Node(hit_node_id)` constraint snapping.
3. **Target Snapshot Highlight (Ghost)** — The snap target now renders a glowing `#4FC3F7` padding ring proxy beneath the active snap target. Evaluated via `fdCanvas.get_arrow_preview()`.
4. **Tool Shortcut Consistency** — Confirmed and documented `A` accurately triggers the Arrow tool across all environments.

Files: `crates/fd-editor/src/tools.rs`, `crates/fd-wasm/src/lib.rs`, `site/app.js`, `fd-vscode/webview/src/main.js`

### v0.11.300 — Bidirectional Selection Sync: Canvas ↔ Layers (R6.18)

1. **Layers → Canvas Auto-Focus** — Clicking a layer now smartly pans and zooms the canvas to ensure the selected node is visible in the viewport. Ported `focusOnNode` capability from VS Code extension to the Web Playground (`site/app.js`), honoring the `reduceMotion` preference by disabling the bezier animation sweep.
2. **Canvas → Layers Auto-Expand** — Clicking a deeply nested node on the canvas now correctly traverses up the Layers panel DOM, automatically removing the `.collapsed` state from all parent folder groups, expanding their chevrons, and successfully calling `.scrollIntoView()` on the `.selected` list item. This guarantees visibility in deep hierarchies and fixes the silent scroll failure. Applied identically to both `site/layers.js` and `fd-vscode/webview/src/panels.js`.

Files: `site/app.js`, `site/layers.js`, `fd-vscode/webview/src/panels.js`

### v0.11.299 — Right-Click to Pan (R3.6)

1. **Right-click = Pan** — Right-clicking anywhere on the canvas now mimics the middle-mouse button and instantly triggers panning (the Hand tool), aligning with standard design tool interactions.
2. **Context menu suppressed** — The native right-click context menu is now exclusively suppressed on the canvas to prevent overlap with panning, but remains fully functional in the Layers panel for critical node actions (Rename, Delete, Reparent, etc.).

Files: `site/app.js`

### v0.11.298 — Seamless WYSIWYG Inline Text Editing & Theme Synchronization (R3.28)

1. **Sub-pixel perfect WYSIWYG** — Removed integer `Math.round()` from `fontSize` and `lineHeight` calculations inside the inline editor. The editor overlay now maps with floating-point precision directly matching the Canvas2D bounds, eliminating sub-pixel textual jumping and layout jitter during transitions. Standardized font injection to raw CSS shorthand for exact baseline matching.
2. **Universal Blue Box Suppression** — Re-ordered the render loop for double-click transitions. Before invoking `renderFn()` across all editor entry paths (standalone text, shape-bound text, and new text creation), `set_suppressed_text_node()` is fired synchronously. This completely eliminates the brief blue selection box "flash" previously visible before the HTML textarea claimed focus.
3. **Theme-Aware Text Rendering** — Refactored WASM text color resolution. `resolve_fill_color` natively uses `CanvasTheme` structure to emit `#1C1C1E` (Light) or `#E0E0E0` (Dark) instead of hardcoding fallback hexes, guaranteeing the WASM renderer and HTML overlay completely sync without visual jumps on theme toggles.

Files: `crates/fd-wasm/src/render2d.rs`, `crates/fd-wasm/src/props.rs`, `site/canvas-core/inline-edit.js`, `fd-vscode/webview/src/inline-edit.js`

### v0.11.297 — Inline Text Color Preservation & Deselect-on-Commit (R3.3)

1. **Text color preservation** — Inline editor now mirrors the exact text color from the WASM renderer. Previously, text nodes using the renderer's default fill (`#CCCCCC`) appeared black (`#1C1C1E`) in the textarea because `get_selected_node_props()` omitted the `fill` key when `style.fill` was `None`. Fix: always emit the resolved fill color for text nodes, including the `#CCCCCC` default and gradient first-stop approximations.
2. **Deselect on commit** — After finishing inline text editing (blur, Enter, or Escape), `select_by_id("")` is called to clear selection and return the canvas to a neutral state. Matches Figma/Excalidraw behavior where completing an edit deselects the node.
3. **Blur race condition** — Reduced `setTimeout(commit, 150)` to `setTimeout(commit, 0)` (microtask). Added `isInlineEditing()` guard to canvas `pointerdown` handler to prevent the dismissing click from triggering unintended canvas interactions.

Files: `crates/fd-wasm/src/props.rs`, `site/canvas-core/inline-edit.js`, `site/app.js`, `fd-vscode/webview/main.js`, `zed-extensions/.../main.js`

### v0.11.296 — Increase Default Shape Sizes (R3.7, R3.42)

1. **Rect default size** — Click-to-place rect increased from 120×80 to **144×96** (20% larger). The ellipse's default width was made narrower than the rect's to better reflect visual hierarchy.
2. **Ellipse default size** — Click-to-place ellipse increased from 90×90 to **128×128** (20% larger). Remains a circle by default for immediate visual parity with common design tools.
3. **Tests updated** — `tools_tests.rs` assertions for `rect_tool_click_creates_centered`, `ellipse_tool_click_creates_centered`, and `rect_tool_drag_back_to_start_is_click` updated to reflect new default dimensions.

Files: `crates/fd-editor/src/tools.rs`, `crates/fd-editor/src/tools_tests.rs`

### v0.11.295 — Resolve Inline Editor Ghosting and Keyboard Shortcut Hijacking (R3.3)

1. **WASM Text Rendering Suppression** — Added `suppressed_text_id` property to the Rust `FdCanvas` struct. This explicitly tells the WASM engine to skip rendering the `draw_text` command for nodes actively being edited via the DOM `<textarea>`, completely eliminating the overlapping "ghosting" visual artifact.
2. **Robust Keyboard Shortcut Bypass** — The global `keydown` tool shortcuts interceptor in `site/app.js` was ignoring the inline editor overlay lifecycle. Re-engineered `isEditingInput` to strictly pull the live `coreInlineEditorActive` exported boolean from `site/canvas-core/inline-edit.js`. This prevents active typing (e.g., "t", "v", "h", "Space") from triggering random tool mode switches.

Files: `crates/fd-wasm/src/render2d.rs`, `site/app.js`, `site/canvas-core/inline-edit.js`, `crates/fd-wasm/src/lib.rs`

### v0.11.294 — Complete Fix for Inline Editor "Weird Box" Artifact (R3.3)

1. **Global Capture Enforcement** — Expanded the previous fix (v0.11.293) for the `<textarea>` artifact bug. Prevents UI panels (like Toolbar, Layers) from blocking the `blur` event by escalating the `pointerdown` listener from the canvas to the `window`. Checks `e.target` to safely exclude arbitrary un-committed clicks *inside* the textarea itself.

Files: `site/canvas-core/inline-edit.js`

### v0.11.293 — Fix Inline Editor "Weird Box" Artifact (R3.3)

1. **Native Blur Enforcement** — Resolved an issue where double-clicking a node to open the inline text editor, then clicking elsewhere on the canvas, would leave an empty, stuck `<textarea>` overlay (the "weird box"). Root cause: canvas interactions invoke `e.preventDefault()` (to stop panning/zooming), which suppressed the browser's native `blur` progression away from the editor, trapping it.
2. **Explicit Capture Phase Blur** — Engineered a non-destructive countermeasure via `setupInlineEditor`. A `{ capture: true }` `pointerdown` event listener now evaluates the active document element and explicitly dispatches `.blur()` to the `textarea` *before* core scripts can intercept and cancel the event bubble. This safely queues the required `commit()` logic and guarantees accurate teardown without compromising overarching interaction safety barriers.

Files: `site/canvas-core/inline-edit.js`

### v0.11.292 — Fix Canvas Interaction & Coordinate Misalignment (R3.39)

1. **Path Bound Box Validation** — Fixed a core regression in `layout.rs` where `NodeKind::Path` was resolving to a hardcoded `100x100` bounding box payload. Path shapes now correctly resolve their `min_x/y` and `max_x/y` from internal spatial commands to emit mathematically accurate bounding envelopes, resolving ghost selections.
2. **Pen Tool Offset Synchronization** — Refactored `PenTool` to shift all visual points towards a local `(0,0)` origin relative to their true position constraint. `PointerUp` now calculates geometric shifting metrics and explicitly emits a `GraphMutation::SetConstraints(Position(start_x + min_x, start_y + min_y))` graph event, so layout positioning maps back to screen space reliably when users drag paths or selection handles.
3. **Graph Mutation Architecture Extension** — Upgraded `SyncEngine` graph handling by scaffolding the `GraphMutation::SetConstraints` variant. The undo/redo command stack (via `compute_inverse`) and interaction modules were upgraded to bidirectionally handle internal constraint injection tracking without desyncing the editor loop.

Files: `crates/fd-core/src/layout.rs`, `crates/fd-editor/src/tools.rs`, `crates/fd-editor/src/sync.rs`, `crates/fd-editor/src/commands.rs`, `crates/fd-editor/src/tools_tests.rs`

### v0.11.291 — Fix Panel Resize After Toggle + Right Panel Resizable (R6.6)

1. **Left panel resize handle drift (Bug #1)** — After toggling the left panel hidden and back visible, the `#layers-resize` drag handle was stuck at `left: 0px` (buried behind the panel). Root cause: `toggleLeftPanel()` and `toggleLayersPanel()` set `--left-panel-width` but never called `positionLayersHandle()`. Fix: expose `positionLayersHandle` as `window.__fdPositionLayersHandle` from `setupPanelResize()` and call it inside the `requestAnimationFrame` of every toggle function.

2. **Right panel unresizable (Bug #2)** — The right panel had no drag handle at all — no HTML element and no JS resize wiring. The CSS class `.panel-resize-handle.props-handle` already existed but was unused. Fix: added `<div id="right-resize" class="panel-resize-handle props-handle">` to `index.html` and wired full `pointerdown/pointermove/pointerup` drag logic in `setupPanelResize()` (180–500px range, localStorage persistence, double-click to reset to 260px).

3. **Dead `layersHandle` reference (Bug #4)** — `toggleLayersPanel()` referenced `layersHandle` (a `const` scoped inside `setupPanelResize()`) — always `undefined` at that callsite, silently failing to show/hide the handle. Fix: replaced with `document.getElementById('layers-resize')` and delegated repositioning to `window.__fdPositionLayersHandle?.()`.

Files: `site/app.js`, `site/index.html`, `site/css/panels.css`

### v0.11.290 — Smart Search: Fuzzy Mode with Segmented Control (R6.5)

- **FEAT (R6.5)**: Replaced exact-only substring search with a **Smart mode** search (default) using `nucleo-matcher` for fuzzy scoring + exact-match boost (+1000 points). Exact substring hits always rank first; fuzzy matches surface typos and abbreviations below. Score threshold (30) suppresses noise.
- **UI**: Replaced the single `.*` regex button with a **3-segment control**: `Exact | Smart | Regex .*`. Smart is the active default, showcasing all modes in one discoverable component.
- **UX**: `Alt+R` keyboard shortcut now cycles Smart ↔ Regex (previously toggled only regex on/off).
- **WASM**: `search_nodes(query, mode)` now accepts `"smart"`, `"exact"`, or `"fuzzy"` as a mode parameter. Results include a `score` field for ranking. Modeled after VS Code command palette: fuzzy scoring + exact-substring boosting.
- **Perf**: `nucleo-matcher` is 6× faster than skim, pure Rust, WASM-ready, ~20-30KB bundle overhead.

Files: `Cargo.toml`, `crates/fd-wasm/Cargo.toml`, `crates/fd-wasm/src/search.rs`, `site/index.html`, `site/css/modals.css`, `site/app.js`

### v0.11.289 — Snap-to-Collapse Panel UX & Cache Fix (R6.6)
- **UX**: Implemented snap-to-collapse on the left panel (drag width `< 80px` automatically collapses the panel, dragging `> 80px` springs it open). Lowered `MIN_WIDTH` constraints to `120px` to naturally support the icon-only segmented pill modes.
- **Fix (Ops)**: Appended `?v=0.11.289` directly to `@import` paths in `style.css` to bust Cloudflare's strict 4-hour edge cache for aggregated assets, ensuring production DOM receives corresponding flex/container-query styles.

### v0.11.288 — Responsive UI: Container Queries for Panel Header Tabs (R6.6)
- **FEAT**: Implement CSS `@container` queries on `#left-panel` and `#right-panel` to gracefully degrade segmented pills.
- **UI**: Wrap tab labels inside `<span class="tab-label">` and hide them (`display: none`) when the panel is resized below `220px`. The UI cleanly transitions to icon-only buttons centered via `flex`/`gap` to adopt professional tool patterns (like Xcode/VS Code) when screen real-estate is premium.

### v0.11.287 — Toolbar Ghost Clone Responsiveness (R3.39)

1. **Snap indicator CSS transitions** — removed `transition: top 0.1s, left 0.1s` from `.toolbar-snap-indicator` to achieve instant tracking, eliminating the intentional 100ms visual lag during dragging.
2. **Translate3d toolbar drag movement** — replaced CPU-bound layout properties (`style.left`/`style.top`) with GPU-accelerated `translate3d(dx, dy, 0)` for the toolbar during `pointermove`, skipping expensive Layout and Paint rendering steps altogether to hit 60fps locking. 
3. **Cached layout reads** — cached exact canvas bounding rect and initial toolbar dimensions at drag start. Eliminates 4 synchronous `getBoundingClientRect()` layout thrashing calls per move frame inside `showSnapIndicator()`. 
4. **GPU layers** — added `will-change: transform` hint to both toolbar and grab shadow during active drag phase to bypass coordinate calculation cold starts.

Files: `site/css/toolbar.css`, `site/app.js`

### v0.11.286 — Fix Inline Editor Position, Ellipse Dblclick, Layers Reparent

1. **Inline editor canvas offset** — `openInlineEditor` in `canvas-core/inline-edit.js` computed textarea position as `b.x * zoom + panX` which is canvas-relative but the textarea is positioned inside `#canvas-content`. When panels are open the canvas element is offset within that container. Fix: subtract `canvasEl.getBoundingClientRect()` from `container.getBoundingClientRect()` and add the delta to `sx`/`sy`.

2. **Ellipse (and rect) double-click** — `dblclick` handler called `get_selected_id()` but the second `pointerdown` of the double-click sequence can clear selection before the `dblclick` event fires, returning empty. Fix: added hit-test fallback — if `get_selected_id()` is empty, `hit_test_at(x, y)` resolves the node under the cursor and selects it before opening the inline editor. Prevents fallthrough to freestanding text-node creation.

3. **Layers reparent drop zone** — `getDropZone` used a symmetric 25%/50%/25% above/nest/below split. The 50% center band is too narrow when items are short. Fix: container nodes (`rect`, `ellipse`, `frame`, `group`) now use 15%/70%/15% so the nest zone covers most of the item height, making drag-on-top reparenting reliable.

Files: `site/canvas-core/inline-edit.js`, `site/app.js`

### v0.11.285 — Mobile Sidebar Icon Fix

1. **Left sidebar icon on right** — On mobile (≤768px), `grid-column: 2/3` from desktop CSS created an implicit second column in the 1-column grid, pushing `#chrome-left` to the right edge. Fixed by overriding `grid-column: 1 / -1` in the mobile media query.

### v0.11.284 — Resize Cursors + Inline Editor Dedup

1. **Resize handle cursors** — Hovering over resize handles now shows appropriate CSS cursors (`nwse-resize`, `nesw-resize`, `ns-resize`, `ew-resize`). WASM `get_resize_cursor_at()` API added for consistency with JS `getResizeHandleCursor`.
2. **Inline editor deduplicated** — Removed 200-line duplicate inline text editor from `app.js` (with `border: 2px solid #0A84FF` blue rect bug and ESC/blur race). Site now uses shared `canvas-core/inline-edit.js` module (same as VS Code extension) with proper `outline: 1px solid #4FC3F7`, clean ESC cancel, and dark/light theme support.
3. **Default text** — Kept as `"Text"` (Figma standard) for immediate visual feedback.

### v0.11.283 — Corner Snap Fix & Minimize Persistence (R3.39)

1. **Absolute edge distance** — `getSnapSide` now uses pixel distance to nearest edge instead of proportional offset. Fixes corner bias on wide canvases.
2. **Minimize preserved on drag** — `applyToolbarSnap` preserves user's minimize state. Only auto-minimizes on overflow, never auto-expands.

### v0.11.282 — Toolbar Snap System Overhaul (R3.39)

**Fixed 8 bugs** by decomposing `applySnapPosition` into 3 focused functions and eliminating recursive side-effects:
1. **No more infinite recursion** — `applyToolbarSnap` resolves overflow linearly, never recurses.
2. **Pixel-perfect snap shadow** — DOM-measured minimized dimensions replace hardcoded 178px guess via `getMiniDims()`.
3. **Auto-restore** — `reclampToolbar` now un-minimizes automatically when canvas has enough space.
4. **Smart axis retention** — `getSnapSide` hysteresis bias (15%) prevents false axis flips near corners.
5. **Panel transition removed** — instant panel collapse prevents stale `getCanvasRect` during CSS animation.
6. **Init race fixed** — toolbar reclamps after layout settles via double-rAF, not during panel CSS load.
7. **Removed `preferredSide` stale state** — reclamp reads from localStorage, not a stale variable.


### v0.11.281 — Hybrid Cascade Toolbar Overflow (R3.39)

**Smart toolbar overflow recovery** — Replaced the old "force to vertical" overflow with a 4-step hybrid cascade on both horizontal AND vertical axes:
1. **Auto-minimize** on the user's preferred edge (preserves intent).
2. **Snap shadow** now previews minimized-size when overflow is detected.
3. **Expand cascade** (dbl-click grip): fit? → collapse nearest panel? → rotate to opposite axis? → soft block with toast.
4. **Smoother panel transitions** — 250ms cubic-bezier CSS transition on collapse/expand.

Files: `site/app.js`, `site/css/panels.css`

### v0.11.280 — Insert Menu Ring Refinement (R3.39)

**Refined Insert Button Ring** — Reduced the thickness and size of the circular ring around the `+` Insert Shape icon (`1px` width instead of `1.5px`, `18px` diameter instead of `20px`). This prevents the ring from looking too heavy and visually competing with the core drawing tools. 

Files: `site/css/toolbar.css`

### v0.11.279 — Insert Menu Visual Distinction (R3.39)

**Added Subtle Ring to Insert Button** — Enclosed the `+` (Insert Shape) icon in a delicate 1.5px outlined circular ring. This visually distinguishes it from the standard toggle tools (Select, Hand, Draw) by identifying it as a dropdown menu trigger, improving UX without disrupting the geometric line-art harmony of the 32×32 toolbar matrix.

Files: `site/css/toolbar.css`

### v0.11.279 — Frontend Modularization & Shape Parity (R3.42, R6.5)

**WASM Shape Creation Parity** — Refactored Toolbar Drag-To-Create (DTC) to leverage a new `wasm.insert_node_at()` API instead of JS string injection. Permanently resolved the divergence between toolbar-dragged shape properties (`#F0F0F0`, stroke `1.5`) and cursor-drawn shape properties (`fill: none`, stroke `2.5`). The Engine is now the ultimate source of truth for AST defaults.
**CSS Modularization** — Sliced the monolithic `3,700-line` style.css into 10 semantic `@import` segments to eliminate token waste for future AI context.
**JS Syntax Extraction** — Decoupled the CodeMirror syntax language parser and Atom One Dark Theme into a standalone ES Module (`site/src/editor/syntax.js`).
**YOLO Workflow** — Mandated `--quiet` flags across all cargo/wasm processes in `/yolo` script to mitigate verbose compilation noise token expenditure.

Files: `crates/fd-wasm/src/lib.rs`, `site/app.js`, `site/style.css`, `site/src/style/*`, `site/src/editor/syntax.js`, `.agents/workflows/yolo.md`

### v0.11.278 — Fix AI Toolbar Button Dimensions (R3.39)

**Fixed AI button size** — Squeezed the `✦ AI` button label (`font-size: 10px; letter-spacing: -0.6px`, padding removed) to strictly fit inside the standard 32×32 tool button matrix. This enforces a consistent 38px minor dimension for the floating toolbar regardless of horizontal or vertical orientation, eliminating layout distortion when auto-overflowed or snapped to side edges.

Files: `site/style.css`

### v0.11.277 — Toolbar Snap Shadow Orientation Fix (R3.39)

- **FIX**: Toolbar snap shadow now correctly swaps its dimensions (width/height) when docking to an edge that forces a perpendicular orientation (e.g., dragging a horizontal toolbar to the left/right edges), ensuring the preview perfectly matches the final docked shape without any layout thrashing during the 60fps drag.

### v0.11.276 — Local Vendor Bundle: Eliminate esm.sh CDN Dependency (R6.5)

**Site hangs on load due to esm.sh** — 9 `modulepreload` hints for CodeMirror packages on `esm.sh` CDN were hanging in a pending state, blocking the browser's `load` event and preventing the Code Editor from initializing. Root cause: esm.sh intermittent outages and cold-start build delays.

**Fix: bundle CodeMirror + lz-string locally** — installed all 8 CodeMirror packages + lz-string via npm, created `site/vendor/cm-entry.js` re-exporting only the symbols used by `app.js`, and bundled with esbuild into a single `site/vendor/cm.min.js` (359KB minified, tree-shaken). Replaced 9 CDN imports in `app.js` with one local import. Removed 9 `modulepreload` hints from `index.html`. Rewrote `sw.js` to cache same-origin vendor assets instead of cross-origin CDN modules. Added esbuild build step to `pages.yml` CI workflow.

**Result:** Zero external CDN dependency for core functionality. Site loads from Cloudflare Pages (same origin, 330+ edge PoPs) with 1 HTTP request vs ~40 previously. Immutable cache headers already cover `/*.js`.

Files: `site/app.js`, `site/index.html`, `site/sw.js`, `site/vendor/cm-entry.js`, `site/vendor/cm.min.js`, `site/package.json`, `.github/workflows/pages.yml`

### v0.11.275 — Fix Ellipse Radius/Diameter Mismatch (R3.7)

**Ellipse renders at 2X size** — previously, drawing an ellipse in the canvas resulted in a shape materially twice as large as the drag-to-create preview bounding box. Root cause: the parser treated the input `.fd` values for `w` and `h` directly as `rx` and `ry` (radii) when creating the `NodeKind::Ellipse` struct, and the emitter output those radii verbatim. Fix: Rust parser now treats input `w`/`h` as the diameter by dividing by `2.0` when assigning to `rx`/`ry`, and the emitter multiplies by `2.0` to restore the diameter on output. Tests updated to match new roundtrip logic.

Files: `crates/fd-core/src/parser.rs`, `crates/fd-core/src/emitter.rs`, `crates/fd-core/src/parser_tests.rs`, `crates/fd-core/src/emitter_tests.rs`

### v0.11.274 — Minimap 60FPS Decoupling and Cached Bitmap (R6.5, R3.25)

**60fps Viewport Rect** — decoupled the minimap's viewport indicator (the blue box) from the WASM scene render interval. The viewport now updates continuously at 60fps when panning the canvas, eliminating micro-stutters during navigation.

**WASM Scene Caching** — the WASM scene overview is now rendered once to an `OffscreenCanvas` (or hidden fallback) when the document modifies (`sceneDirty`), and blitted via `drawImage` during the 60fps loop. Replaced `uiDirty` reliance for scene rendering with a dedicated `sceneDirty` flag to prevent WASM thrashing during pan/zoom.

**Interaction Debouncing** — paused the heavy WASM minimap updates entirely while the user is actively dragging a node or using a continuous tool (`activePointerId !== -1`). It refreshes smoothly from the cache instantly upon `pointerup`.

Files: `site/app.js`

### v0.11.273 — Default Active Tabs via SessionStorage (R6.6)
**Fresh start always defaults to Layers & Agent** — changed `activeLeftTab` and `activeRightTab` to use `sessionStorage` instead of `localStorage`. This ensures that every new browser tab or fresh session guarantees a clean slate (Layers & Agent tabs toggled on by default), while still preserving your context if you accidentally refresh the page mid-workflow.

Files: `site/app.js`

### v0.11.272 — Panel Header Segmented Pill Redesign (R6.6)

**Segmented control tabs** — left and right panel headers now use Apple HIG segmented control pill styling. Tab buttons wrapped in a `.lp-tab-group`/`.rp-tab-group` container with `--fd-segment-bg` tinted track and 8px border-radius. Active tab gets `--fd-segment-active` capsule highlight with `--fd-segment-shadow` depth. Inactive tabs are transparent with secondary text color.

**Bottom separator** — both `.lp-tabs` and `.rp-tabs` now have `border-bottom: 0.5px solid var(--fd-border)` to visually separate the header from panel content.

Files: `site/style.css`, `site/index.html`

### v0.11.271 — Fix Inline Text Editor Positioning (R3.3)

**Textarea appeared offset to the left** — double-clicking a shape to edit text placed the `<textarea>` overlay at the wrong position. Three root causes identified and fixed:

1. **Coordinate system mismatch** — textarea was positioned relative to `#canvas-wrapper` but coordinates were computed relative to the canvas element (which is in column 2 of a CSS grid, offset by the left panel width). Fix: position textarea in `#canvas-content` and add canvas element offset (`canvasEl.getBoundingClientRect().left - contentEl.getBoundingClientRect().left`).

2. **BoundsInfo field name mismatch** — WASM `get_node_bounds()` returns `{x, y, w, h}` but JS read `b.width` / `b.height` (undefined → fallback to 80×24). Fix: read `b.w` / `b.h`.

3. **Dual text rendering** — canvas continued drawing text under the textarea during editing. Fix: temporarily clear text content on open, restore on commit/cancel.

Files: `site/app.js`

### v0.11.270 — Fix DTC Preview, Toolbar Snap, Ellipse Size (R3.42, R3.39, R3.7)

**DTC preview invisible** — drag-to-create preview shape was invisible because `dtcPreview` and `DTC_SIZES` were declared inside `initPlayground()` closure (L6138) while `drawDtcPreview()` at module scope (L551) couldn't access them. Fix: hoisted both to module scope.

**Toolbar can't snap top/bottom** — `getSnapSide()` was orientation-locked: vertical toolbar → left/right only. Once auto-overflowed to vertical, it could never snap to top/bottom. Fix: replaced with distance-based evaluation that considers all 4 edges — closest axis wins, allowing vertical↔horizontal switching.

**Ellipse too big** — WASM default ellipse click-creates was 100×100. Fix: reduced to 90×90 to match visual parity with rect (120×80). Updated `ellipse_tool_click_creates_centered` test.

Files: `site/app.js`, `crates/fd-editor/src/tools.rs`, `crates/fd-editor/src/tools_tests.rs`

### v0.11.269 — Fix Post-Drop Context Menu During Draw Gestures (R3.64)

**Context menu fired during draw-tool gestures** — drawing a rectangle, ellipse, pen stroke, or any non-Select tool gesture triggered the post-drop reparent context menu ("Nest into @target") on pointer up. Root cause: `canvasDragOccurred` was set to `true` for any `pointermove` that produced `moveResult.changed`, including draw-tool gestures (not just Select-tool drags). The post-drop menu at pointerup checked `wasDragging` without considering which tool was active. Fix: guarded `canvasDragOccurred = true` to only set when the active tool is `select` or `hand`, so draw-tool gestures no longer trigger reparent menus, canvas→layers cross-drag highlights, or ghost labels.

Files: `site/app.js`

### v0.11.268 — Edge-Only Snap: Remove Floating Mode, Lock Toolbar Orientation (R3.39)

**Major snap simplification** — removed free-floating toolbar mode and all threshold/overflow logic that caused persistent bugs across 5+ conversations. Toolbar now always snaps to edges with orientation locking: horizontal toolbar → top/bottom only, vertical toolbar → left/right only. `getSnapSide` reduced from 48 lines (threshold ratios, overflow fallback, edge filtering) to 12 lines (midpoint comparison). Deleted `applyFloatingPosition` (~40 lines), simplified `showSnapIndicator` (removed orientation swap), simplified `reclampToolbar` (removed floating branch). Net ~120 lines removed. Old `floating` localStorage state migrated to `bottom` on load.

Files: `site/app.js`

### v0.11.267 — Overflow Snap Picks Overflowed Edge for Correct Shadow Orientation (R3.39)

**Overflow snap picked wrong edge** — when dragging a vertical toolbar below canvas, the overflow fallback considered all edges by absolute distance. A side edge (left/right) often had a smaller absolute distance than the bottom edge, so the shadow showed vertical orientation instead of horizontal. Fix: `.filter(e => e.dist < 0)` ensures only overflowed edges are candidates. Dragging below → snaps bottom (horizontal shadow). Dragging past right → snaps right (vertical shadow).

Files: `site/app.js`

### v0.11.266 — Grip-Anchored Minimize + Insert Button Icon (R3.39)

**Grip stays stationary on minimize** — double-clicking the toolbar grip handle now keeps the grip visually pinned while the rest of the toolbar shrinks/expands toward it. Previous behavior centered on the toolbar's midpoint, which caused the grip to jump. Fix: captures `gripEl.getBoundingClientRect()` before toggle, computes delta after toggle, and offsets `toolbar.style.left/top` by the difference. Result clamped within canvas bounds.

**Insert button SVG icon** — replaced the plain `+` text character with a Phosphor Light SVG plus icon (consistent with all other toolbar icons). Removed both `ft-sep` dividers that flanked the insert button — it now sits directly between tool buttons and the AI Touch button without separators.

Files: `site/app.js`, `site/index.html`, `site/style.css`

### v0.11.265 — Auto-Rotate Floating Toolbar & Overflow Snap Fallback (R3.39)

**Drag to center always auto-docked** — `applyFloatingPosition` checked if the toolbar width exceeded the canvas width, but the toolbar was still horizontal (~600px) from its docked orientation. In a narrow canvas (~500px with panels), it always exceeded → always auto-docked. Fix: force vertical orientation (`flexDirection: column`) when entering floating mode, so the ~44px wide vertical toolbar always fits.

**Overflow snap went to wrong edge** — two bugs in `getSnapSide` fallback: (1) sort used `b.dist - a.dist` which picked the *farthest* edge (e.g., top when overflowing below). Fixed to `Math.abs(a.dist) - Math.abs(b.dist)` to pick closest edge. (2) Fallback fired even when toolbar was centered (all distances positive, beyond threshold), causing false snaps. Added overflow guard: only triggers when at least one distance is negative.

Files: `site/app.js`

### v0.11.264 — Fix Rect Duplication on Toolbar Drag & Snap Threshold (R3.39, R3.42)

**Rect duplication on toolbar drag** — clicking a tool button (e.g., Rect) set `dtcTool` via the button's `pointerdown` handler. If the user then dragged the toolbar grip instead of clicking the canvas, `dtcTool` was never cleared (grip's `stopPropagation` prevented `canvas.pointerdown` from firing). The document-level DTC `pointermove`/`pointerup` handlers then created a duplicate shape at the drop position. Fix: clear `dtcTool` and `dtcActive` in the grip `pointerdown` handler.

**Snap threshold too aggressive in constrained viewports** — the snap threshold formula used `Math.max(20, ...)` as a hard floor, meaning when the toolbar nearly filled the canvas axis (e.g., `availH=40px`), each side's 20px threshold consumed 100% of free space. Fix: removed the hard floor, threshold is now `Math.min(60, avail * 0.15)` — each side never exceeds 15% of free space, leaving ≥70% as free-float zone.

Files: `site/app.js`

### v0.11.263 — Remove Velocity Throw to Fix False-Snap (R3.39)

**Velocity throw caused false-snapping** — the velocity throw feature (speed > 500 px/s) bypassed the shadow-based snap gate introduced in v0.11.261. A normal drag gesture easily exceeds 500 px/s, so even when no snap shadow was visible (toolbar in canvas interior), the velocity throw would force-snap the toolbar to an edge. Fix: removed velocity throw entirely. Snap behavior is now 100% shadow-driven — if the snap shadow is visible when the user releases, snap there; otherwise float freely.

Files: `site/app.js`

### v0.11.262 — Browser Tab Reuse Enforcement (Docs/Workflows)

**Workflow templates enforce tab reuse** — Added `TAB REUSE:` preamble to every browser subagent task template in `e2e.md` (Smoke, Site Deploy Verification). Previously only the Production Feature Verification template mentioned tab reuse. Added explicit "reuse the fast-draft.com tab from step (a)" to `yolo.md` step 21b. Added "Cross-subagent tab memory" bullet to `GEMINI.md` Browser Subagent section. Documented root cause and fix in `LESSONS.md`.

Files: `.agents/workflows/e2e.md`, `.agents/workflows/yolo.md`, `GEMINI.md`, `docs/LESSONS.md`

### v0.11.261 — Fix Toolbar Snap Position & False-Snap (R3.39)

**Shadow ≠ final position** — `applySnapPosition()` used raw `grabOffsetX/Y` to compute toolbar position, but `showSnapIndicator()` used proportional ratios (`grabOffset / toolbarWidth * ghostWidth`). When orientation changed (horizontal→vertical), the shadow showed one position but the toolbar landed elsewhere. Fix: both functions now use the same proportional ratio from drag-start toolbar dimensions (`dragStartTbWidth/Height`).

**False-snap in canvas interior** — toolbar snapped to an edge even when dragged to the middle of the canvas (no shadow visible). Root cause: `pointerup` re-computed `getSnapSide()` independently, which could return a side even if the shadow had been hidden during the last `pointermove`. Fix: `pointerup` now uses `lastSnapSide` (the snap side from the most recent shadow indicator), ensuring no-shadow = no-snap. Velocity throws still work independently.

Files: `site/app.js`

### v0.11.260 — Fix Toolbar Snap, Rect Duplication, Minimap Visibility (R3.39, R3.42, R3.25)

**Toolbar false-snap** — `getSnapSide()` returned a snap edge even when toolbar was dragged away from all edges. Root cause: negative distance (toolbar past canvas edge) produced a ratio < 0, which always beat `minRatio = 1`. Fix: added `dist >= 0` guard to all four edge checks — only snap when genuinely approaching an edge.

**Rect duplication on draw/drag** — drawing a rect via click-draw-on-canvas created a duplicate because the Drag-to-Create (DTC) state (`dtcTool`) was never cleared when the user clicked the canvas directly. Both WASM `handle_pointer_up` and DTC `insertShapeAt` fired on the same gesture. Fix: clear `dtcTool` on canvas `pointerdown`.

**Minimap hidden behind right panel** — after the CSS Grid refactor (v0.11.240), `#minimap-container`'s `right: 12px` was relative to the full grid container (all 3 columns), not the canvas column. When the right panel was open, the minimap sat behind it. Fix: `right: calc(var(--right-panel-width, 0px) + 12px)`.

Files: `site/app.js`, `site/style.css`

### v0.11.259 — Shrink Panel Default Width to 260px (R6.6)

**Narrower panels** — both left and right panel defaults reduced from 320px to 260px, giving 120px more canvas space (60px per side). On a 1440px viewport, canvas ratio improves from 56% to 64%. Added `--fd-panel-default-width: 260px` CSS variable as single source of truth. Updated all hardcoded `320` references in grid fallback, `updateRightPanelWidth()`, `toggleLeftPanel()`, `toggleLayersPanel()`, `DEFAULT_LEFT_W`, and `<head>` initialization script. Users with saved custom widths retain their preference.

Files: `site/style.css`, `site/app.js`, `site/index.html`

### v0.11.258 — Sidebar Toggle Icon Alignment (R6.19)

**Pixel-matched sidebar toggles** — panel header toggle icons (`.lp-tab-toggle`, `.rp-tab-toggle`) now use identical dimensions to their canvas chrome counterparts (`#sidebar-toggle-btn`, `#hamburger-toggle-btn`): 16×16 SVG, 28×28 button, 6px padding, 8px border-radius, matching background/border/shadow. Previously the panel toggles used 14×14 SVGs in ~22×22 buttons with no background, causing a visible size/position jump on panel toggle.

Files: `site/index.html`, `site/style.css`

### v0.11.257 — Canvas-Projected Drag-to-Create Preview (R3.15, R3.42)

**WYSIWYG preview** — drag-to-create shapes are now rendered directly on the Canvas2D context in scene coordinates instead of as a floating DOM element. The preview uses the same default styles (fill, stroke, corner radius) as the final shape and is automatically zoom-aware — what you see during drag is exactly what you get on drop. Removed `.dtc-ghost` DOM element and 43 lines of associated CSS.

Files: `site/app.js`, `site/style.css`

### v0.11.256 — Proportional Snap Threshold (R3.39)

**Adaptive snap threshold** — `getSnapSide()` now uses a per-axis proportional threshold (15% of available space, clamped 20–60px) instead of a fixed 60px. On narrow canvases (both panels open, ~260px visible), the old 60px threshold covered 63% of the canvas width, making free-float nearly impossible. Now the threshold scales down to ~32px, leaving 70% of the canvas as free-float zone. Uses normalized ratio comparison so different axis thresholds are compared fairly.

Files: `site/app.js`

### v0.11.255 — Toolbar-Rect Snap Detection (R3.39)

**Toolbar-rect-based snap** — `getSnapSide()` now projects the toolbar's bounding rect from cursor + grab offset and checks if any toolbar edge is within 60px of the corresponding canvas edge. Previously checked cursor position only, which meant snap behavior depended on where you grabbed the grip rather than where the toolbar actually is. Closest edge wins when multiple are within threshold.

Files: `site/app.js`

### v0.11.254 — Free-Position Edge Snapping (R3.39)

**Free-position snapping** — `applySnapPosition()` now uses the grab offset (where you clicked on the grip) instead of centering the toolbar on the cursor. This enables snapping to any position along an edge, not just a few fixed spots. Grab offsets are passed through the full drag end → snap chain. Reclamp/overflow calls (no offset) fall back to centering.

Files: `site/app.js`

### v0.11.253 — Snap Shadow Grab-Offset Alignment (R3.39)

**Grab-offset preservation** — `showSnapIndicator()` now uses the user's grab offset (where they clicked on the grip relative to the toolbar's edge) instead of centering the ghost on the cursor. The offset is scaled proportionally when orientation changes (horizontal→vertical or vice versa). The shadow now shows exactly where the toolbar will land, aligned with the drag position.

Files: `site/app.js`

### v0.11.252 — Toolbar Canvas Containment (R3.39)

**Canvas containment invariant** — toolbar must always remain fully within the visible canvas area. `reclampToolbar()` now fires on panel toggle (left, right) and panel resize drag end, using double-rAF to ensure CSS Grid has recalculated before reading canvas bounds.

**Visible canvas rect fix** — `getCanvasRect()` now computes the actual visible canvas area by narrowing the `#fd-canvas` element's bounding rect with the left and right panel edges. The canvas grid column extends behind panels (higher z-index overlay), so raw `getBoundingClientRect()` was including area hidden behind panels — allowing the toolbar to "snap" into the right panel zone.

**Floating reclamp fix** — `reclampToolbar()` for floating toolbar now always re-clamps to the current canvas rect via `applyFloatingPosition()`, instead of only auto-docking on overflow. Prevents toolbar from staying at stale coordinates when panels open/close.

**Head script migration** — `<head>` inline script now recognizes `'floating'` as a valid toolbar side for zero-FOUC initialization.

Files: `site/app.js`, `site/index.html`

### v0.11.251 — Toolbar Drag UX: Cursor-Following Shadow + Free-Float (R3.39)

**Cursor-following snap shadow** — `showSnapIndicator()` now takes pointer coordinates and positions the ghost silhouette at the cursor's position along the sliding axis (clamped within canvas), instead of always centering on the edge. The ghost shows exactly where the toolbar will land.

**Free-float on canvas** — toolbar no longer force-docks to the nearest edge on every drop. When dropped in the canvas interior (outside `SNAP_THRESHOLD` of any edge), it stays at the drop position with `toolbar-floating` class. Only snaps to edges when dragged near them or when a velocity throw is detected.

**Overflow auto-dock** — floating toolbar auto-docks to the nearest edge on window resize or panel toggle if it overflows the canvas bounds. Otherwise, it stays put.

**Minimize on floating** — double-click grip on a floating toolbar preserves its position (calls `applyFloatingPosition` instead of `applySnapPosition`).

Files: `site/app.js`, `site/style.css`

### v0.11.250 — Fix Toolbar Minimize Center Drift & Side Switch (R3.39)

**DOM-sourced dock side** — double-click minimize/expand now reads the toolbar's ACTUAL dock side from its CSS class (`toolbar-docked-left`, etc.) instead of from localStorage. The saved side in localStorage could be stale: e.g., default `'bottom'` when the toolbar is actually on `'left'` due to auto-overflow during initialization. This caused the toolbar to jump from left→bottom on double-click.

**Center-anchored minimize** — captures the toolbar's current visual center (`getBoundingClientRect`) BEFORE toggling the `toolbar-minimized` class, and passes that center as the drop coordinates to `applySnapPosition`. The function computes `left = dropX - width/2`, so when width changes on minimize, the center stays stable instead of the left edge.

**Synchronous reposition** — removed `requestAnimationFrame` wrapper. Class toggle + reposition executes in the same synchronous JS frame, eliminating the 1-frame flash.

Files: `site/app.js`

### v0.11.249 — Fix Toolbar Grip Double-Click Jump & Orientation Switch (R3.39)

**Deferred drag mode** — toolbar grip `pointerdown` no longer enters drag mode (removing docked classes and switching to fixed positioning). Drag mode now activates in `pointermove` only after exceeding the 5px threshold. Eliminates the visual flash/jump on click and double-click — toolbar stays perfectly still until actually dragged.

**Preserve orientation on minimize** — double-click minimize now re-snaps to the saved side via `applySnapPosition(saved.side)` instead of `reclampToolbar()`. The old code could switch a vertical toolbar to horizontal via the `preferredSide` override (set when auto-overflow previously forced horizontal→vertical). Now the toolbar stays on its current edge when toggling minimized state.

Files: `site/app.js`

### v0.11.248 — Collision-Based Minimap Positioning (R3.25, R6.18)

**Smart minimap shift** — minimap no longer unconditionally shifts up 64px when toolbar is bottom-docked. New `adjustMinimapForToolbar()` uses AABB collision detection between toolbar and minimap bounding rects. Minimap sits at true bottom-right (`bottom: 12px`) when toolbar doesn't overlap, and shifts above toolbar + 8px gap only when actual overlap is detected. Called from `applySnapPosition()`, `reclampToolbar()`, and toolbar minimize/expand toggle.

**Blanket CSS rule removed** — deleted `[data-toolbar="bottom"] #minimap-container { bottom: 64px }` and `.toolbar-docked-bottom ~ #minimap-container` selectors. Positioning is now fully dynamic via JS.

Files: `site/style.css`, `site/app.js`

### v0.11.247 — Fix Toolbar Disappearing on Window Resize (R3.39)

**Visibility preserved through reclamp** — `applySnapPosition()` clears all inline styles via `cssText = ''` before repositioning the toolbar. This also cleared `visibility: visible` (set once at startup), causing the toolbar to revert to the CSS default `visibility: hidden`. Now re-sets `visibility: visible` immediately after the cssText reset. Reproducible by resizing the window narrow enough to trigger the horizontal→vertical auto-overflow switch.

Files: `site/app.js`

### v0.11.246 — Remove Loading Overlay (R6.5)

**Loading overlay removed** — Deleted the `#canvas-loading` skeleton animation overlay (shimmer shapes, progress bar, status text) that caused a brief dark-to-white flash on page load. WASM loads in <300ms on warm cache (service worker + preloads), making the overlay invisible on repeat visits and barely visible on first load. Net deletion of ~120 lines across HTML, CSS, and JS.

**Error fallback preserved** — WASM load failures (timeout, network error) now create a dynamic error overlay on the fly instead of reusing the removed static element. Retry button and VS Code extension link retained.

Files: `site/index.html`, `site/style.css`, `site/app.js`

### v0.11.245 — Fix Toolbar Startup Jump (R3.39)

**Single-source positioning** — Removed CSS `calc()` centering rules from all four `[data-toolbar="*"]` selectors. Toolbar now hidden via `visibility: hidden` until JS `applySnapPosition()` computes the correct pixel position, eliminating the CSS→JS position handoff that caused a visible rightward jump on page load.

**Transition race fix** — Toolbar's inline `transition` re-enable now uses double `requestAnimationFrame` (matching the `init-no-transition` class removal timing), preventing a 1-frame window where transitions could leak during startup.

Files: `site/style.css`, `site/app.js`

### v0.11.244 — Chrome Icon Positioning & Panel Layout (R3.39, R6.5)

**Chrome icons in canvas grid column** — `#chrome-left` and `#chrome-right` now use `grid-column: 2; grid-row: 1` to position within the canvas grid area. Uses simple `left: 8px` / `right: 8px` instead of `calc(var(--panel-width) + 8px)`. Fixes icon position shift when panels toggle and clipping when both panels open.

**Canvas grid min-width** — Grid canvas column changed from `1fr` to `minmax(200px, 1fr)`, preventing the canvas from shrinking below 200px when both panels are open.

**Panel width equalization** — Left panel default width changed from 280px to 320px to match the right panel width, across CSS fallbacks, JS constants (`DEFAULT_LEFT_W`), and the `<head>` initialization script.

**Mobile auto-collapse** — On viewport ≤768px, both panels auto-collapse on startup regardless of saved state. Prevents panels from covering the canvas on mobile web.

Files: `site/style.css`, `site/app.js`, `site/index.html`

### v0.11.243 — Toolbar & Canvas UI Polish (R3.39, R3.25, R6.5)

**Vertical separator fix** — `.ft-sep` dimensions now swap to `width:20px; height:1px` when toolbar is docked left/right (`data-toolbar="left"/"right"`). Removes the dashed appearance in vertical orientation.

**Snap shadow preview** — dragging toolbar near a canvas edge shows a ghost silhouette (same size/shape as toolbar, frosted glass, 45% opacity) at the snap destination instead of a thin colored strip. Ghost dimensions estimate orientation change when switching horizontal↔vertical.

**Always-snap behavior** — toolbar always snaps to the nearest canvas edge on drop (no floating state). Auto-detects nearest edge by distance when dropped in open canvas area.

**Default bottom-center** — new users and cleared localStorage now get toolbar at bottom-center (was top-center). Updated `parseToolbarPos()` in app.js and `<head>` script in index.html.

**Canvas loading background** — `.canvas-loading` now uses `var(--fd-bg, #F5F5F7)` instead of `var(--bg-card)` (which resolved to dark `#1C2128` from marketing tokens). Loading screen matches canvas theme.

**Settings icon offset** — `.canvas-chrome-left` and `.canvas-chrome-right` margins reduced from 10px to 8px for tighter alignment with sidebar panel edges.

**Minimap position** — `#minimap-container` right offset simplified from `calc(var(--right-panel-actual-width, 0px) + 12px)` to `12px` (container is already inside the canvas grid column).

**Deduplicated .ft-sep** — removed duplicate definition at line 1614; single source of truth at line 382.

Files: `site/style.css`, `site/app.js`, `site/index.html`

### v0.11.242 — Toolbar Canvas-Relative Positioning (R3.39)

**CSS calc() positioning** — Toolbar CSS default coords now use `calc(var(--left-panel-width) + (100vw - lpW - rpW) / 2)` to center within the canvas area, not the viewport. Fixes toolbar appearing inside right panel when docked right, and off-center when docked top/bottom.

Files: `site/style.css`, `docs/CHANGELOG.md`

### v0.11.241 — Post-Grid Regression Fixes (R3.39, R6.19)

**Toolbar z-index** — Bumped from 25 to 30 so toolbar floats above panels (z-index 25).

**Sidebar toggle in panel headers** — Sidebar toggle icons now ALWAYS visible in panel headers (`display: flex`). Removed dependency on `.lp-open`/`.rp-open` class toggles. Canvas chrome toggles (`#sidebar-toggle-btn`, `#hamburger-toggle-btn`) hidden via `[data-lp/rp="open"]` selectors.

**Lesson documented** — Added "Sidebar Toggle DOM Duplication Regression" to `docs/LESSONS.md`.

Files: `site/style.css`, `docs/LESSONS.md`, `docs/CHANGELOG.md`

### v0.11.240 — CSS Grid Layout + Data-Attr State Machine (R3.39, R6.19)

**Zero-FOUC Architecture** — Refactored `#canvas-content` from absolute-positioned children to CSS Grid (`grid-template-columns: var(--left-panel-width) 1fr var(--right-panel-width)`). All layout state now driven by `data-*` attributes on `<html>` set synchronously from a `<head>` script before `<body>` is parsed. Eliminates toolbar flash at (0,0), panel collapse delay, and adaptive icon flicker.

**Data-Attribute State Machine** — Panel state (`data-lp`, `data-rp`), toolbar dock side (`data-toolbar`), and toolbar minimized state (`data-toolbar-min`) are `<html>` attributes. CSS selectors like `[data-lp="closed"]` drive layout — no JS class toggles needed for initial render.

**Toolbar CSS Default Coords** — `[data-toolbar="top"] #floating-toolbar` now includes full positioning rules (`top: 10px; left: 50%; transform: translateX(-50%)`), so toolbar renders at center-of-edge from frame 0. JS `applySnapPosition()` overrides with exact canvas-aware coords via inline styles.

**fd-shell API** — Created `fd-shell/README.md` documenting the multi-platform data-attribute API for layout shell reuse across site, VS Code, and Tauri platforms.

Files: `site/index.html`, `site/style.css`, `site/app.js`, `fd-shell/README.md`

### v0.11.239 — Canvas & Toolbar Bug Fixes (R3.39, R3.73, R6.5, R6.19)

**DTC Shapes Visible** — Drag-to-create and insert menu shapes now use visible default fills (#F0F0F0 light / #2C2C2E dark) instead of transparent. Immediate `set_text()` + `renderCanvas()` forced after insertion.

**Toolbar Grip Click Fix** — Added 5px drag threshold to grip `pointerup` handler. If drag distance is below threshold, toolbar restores to saved position instead of re-snapping. Eliminates jump on handle click.

**Insert Menu Overflow Fix** — Insert menu detects toolbar's docked position (bottom/left/right) and opens in the appropriate direction (above when bottom-docked, sideways when side-docked).

**Inline Text Editor Position** — `openInlineTextEditor()` now accounts for canvas element offset within wrapper when calculating textarea screen coordinates.

**Lasso Select** — JS-only freeform polygon selection tool. Draws dashed blue lasso path during drag. On release, selects all nodes whose bounding box corners are inside the lasso polygon using ray-casting algorithm. Switches to Select tool after lasso.

**Eraser Marquee** — JS-only rectangle erasure tool. Draws dashed red marquee during drag. On release, deletes all nodes fully enclosed by the rectangle from FD code. Supports undo via `push_undo_snapshot`.

**AI Touch Simplified** — Removed two-phase pipeline (refine + review) and full-doc review feature. Now single-phase code-modify: with selection refines selected nodes, without selection refines entire document. Both show inline diff. Uses 1 API credit instead of 2. Removed review panel HTML, `renderReviewPanel()`, `runFullDocReview()`, and Settings menu item.

**Settings Button Visibility** — Changed settings button icon from sun-like to proper gear/cog SVG. Removed dead `canvas-theme-toggle` reference from `<head>` script.

Files: `site/app.js`, `site/index.html`

### v0.11.238 — Startup FOUC Fixes (R3.39, R6.19)

**Toolbar Position from `<head>`** — toolbar position now set via inline script in `<head>` before first paint, reading `fd-toolbar-pos` from localStorage. Eliminates the 100–500ms flash at (0,0).

**Canvas Chrome Always Visible** — `#chrome-right` z-index raised to 26 (above panels at 25) so settings gear and share buttons are always visible. `rp-open`/`lp-open` classes set from `<head>` script so adaptive sidebar icons hide/show from frame 0.

**Zero Startup Animations** — loading overlay now instant-hidden (no fade), toolbar base transition removed (only applied during snap), chrome position transitions removed. `#floating-toolbar` added to `init-no-transition` suppression list.

Files: `site/index.html`, `site/style.css`, `site/app.js`

### v0.11.237 — Toolbar Drag-Snap Fixes (R3.39)

**Orientation Preserved During Drag** — dragging a vertical toolbar grip no longer flips it to horizontal mid-drag. Fix: `getComputedStyle(toolbar).flexDirection` captured before removing docked classes, explicitly set on `toolbar.style` during drag.

**Canvas-Aware Snap Bounds** — `getSnapSide()` now uses `#fd-canvas.getBoundingClientRect()` instead of `window.innerWidth/Height`. Toolbar snaps within the visible canvas area only, never behind open left/right panels.

**Free-Position Snap** — toolbar can snap anywhere along an edge (not just centered). Drop coordinates are clamped within canvas bounds so the toolbar never overflows. Position (side + coordinates) persisted in localStorage as `{side, x, y}` (auto-migrates old string format).

**Re-clamp on Resize/Panel Toggle** — `reclampToolbar()` fires on `window.resize` and after minimize toggle, keeping toolbar within canvas bounds when panels open/close or window resizes.

Files: `site/app.js`, `site/style.css`

### v0.11.236 — Chrome Redesign + DTC Fixes (R3.42c, R6.19, R6.20, R6.21)

**DTC Bug Fixes** — ellipse size reduced from 100×100 to 80×80 (visual parity with rect), all shapes now default to transparent fill + theme-aware stroke (#333 light / #CCC dark) instead of blue fill, frame defaults to white fill. Arrow removed from drag-to-create (kept in insert menu only — arrows need two anchor points, not a bbox drop).

**Insert Button Visible When Minimized** — `+` insert button now stays visible when the toolbar is double-click minimized (alongside active tool and AI button).

**Chrome Redesign** — theme toggle moved from chrome-left into Settings dropdown (chrome-left is now sidebar toggle only). Export tab replaced with floating Share dropdown (↗) in chrome-right with Share Link, Copy PNG, Download SVG, Download HTML. Import CSS moved to Settings dropdown. Sign-in moved to Settings dropdown. Chrome-right order: Share → Settings → Right Panel toggle.

**Right Panel: Agent + Search** — Export and Settings tabs removed from right panel. New Search tab with live text search: searches FD code for node IDs, text content, style names. Results show @id, context snippet, line number. Click a result to select the node on canvas and scroll to line in code editor.

**Adaptive Sidebar Icons** — sidebar toggle buttons now appear in panel tab headers when panels are open (and hide from chrome). When panels collapse, chrome toggle icons reappear. Panel z-index raised to 25 (above chrome at 20) so panels properly overlay chrome when open.

Files: `site/app.js`, `site/index.html`, `site/style.css`

### v0.11.235 — Drag-to-Create + Insert Menu (R3.42, R3.42b)

**Drag-to-Create Re-implemented** — toolbar tool buttons now support drag-to-create: pointerdown on a draw tool button, drag onto the canvas, release to create a shape at the drop point. Ghost preview (dashed outline matching shape type) follows the cursor during drag. Fix: `e.preventDefault()` on toolbar button `pointerdown` blocks native SVG drag hijacking (root cause of 6 prior failures, documented in LESSONS.md).

**Insert Menu** — new `+` button in toolbar opens a frosted glass dropdown with shape shortcuts (Rectangle, Ellipse, Text, Frame, Arrow). Click an item to create the shape at viewport center. Keyboard shortcut: `⌘/` (or `Ctrl+/`).

**Onboarding Updated** — hints now say "pick a tool, then click canvas to draw" + "or drag a tool onto the canvas" (was "click & drag to draw").

**CSS** — added `-webkit-user-drag: none` on `.ft-tool-btn svg` (belt-and-suspenders with existing `pointer-events: none`).

Files: `site/app.js`, `site/index.html`, `site/style.css`

### v0.11.234 — Left Panel Visible During Loading (R6.5)

**Left Panel Z-Index Fix** — `#left-panel` z-index raised from `10` to `15` to match `#right-panel`. The loading overlay (`.canvas-loading`) has `z-index: 10`, which was covering the left panel during WASM initialization. Now both panels are visible immediately while the canvas engine loads.

Files: `site/style.css`

### v0.11.233 — Canvas Loading UX Round 2: Eliminate Slide-In Race (R6.5)

**Panel Init Before WASM Await (#1)** — `initLeftPanel()`, `initRightPanel()`, `initSettingsPanel()`, `initOnboarding()` moved to the top of `initPlayground()` before the first `await` (WASM fetch). Previously they ran ~500 lines after the await, leaving a 60-100ms window where panels were uninitialized while the browser painted frames.

**Double-rAF Transition Removal (#2)** — `init-no-transition` class removal now uses double `requestAnimationFrame` (rAF inside rAF). Single rAF can fire in the same paint cycle as layout changes, causing the browser to interpret the CSS var update as a transition-eligible change. Double-rAF guarantees one full painted frame passes before transitions re-enable.

**LocalStorage-Aware Head Script (#3)** — inline `<script>` in `<head>` reads `fd-right-collapsed`, `fd-left-collapsed`, and `fd-left-panel-width` from localStorage before first paint. Sets correct CSS vars (`--left-panel-width`, `--right-panel-width`, `--right-panel-actual-width`) and applies `.collapsed` class on DOMContentLoaded. Returning users with collapsed panels see the correct layout from frame zero — no layout jumps.

Files: `site/app.js`, `site/index.html`

### v0.11.232 — Canvas Loading UX: Instant Panels + Streaming WASM + Module Preloads (R6.5)

**Suppress Minimap/Zoom Slide-In (#1)** — `.init-no-transition` class on `<html>` suppresses all CSS transitions during startup; removed after first frame via `requestAnimationFrame`; minimap and panels appear in their final position instantly

**Left Panel Loads Immediately (#2)** — `initLeftPanel()` moved before WASM init (was called after engine ready); inline `style` on `canvas-wrapper` sets initial CSS vars so panel dimensions are known before JS runs

**CodeMirror Modulepreload (#3)** — 9 `<link rel="modulepreload">` hints for esm.sh dependencies in `<head>`; browser fetches in parallel with HTML parse instead of waiting for `app.js` module graph resolution; saves 200-500ms on cold loads

**SW CDN Module Caching (#4)** — `sw.js` now caches esm.sh modules alongside WASM assets using stale-while-revalidate; repeat visits load from disk cache; CDN pre-caching is best-effort (non-blocking)

**WASM Streaming Instantiation (#5)** — passes `Response` directly to `wasm.default()` which calls `WebAssembly.instantiateStreaming` internally; browser compiles WASM while bytes arrive; saves 100-300ms for 785KB binary; animated progress bar during streaming

Files: `site/index.html`, `site/app.js`, `site/sw.js`

### v0.11.231 — Mobile Touch Fixes: Pinch Zoom Center + Invisible Panel (R6.5, R6.7)

**Pinch-to-Zoom Center Fix** — zoom now anchors at the current finger midpoint:
- Old formula used frozen `pinchMidStartX/Y` (captured once at gesture start) as zoom anchor — zoom always centered on initial touch position, not where fingers currently are
- Replaced with standard zoom-at-point formula using live `midX/midY` from active pointers
- Matches `touchZoomAtPoint` behavior in the touch-events handler

**Invisible Panel Fix** — collapsed panels and backdrop no longer block canvas touches:
- Added `pointer-events: none` to `#left-panel.collapsed` and `#right-panel.collapsed` on mobile
- Added `pointer-events: none` default to `#mobile-layers-backdrop`, with `pointer-events: auto` only when `.visible`
- Root cause: panels off-screen via `transform: translateX(±100%)` still intercepted touch events because CSS transforms don't affect `pointer-events`

### v0.11.230 — Mobile UX Round 2 (R6.5)

**Touch-Sized Controls** — all interactive elements meet 44px Apple HIG minimum:
- Chrome buttons bumped from 26×26px to 36×36px on mobile
- Toolbar buttons bumped from 6px padding to 10px padding (40×40px min target)
- `touch-action: manipulation` on toolbar, chrome, and panel tabs (prevents iOS double-tap zoom)

**Toolbar Scroll Indicator** — gradient fade on right edge reveals more tools:
- `-webkit-mask-image` gradient fades to transparent at 82% width
- `scroll-end` class (toggled by JS) removes mask when scrolled to end
- iOS momentum scrolling (`-webkit-overflow-scrolling: touch`)
- Removed `scale(0.88)` — toolbar now renders at native size for clarity

**Panel Close Buttons** — discoverable ✕ in tab bar headers on mobile:
- Added `#lp-mobile-close` and `#rp-mobile-close` to panel tab bars
- Hidden on desktop (`display: none`), shown on mobile (`display: flex !important`)
- Collapses panel and hides backdrop on click

**Viewport Change Observer** — auto-collapse panels on orientation/resize:
- `matchMedia('(max-width: 768px)')` listener collapses panels when entering mobile width

### v0.11.229 — Excalidraw-Inspired User Behavior Tests (R4.16)

**Undo/Redo State Machine Tests** — 6 new tests in `commands.rs`:
- `undo_redo_add_remove_node` — AddNode → undo removes → redo re-adds
- `undo_redo_set_text_content` — SetText → undo reverts content → redo re-applies
- `undo_redo_resize_updates_text` — Resize → undo restores dimensions + text output
- `undo_redo_multi_step_chain` — 3 operations (move→resize→style) → undo all → redo all
- `push_snapshot_undo_restores_text` — JS-driven snapshot (paste) → undo reverts graph
- `undo_redo_group_ungroup` — Group→undo dissolves→redo recreates

**Bidi Sync Regression Tests** — 4 new tests in `sync_tests.rs`:
- `sync_add_node_appears_in_text` — AddNode → flush → text contains node + roundtrip
- `sync_set_text_updates_node_and_text` — SetText → flush → text updated + roundtrip
- `sync_delete_group_child_text_updates` — RemoveNode on group child → group intact + roundtrip
- `sync_full_user_flow_draw_edit_delete` — Complete user session: draw rect → add text → edit text → cascade delete

**Excalidraw-Style TS User Flow Tests** — 4 new test suites in `e2e-ux.test.ts`:
- Box-select simulation (AABB intersection, inclusive/partial selection, reverse drag normalization)
- Resize handle positions (8-handle system, position recalculation, hit-test with radius)
- Context menu action dispatch (selection-aware menu items, paste/group/z-order availability)
- JS-level undo/redo state tracking (push/undo/redo, multi-step chains, redo-clear-on-branch)

### v0.11.228 — Sidebar Performance + Mobile UI Fix (R6.5, R6.7)

**Sidebar Performance** — 4 optimizations for smoother collapse/resize:
- GPU-composited `transform: translateX()` slide-out replaces `width` animation (zero layout reflow)
- Added missing `.no-transition` CSS rule (was toggled in JS but never defined)
- `requestAnimationFrame` throttle on drag-resize handler (one paint per display frame)
- `will-change: transform` on both panels for compositor layer promotion
- Fixed `updateRightPanelWidth()` to also set `--right-panel-width` CSS var

**Mobile UI Rewrite** — canvas-first experience on ≤768px viewports:
- Both panels auto-collapse on init with backdrop overlay for drawer UI
- Canvas fills full width (`--left/right-panel-width: 0px !important`)
- Panels open as slide-in overlays (left 280px, right 320px max 85vw)
- Toolbar forced to compact bottom-center pill (no drag, no grip handles)
- Chrome buttons downsized, minimap/FAB/onboarding hidden
- `switchLeftTab`/`switchRightTab` skip un-collapse on mobile

### v0.11.227 — Empty Canvas Default & Drag-to-Create Fix (R6.17)

**Empty Canvas** — removed 170-line `DEFAULT_FD` tutorial; new visitors see a blank canvas with onboarding hints

**Drag-to-Create Removed** — disabled `toolbarDragTool` + `pointerenter` synthesized pointer-down (was conflicting with toolbar grip drag); tools now click-only (Figma/Excalidraw behavior)

### v0.11.226 — UI Fix Round 2 (R6.18)

**Layers as Tab** — merged into left panel tab bar (Layers/Code/Inspect), removed split-pane divider
- One view at a time, more vertical space per tab
- Default active tab: Layers

**Export Moved to Right Panel** — tabs: Agent / Export / Settings (removed History placeholder)

**Agent Header Deduped** — removed `.ai-chat-header` inside pane (tab is sufficient), Clear button moved to input area

**Canvas-Only Onboarding** — handwritten Caveat font annotations directly on canvas
- No dimming, no overlay, `pointer-events: none`
- Auto-dismiss after 8s or on first interaction
- Positioned within canvas bounds (respects panel widths)

**Chrome Icons Inside Canvas Bounds** — offset by `calc(var(--left/right-panel-width) + 10px)`
- Dynamic transition when panels collapse/expand
- Never overlaps panels

### v0.11.225 — UI Refinements v2: Apple-Style Chrome & Onboarding (R6.18)

**Apple-Style Canvas Chrome** — individual 28px icon buttons replace frosted pill overlays
- Top-left: sidebar toggle + light/dark theme toggle (solid bg, subtle shadow)
- Top-right: sign in + settings dropdown + right panel toggle
- No longer covers canvas or panel content

**3 Tabs Per Panel** — segmented control style (rounded pill, no underline)
- Left panel: Code / Inspect / **↗ Export** (moved from right panel)
- Right panel: Agent / **⚙ Settings** (full panel, not dropdown) / **📓 History** (placeholder)

**Settings Panel** — all settings as grouped items inside right panel Settings tab
- AI group: Renamify, Design Review
- View group: Present, Sketchy, Grid, Reduce Motion
- Window group: Full Screen, Fit to Content
- Help group: Shortcuts, About, Docs, Download, GitHub

**Left Panel Width** — default 320px (matching right panel), user-resizable

**Onboarding Overlay** — Excalidraw-style first-visit tips
- Semi-transparent backdrop with positioned tip cards pointing to toolbar, panels, minimap
- Dismiss on click anywhere or any keypress; stored in localStorage (`fd-onboarded`)

**Responsive Minimap** — scales with viewport, shifts up when toolbar is bottom-docked
- `min(150px, 18vw)` width, `min(100px, 12vw)` height
- Bottom offset 64px when `.toolbar-docked-bottom` sibling present

### v0.11.224 — Panel Layout Redesign (R6.17)

**Theater Animation Removed** — panels always visible on load
- Deleted `panels-collapsing` CSS and startup animation JS (1.3s delay)
- Panels restore from localStorage saved state instantly

**Left Panel Tabs** — Layers + Code / Inspect
- Merged Specs + Design into single **◧ Inspect** tab (specs at top, properties below)
- Reduced from 3 tabs to 2 for cleaner layout

**Right Panel Tabs** — Agent / Export
- Added tab bar with **✦ Agent** and **↗ Export** tabs
- Export tab surfaces Share, PNG, SVG, HTML, Import CSS as card-style buttons
- Removed old `rp-actions-bar` header (Share/Sign in/⚙ were inside panel)

**Top-Corner Chrome** — always-visible canvas controls
- Top-left: sidebar toggle icon (◫) — toggles left panel
- Top-right: Sign in (👤) + Settings (⚙) dropdown + Hamburger (☰) toggle
- Settings dropdown preserved intact from old `rp-actions-bar`

**Minimap Fix** — no longer covered by right panel
- `#minimap-container` offset by `--right-panel-actual-width` CSS variable
- Smooth `right` transition matches panel open/close

Files: `site/index.html`, `site/style.css`, `site/app.js`

### v0.11.223 — Chrome Layout Redesign (R6.7)

**Left Panel** — Layers + Code/Specs/Design tabs
- `#left-panel` replaces separate layers panel + sidebar pills
- Layers section at top with collapsible header
- Three tabs at bottom: Code, Specs, Design
- Split divider between layers and tabs (resizable)
- `--left-panel-width` CSS var (was `--layers-width`)

**Right Panel** — Agent-only + Actions Bar
- Removed tab strip (Agent/Code/Specs/Design)
- Actions bar at top: Share · Sign in · ⚙
- Full-height agent chat content area

**Toolbar** — Frosted glass pill, draggable, snaps to 4 edges
- Removed scroll decoration (paper roll, wood cores, finials)
- Clean frosted glass pill with grip handles (⠿)
- Drag to move, snap to nearest edge on release
- Velocity-based throw gesture for quick docking
- Double-click grip to minimize (only active tool + ✦ AI)
- ✦ AI Touch button integrated into toolbar
- Persists position and minimized state in localStorage

**Chrome Cleanup** — Removed 3 floating pills
- `#chrome-sidebar` (☰ sidebar toggle with dropdown)
- `#chrome-ai` (✦ AI Touch button)
- `#chrome-actions` (Share/Settings/Sign in)

Files: `site/index.html`, `site/style.css`, `site/app.js`

### v0.11.222 — Unified Right Panel with Horizontal Tabs (R6.6)
- **UX (R6.6)**: Consolidated 5 separate panels (AI Chat, Code Editor, Specs, Properties, Animations) into a single unified `#right-panel` with 4 horizontal tabs: ✦ Agent (default), { } Code, 📋 Specs, ◧ Design
- **UX (R6.6)**: Merged Animations and Properties into single "Design" tab — properties shown when a node is selected, animation UI merged into the same tab
- **UX (R6.6)**: Agent tab is the default/first tab — AI chat accessible immediately on load
- **UX (R6.6)**: Tabs use frosted glass styling with smooth transitions; active tab highlighted with purple accent indicator; tab state persisted in localStorage
- **UX (R6.6)**: Right panel can be collapsed/expanded by clicking the active tab — toggles between open and collapsed states with smooth width transition
- **CLEANUP (R6.6)**: Removed ~300 lines of dead code: `setupSplitResize()`, `codeCollapsed`/`savedEditorWidth` state, `split-resize` handle, `right-sidebar-toggle`, editor-header click handler, props-panel resize logic
- **SITE**: Changes in `site/index.html` (HTML restructuring), `site/style.css` (tab bar + pane styling), `site/app.js` (tab management, panel consolidation), `site/ai-chat.js` (Agent tab integration)

### v0.11.221 — Rename "Playground" → "Editor" (R6.5)
- **RENAME (R6.5)**: Renamed `site/playground.js` → `site/app.js` — main JavaScript module gets a proper name matching production app identity
- **RENAME (R6.5)**: All user-facing "Playground" text → "Editor" across about page, download page, docs, shortcuts, footer links, README, and share button
- **INFRA**: Updated `.github/workflows/pages.yml` cache-bust `sed` target from `playground.js` to `app.js`
- **DOCS**: Updated GEMINI.md Source row, CONTRIBUTING.md, docs/TARGET.md, canvas-core comments, fd-vscode comments, and api/ai.js comments

### v0.11.220 — Layout Fixes: Non-Scrollable Canvas + Centered Toolbar (R6.5, R6.6)
- **FIX (R6.5)**: Canvas is now truly non-scrollable — added `html, body { overflow: hidden; height: 100% }` to prevent browser-level scroll leaking through the `#app` viewport
- **UX (R6.6)**: Floating scroll toolbar now centered (`left: 50%; transform: translateX(-50%)`) instead of left-anchored to layers panel width — matches Excalidraw/Figma toolbar placement
- **UX (R6.6)**: Toolbar has `max-width: calc(100% - 200px)` safety to prevent minimap overlap at narrow viewports

### v0.11.219 — UI Consolidation + Onboarding (R6.5, R6.6)
- **UX (R6.5)**: Merged ☰ hamburger menu into ⚙ gear dropdown — single unified settings menu with Agent, Renamify, Design Review, Present, Sketchy, Grid, Theme, Reduce Motion, Fullscreen, Fit to Content, Export options, Shortcuts, and navigation links; removed hamburger button and separator
- **UX (R6.6)**: Code panel now collapses to **zero width** instead of 10% — resize handle also hides when collapsed; `.code-collapsed` grid uses `0fr` column
- **UX (R6.6)**: Right sidebar toggle button — floating pill with sidebar icon appears when code panel is collapsed; clicking restores both code panel and layers panel
- **UX (R6.5)**: Reversed panel startup animation — panels start **visible** at normal size, then collapse to zero after canvas loads (800ms show + 500ms collapse); gives users a visual cue of available panels before canvas takes over; `panels-collapsing` CSS class replaces `panels-intro`/`panels-expanding`
- **UX (R6.5)**: New onboarding experience — `DEFAULT_FD` replaced with guided `onboarding.fd` content: welcome message, tool hints, navigation card, interactive shapes with hover effects, workflow steps with edge connections, and pro tips; Excalidraw-style first-time user onboarding
- **EXAMPLES**: New `examples/onboarding.fd` file matching the playground default

### v0.11.218 — Native Fullscreen + Panel Animation (R6.5)
- **UX (R6.5)**: Moved fullscreen toggle from floating ⛶ button (which overlapped ☰ hamburger) into ⚙ Settings dropdown as "⛶ Full Screen ⇧F" menu item
- **UX (R6.5)**: Switched to native Fullscreen API (`requestFullscreen` / `exitFullscreen` with Safari `webkit` fallback) — true OS-level fullscreen on every platform
- **UX (R6.5)**: Removed floating fullscreen button and ~50 lines of associated CSS — cleaner canvas chrome
- **UX (R6.5)**: Added panel startup animation — Layers and Code panels briefly collapse then expand (0.2s delay + 0.3s ease-out), giving users a visual cue that panels exist and can be toggled. Respects "Reduce Motion" preference

### v0.11.217 — Remove Welcome Overlay (R6.5)
- **UX (R6.5)**: Removed "Click anywhere to start" welcome overlay — users now go straight to the canvas (Excalidraw-style instant start). Cleaned up 67 lines of CSS and 19 lines of JS

### v0.11.216 — Excalidraw-Inspired Improvements (R3.73–R3.77, R6.17, R7.1, R7.2)
- **Instant Start (R6.17)**: Service Worker (`sw.js`) with stale-while-revalidate strategy pre-caches WASM assets for instant repeat-visit loading
- **Quick Color Picker (R3.75)**: 8-preset color strip + custom color picker appears below selected shapes — left-click for fill, right-click for stroke
- **Share Modal (R3.76)**: Polished share modal with URL input, copy button with success feedback, and QR code visualization — replaces bare clipboard copy
- **Image Drag-and-Drop (R3.77)**: Drop images onto canvas to create placeholder rects — drag overlay with visual feedback, 2MB size limit
- **Presentation Mode (R3.74)**: Frame-based slideshow from ☰ Menu → Present — ←/→ arrow keys navigate between frames, Esc exits, auto-hides all chrome
- **Lasso Selection (R3.73)**: Freehand polygon selection tool with ray-casting point-in-polygon algorithm — `L` key shortcut, selects nodes whose centers fall inside the lasso polygon. 5 new tests
- **Future**: Documented R7.1 (Real-time Collaboration with CRDT) and R7.2 (Community Library Ecosystem) in REQUIREMENTS.md for later implementation

### v0.11.215 — App Chrome Redesign (R6.5)
- **UX (R6.5)**: Replaced full-width canvas toolbar bar with floating chrome pills — sidebar (top-left), AI Touch (top-center), action bar (top-right: Share, Sign in, Settings gear, ☰ Menu). Canvas now has zero persistent chrome bars
- **UX (R6.5)**: Split settings menu into two dropdowns: ⚙ Settings gear (Sketchy, Grid, Theme, Reduce Motion, Fit to Content) and ☰ Menu (AI Agent, Renamify, Design Review, Export, Shortcuts, Links)
- **UX (R6.5)**: Added sidebar dropdown (☰ top-left) for Layers panel, Code Editor, and Specs Panel toggles — consolidates panel controls into one discoverable pill
- **UX (R6.5)**: Added undo/redo buttons (↩ ↪) to the scroll toolbar — previously only available via keyboard shortcuts (⌘Z/⌘⇧Z)
- **UX (R6.5)**: Theme toggle moved from dedicated pill to Settings gear dropdown — cleaner UI, one less persistent button
- **DESKTOP**: Tauri app inherits all chrome changes (shares `site/` directory)

### v0.11.214 — Remove Homepage Navbar (R6.5)
- **UX (R6.5)**: Removed navbar from homepage — canvas now fills `100vh` (was `100vh - 52px`); matches Excalidraw's zero-chrome UX and achieves parity with the desktop app (which has no navbar)
- **UX (R6.5)**: Nav links (About, Docs, Get Fast Draft, GitHub) relocated to ☰ Settings dropdown in canvas toolbar — accessible via the existing hamburger menu; pattern matches Figma/Excalidraw/tldraw
- **UX (R6.5)**: Welcome overlay retained for first-time visitor onboarding (Docs, Shortcuts, Download links)
- **DESKTOP**: Web and desktop apps are now visually identical — both are 100% canvas with no outer chrome

### v0.11.213 — Canvas-First Homepage (R6.5)
- **UX (R6.5)**: Homepage is now a full-viewport playground — canvas + code editor fill the entire screen (`100vh - 52px` navbar); matches Excalidraw's canvas-first UX; replaces hero marketing content with immediate interactive experience
- **UX (R6.5)**: Welcome overlay for first-time visitors — frosted glass card with "Ready to design?" prompt, "Open Docs" and "Get App" links; dismisses on click/Escape; remembered via `localStorage` (`fd-welcomed`)
- **SITE (R6.5)**: New `/download/` page — OS-aware download cards (macOS/Windows/Linux) with GitHub Release API auto-fetch for links and file sizes; CLI install snippet with copy button; editor support table
- **SITE (R6.5)**: New `/about/` page — all marketing content relocated from homepage (features, two modes, benchmarks, architecture); scroll-reveal animations; hero with gradient background
- **SITE (R6.5)**: Updated nav across all 6 pages (index, about, download, docs, shortcuts, changelog) — links now `About | Docs | Shortcuts | Changelog | GitHub | Get Fast Draft`; "Install Extension" → "Get Fast Draft" button linking to `/download/`
- **SITE (R6.5)**: Playground border-radius and box-shadow removed for seamless edge-to-edge layout
- **DESKTOP**: Tauri desktop app automatically inherits the full-viewport layout (shares `site/` directory)

### v0.11.212 — Bump Layers Panel Default Width (R6.6)
- **UX (R6.6)**: Default Layers panel width increased from **180px to 220px** — node names like `@btn_primary_label` are now readable without truncation; CSS variable `--layers-width` default, `DEFAULT_LAYERS_W` JS constant, and toggle restore fallback all updated; existing user-resized widths in localStorage are unaffected

### v0.11.211 — Edge Header Syntax + Inline Constraints (R1.6, R1.10)
- **FORMAT (R1.6)**: New edge header syntax `edge @name @from -> @to { ... }` — from/to anchors declared in header, not body; braceless form `edge @name @from -> @to` for edges with default properties; anonymous form `edge @from -> @to` auto-generates ID; inline label `edge @name @from -> @to "label text"`
- **FORMAT (R1.10)**: Constraints are now inline node properties — `center_in:`, `offset:`, `fill_parent:` parsed inside node blocks alongside `w:`, `h:`, etc.; external `@id -> verb:` syntax still accepted (backward compat) but emitter outputs inline form
- **PARSER**: Fixed `->` vs negative-number disambiguation — `-` only matches as point-anchor start when followed by a digit
- **EMITTER**: Node-anchor edges use header form; point-anchor edges fall back to body form; braceless when all properties match defaults; constraints emitted inline, external constraint section removed
- **JS**: `parseLayerTree` in `playground.js` and `panels.js` updated to recognize both header and body edge forms; braceless edges correctly skip brace-depth tracking
- **SITE**: Playground demo content updated to use edge header syntax; constraints kept in legacy form for demo (WASM parser handles both)
- **EXAMPLES**: All 19 `.fd` example files auto-migrated to new syntax via parse→re-emit
- **TESTS**: 12 new tests — `parse_inline_center_in`, `parse_inline_offset`, `parse_inline_fill_parent`, `roundtrip_inline_constraints`, `parse_legacy_arrow_constraint`, `parse_edge_header_syntax`, `parse_edge_header_braceless`, `parse_edge_header_anonymous`, `parse_edge_header_with_label`, `roundtrip_edge_header`, `parse_edge_legacy_body`, `emit_edge_braceless`

### v0.11.210 — Canvas-First Layout + Layers Collapse-to-Zero (R6.6)
- **SITE (R6.6)**: Canvas is now on the **left** and Code editor on the **right** — visual output takes the hero position (matches Figma/Penpot convention)
- **SITE (R6.6)**: Layers panel collapse now goes to **width: 0** (fully hidden) instead of 40px — canvas gets full width when collapsed
- **SITE (R6.6)**: Added sidebar icon pill in toolbar to toggle Layers panel (replaces header-only toggle for discoverability)
- **SITE (R6.6)**: Split-resize drag logic inverted for canvas-first grid layout
- **VSCODE (R6.6)**: Canvas now opens in **ViewColumn.One** (left) with text editor in ViewColumn.Two (right) — canvas-first across all platforms

### v0.11.209 — Light Theme Default + Layers Consolidation (R6.6)
- **SITE (R6.6)**: Default canvas theme is now **Light** across all platforms (site, VS Code, desktop) — consistent with Figma/Notion defaults
- **SITE (R6.6)**: Removed duplicate `Layers` toolbar button — layers panel header is now the sole toggle (Penpot-style), with cursor:pointer and hover highlight
- **SITE (R6.6)**: Cleaned up `#layers-toggle-btn` CSS and JS references

### v0.11.208 — Sync Playground Default with demo.fd
- **SITE**: Replaced playground's 30-line `DEFAULT_FD` card snippet with the comprehensive `demo.fd` format reference (400 lines) — visitors now see every FD keyword, node type, edge style, and animation on first load
- **SITE**: Stripped `import "shared_library.fd"` from embedded copy (playground has no file system)

### v0.11.207 — Consolidate Examples (R4.16)
- **EXAMPLES (R4.16)**: Deleted 13 redundant example files — `animations.fd`, `constraints.fd`, `edge_types.fd`, `design_tokens.fd`, `design_system.fd`, `dark_theme.fd`, `landing_page.fd`, `mobile_app.fd`, `onboarding.fd`, `animated_onboarding.fd`, `responsive_dashboard.fd`, `wireframe_login.fd`, `grid_gallery.fd`
- **EXAMPLES (R4.16)**: Rewrote `demo.fd` as comprehensive format reference — showcases every FD keyword (import, style, extends, edge_defaults), all node types (rect, ellipse, text, group, frame, path, generic), all properties (fill, stroke, corner, shadow, opacity, clip, pad, locked, place, bg shorthand), all layouts (column, row, grid), all animation triggers and easing functions, all edge styles (curve, arrow, flow, label, spec), and constraints (center_in, offset)
- **FIX (R4.16)**: Fixed `path_drawing.fd` — replaced invalid `theme` keyword with valid `style` blocks; expanded from 57 to 52 well-structured lines with proper style blocks, spec annotations, and edge connections
- **EXAMPLES**: Final set reduced from 21 to 8 files: `demo.fd`, `welcome.fd`, `checkout_flow.fd`, `pricing_page.fd`, `userflow_onboarding.fd`, `path_drawing.fd`, `import_namespace.fd`, `shared_library.fd`

### v0.11.206 — Layers Panel Minimizes to 40px Instead of Hiding (R6.6)
- **UX (R6.6)**: Layers panel `.collapsed` now **minimizes to 40px** instead of `width: 0` — the "LAYERS" header stays visible as the click target to re-expand; resize handle stays positioned at the 40px edge (not hidden)
- **CLEANUP (R6.6)**: Removed `#layers-restore` strip (HTML + CSS + JS listener) — header is always visible so the restore strip is redundant
- **SITE + EXTENSION**: Applied to `site/style.css`, `site/index.html`, `site/playground.js`, and `fd-vscode/src/webview-html.ts`

### v0.11.205 — Canonicalize Examples & Playground Keywords (R4.16)
- **EXAMPLES (R4.16)**: `accept:` → `todo:` across 16+ example files (~60 occurrences) — `checkout_flow.fd`, `mobile_app.fd`, `pricing_page.fd`, `userflow_onboarding.fd`, `constraints.fd`, `design_system.fd`, `dark_theme.fd`, `animations.fd`, `landing_page.fd`, `path_drawing.fd`, `edge_types.fd` + 6 benchmark files
- **EXAMPLES (R4.16)**: `border_radius:` → `corner:` in `edge_types.fd`; `background:` → `fill:` and `rounded:` → `corner:` in `benchmarks/design_system.fd`
- **DOCS (R4.16)**: `CHEATSHEET.md` — `anim` → `when`, `accept:` → `todo:`, property aliases table marked as legacy; `README.md` — `anim` → `when`, deprecated alias row updated
- **SITE (R4.16)**: Playground syntax highlighter — removed deprecated `anim`/`note` from keyword matching (only `when`/`spec` highlighted); added `todo:`, `done:`, `tag:`, `role:`, `trait:`, `intent:`, `extends:`, `visible:`, `cursor:` to property highlighting

### v0.11.204 — Code Panel Minimizes to 10% Instead of Hiding (R6.6)
- **UX (R6.6)**: Code panel toggle now **minimizes** to ~10% width instead of collapsing to 0% — the editor header ("● Code ▾") stays visible as the click target to re-expand; eliminates the discoverability problem of the fully-hidden panel
- **UX (R6.6)**: Resize handle stays **visible and draggable** in minimized state — dragging from 10% smoothly expands the panel to any width; handle `pointerdown` auto-uncollapse seeds `--editor-width` from the current 10% position so drag operates on the normal grid template
- **UX (R6.6)**: **Smooth collapse/expand transitions** — CSS Grid now always transitions between px↔px values (no px↔% unit mismatch); collapse animates `--editor-width` to the collapsed px value before applying `.code-collapsed` class; expand animates from collapsed px to saved width
- **UX (R6.6)**: **Width memory** — collapsing (via click or drag) saves the pre-collapse editor width; expanding restores it; drag-to-collapse saves the pre-drag width so the panel returns to its original size
- **CLEANUP (R6.6)**: Removed `#code-restore` vertical tab strip — no longer needed since the panel header is always visible at 10%; deleted ~44 lines of orphaned CSS (`.panel-restore-strip.code-restore` and child selectors), HTML element, and JS click listener
- **SITE**: Changes in `site/style.css` (`.code-collapsed` grid uses `var(--collapsed-width)`), `site/index.html` (removed restore strip), `site/playground.js` (`toggleCodePanel` rewrite, `setupSplitResize` width memory + smooth collapse)

### v0.11.203 — Code Panel Tab Handle (R6.6)
- **UX (R6.6)**: Replaced invisible 12px hover-only strip with a visible **28px vertical Tab Handle** when code panel is collapsed — frosted glass background, rotated `{ } Code` label, 3px purple accent left border, rounded right corners; hover widens to 32px with glow; matches VS Code collapsed sidebar pattern for instant discoverability
- **UX (R6.6)**: Tab Handle hidden on mobile (≤768px) — mobile uses existing `#mobile-code-toggle` toolbar button
- **SITE**: Changes in `site/style.css` (`.panel-restore-strip.code-restore` rewrite), `site/index.html` (`code-tab-label` span)

### v0.11.202 — Prune Deprecated Backward-Compat Code (R4.16)
- **REFACTOR (R4.16)**: Removed `ReadMode::Notes` enum variant — collapsed into `ReadMode::Spec`; `emit_notes_markdown()` wrapper function removed
- **REFACTOR (R4.16)**: Removed dead `label:` property handler from parser — deprecated property now falls through to the standard unknown-property skip
- **REFACTOR (R4.16)**: Removed `"─── Themes ───"` from parser `SECTION_SEPARATORS` — emitter outputs `style`, never `theme`
- **LSP**: Removed `(legacy: theme)` and `(legacy: anim)` labels from code completion items; renamed `extract_note_file_path` → `extract_spec_file_path`
- **CORE**: Cleaned stale "(backward compat)" doc comments across `model.rs`, `tools.rs`, `selection.rs`
- **NOTE**: Parser backward-compat for `note`/`theme`/`anim` keywords intentionally kept — old `.fd` files still need these

### v0.11.201 — Fix Code Toggle Cannot Restore (R6.6)
- **FIX (R6.6)**: Code panel can now be reliably toggled back after collapsing — root cause 1: `transitionend` event never fired when CSS Grid transitioned between incompatible units (`0px` ↔ `3fr`), so `window.dispatchEvent(new Event('resize'))` never ran and the canvas didn't resize to the restored layout; fix: added 300ms fallback `setTimeout` that dispatches resize if `transitionend` doesn't fire (cleans up properly if it does)
- **FIX (R6.6)**: Code-restore strip hit area enlarged — widened from 8px to 12px visible width with a 24px `::after` pseudo-element hit area for reliable clicking; `z-index` increased from 18 to 20 to ensure the strip is not obscured by canvas overlays; hover glow enhanced with `box-shadow`
- **SITE**: Changes in `site/playground.js` (`toggleCodePanel` fallback), `site/style.css` (`.panel-restore-strip.code-restore` hit area)

### v0.11.200 — Keyword Improvements: Style Extends, Alias Pruning, Emission Unification (R1.22, R4.16, R4.18)
- **FEATURE (R1.22)**: Style inheritance — `extends: <parent>` inside `style` blocks; child style inherits all parent properties, child properties override; `apply_style_with_extends()` walks extends chain with max depth 8 cycle protection; works with `use:` resolution and edge styles
- **FORMAT (R4.16)**: Pruned `rounded:` and `radius:` aliases — `corner:` is now the sole keyword for corner radius in both node and style property parsers; deprecated aliases silently ignored
- **FORMAT (R4.16)**: Unified `pad:` emission — emitter now outputs `pad:` canonically instead of `padding:` for Free-layout frames; parser still accepts both `pad:` and `padding:` for backward compatibility
- **FORMAT (R4.18)**: Deprecated `anim` keyword documented — `when` is the canonical animation keyword; `anim` still accepted by parser but `when` is emitted
- **LSP**: Removed deprecated spec sub-keywords (`accept:`, `status:`, `priority:`, `tag:`) from code completions and hover documentation; `spec` block snippet simplified to description-only
- **DOCS**: Updated SKILL.md (extends syntax, `when` keyword, removed deprecated spec examples), REQUIREMENTS.md (R1.22 style extends, R1.23 component instantiation planned, R4.16 updated)
- **TESTS**: 3 new tests — `parse_style_extends`, `roundtrip_style_extends`, `parse_style_extends_with_override`; updated `roundtrip_padding_canonical` for `pad:` emission

### v0.11.199 — Canvas-Core Migration + Inline Edit Extraction (R6.12)
- **BUILD (R6.12)**: VS Code webview build script (`build-webview.mjs`) now injects 6 canvas-core shared modules (state, render, clipboard, viewport, shortcuts, inline-edit) before extension-specific modules — establishes single source of truth for shared logic
- **CANVAS**: Created `site/canvas-core/inline-edit.js` — shared inline text editor with double-click handling, textarea overlay, live sync, Enter/Escape, edge label editing; usable by both site playground and VS Code extension

### v0.11.198 — Vision Pillars + Site Refresh
- **DOCS**: Defined 4 vision pillars in `REQUIREMENTS.md` and `README.md`: Design as Code, AI-Native Format, Living Components, Prompt as You Draw
- **SITE**: Replaced 6 generic feature cards with 4 pillar-aligned cards on `fast-draft.com`
- **SITE**: Fixed stale `note` → `spec` reference and `~5×` → `~6×` token ratio in Two Modes section
- **REPO**: Merged 3 PRs (#697 XSS fix, #698 ARIA labels, #684 import examples); closed 7 stale/duplicate PRs

### v0.11.197 — Canvas UI Bug Fixes (R3.3, R3.7)
- **FIX (R3.3)**: Frame tool (F+drag) now creates `NodeKind::Frame` instead of `NodeKind::Rect` — added `frame_mode` field to `RectTool` that switches between Frame/Rect creation with appropriate defaults (clip, layout, fill)
- **FIX (R3.7)**: Resize handle hit radius increased from 8→12px (mouse), 12→14px (pen) and visual size from 7→8px (mouse), 9→10px (pen) — reduces accidental shape creation when intending to resize
- **TESTS**: 2 new tool tests: `frame_tool_creates_frame_node`, `rect_tool_without_frame_mode_creates_rect`

### v0.11.196 — Style Spec Extension + When Templates + format_num Precision (R1.9, R1.15)
- **FORMAT (R1.9)**: Style blocks now support spec metadata — `role:`, `trait:`, `intent:` keywords inside `style name { }` blocks are parsed into `style_specs: HashMap<NodeId, Spec>` on SceneGraph and emitted round-trip
- **FORMAT (R1.9)**: `resolve_spec()` method on SceneGraph — merges spec from `use:` referenced styles into a node's inline spec; style specs provide defaults, inline overrides take precedence; `merge_spec_values()` utility for Spec merging
- **FORMAT (R1.15)**: Reusable `when` templates — top-level `when name { scale: 1.05; ease: spring 300ms }` blocks are parsed/emitted/round-tripped via `when_templates: HashMap<NodeId, WhenTemplate>` on SceneGraph
- **FORMAT (R1.15)**: `use:` inside `when :trigger { }` blocks — `use_template: Option<NodeId>` field on `AnimKeyframe` lets animations reference named `when` templates for DRY animation definitions
- **FIX**: `format_num` precision increased from 1 to 3 decimal places — fixes roundtrip loss for values like `1.05` (was emitted as `1`, now as `1.05`); values like `128.57` are now preserved instead of being rounded to `128.6`
- **TESTS**: 4 new roundtrip tests: `roundtrip_style_with_spec`, `use_merges_spec_from_style`, `roundtrip_when_template`, `when_use_template`

### v0.11.195 — Typed Spec Struct + New Canvas Keywords (R1.9)
- **FORMAT (R1.9)**: `spec` blocks now parse `role:`, `trait:`, `intent:` keyword fields into a typed `Spec` struct with `role: Option<String>`, `traits: Vec<String>`, `intent: Option<String>`, `description: Option<String>` — AI agents can read and write structured metadata without regex
- **FORMAT (R1.9)**: Emitter outputs typed fields first (`role:`, `trait:`, `intent:`) followed by blank line separator and free-form markdown description — clean canonical output
- **FORMAT (R1.9)**: Backward-compatible with legacy `spec { "quoted text" }` and `note { ... }` formats — quoted strings inside block-form specs are auto-unquoted on parse
- **FORMAT (R1.9)**: `Spec::contains()` helper method for test assertions; `Spec::display_text()` for rendering typed fields + description as one text block
- **FORMAT**: New canvas keywords: `visible: true|false` (visibility toggle), `cursor: <name>` (CSS cursor hint), `rotate: <degrees>` (static rotation) — parse + emit + roundtrip in `Properties`
- **INTERNAL**: Updated all downstream crates (`fd-wasm/notes.rs`, `fd-wasm/code_intel.rs`, `fd-editor/sync.rs`) to use typed `Option<Spec>` instead of `Option<String>`
- **TESTS**: 4 new roundtrip tests: `roundtrip_spec_role_trait_intent`, `roundtrip_spec_with_description`, `roundtrip_visible_cursor_rotate`, `roundtrip_spec_backward_compat_quoted`

### v0.11.194 — Fix WASM Loading Hang on Edge/Windows (R6.5, R6.9)
- **FIX (R6.9)**: WASM loading no longer hangs forever on Edge/Windows — root cause: Cloudflare strips `Content-Length` header when compressing WASM responses (brotli/gzip); fallback path re-fetched the WASM binary via `wasm.default(url)` instead of consuming the already-fetched `Response`, causing body-locking stalls on some Edge/Chromium builds; fix: fallback path now calls `wasmResponse.arrayBuffer()` to consume the in-flight response, eliminating the double-fetch entirely
- **FIX (R6.5)**: 30-second WASM loading timeout — `raceWithTimeout()` helper wraps the fetch, body-read, and instantiation stages in `Promise.race` with a 30s deadline; on timeout, shows "Loading timed out" error with actionable ↻ Retry button instead of infinite spinner
- **FIX (R6.5)**: HTTP status check — WASM fetch now throws on non-ok HTTP responses (e.g., 404, 502) with status code in error message
- **DIAG (R6.9)**: Console breadcrumbs — `[FD]` prefixed log messages at each loading stage (fetch start, fetch complete with timing, binary size, instantiation, canvas creation, ready with total time) for instant diagnosis of future loading issues
- **SITE**: Changes in `site/playground.js`

### v0.11.193 — Toolbar Redesign: Remove Segment-Pill + Code-Restore Strip (R6.6)
- **UX (R6.6)**: Removed redundant `Code | Design` segmented pill from canvas toolbar — Code toggle now lives exclusively in the code panel header (editor-header click + chevron); Design segment was always active with no function; single source of truth for code panel visibility
- **UX (R6.6)**: Code-restore strip — when code panel is collapsed, an 8px clickable vertical strip appears at the left edge of the playground (reuses `panel-restore-strip` pattern from Layers/Props panels); hover shows accent highlight; click toggles code panel back open
- **UX (R6.6)**: Layers toggle moved to far-left of canvas toolbar — first button in `tb-left` zone for immediate discoverability; previously positioned after the segment-pill
- **CLEANUP (R6.6)**: Removed ~45 lines of orphaned `.segment-pill`, `.segment-btn`, `.seg-dot` CSS; removed `seg-code` sync logic from `toggleCodePanel()` in JS; cleaned mobile media query `.segment-pill { display: none }` rule

### v0.11.192 — Desktop IPC Integration Tests (R6.2)
- **TESTING (R6.2)**: 12 integration tests for all 5 Tauri IPC commands (`open_file`, `save_file`, `get_recent_files`, `add_recent_file`, `get_current_file`) — covers file I/O, state updates, dedup, cap-at-10, name extraction, and open-save roundtrip; uses `tempfile` crate for isolated temp directories
- **REFACTOR (R6.2)**: Extracted `_inner` functions from `#[tauri::command]` wrappers — testable without Tauri runtime; `State<AppState>` → `&AppState` for direct testing

### v0.11.191 — Desktop Auto-Update (R6.2)
- **FEATURE (R6.2)**: Auto-update via `tauri-plugin-updater` — checks for updates 10s after launch, shows non-intrusive toast ("Fast Draft vX.Y.Z available · [Update Now]"), downloads + installs in-place, then relaunches
- **FEATURE (R6.2)**: Dual update endpoints — primary: `https://fast-draft.com/api/update/` (Cloudflare CDN, 300+ PoPs, 5min edge cache); fallback: GitHub Releases `latest.json`
- **FEATURE**: Cloudflare Pages Function at `/api/update/` — proxies `latest.json` from GitHub Releases with 5min caching, returns `204 No Content` on errors for graceful degradation
- **CI**: Release pipeline now signs update bundles with `TAURI_SIGNING_PRIVATE_KEY` and generates `latest.json` automatically via `tauri-action`

### v0.11.190 — Fix Desktop Build Pipeline (R6.2)
- **FIX (R6.2)**: `tauri.conf.json` `frontendDist` path was `../../../site` (resolved outside repo root); corrected to `../../site`
- **FIX (R6.2)**: Removed `GITHUB_TOKEN` from `tauri-action@v0` env in `release.yml` and `desktop.yml` — prevents tauri-action from creating a duplicate GitHub Release that conflicts with the dedicated `release` job
- **FIX (R6.2)**: Added explicit `--target` for Linux (`x86_64-unknown-linux-gnu`) and Windows (`x86_64-pc-windows-msvc`) builds — ensures consistent output directory structure across all platforms
- **FIX (R6.2)**: Updated artifact upload paths from `target/release/bundle/` to `target/**/release/bundle/` — matches Tauri's per-target output directory when `--target` is specified

### v0.11.189 — Desktop App (Tauri v2) (R6.2)
- **FEATURE (R6.2)**: Desktop app via Tauri v2 — wraps the existing web playground in a native macOS/Windows/Linux window. All canvas tools, AI Touch, Layers panel, and bidi sync work immediately with zero new rendering code
- **FEATURE**: Native file I/O — ⌘O (Open), ⌘S (Save), ⌘⇧S (Save As) via native file dialogs with `.fd` file filter. Recent files list (max 10) persisted in app data directory
- **FEATURE**: Window title shows current filename (`filename.fd — Fast Draft`)
- **CI**: `desktop.yml` workflow — builds Tauri binaries for macOS (arm64 + x86), Windows (x64), Linux (x64) via `tauri-apps/tauri-action`. Triggered on manual dispatch and version tags

### v0.11.188 — Streaming Responses + VS Code Extension Chat Parity (R4.26)
- **FEATURE (R4.26)**: SSE Streaming — AI Chat responses now stream token-by-token via Server-Sent Events, showing real-time text as the AI generates it. When streaming completes, the full message is finalized with markdown rendering and Apply/Skip buttons for FD code blocks
- **FEATURE (R4.26)**: VS Code Extension Chat Parity — ported the full AI Agent chat panel to the VS Code extension with matching CSS, HTML, toolbar button (✦ Agent), selection context badge, quick-action chips, and smart replace. Calls the production `https://fast-draft.com/api/ai` endpoint
- **API**: `/api/ai` now accepts `stream: true` in chat mode, returning `text/event-stream` with Cloudflare Workers AI streaming. Non-streaming requests and non-chat modes continue to return full JSON as before

### v0.11.187 — AI Chat: Selection Context + Chips + Smart Replace (R4.26)
- **FEATURE (R4.26)**: Selection Context Injection — AI Agent chat automatically includes the currently selected nodes' FD code in the system prompt, enabling context-aware responses when users say "this" or "these". A context badge above the input shows what's selected (e.g., `📌 @login_form`)
- **FEATURE (R4.26)**: Quick-Action Chips — three contextual one-tap action buttons appear above the chat input, adapting to selection state: no selection (improve colors / add header / review design), single node (restyle / rename / add hover), multi-node (group / align / add edges)
- **FEATURE (R4.26)**: Smart Replace — when applying AI-generated FD code blocks, the "Apply" button now finds matching `@id` blocks in the document and replaces them in-place (surgical splice) instead of appending. Falls back to append for new nodes. Uses brace-depth tracking for accurate block boundary detection
- **UX**: Added clear chat button (🗑) in the panel header, `fd-selection-changed` custom event for real-time badge/chip updates, and exclusive panel behavior (opening chat closes specs panel)

### v0.11.186 — Canvas→Layers Cross-Drag + Searchable Parent Picker (R3.64)
- **FEATURE (R3.64)**: Canvas→Layers cross-drag — drag a selected node from the canvas into the Layers panel to reparent/reorder; pointer events detect when cursor enters the Layers panel and show the same `drag-over-nest`/`above`/`below` indicators as Layers→Layers drag
- **FEATURE (R3.64)**: Ghost preview label — while dragging over the Layers panel, a floating `@node_name` badge follows the cursor to indicate which node is being moved
- **FEATURE (R3.64)**: Searchable "Move Into" picker — right-click → "Move Into…" now opens a filterable popover with all valid containers; replaces the old static 15-item submenu, supports instant search by node ID
- **PARITY**: All features implemented in both site (`playground.js`) and VS Code extension (`pointer.js`, `panels.js`)

### v0.11.185 — Refactor `note` → `spec` Keyword (R4.18)
- **RENAME (R4.18)**: `note` keyword → `spec` — annotation blocks now use the more precise term `spec` (specification) which better reflects structured metadata for AI agents; emitter outputs `spec` keyword; parser accepts both `spec` (primary) and `note` (legacy alias) for backward compatibility
- **RENAME (R4.18)**: `ReadMode::Notes` → `ReadMode::Spec` (Notes kept as backward-compat alias); `emit_notes_markdown` → `emit_spec_markdown` (old function kept as alias)
- **RENAME (R4.18)**: `GraphMutation::SetNote` → `SetSpec`; `SceneNode.note` → `SceneNode.spec`; `Edge.note` → `Edge.spec`
- **WASM**: `get_note` → `get_spec`, `set_note` → `set_spec`, `get_all_notes` → `get_all_specs`; JSON key `"note"` → `"spec"` in `get_all_specs` output
- **UI**: "Notes Panel" → "Specs Panel" across site playground (`playground.js`, `index.html`, `style.css`) and VS Code extension (`webview-html.ts`, `extension.ts`, `main.js`, `panels.js`, `context-menu.js`, `drag-drop.js`); all CSS classes `notes-*` → `specs-*`; view mode `"notes"` → `"specs"`
- **DOCS**: README "Built-In Notes" → "Built-In Specs"; demo.fd examples updated to `spec` keyword
- **TESTING**: All 200+ tests pass; no breaking changes for `.fd` files using legacy `note` keyword

### v0.11.184 — Reparent Interaction Redesign (R3.64)
- **BREAKING (R3.64)**: Removed ⌘+drag reparenting from canvas — previously holding Cmd/Ctrl during drag would reparent into overlapping containers, which was prone to accidental activation; removed from both site (`playground.js`) and VS Code extension (`pointer.js`)
- **FEATURE (R3.64)**: Post-drop context menu — after moving a node (plain drag, no modifiers) that overlaps a container, a context menu appears offering "Nest into @target" (preserve position) and "Center in @target" (CenterIn constraint); explicit user confirmation prevents accidental reparenting
- **FEATURE (R3.64)**: Layers→Canvas cross-drag — dragging a layer item from the Layers panel and dropping it on the canvas reparents the node to root and sets its position to the drop point; uses `set_node_position()` WASM API
- **UX (R3.64)**: ⌘+Hand tool is now pure select/move — with ⌘+drag reparent removed, holding Cmd on the Hand tool cleanly switches to Select tool for click/drag without reparent side effects
- **WASM**: New `get_node_kind(id)` API — returns the kind name of a node ("rect", "ellipse", etc.); new `get_parent_id(id)` API — returns the parent node ID or empty string for root-level nodes; new `set_node_position(id, x, y)` API — sets absolute position constraint
- **CLEANUP**: Removed `#reparent-overlay` from `index.html` and its CSS from `style.css`; removed ⌘+drag→Reparent rows from `SHORTCUTS.md` modifier tables
- **PARITY**: All changes applied to both site (`playground.js`, `index.html`, `style.css`) and VS Code extension (`pointer.js`, `main.js`)

### v0.11.183 — Shared Canvas-Core Module (R6.12 Phase 2)

- **NEW** `site/canvas-core/state.js` (170 lines) — shared zoom/pan state, dirty flags, grid, reduce-motion, tool defaults, `screenToScene`, `pointerTypeToU8`, `showToast`
- **NEW** `site/canvas-core/render.js` (304 lines) — tween engine, detach animation, grid drawing, dirty-flag render loop, `fitToContent`, `getSceneBounds`, `zoomAtPoint`, `zoomToCenter`
- **NEW** `site/canvas-core/clipboard.js` (96 lines) — `extractNodeBlock`, `buildPasteIdMap`, `applyIdRenames`, `collectDeclaredIds`
- **NEW** `site/canvas-core/viewport.js` (120 lines) — `getResizeHandleCursor`, `pinchDistance/Center`, `nudgeSelected`
- **NEW** `site/canvas-core/shortcuts.js` (140 lines) — `TOOL_SHORTCUTS`, `TOOL_CYCLE`, `DOUBLE_PRESS_MS`, `buildShortcutHelpHtml`
- `playground.js` imports all 5 canvas-core modules (verified: no console errors, selection functional)

### v0.11.182 — HTML Export + Cleanup (R3.56)
- **FEATURE (R3.56)**: HTML+CSS export — `export_html(graph)` generates standalone responsive HTML page from FD scene; Rect/Frame → `<div>`, Ellipse → `<div>` with `border-radius: 50%`, Text → `<p>` with font styles, Path → inline `<svg>`, Group → wrapper `<div>`; supports fills (solid + gradient), strokes, corner-radius, opacity, shadow, text alignment/valign, and hover/press animations as CSS transitions; Google Fonts auto-linked; 15 unit tests
- **WASM**: `export_html()` method on `FdCanvas` — exports current selection (or full canvas) as HTML; wired in `fd-wasm/src/export.rs`
- **UI**: "Download HTML" button (🌐) added to Settings menu in site playground — downloads `fast-draft-export.html` file
- **FIX**: Removed stale `console.warn("[FD DIAG]")` spatial-index diagnostic from `hit_test` in `lib.rs`
- **DOCS**: Updated README "Built-In Specs" section to "Built-In Notes" with current `note`/`todo:` syntax

### v0.11.181 — Unified Context Menu System (R6.6)
- **REFACTOR (R6.6)**: Ported unified `ContextMenu` class from site playground to VS Code extension — singleton, data-driven context menu with robust dismissal (`AbortController` + capture-phase click/keydown/contextmenu), ARIA roles, keyboard navigation (↑↓ + Enter), viewport clamping, open/close animation via CSS transitions; replaces 3 separate implementations (canvas context menu, layers context menu, static HTML)
- **REFACTOR (R6.6)**: `setupContextMenu()` replaced — was ~325 lines of manual `document.getElementById` per-item wiring; now 30 lines building item arrays via `buildNodeMenuItems()` + `ctxMenu.open()`; all 15+ actions preserved including AI Touch custom submenu and annotation handling
- **REFACTOR (R6.6)**: `wireLayerContextMenu()` replaced — was ~215 lines of HTML string building + per-action click handlers; now uses same `ctxMenu.open()` with data-driven items; all 17 layer actions preserved (rename, clipboard, structure, z-order, lock, select-children, move-into, center-into, delete)
- **REFACTOR (R6.6)**: `closeLayerCtxMenu()` and `closeContextMenu()` now delegate to `ctxMenu.close()` — single close path with guaranteed cleanup via `AbortController.abort()`
- **FIX (R6.6)**: Escape key, outside click, and Code Mode click now correctly dismiss both canvas and layers context menus — `shortcuts.js` Escape handler uses `ctxMenu.isOpen` instead of querying removed static DOM elements
- **CLEANUP**: Removed 32 lines of static `#context-menu` HTML, 55 lines of `.layer-ctx-*` CSS, 68 lines of `#context-menu` CSS (replaced with 83 lines of unified `.ctx-menu` CSS), 51 lines of dead AI Touch inline script
- **EXTENSION**: Changes in `context-menu.js`, `panels.js`, `shortcuts.js`, `webview-html.ts`

### v0.11.180 — Code Highlight Flash + Context Menu Fix (R6.6)
- **UX (R6.6)**: Code highlight now flashes briefly when selecting a node — CSS `@keyframes fd-highlight-flash` fades the yellow highlight over 1.2s; stale CodeMirror decorations auto-cleaned after 1.4s; previously the highlight was permanent
- **UX (R6.6)**: Multi-selection no longer highlights code — selecting 2+ nodes skips the CodeMirror highlight entirely, eliminating visual noise from large yellow blocks spanning many lines
- **FIX (R6.6)**: Layer context menu now closes on outside click — changed close listener from `click` to `pointerdown`, which fires before `stopPropagation` handlers on layer items; previously clicking inside layers panel (but outside menu) didn't dismiss it
- **SITE**: Changes in `site/style.css` (CSS animation keyframes), `site/playground.js` (multi-select guard, auto-clear timer, pointerdown listener)

### v0.11.179 — Text Node Edge Case Fixes (R3.48, R2.1)
- **FIX (R3.48)**: `RemoveNode` now cascade-deletes all descendants — previously `petgraph::remove_node` disconnected children but left them as unreachable islands with stale `id_index` entries; deleting a rect with a text child (e.g. a button label) no longer orphans the text node
- **FIX (R2.1)**: `clone_node_recursive` now deep-copies children of `Rect` and `Ellipse` (was `Group`/`Frame` only) — `⌘D` on a button-with-label no longer drops the text child
- **FIX (R2.1)**: Parser enforces text/path as leaf-only — nested node definitions inside `text` or `path` blocks are silently consumed and discarded; prevents invalid text-in-text graph structures from `.fd` source
- **TESTING**: 3 new tests — `sync_delete_rect_with_text_child`, `sync_delete_group_with_nested_children`, `parse_text_ignores_nested_nodes`
- **CORE**: Changes in `sync.rs` (cascade-delete), `selection.rs` (clone container match), `parser.rs` (text/path child guard)

### v0.11.178 — Fix Extension Toolbar Layout (R6.6)
- **FIX (R6.6)**: Export, Fullscreen, and Settings buttons in VS Code extension toolbar now align to the far right — added `.tb-spacer` flex element between left zone (AI Touch, Renamify) and right zone (Notes, Status, Fullscreen, Settings); matches the web playground's spacer pattern
- **EXTENSION**: Changes in `fd-vscode/src/webview-html.ts` (CSS rule + HTML spacer element)

### v0.11.177 — Segmented Code/Design Toggle (R6.6)
- **UX (R6.6)**: Replaced separate `<> Code` button + `● DESIGN` label in canvas toolbar with a unified **segmented pill control** (Apple HIG style) — two segments "Code" and "Design" in a rounded pill; Code segment toggles code panel visibility (active = visible, dimmed = collapsed); Design segment always active with green dot indicator
- **UX (R6.6)**: Segmented control uses `--fd-segment-*` CSS tokens — active segment gets elevated white/glass background with shadow, inactive is transparent; smooth 200ms transition on toggle
- **MOBILE**: Segmented pill hidden at ≤768px — mobile uses existing `#mobile-code-toggle` button; no behavior change on mobile
- **CLEANUP**: Removed orphaned `.canvas-label`, `.canvas-dot`, `#code-toggle-btn` CSS rules
- **SITE**: Changes in `site/index.html`, `site/style.css`, `site/playground.js`

### v0.11.176 — Merge Zen Mode into Fullscreen (R6.6)
- **UX (R6.6)**: Zen Mode and Fullscreen Mode merged into a single **Fullscreen** mode — entering fullscreen now both expands the playground to fill the viewport AND hides canvas chrome (toolbar, editor, minimap, panels); `⇧F` to enter, `Escape` to exit; `zenMode` state variable removed
- **UX (R6.6)**: Fullscreen toggle button moved inside the canvas — positioned at top-right corner as a 32×32 frosted-glass pill (`⛶`); expands to `✕ Exit` pill in fullscreen mode; replaces both the old outer `⛶ Full Screen` button and the 🧘 Zen toggle
- **UX (R6.6)**: 4-finger tap gesture now toggles Fullscreen (was Zen); `L` key toggles Layers panel in fullscreen (was zen-visible, now fs-visible)
- **CSS**: Replaced `.zen-mode` selectors with `.fullscreen-mode`; renamed `.zen-full-only` → `.fs-hide`; renamed `.zen-toggle-canvas` → `.fullscreen-toggle-canvas`; removed old `.playground-fs-btn` styles
- **PARITY**: All changes applied to VS Code extension (`webview-html.ts`, `navigation.js`, `pointer.js`, `shortcuts.js`, `main.js`) — removed `setupZenModeToggle()`/`applyZenMode()`, updated `applyFullscreenMode()` to clear `fs-visible` overrides
- **DOCS**: `SHORTCUTS.md` — Zen Mode section removed, merged into Full Screen section; `shortcuts.html` — same; 4-finger tap gesture updated

### v0.11.175 — Hand Tool UX: ⌘+Click Deselect + Modifier Cursor Persistence (R3.6)
- **FIX (R3.6)**: Hand tool plain click no longer deselects — only ⌘+click on empty space deselects (via WASM SelectTool fallthrough); reverts the over-eager plain-click deselect from v0.11.173 while keeping ⌘+click working correctly
- **UX (R3.6)**: Modifier cursor icons (⌘ → select, Alt → copy) now persist after clicks and drags when the modifier key is still held — previously, pointer-up would reset cursor to `grab` even if user was holding ⌘ or Alt
- **SITE**: Changes in `site/playground.js` (pointer-up pan block + restore block)
- **PARITY**: Changes in `fd-vscode/webview/src/pointer.js` (same two fixes)

### v0.11.174 — Escape Key Deselects All (R3.6)
- **UX (R3.6)**: Escape key now deselects all selected nodes when no other UI layer is open — layered dismissal order: context menu → annotation card → shortcut help → fullscreen/zen mode → locked tool → **deselect** (one action per press, matches Figma)
- **SITE**: Layered Escape handler in `site/playground.js`
- **PARITY**: Layered Escape handler in `fd-vscode/webview/src/shortcuts.js` (replaces old non-layered handler that closed everything at once); duplicate Escape tool-unlock condition removed

### v0.11.173 — Hand Tool Click-to-Deselect (R3.6)
- **FIX (R3.6)**: Hand tool click on empty canvas space now deselects all selected nodes — previously the Hand tool always entered pan mode on pointer-down and returned early, never calling selection logic; fix: on pointer-up, if the pointer moved < 5px from its start position (a click, not a drag), calls `select_by_id('')` to clear selection; matches Figma's Hand tool behavior
- **SITE**: Changes in `site/playground.js` (hand pan start tracking + deselect on click)
- **PARITY**: Changes in `fd-vscode/webview/src/pointer.js` + `state.js` (same fix)

### v0.11.172 — Fix ⌘+Drag Reparent Overlay Position (R3.64)
- **FIX (R3.64)**: ⌘+drag reparent dashed border overlay now appears around the target parent node instead of at the top-right of the canvas — root cause: `playground.js` calculated overlay position using `canvas-wrapper.getBoundingClientRect()` subtraction + `canvas.offsetLeft` which double-counted the layers panel offset; `pointer.js` (VS Code) used raw scene-to-screen coordinates without accounting for the canvas position within its parent container; fix: both files now use `canvas.offsetLeft + sx` / `canvas.offsetTop + sy` relative to the `#canvas-content` parent (same pattern used by `#dimension-tooltip`)
- **SITE**: Changes in `site/playground.js` (line 5035-5036)
- **PARITY**: Changes in `fd-vscode/webview/src/pointer.js` (line 274-275)

### v0.11.171 — Code Panel Toggle + Fullscreen Auto-Collapse (R6.6)
- **UX (R6.6)**: Code toggle toolbar button — `<> Code` button in canvas toolbar (next to Layers) toggles code panel visibility; dimmed when collapsed, full opacity when expanded; matches Layers toggle `tool-btn` pattern with `<>` SVG icon
- **UX (R6.6)**: Code panel collapse — smooth Figma-style collapse via `overflow: hidden` + CSS Grid transition; content clips as column shrinks to 0; `transitionend` event triggers precise canvas resize
- **UX (R6.6)**: Fullscreen auto-collapse — entering fullscreen mode (`⇧F`) automatically collapses the code panel; toolbar button stays visible for one-click re-expansion
- **SITE**: Changes in `site/index.html` (toolbar Code button), `site/style.css` (`#code-toggle-btn` + `.code-hidden`), `site/playground.js` (`toggleCodePanel()` syncs button state)

### v0.11.170 — Panel Toggle, Resize & Exclusive Policy (R6.7)
- **UX (R6.7)**: Desktop Layers toggle — new `☰` button in canvas toolbar toggles Layers panel collapsed/expanded at all viewports (previously toggle only available on mobile); button dims when panel is collapsed
- **UX (R6.7)**: `\` keyboard shortcut — pressing backslash toggles the Layers panel collapsed/expanded (no modifiers, not active in text inputs); matches Figma `\` shortcut convention
- **UX (R6.7)**: Notes panel resize — left-edge drag handle on Notes panel enables resizing between 180–500px; double-click to reset to default 260px; width persists in `localStorage` (`fd-notes-width`); CSS variable `--notes-width` enables dynamic sizing
- **UX (R6.7)**: Exclusive right-side panels — opening Notes auto-closes AI Chat and vice versa; prevents confusing panel overlap on the right side; state synced via `window._notesPanelOpen` for cross-module coordination between `playground.js` and `ai-chat.js`
- **SITE**: Changes in `site/index.html`, `site/style.css`, `site/playground.js`, `site/ai-chat.js`

### v0.11.169 — AI Agent Mode: MCP Server + Multi-Turn Chat (R2.15, R2.16)
- **FEAT (R2.15)**: MCP Server for FD files — new `fd-mcp/` package exposes 7 MCP tools (`fd_read_document`, `fd_list_nodes`, `fd_create_node`, `fd_update_node`, `fd_delete_node`, `fd_rename_node`, `fd_get_score`) and 1 resource (`fd://active-document`) via stdio transport; registered in VS Code extension `package.json` under `contributes.mcpServers`; enables AI agents (Claude, Cursor, Copilot) to natively read/modify `.fd` files
- **FEAT (R2.16)**: Multi-Turn AI Chat — new `mode: 'chat'` in `/api/ai` Cloudflare endpoint supports conversation history (up to 10 messages) with full document context injection; frosted glass slide-in chat panel on site with message bubbles, per-block accept/reject for FD code changes, and `ai-chat.js` module; toolbar button `✦ Agent` added
- **SITE**: New `ai-chat.js` module (195 lines), HTML panel in `index.html`, CSS styles in `style.css` (240 lines)
- **MCP**: `fd-mcp/src/server.ts` (601 lines), `package.json`, `tsconfig.json`

### v0.11.167 — Fix ⌘ Key Shows Duplicate Icon on Hand Tool (R3.70)
- **FIX (R3.70)**: Holding ⌘ on Hand tool now shows default/pointer cursor (select preview) instead of copy/duplicate cursor — root cause: `playground.js` added `modifier-alt` CSS class (which maps to `cursor: copy`) when Cmd was pressed on Hand tool; should have used a select-preview cursor since ⌘+Hand = temp Select, not duplicate; fix: new `modifier-cmd-select` CSS class with `cursor: default` used instead; all class removal calls updated to include the new class
- **SITE**: Changes in `site/playground.js` (4 locations), `site/style.css` (new `#fd-canvas.modifier-cmd-select` rule)

### v0.11.166 — Fix ⌘+Drag Reparent (R3.64)
- **FIX (R3.64)**: ⌘+drag reparent now works correctly — root cause: `hit_test_at()` returned the dragged node itself (topmost at pointer position), so the `hitId !== selectedId` check always failed; new `hit_test_at_excluding(x, y, excludeId)` WASM API performs hit testing while skipping the dragged node and its descendants, revealing the container underneath
- **CORE**: New `hit_test_excluding()` function in `fd-render/src/hit.rs` — recursive traversal that skips all nodes in an excluded `HashSet<NodeIndex>`; new `hit_test_at_excluding()` WASM API in `fd-wasm/src/props.rs` collects dragged node + all descendants into exclusion set
- **UX (R3.64)**: Visual feedback during ⌘+drag — dashed blue overlay highlights the target container with "Nest into @id" label; overlay tracks pointer position in real-time during pointermove; hidden on pointer release
- **PARITY**: ⌘+drag reparent + visual feedback ported to VS Code extension (`fd-vscode/webview/src/pointer.js`)
- **TESTING**: New `hit_test_excluding_skips_dragged_node` regression test — verifies excluding @child reveals @container underneath; verifies excluding both returns None

### v0.11.165 — Mobile Canvas Polish (R6.7, R6.6)
- **FIX (R6.7)**: Auto-fit content on mobile resize — `fitToContent()` now fires via debounced ResizeObserver (200ms) on ≤768px viewports, ensuring scene content is always centered and scaled to fit the canvas after layout changes; previously `fitToContent` only ran once at init (100ms timeout), which was too early for mobile CSS layout to settle
- **UX (R6.6)**: Canvas-first mobile layout — code editor is hidden by default at ≤768px; new "{ } Code" toggle button in toolbar opens the editor as a full-screen overlay; "✕" close button in editor header dismisses back to canvas; auto-closes when viewport grows past 768px
- **UX (R6.6)**: Compact toolbar at ≤768px — hide text labels on non-essential items (AI Touch, Renamify, Notes, Share, Fullscreen, Status); reduce toolbar height from 42px to 36px; smaller font/padding on remaining buttons
- **UX (R6.6)**: Floating scroll toolbar rescaled to 82% at ≤768px with reduced bottom offset (4px), preventing clipping on small canvas areas
- **FIX (R6.7)**: Orientation change handler — `orientationchange` event fires `resizeCanvas()` + `fitToContent()` after 300ms delay (iOS layout settle time)
- **SITE**: Changes in `site/style.css`, `site/index.html`, `site/playground.js`

### v0.11.164 — Responsive Canvas Fix + Mobile Layers Drawer (R6.7)
- **FIX (R6.7)**: Canvas no longer has 180px dead space at ≤768px viewport — root cause: `#layers-panel` was hidden via `display: none !important` but `--layers-width` CSS custom property was never reset to `0px`, so `#fd-canvas` still used `left: var(--layers-width, 180px)` and `width: calc(100% - 180px - ...)` even though the panel was invisible; fix: added `#canvas-wrapper { --layers-width: 0px; --props-width: 0px; }` to the ≤768px media query
- **FEATURE (R6.7)**: Layers panel accessible on mobile as slide-in drawer — instead of `display: none`, the layers panel is now positioned as an absolute overlay that slides in from the left with a smooth 250ms transition; "☰ Layers" toggle button in the canvas toolbar (tb-right zone) opens/closes the drawer; frosted glass backdrop (click to dismiss); drawer auto-closes when viewport grows past 768px via `matchMedia` listener
- **CSS**: New `#mobile-layers-toggle` button styles (hidden on desktop, inline-flex at ≤768px), `#mobile-layers-backdrop` overlay, `#layers-panel.mobile-open` transform state
- **SITE**: Changes in `site/style.css`, `site/index.html`, `site/playground.js`

### v0.11.163 — Layers Context Menu Parity (R3.69)
- **FEATURE (R3.69)**: Layers context menu expanded from 7 to 15 items — now matches canvas context menu; new items: Rename (triggers inline edit), Cut (⌘X), Copy as PNG (⌘⇧C), Group (⌘G), Ungroup (⇧⌘G), Frame Selection, Bring to Front (⌘⇧]), Send to Back (⌘⇧[), Lock/Unlock (dynamic icon), Select Children (containers only)
- **UX (R3.69)**: Keyboard shortcut hints — all context menu items show their keyboard shortcut right-aligned in muted style (e.g. `⌘X`, `⌘D`, `⌫`); Group/Ungroup dynamically disabled when not applicable
- **UX (R3.69)**: Contextual Select Children — appears only for container nodes (rect/ellipse/frame/group) with children; selects all direct children via `select_multiple_by_ids()`
- **CSS**: New `.layer-ctx-shortcut` (right-aligned muted shortcut hints), `.layer-ctx-disabled` (grayed-out + pointer-events none); increased context menu `max-height` from 240px to 400px and `min-width` from 150px to 180px
- **PARITY**: All changes applied to both site (`playground.js`, `style.css`) and VS Code extension (`panels.js`, `webview-html.ts`)

### v0.11.162 — Opt-in Center-in-Parent Reparent (R3.72)
- **FEATURE (R3.72)**: Alt+drop in Layers panel → center child in parent — holding Alt/Option while dropping a node onto a container in the Layers panel uses `CenterIn` constraint instead of preserving visual position; default (no modifier) behavior unchanged
- **FEATURE (R3.72)**: "Center in @target" context menu items — right-click a layer item → "Move Into" sub-menu now shows both "Move into @target" (preserve position) and "⊙ Center in @target" (center) for each container
- **WASM**: New `reparent_into_centered(child, target)` API — same validation as `reparent_into` but strips positional constraints and adds `CenterIn(target)` constraint; refactored shared validation into `validate_reparent` helper (DRY)
- **PARITY**: All center-in-parent changes applied to both site (`playground.js`) and VS Code extension (`panels.js`)

### v0.11.161 — Fix Layers Panel Reparent Duplication (R3.68)
- **FIX (R3.68)**: Dragging a node above its parent in the Layers panel no longer duplicates it — root cause: `reparent_node()` removed the graph edge from old parent → child but did not clean up the old parent's `sorted_child_order` cache; when the old parent had an explicit sort order (created by previous reorder operations), the stale entry caused the emitter to visit the child twice (ghost under old parent + real under new parent)
- **CORE**: `reparent_node()` in `model.rs` now removes the child from the old parent's `sorted_child_order` after removing the edge — 3-line fix preventing all ghost-child duplication
- **CORE**: `children()` in `model.rs` now defensively filters `sorted_child_order` entries against actual graph edges — belt-and-suspenders guard against any future `sorted_child_order` desync
- **TESTING**: New `reparent_after_reorder_no_ghost_children` regression test — creates parent+children, reorders (creating `sorted_child_order`), reparents child to root, verifies no duplicate in old parent's `children()` and no duplicate in `emit_document()` output

### v0.11.160 — Arrow Shift+Drag Angle Snap + Shift Behavior Documentation (R3.71)
- **FEATURE (R3.71)**: Arrow tool Shift+drag → 45° angle snap — holding Shift while drawing an arrow snaps the endpoint to the nearest 45° increment (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°); applies to both live preview (PointerMove) and final placement (PointerUp for point anchors); `snap_to_45_degrees()` helper in `tools.rs`
- **DOCS (R3.71)**: Complete Shift modifier documentation in `SHORTCUTS.md` — new per-tool Shift constraint table (Rect→square, Ellipse→circle, Frame→square, Arrow→45° snap, Pen/Text→none); Hand tool Shift row added (no effect — pan is unconstrained)
- **PARITY**: Frame tool already inherits Shift+drag square constraint from RectTool (both routed through `rect_tool.handle()` in `pointer.rs`)
- **TESTING**: 3 new tests — `arrow_tool_shift_snaps_to_45_degrees` (horizontal snap), `arrow_tool_shift_snaps_preview_to_diagonal` (45° diagonal snap), `snap_to_45_degrees_all_directions` (all 8 compass directions + zero-distance edge case)

### v0.11.159 — Hand Tool Modifier Keys (R3.70)
- **FEATURE (R3.70)**: Alt (Option) on Hand tool → temporary duplicate mode — holding Alt while on the Hand tool temporarily switches to Select + clone behavior; Alt+click/drag a node duplicates it (same as Alt+drag on Select tool); tool restores to Hand on pointer-up
- **FEATURE (R3.70)**: Cmd (⌘) on Hand tool → temporary select mode — holding Cmd while on the Hand tool temporarily switches to Select tool; click to select, drag to move, drag onto container to reparent; creates perfect V↔H symmetry (Select+Cmd=pan, Hand+Cmd=select)
- **FEATURE (R3.70)**: Tool-aware modifier cursor previews — Cmd held on Hand tool shows default/pointer cursor (select preview) instead of grab cursor; other tools unchanged (Cmd=grab, Alt=copy, Ctrl=eraser)
- **PARITY**: All changes implemented on both site (`playground.js`) and VS Code extension (`main.js`)
- **DOCS**: Updated `SHORTCUTS.md` with new Hand tool modifier behavior table

### v0.11.158 — Layers Panel File Explorer UX (R3.69)
- **FIX (R3.69)**: Reparent position preservation — moving a node via layers panel (drag, context menu, or WASM API) now preserves its visual canvas position by computing parent-relative coordinates from absolute bounds; fixes text nodes "disappearing" at (0,0) when moved to root and identity duplication on round-trip
- **FEATURE (R3.69)**: ⌘+Click multi-select in layers — Command/Ctrl+Click toggles individual nodes in/out of the selection set; highlights update immediately from actual WASM selection state
- **FEATURE (R3.69)**: ⇧+Click batch select in layers — Shift+Click selects a contiguous range from the last-clicked item to the current item, respecting collapsed/expanded tree state
- **FEATURE (R3.69)**: Keyboard shortcuts in layers panel — Delete/Backspace, ⌘C (copy), ⌘X (cut), ⌘V (paste), ⌘D (duplicate), ⌘A (select all) all work when the layers panel has focus
- **FEATURE (R3.69)**: Context menu enhancements — right-click layer items now shows Duplicate, Copy, Paste, and Delete actions alongside existing Move Into/Move to Root; Delete uses red danger styling
- **WASM**: New `toggle_select_by_id(id)` API — toggles a single node in/out of the current selection (for ⌘+Click); new `add_to_selection(id)` API — adds without clearing; new `select_multiple_by_ids(json)` API — replaces selection with a batch of IDs (for ⇧+Click range)
- **CORE**: `reparent_into()` in `crud.rs` now captures absolute bounds before reparent, computes new parent-relative Position constraint after reparent, and strips conflicting positional constraints (Offset, CenterIn, FillParent)
- **PARITY**: All changes implemented on both site (`playground.js`) and VS Code extension (`panels.js`)
- **CSS**: New `.layer-ctx-danger` styling for destructive menu items; `.layer-ctx-sep` separator between action groups

### v0.11.157 — Layer Drag-to-Reparent + Reorder + Context Menu (R3.68)
- **FEATURE (R3.68)**: Drag-to-reparent in layers panel — drag a layer item onto a container (rect/ellipse/frame/group) to make it a child; split-zone cursor detection (top 25% = insert above, middle 50% = nest into container, bottom 25% = insert below); blue highlight and insertion line visual feedback
- **FEATURE (R3.68)**: Drag-to-reorder in layers panel — drag a layer item above/below siblings to reorder z-order; works across parent boundaries (reparents then reorders)
- **FEATURE (R3.68)**: "Move Into" context menu — right-click any layer item to see a context menu listing all valid containers; select one to reparent into it; also includes "Move to Root" option
- **FEATURE (R3.68)**: Drop-to-root — drag a nested layer item to the empty space in the layers panel to move it back to the document root
- **FEATURE (R3.68)**: Undo snapshot guard — all reparent/reorder operations push undo snapshots via `push_undo_snapshot()` for seamless ⌘Z rollback
- **WASM**: New `reorder_child(child_id, index)` API — reorders child to a specific z-order index within its parent; new `get_container_ids()` API — returns JSON array of valid containers for the "Move Into" menu; enhanced `reparent_into()` — now accepts `"root"` as target and skips if already a child of that parent
- **CORE**: New `move_child_to_index(child, target_index)` on `SceneGraph` — clamped index reorder with `rebuild_child_order()`
- **TESTING**: 4 new unit tests — `move_child_to_index_basic`, `move_child_to_index_out_of_bounds`, `move_child_to_index_noop`, `reparent_then_children_correct`
- **PARITY**: All drag-and-drop + context menu functionality implemented on both site (`playground.js`) and VS Code extension (`panels.js`)
- **CSS**: New drag-and-drop styles (`.dragging`, `.drag-over-nest`, `.drag-over-above`, `.drag-over-below`, `.drag-over-root`, `.layer-ctx-menu`) in both `style.css` and `webview-html.ts`

### v0.11.156 — Input-Aware Hand Tool + Drag-from-Toolbar (R3.67)
- **FEATURE (R3.67)**: Input-aware Hand tool — Apple Pencil (pen) selects/moves nodes (delegates to Select behavior), finger/mouse always pans; matches Procreate/Concepts/Affinity Designer 2 iPad convention; `effective_tool()` helper centralizes Hand+Pen→Select logic across all pointer handlers (down/move/up)
- **FEATURE (R3.67)**: Visual mode indicator — pencil hover on Hand tool shows `default` cursor (not `grab`) and `move` cursor over nodes, making it clear pencil will select; provides immediate feedback about input-device-specific behavior
- **FEATURE (R3.67)**: Drag-from-toolbar-to-canvas — pressing a draw tool button and dragging onto the canvas starts shape creation in one continuous gesture; `pointerdown` on toolbar sets tool immediately, `pointerenter` on canvas synthesizes a pointer-down to begin drawing
- **WASM**: `effective_tool()` on `FdCanvas` (returns Select when Hand+Pen, else active tool); all 3 match arms + `tool_switched` in `pointer.rs` use effective tool
- **PARITY**: VS Code extension `pointer.js` updated with same Hand+Pen gate
- **DOCS**: Updated SHORTCUTS.md (Hand tool input-aware behavior)

### v0.11.155 — Rect Tool iPad Enhancements (R3.63, R3.64, R3.65, R3.66)
- **FEATURE (R3.63)**: Tool locking (sticky mode) — double-press keyboard shortcut (`R R`) or double-click toolbar button locks tool; stays active after placing shapes; 🔒 visual badge + toast; V/Escape unlocks; switching tools clears lock
- **FEATURE (R3.64)**: ⌘+drag reparent — holding ⌘/Ctrl during drag-and-drop moves node into a container (Rect/Ellipse/Frame/Group); `reparent_into()` WASM API with cycle detection and container-type validation; works across all tools
- **FEATURE (R3.65)**: Drag-back-to-cancel — dragging back within 5px of start during draw gesture resets `dragged` flag; pointer-up triggers click-to-place (default size) instead of tiny shape; applies to RectTool and EllipseTool
- **FEATURE (R3.66)**: iPad interaction polish — persistent smart defaults via localStorage; dimension tooltip during Rect/Ellipse/Frame draw (WASM returns bounds for draw tools); 3-finger double-tap = undo (removed delayed single-tap undo); pencil hover ghost preview (rect/ellipse outlines); Shift+Alt square/circle-from-center explicit handling
- **CORE**: `current_drawing_id()` getters on `RectTool` and `EllipseTool`; drag-back-to-cancel in `tools.rs` PointerMove handlers
- **WASM**: `reparent_into()` in `crud.rs`; draw-tool bounds in `pointer.rs` PointerMove response
- **TESTING**: 3 new unit tests (`rect_tool_shift_alt_square_from_center`, `rect_tool_cancel_resets_state`, `rect_tool_drag_back_to_start_is_click`)
- **SITE**: `playground.js` — tool locking state, double-press/double-click detection, smart defaults (load/save), locked tool honor on pointer-up, ⌘+drag reparent, pencil hover ghost, 3-finger gesture fix, FAB smart defaults save
- **DOCS**: Updated `SHORTCUTS.md` (3-finger gestures, ⌘+drag, Shift+Alt, persistent defaults, drag-back-to-cancel), `REQUIREMENTS.md` (R3.63-R3.66)

### v0.11.154 — iPad Cursor Tool Improvements (R3.6, R6.3)
- **FEATURE (R3.6)**: Touch-aware hit radii — `PointerType` enum (Mouse/Touch/Pen) with adaptive `handle_hit_radius()` (touch=24px, pen=12px, mouse=8px) and `node_hit_radius()` (touch=12px, pen=4px, mouse=0px); `set_pointer_type(u8)` WASM API called from JS before every `handle_pointer_down`
- **FEATURE (R6.3)**: Visual cursor feedback for touch — translucent blue halo (24px radius, 150ms scale-in, 200ms fade) appears at finger contact point; target node gets a matching blue highlight glow; rendered as Canvas2D overlay in `renderCanvas()`
- **FEATURE (R6.3)**: Apple Pencil hover preview — detects pen hover via `pointerType='pen' && buttons=0` in pointermove; draws cyan crosshair + center dot at hover position; highlighted node gets dashed blue outline when pencil hovers over it
- **FEATURE (R6.3)**: Touch-optimized resize handles — touch gets 14px round handles (was 7px squares) with corners-only (4 handles instead of 8); `draw_selection_handles()` accepts `handle_size` and `corners_only` params threaded through `render_scene()` → `render_node()`
- **WASM**: New `set_pointer_type(u8)`, `get_handle_visual_size() → f32`, `get_corners_only() → bool` APIs on `FdCanvas`
- **CORE**: `PointerType` in `fd-editor/src/input.rs` — `from_u8()`, `handle_hit_radius()`, `handle_visual_size()`, `corners_only()`, `node_hit_radius()` methods
- **PARITY**: VS Code extension `main.js` + `pointer.js` — `set_pointer_type` called before `handle_pointer_down` with `pointerType` forwarding
- **SITE**: Changes in `site/playground.js` (touch halo, pencil hover, pointer type helper)
- **RUST**: Changes in `input.rs`, `lib.rs`, `render2d.rs`, `export.rs`

### v0.11.153 — Hand Tool Improvements (R3.6, R6.6)
- **FEATURE (R3.6)**: Bare `0` key shortcut → Reset zoom to 100% — new `ZoomReset` action in `shortcuts.rs`; `⌘0` remains Zoom-to-Fit; wired through WASM `keyboard.rs` and handled in `playground.js`
- **FEATURE (R6.6)**: Floating toolbar visible in Zen mode — toolbar is centered at bottom instead of hidden; touch/iPad users can access Hand tool and other tools without keyboard
- **FEATURE (R6.6)**: Scroll-roll minimize on toolbar handles — double-click right handle rolls paper right-to-left (1s CSS transition), double-click left handle rolls left-to-right; double-click again to unroll; state persisted in `localStorage` (`fd-toolbar-rolled`)
- **FEATURE (R3.6)**: Space-hold pan visual indicator — Hand tool button shows pulsing blue ring animation (`.pan-active`) while Space is held; removed on Space release
- **TESTING**: New `resolve_zoom_reset` test verifying bare `0` → ZoomReset and `⌘0` → ZoomToFit
- **RUST**: `shortcuts.rs` (ZoomReset variant + mapping), `keyboard.rs` (action routing + name)
- **SITE**: `style.css` (rolled-left/rolled-right CSS, pan-active pulse, Zen toolbar), `playground.js` (scroll-roll dblclick, zoomReset handler, pan indicator)

### v0.11.152 — Apple Pencil Pro Squeeze Combos + Pressure-Sensitive Pen Strokes (R3.10, R3.22)
- **FEATURE (R3.10)**: Apple Pencil Pro squeeze detection ported to site playground — `pointerdown` with `button=5 && pointerType='pen'` triggers tool toggle via `handle_stylus_squeeze()`; modifier combos: plain=toggle

 	 last two tools, Shift=Pen, Ctrl=Select, Alt=Rect, Ctrl+Shift=Ellipse
- **FEATURE (R3.22)**: Pressure-sensitive pen strokes — `PenTool` now stores pressure per point `(x, y, pressure)`; on `PointerUp`, average pressure maps to stroke width via `pressure_to_stroke_width()` (1.0–4.5px range: light ≤0.3 → 1.0px, heavy ≥0.9 → 4.5px); default stroke `#5E5CE6` applied on path creation
- **CORE**: New `SetStrokeWidth { id, width }` `GraphMutation` with full undo/redo support in `commands.rs` and `sync.rs`
- **TESTING**: 3 new pressure tests — `pen_tool_light_pressure_thin_stroke`, `pen_tool_heavy_pressure_thick_stroke`, `pen_tool_default_pressure_medium_stroke`; updated `tool_pen_basic_draw` and `tool_pen_subsampling` for new mutation count
- **SITE**: `setupApplePencilPro(canvas)` function in `playground.js`

### v0.11.151 — Hand Tool Reverted to Pan-Only (R3.6)
- **CHANGE (R3.6)**: Hand tool is now pan-only — removed "Smart Hand" context-aware behavior (hit-test on pointer-down, select+move on nodes); Hand tool now always pans regardless of what's under the cursor, matching Figma/Sketch/Procreate/Affinity convention; decision driven by iPad + Apple Pencil Pro safety (accidental node moves when expecting safe pan) and input hierarchy clarity (pencil = precision, fingers = navigate, Hand = safe viewport tool)
- **CORE**: `pointer.rs` — `handle_pointer_down` returns `false` immediately for Hand tool (was: hit-test → delegate to SelectTool); `handle_pointer_move` and `handle_pointer_up` return empty mutations for Hand (was: delegate to SelectTool during drag)
- **SITE**: `playground.js` — Hand tool block simplified to always initiate pan (was: WASM hit-test → conditional pan or node move)
- **EXTENSION**: `pointer.js` + `main.js` — same simplification as site
- **DOCS**: `SHORTCUTS.md` — `H` key description changed from "Hand (smart pan) · Pan on empty space, move nodes on drag" to "Hand (pan) · Pan canvas with click+drag"; `REQUIREMENTS.md` R3.6 updated to reflect pan-only behavior

### v0.11.150 — Fix Extension Shortcuts + Cursor Icons (R3.11, R6.1)
- **FIX (R6.1)**: Tool shortcuts (V/R/H/O/P/A/T/F/E) now work when the canvas custom editor is active — previously captured by VS Code's native keybinding system and never reaching the webview's keydown handler; added `fd.tool.*` commands registered in `extension.ts` with single-key keybindings (`when: activeCustomEditorId == 'fd.canvas'`) that forward `toolChanged` messages to the canvas webview via `postMessage`
- **FIX (R3.11)**: Hand tool now shows `grab` cursor instead of inheriting default — added missing `#fd-canvas.tool-hand { cursor: grab }` CSS rule; also added `tool-arrow` (crosshair) and `tool-frame` (crosshair) cursor rules
- **FIX (R6.1)**: `toolChanged` message handler in `sync.js` now calls `updateToolbarActive()` which includes `updateCanvasCursor()` — previously only toggled toolbar button `.active` classes without updating the canvas cursor
- **EXTENSION**: Changes in `package.json` (9 commands + 9 keybindings), `extension.ts` (command handlers), `webview/src/sync.js` (handler), `site/style.css` (3 cursor rules)

### v0.11.149 — Comprehensibility Score, Incremental Parse, Shared Canvas UI
- **CORE (R4.21)**: Comprehensibility Score — new `score.rs` module computes a 0–100 score across 5 metrics: Semantic Naming, Doc-Comment Density, Style Reuse, Edge Default Coverage, Token Efficiency; exposed via `FdCanvas::compute_score()` WASM API returning JSON with total + per-metric breakdown & suggestions; 6 unit tests
- **PERF (R2.3)**: Block-level incremental parse — `update_text_range()` in `sync.rs` now splits text into top-level blocks, hashes each, and skips full re-parse + layout resolve when block hashes are unchanged; falls back to full re-parse for structural changes; 6 unit tests
- **PLATFORM (R6.12)**: Shared Canvas UI Module Phase 1 — `fd-canvas-ui` package with 3 new modules: `pointer.ts` (gesture classification, viewport→scene transform, pinch helpers), `shortcuts.ts` (default shortcut map + cross-platform matcher), `clipboard.ts` (node & style clipboard with platform fallback); barrel exports in `index.ts`
- **CLEANUP (R3.44)**: Marked as done — double-click edge labeling supersedes "text consume on drag"

### v0.11.148 — Reduce Motion Support (R6.16)
- **A11Y (R6.16)**: System-wide `prefers-reduced-motion` — global CSS blanket rule suppresses all CSS animations and transitions when OS "Reduce motion" is enabled; skeleton shimmer preserved as minimal loading indicator; JS guards skip touch inertia, camera pan animation, and detach pop effect
- **A11Y (R6.16)**: Manual "Reduce Motion" toggle — new toggle in ☰ Settings dropdown + `⇧M` keyboard shortcut; `localStorage` persistence (`fd-reduce-motion` key); `.reduce-motion` body class mirrors the CSS media query blanket rule; toast notification confirms state change
- **A11Y (R6.16)**: Live OS detection — `matchMedia` change listener updates `reduceMotion` flag in real-time when user toggles system accessibility setting
- **PARITY (R6.16)**: VS Code extension — `reduceMotion` flag in `state.js` with OS `matchMedia` detection; inertia guard in `pointer.js`; detach animation guard in `render.js`; focus-on-node instant jump in `navigation.js`
- **SITE**: Changes in `site/style.css`, `site/index.html`, `site/playground.js`
- **EXTENSION**: Changes in `fd-vscode/webview/src/state.js`, `pointer.js`, `render.js`, `navigation.js`, `main.js` (built)
- **DOCS**: `⇧M` shortcut added to `SHORTCUTS.md`

### v0.11.147 — AI Touch Context Menu Prompt + Flat Review Findings (R4.25)
- **UX (R4.25)**: Custom prompt textarea in right-click context menu — `✦ AI Touch ▸` expandable submenu with 200-char textarea, live char counter, and "Run ✦" button; prompt persists in `localStorage` (`fd-ai-prompt` key); menu stays open while typing (stopPropagation on textarea events); ⌘Enter shortcut to run
- **UX (R4.25)**: Flat review findings — removed category grouping (Naming, Colors & Visuals, Structure & Layout) from review panel UI; all findings now displayed as a single flat list with severity icons and suggestions; raw categorized data logged to `console.debug('[AI Touch] Raw review:')` for debugging
- **API (R4.25)**: `user_focus` field — API accepts optional `user_focus` string in request body; appended as `## User Focus` section to system prompt for both refine and review modes; server-side truncation to 200 chars
- **PARITY (R4.25)**: VS Code extension updated with same submenu, prompt persistence, and `userFocus` parameter through message pipeline → `refineSelectedNodes()` → LLM prompt
- **SITE**: Changes in `site/index.html`, `site/style.css`, `site/playground.js`, `functions/api/ai.js`
- **EXTENSION**: Changes in `fd-vscode/src/webview-html.ts`, `fd-vscode/src/extension.ts`, `fd-vscode/src/ai-touch.ts`

### v0.11.146 — WASM Loading Performance (R6.5)
- **PERF (R6.5)**: Immutable cache headers — `_headers` changed from `no-cache` to `public, max-age=31536000, immutable` for WASM, JS, and CSS; safe because `pages.yml` auto-busts all URLs with `?v=<git-sha>` on every deploy; return visitors get instant loads from browser disk cache
- **PERF (R6.5)**: Real progress bar — replaced fake 2.5s CSS animation with `fetch()` + `ReadableStream` byte tracking; progress bar now shows actual download percentage ("Loading engine… 72%"); JS module import and WASM fetch run in parallel via `Promise.all()`
- **PERF (R6.5)**: WASM binary optimization — added `--enable-bulk-memory --enable-reference-types` flags to `wasm-opt` for more compact binary encoding
- **PERF (R6.5)**: `fetchpriority="high"` on WASM preload link in `index.html` — prioritizes WASM download over lower-priority assets
- **CSS**: Removed unused `progress-fill` keyframe; `.loading-progress-bar` now uses `transition: width 0.15s ease` driven by JS instead of fixed animation
- **SITE**: Changes in `site/_headers`, `site/index.html`, `site/style.css`, `site/playground.js`, `crates/fd-wasm/Cargo.toml`

### v0.11.145 — Admin Model Override + Model Badge (R4.23)
- **Admin URL param**: Add `?ai_model=llama-70b` (or `llama-8b`, `gemma-12b`) to override model per session. Validated against whitelist.
- **Model badge**: Review panel footer shows which model produced the result (e.g. "Model: gemma-3-12b-it").
- **Files**: `functions/api/ai.js` (MODEL_ALIASES), `site/playground.js` (getAiModelHint + badge), `site/style.css`

### v0.11.144 — Single AI Endpoint + Env-Var Model Selection (R4.23, R4.24)
- **Single endpoint**: Merged all AI into `/api/ai` with 3 modes: `refine`, `renamify`, `review`. Deleted `functions/api/ai-review.js`.
- **Env-var model selection**: `AI_MODEL_FAST` (refine/renamify) and `AI_MODEL_QUALITY` (review). Default: `@cf/google/gemma-3-12b-it` for both.
- **1 credit per action**: Every AI call costs exactly 1 credit. Full-doc review dropped from 3→1 credits.
- **Files**: `functions/api/ai.js` (rewritten), `functions/api/ai-review.js` (deleted), `site/playground.js`

### v0.11.143 — Few-Shot Prompt Engineering for AI Touch (R4.23)
- **2-shot refine examples**: `buildRefinePrompt()` now includes 2 before/after example pairs (rename+restyle, frame structure preservation). ~30-40% quality improvement on 8B model.
- **1-shot review examples**: All 4 review prompts (scoped, naming, visual, structure) include concrete input→output examples for 70B model.
- **Compressed FD syntax guide**: `FD_SYNTAX_GUIDE` rewritten for token efficiency (~40% fewer tokens) with golden example snippet from `demo.fd`.
- **Files**: `functions/api/ai.js`, `functions/api/ai-review.js`, `site/playground.js`

### v0.11.142 — Unified AI Touch Pipeline: Two-Phase Refine + Review (R4.24)
- **Unified AI Touch**: One button, two phases. With selection: Phase 1 (8B refine → apply changes) + Phase 2 (70B scoped review → score panel). Without selection: full-doc review (3 credits).
- **Smart Model Routing**: 8B for refine/renamify (fast, cheap), 70B for review (quality-critical). ~60% fewer neurons per call.
- **Scoped Review**: New `mode: 'scoped'` in `/api/ai-review` — single LLM call for selected nodes only (1 credit vs 3 for full doc).
- **Toolbar Simplification**: Removed standalone "✦ AI Review" button. Full Design Review available via ☰ settings menu.
- **Files**: `functions/api/ai.js`, `functions/api/ai-review.js`, `site/playground.js`, `site/index.html`

### v0.11.141 — AI Touch Monetization: Rate Limiting + Quality Upgrade + Design Review Agent (R4.22, R4.23, R4.24)
- **R4.22 — AI Rate Limiting**: IP-based daily call limit via Cloudflare KV (`RATE_LIMIT` namespace). 10 calls/day/IP free tier (configurable via `AI_DAILY_LIMIT` env var). `X-RateLimit-Limit`/`X-RateLimit-Remaining` response headers. 429 response with retry info. Frontend shows remaining-count toast and rate-limit-exceeded toast. Design Review costs 3 credits per review.
- **R4.23 — AI Quality Upgrade**: Model upgraded from `llama-3.1-8b-instruct` to `llama-3.3-70b-instruct-fp8-fast`. Enhanced system prompts with FD format syntax guide. `max_tokens` 4096→8192. Temperature 0.3 for deterministic output.
- **R4.24 — Design Review Agent**: New `/api/ai-review` endpoint runs 3 parallel LLM calls (naming audit, visual critique, structure analysis). Returns structured JSON with per-category scores and severity-graded findings. New "✦ AI Review" toolbar button with frosted glass slide-up panel showing category cards, score badges, and fix suggestions.
- **Files**: `functions/api/ai.js` (rewritten), `functions/api/ai-review.js` (new), `site/playground.js`, `site/index.html`, `site/style.css`

### v0.11.139 — Excalidraw Export + AI Touch Enhancement (R3.55, R4.20)
- **R3.55 — Excalidraw Export**: New `export_excalidraw()` WASM API converts FD scene to Excalidraw v2 JSON. Maps rect/frame→rectangle, ellipse→ellipse, text→text, path→freedraw. Includes fill, stroke, opacity, corner radius. ⌘⇧E keyboard shortcut copies JSON to clipboard. Core logic in `fd-core/src/excalidraw.rs` with 9 unit tests.
- **R4.20 — AI Touch Enhancement**: New `emit_selection_fd()` WASM API emits FD text for only selected nodes, replacing fragile regex-based block extraction in JS. AI Touch prompt now uses accurate WASM-powered selection extraction with JS fallback.
- New public functions in `emitter.rs`: `emit_node_standalone()` and `emit_edge_standalone()`.

### v0.11.140 — Dark-Only Site + Canvas Pill Contrast Fix (R3.13)

- **UX (R3.13)**: Site is now dark-only — removed site-wide ☀️/🌙 toggle from navbar on all pages (index, docs, shortcuts, changelog). Dark theme is the brand identity; eliminates the confusing two-toggle experience
- **UX (R3.13)**: Canvas pill toggle is now the sole theme control — switches between light/dark canvas (`.dark-canvas` class). Fixed contrast by switching from marketing vars (`--bg-card`, `--border`) to canvas-specific `--fd-*` tokens (`--fd-surface-solid`, `--fd-border`). Hover glow now uses `--fd-accent` blue instead of purple
- **CLEANUP**: Deleted ~150 lines of `body.light-theme` CSS from `shared.css` (variable overrides, nav/footer), `style.css` (hero, playground, cards, responsive), and `docs/style.css` (code blocks, tables, sidebar, callouts, tags — all 80 lines added in v0.11.138). Removed `.theme-toggle-btn` component CSS, `fd-site-theme` localStorage, and all head scripts/toggle handlers
- **SITE**: Changes in `shared.css`, `style.css`, `docs/style.css`, `index.html`, `docs/index.html`, `docs/shortcuts.html`, `docs/changelog.html`, `playground.js`

### ~~v0.11.138~~ ~~v0.11.137~~ — _superseded by v0.11.140_
- **UX (R3.13)**: localStorage persistence — both themes saved independently (`fd-site-theme`, `fd-canvas-theme`); inline `<script>` in `<head>` applies `body.light-theme` before first paint to prevent FOUC; canvas pill syncs with initial state on load
- **UX (R3.13)**: Canvas pill toggle relocated from navbar to canvas toolbar (right zone, after Zen button) — semantically grouped with canvas-specific controls
- **PARITY (R6.5)**: Site toggle added to all 4 pages — home page + 3 docs pages (index, shortcuts, changelog) share identical toggle button, head script, and click handler
- **CSS**: New `.theme-toggle-btn` circular button in `shared.css`; `body.light-theme .site-nav`, `.site-footer`, `.hero-gradient`, `.hero-grid`, `.playground-split`, `.editor-header`, `.feature-card:hover`, `.mode-card:hover`, mobile `.nav-links` overrides
- **SITE**: Changes in `site/shared.css`, `site/style.css`, `site/index.html`, `site/playground.js`, `site/docs/index.html`, `site/docs/shortcuts.html`, `site/docs/changelog.html`

### v0.11.136 — Unified Navbar + Footer + Shared CSS (R6.5, R6.15)

- **REFACTOR (R6.5)**: Unified navbar across all 4 site pages — home page and 3 docs pages now share identical `.site-nav` HTML structure with consistent links (Home, Docs, Shortcuts, Changelog, GitHub, Install Extension); home page retains transparent→frosted-on-scroll effect via `.nav-transparent` modifier; docs pages start frosted
- **REFACTOR (R6.15)**: Unified footer across all 4 pages — docs pages upgraded from minimal text-only `.docs-footer` to rich `.site-footer` with brand logo, 5 navigation links, and copyright line matching the home page
- **REFACTOR (R6.5)**: Extracted `shared.css` (170 lines) — single source of truth for design tokens (`:root` vars), reset, body, links, keyboard accessibility, `.site-nav`, `.site-footer`, `.gradient-text`, mobile responsive nav; imported by all pages; eliminates ~200 lines of duplicated CSS across `style.css` and `docs/style.css`
- **UX (R6.5)**: Font stack unified to Geist Sans + Geist Mono across all pages — docs pages previously used Inter + JetBrains Mono; now consistent with home page; JetBrains Mono retained as code-block fallback
- **UX (R6.15)**: CTA button label unified to "Install Extension" (was "Install" on docs pages)
- **SITE**: New `site/shared.css`; changes in `site/style.css`, `site/index.html`, `site/docs/index.html`, `site/docs/shortcuts.html`, `site/docs/changelog.html`, `site/docs/style.css`

### v0.11.135 — Multi-Finger Gesture System (R3.6, R6.3, R6.6)

- **FEATURE (R3.6)**: 3-finger tap → undo, 3-finger double-tap → redo (iPadOS-native, <200ms + <15px movement threshold, 400ms double-tap window)
- **FEATURE (R3.6)**: 3-finger pinch-in → copy, pinch-out → paste (area ratio thresholds: <0.4 = copy, >2.5 = paste)
- **FEATURE (R3.6)**: 3-finger long-press (500ms) → floating edit menu with Undo/Redo/Cut/Copy/Paste (auto-dismiss 3s)
- **FEATURE (R3.6)**: 4-finger tap → toggle Zen mode (<250ms, <20px movement)
- **FEATURE (R3.6)**: 4-finger swipe up → zoom-to-fit, swipe down → zoom-to-selection (50px threshold; falls back to 100% if no selection)
- **FEATURE (R3.6)**: 4-finger horizontal swipe → cycle tool in toolbar order (hand→select→rect→ellipse→pen→arrow→text→eraser, wraps around)
- **UX (R6.3)**: iPadOS gesture hierarchy — 1-finger=object, 2-finger=viewport, 3-finger=edit, 4-finger=app; muscle-memory aligned with iOS
- **SITE**: Changes in `site/playground.js` (`setupTouchGestures`)
- **EXTENSION**: Changes in `fd-vscode/webview/src/pointer.js` (`setupTouchGestures`)
- **DOCS**: Updated `SHORTCUTS.md` with full multi-finger gesture reference table

### v0.11.134 — Two-Finger Gesture Redesign (R3.6, R6.6)

- **UX (R3.6)**: Normalized zoom wheel factor — unified to `ZOOM_WHEEL_FACTOR = 1.04` across site (`playground.js`) and VS Code (`main.js`); was 1.05 on site and 1.03 on VS Code
- **UX (R3.6)**: Smart two-finger gesture disambiguation — 50ms delay before committing to two-finger mode (site); 30px minimum distance threshold rejects accidental palm grazes (both platforms); Apple Pencil palm rejection via `touchType === 'stylus'` / `pointerType === 'pen'`
- **FEATURE (R6.6)**: Full touch gesture system ported to site — `setupTouchGestures()` (280 lines) adds: pinch-to-zoom, two-finger pan with momentum inertia, three-finger swipe undo/redo (50px threshold), long-press context menu (500ms), Apple Pencil palm rejection; previously site only had pointer-based gestures
- **UX (R3.6)**: Improved pan inertia on both platforms — weighted 3-frame velocity average (recent frames count more), exponential decay friction `0.95` (was `0.92`), minimum velocity threshold `0.1px` (was `0.5`); smoother momentum stop
- **UX (R3.6)**: `zoomAtPoint()` helper extracted on site — replaces inline zoom math in wheel handler; consistent cursor-anchored zoom behavior
- **FIX (R3.6)**: `touchcancel` now calls `cancelInertia()` on VS Code — prevents ghost inertia after app switch
- **SITE**: Changes in `site/playground.js`
- **EXTENSION**: Changes in `fd-vscode/webview/main.js`
- **DOCS**: Updated `SHORTCUTS.md` with touch gesture shortcuts (two-finger pan, three-finger undo/redo, long-press context menu)

### v0.11.133 — Smart Hand Tool (R6.6)

- **FEATURE (R6.6)**: Hand tool is now context-aware ("Smart Hand") — dragging empty space pans the canvas (unchanged), dragging a node selects and moves it (new); WASM hit-tests on pointer-down: node hit → delegates to SelectTool for select+move, empty → returns false for JS pan; two-finger gestures always pan even on objects (unchanged, JS-level); Hand tool excluded from `tool_switched` auto-switch logic to prevent switching back to Select after pointer-up
- **PARITY (R6.6)**: Smart Hand behavior applied to both site playground (`playground.js`) and VS Code extension (`pointer.js`→`main.js`); cursor shows `grab` on idle, `grabbing` during pan, delegates to WASM cursor for node interactions
- **DOCS**: Updated `SHORTCUTS.md` — Hand tool description changed from "Hand (pan) tool" to "Hand (smart pan) · Pan on empty space, move nodes on drag"

### v0.11.132 — Hand Tool + Shift Interaction Improvements (R3.54, R6.6)

- **FEATURE (R6.6)**: Hand tool (`H` key) — dedicated pan tool; click+drag to pan canvas; toolbar button with ✋ icon between Select and Rect; `grab`/`grabbing` cursor; panning handled entirely in JS, WASM pointer handlers return early for Hand tool
- **CHANGE (R3.54)**: Shift+drag axis-snap is now **per-frame** instead of lock-based — each frame projects movement onto the dominant axis (horizontal or vertical), allowing direction changes mid-drag; no dead-zone threshold; removed `locked_axis`, `drag_start_x`, `drag_start_y` from `SelectTool`
- **CHANGE (R3.54)**: Shift+resize now preserves **original aspect ratio** instead of forcing square — `resize_aspect` field captures `w/h` at resize start; width-dominant and height-dominant paths compute the constrained dimension from the aspect ratio
- **FIX (R3.54)**: Shift+click deselect no longer cancelled by sub-pixel pointer jitter — `shift_toggled_off` cancellation moved past a 0.5px meaningful-move threshold, preventing accidental deselect cancellation from trackpad noise
- **PARITY (R6.6)**: Hand tool added to both site playground and VS Code extension — toolbar button, keyboard shortcut, cursor, pan behavior all consistent
- **TESTING**: Rewrote 4 Shift+drag tests for per-frame axis-snap behavior; all 115 workspace tests pass
- **DOCS**: Updated `SHORTCUTS.md` with `H` → Hand (pan) tool

### v0.11.131 — Fix Blank Canvas: wasm-opt -O2 Strips Canvas2D Draw Calls (R6.9)

- **FIX (R6.9)**: Canvas no longer renders blank in both VS Code extension and site playground — root cause: `wasm-opt -O2` (wasm-pack's default) was incorrectly stripping Canvas2D draw calls (`fill_rect`, `stroke`, `fill`, `set_fill_style_str`, etc.) as dead code because these are imported JavaScript functions with void return that `wasm-opt` treats as side-effect-free at `-O2`; downgraded to `-O1` which preserves all imported JS side-effects while still applying safe optimizations
- **INFRA**: Added `[package.metadata.wasm-pack.profile.release] wasm-opt = ["-O1"]` to `crates/fd-wasm/Cargo.toml` — overrides wasm-pack's default `-O2` optimization level; `-O1` retains ~90% of size savings without stripping external function calls
- **DIAG**: Verified via 3-tier test: (1) dev build (no wasm-opt) → renders correctly, (2) release build with `-O1` → renders correctly, (3) release build with `-O2` (default) → blank canvas

### v0.11.130 — Raw Markdown Notes (R4.18)

- **REFACTOR (R4.18)**: Replaced structured `Annotation` enum with raw markdown `note: Option<String>` — content inside `note { }` or `spec { }` blocks is now captured verbatim as raw markdown text, enabling checklists (`- [ ]` / `- [x]`), headings, bullets, and any markdown syntax; the old DSL (`todo:`, `done:`, `tag:`, `accept:`, `status:`, `priority:`) is no longer parsed into variants — it's preserved as raw text
- **CORE**: Deleted `Annotation` enum (5 variants: `Description`, `Todo`, `Done`, `Tag`, `Status`) from `model.rs`; `SceneNode.note` and `Edge.note` are now `Option<String>`
- **PARSER**: `parse_note_block` rewritten with brace-depth counting to capture raw markdown; new `dedent_note_content` strips common leading whitespace; `parse_note_item` deleted
- **EMITTER**: `emit_annotations` → `emit_note`; single-line notes emit as `note "text"`, multiline as `note { content }`; `emit_notes_markdown` passes through raw content; `emit_spec_annotations` and `has_annotations_recursive` deleted
- **SYNC**: `SetAnnotations` mutation → `SetNote { id, note: Option<String> }`; undo logic simplified to clone/restore a single `Option<String>`
- **WASM**: `get_annotations_json`/`set_annotations_json` → `get_note`/`set_note` — plain string APIs instead of JSON array
- **TESTING**: 230 tests pass; ~18 tests rewritten from structured annotation assertions to raw markdown content checks
- **COMPAT**: `spec` keyword still accepted by parser (emitter always outputs `note`); `.fd` example files unchanged

### v0.11.129 — Fix 30-70 Split Breaks on First Node Drag (R6.6)

- **FIX (R6.6)**: Playground 30-70 code/canvas split no longer expands when first dragging a node — root cause: CSS Grid children default to `min-width: auto`, so when `resizeCanvas()` set `canvas.style.width` to a fixed pixel value, the `.playground-canvas` column couldn't shrink below that intrinsic width, forcing the grid column to exceed its `7fr` allocation; fix: added `min-width: 0` to both `.playground-editor` and `.playground-canvas` grid children (standard CSS Grid overflow fix) + `overflow: hidden` on `.playground-canvas` as defense in depth
- **PERF (R6.6)**: `fdCanvas.resize()` WASM call moved inside the dimension-change guard — previously called unconditionally on every `resizeCanvas()` invocation (including during pointer events via ResizeObserver); now only fires when canvas pixel dimensions actually change, eliminating redundant WASM layout recalculations during drag
- **SITE**: Changes in `site/style.css`, `site/playground.js`


### v0.11.128 — Notes Redesign: Rename Spec → Note (R4.18)

- **RENAME (R4.18)**: `spec` keyword → `note` — annotation blocks now use the more universal term; emitter outputs `note` keyword; parser accepts both `note` and `spec` for backward compatibility
- **RENAME (R4.18)**: `accept:` field → `todo:` — annotation acceptance criteria renamed to `todo:`; parser accepts both `todo:` and `accept:`; emitter outputs `todo:`
- **RENAME (R4.18)**: `ReadMode::Spec` → `ReadMode::Notes` (Spec kept as backward-compat alias); `emit_spec_markdown` → `emit_notes_markdown` (old function kept as alias)
- **UX (R6.6)**: View toggle simplified from 3 buttons (All | Design | Spec) to 2 buttons (Design | Notes) — Design is now the default mode; "All" mode removed
- **UX (R6.6)**: "Add Note" context menu item — right-click a selected node to quickly add a `note "..."` annotation
- **UX (R6.6)**: Settings menu "Spec Badges" → "Note Badges"; context menu "View Spec" → "View Notes"; "Add Spec" → "Add Note"
- **PARITY (R6.6)**: All renames applied to site playground (`playground.js`, `index.html`) and VS Code extension (`webview-html.ts`, `state.js`, `drag-drop.js`, `panels.js`, `context-menu.js`, `navigation.js`, `main.js`, `extension.ts`)
- **LSP**: `--view notes` accepted alongside `--view spec` in fd-lsp
- **TESTING**: 3 new emitter tests (`note_keyword_compat`, `note_keyword_output`, `todo_alias_output`), updated `sync_set_annotations` and `test_spec_markdown_basic`
- **SITE**: Feature card "Specs Built In" → "Notes Built In"; demo.fd updated to use `note` keyword
- **DOCS**: Updated `demo.fd` examples from `spec`→`note`, `accept:`→`todo:`

### v0.11.127 — Fullscreen Mode + Deep Links (R6.6)

- **FEATURE (R6.6)**: Full Screen mode — ⛶ button in canvas toolbar expands playground to fill entire viewport; `Shift+F` shortcut; `Escape` to exit; separate from Zen mode (Zen hides code editor, Fullscreen hides page chrome); CSS `fullscreen-mode` class with fixed positioning and smooth enter animation
- **FEATURE (R6.6)**: Deep linking with URL compression — 🔗 Share button compresses current editor text via LZ-String (`compressToEncodedURIComponent`) and copies `?code=...` URL to clipboard; loading a `?code=` URL decompresses and populates the editor; `?fullscreen` parameter auto-enters fullscreen on load
- **PARITY (R6.6)**: VS Code extension — fullscreen toggle button, CSS, Shift+F shortcut, and Escape exit added to `webview-html.ts`, `navigation.js`, `shortcuts.js`, `main.js`; state persisted via `vscode.setState()`
- **SITE**: Changes in `site/style.css`, `site/index.html`, `site/playground.js`
- **EXTENSION**: Changes in `fd-vscode/src/webview-html.ts`, `fd-vscode/webview/src/navigation.js`, `fd-vscode/webview/src/shortcuts.js`, `fd-vscode/webview/src/main.js`, `fd-vscode/webview/main.js` (built)

### v0.11.126 — FAB Persistent During Drag (R6.6)

- **UX (R6.6)**: Floating Action Bar (FAB) now stays visible and tracks the node during move drag — previously disappeared on pointerdown and only reappeared on pointerup; `updateFab(canvas)` added to the ~10fps render loop alongside `updatePropertiesPanel()`; CSS transitions (`left 0.08s ease, top 0.08s ease`) provide smooth tracking animation for free
- **FIX (R6.6)**: Dead FAB-hide code on pointerdown — `document.getElementById('fab')` targeted nonexistent element (actual ID is `floating-action-bar`); fixed to correct ID and gated behind draw-gesture check (FAB only hides during draw/resize tools, not during select-tool move)
- **PARITY (R6.6)**: VS Code extension `updateFloatingBar()` updated with same draw-gesture gate — `pointerIsDown` no longer unconditionally hides the FAB; `scheduleSideEffects()` now calls `updateFloatingBar()` + `updatePropertiesPanel()` at ~10fps for consistent tracking
- **SITE**: Changes in `site/playground.js`
- **EXTENSION**: Changes in `fd-vscode/webview/main.js`

### v0.11.125 — Fix Multi-Node Drag Double-Move (R3.16)

- **FIX (R3.16)**: Selected parent+child nodes now move at the same speed when dragged together — root cause: `MoveNode` in `sync.rs` propagated dx/dy to **all** descendants' cached bounds; when both parent and child were selected and dragged, the child received the delta twice (once from its own `MoveNode` + once from the parent's descendant propagation); fix: new `apply_mutation_with_co_selected()` method accepts a slice of co-selected `NodeId`s and skips descendant propagation for nodes in that set; `CommandStack::execute_with_co_selected()` and `FdCanvas::apply_mutations()` wire the co-selected context through the pipeline
- **TESTING**: 2 new regression tests — `sync_multi_select_parent_child_no_double_move` (parent+child both selected, both move 1× not 2×), `sync_single_select_parent_still_propagates_to_children` (single-parent drag still propagates to descendants, no regression)

### v0.11.124 — Figma-Style Double-Click Text Drill-In (R3.28)

- **UX (R3.28)**: Double-clicking a rect/ellipse/frame now drills into its child text node (Figma behavior) — if no text child exists, creates one and opens inline editor; if text child exists, selects it and opens inline editor; selection transfers from parent shape to child text node during editing
- **WASM**: New `create_child_text(parent_id, content)` API — creates a text node as child of a shape, selects it, and returns the new text ID; validates parent is a rect/ellipse/frame
- **WASM**: New `get_text_child_id(parent_id)` API — returns the ID of the first text child node of a shape, or empty string if none exists
- **CLEANUP**: Removed `"label"` abstraction from WASM APIs — `get_selected_node_props()` no longer returns a `label` property for shapes; `set_node_prop("label", ...)` handler removed; inline editing now operates entirely through real text node IDs and `"content"` prop
- **PARITY**: Frame nodes now support double-click text editing (was only rect/ellipse)
- **SITE**: `playground.js` updated to use `create_child_text()` / `get_text_child_id()` instead of label prop
- **EXTENSION**: `inline-edit.js` and bundled `main.js` updated with same drill-in logic

### v0.11.123 — Unified Playground Header Bar (R6.6)

- **UX (R6.6)**: Code and Design headers are now visually connected as one continuous frosted glass bar — both panels share unified `--header-bg` and `--header-border` CSS tokens; `::before` pseudo-element on the resize handle bridges the 6px gutter gap; removes the `.dark-theme #canvas-toolbar` override (now unnecessary); headers have matching `backdrop-filter: blur(20px) saturate(180%)` and 0.5px hairline border-bottom
- **SITE**: Changes in `site/style.css`

### v0.11.122 — Playground 30-70 Code/Design Split (R6.6)

- **UX (R6.6)**: Default playground split changed from 40/60 to **30/70** — design canvas gets 70% of horizontal space, code editor 30%; gives the visual canvas more room by default while keeping code readable; grid-template-columns changed from `2fr auto 3fr` to `3fr auto 7fr`
- **UX (R6.6)**: Minimum split fraction lowered from 25% to 15% — users can now drag the code panel narrower for even more canvas space; double-click handle resets to 30/70 (was 50/50)
- **SITE**: Changes in `site/style.css`, `site/playground.js`

### v0.11.121 — Fix WASM Import Error on Chrome/Edge (R6.9)

- **FIX (R6.9)**: Canvas no longer fails on Chrome with `WebAssembly.instantiate(): Import #0 "./fd_wasm_bg.js" "__wbg_instanceof_Window_ed49b2db8df90359": function import requires a callable` — root cause: stale `fd_wasm.js` glue file cached by browser while `fd_wasm_bg.wasm` was updated; the `modulepreload` link and dynamic `import()` call had no cache-busting `?v=` query strings, causing Chrome/Edge to serve mismatched JS+WASM pairs
- **INFRA**: Added `?v=0.11.5` to all four WASM paths: `modulepreload` and `preload` in `index.html`, `import()` and `wasm.default()` in `playground.js`; these are auto-replaced with git SHA by `pages.yml` on every deploy
- **INFRA**: Extended `pages.yml` auto-bust step to also `sed` `playground.js` (was only `index.html`); ensures WASM import paths get unique URLs on every deploy
- **DOCS**: New LESSONS.md entry — "WASM Modulepreload Cache Mismatch Breaks Chrome/Edge"

### v0.11.120 — Website Theme Polish Batch 2 (R6.5)

- **UX (R6.5)**: Animated hero skeleton during WASM load — three CSS shapes (card, title bar, button) assemble from scattered positions with spring-curve easing; purple→blue gradient progress bar fills during load; status text transitions through "Loading engine…" → "Initializing runtime…" → "Parsing scene…" → "✓ Ready"; smooth 400ms fade-out when canvas is ready; `prefers-reduced-motion` fallback disables assembly animation
- **UX (R6.5)**: Navbar canvas theme toggle — pill-style sun/moon toggle in the navigation bar; clicking switches the canvas between dark (default) and light themes via `fdCanvas.set_theme()`; toggles `.dark-canvas` class on wrapper for canvas chrome; slider animates with gradient knob between sun ☀️ and moon 🌙 positions; purple glow on hover
- **SITE**: Changes in `site/style.css`, `site/index.html`, `site/playground.js`

### v0.11.119 — Documentation Pages (R6.15)

- **SITE (R6.15)**: New `/docs/` section on fast-draft.com — three static pages served from `site/docs/`:
  - **Language Reference** (`/docs/`) — complete `.fd` format guide: node types, styles, edges, animations, constraints, layout, annotations, colors, property aliases, imports; syntax-highlighted code examples with Atom One Dark palette
  - **Keyboard Shortcuts** (`/docs/shortcuts.html`) — 8-section reference: tools, edit, transform, z-order, view, modifiers, floating toolbar, zen mode, mobile/touch
  - **Changelog** (`/docs/changelog.html`) — curated release notes for recent versions with category tags (FEATURE, FIX, UX, PERF, INFRA, DOCS); links to full CHANGELOG.md on GitHub
- **SITE (R6.15)**: Shared docs stylesheet (`site/docs/style.css`) — dark theme matching main site, fixed sidebar navigation with scroll-spy, responsive layout (collapsible sidebar on mobile), code blocks, tables, callouts, keyboard badges, prev/next page navigation
- **SITE (R6.15)**: "Docs" link added to main site navbar and footer
- **INFRA**: `site/_headers` — added `no-cache` for `/docs/*.html` and `/docs/*.css`

### v0.11.118 — Website Theme Polish Batch 1 (R6.5)

- **UX (R6.5)**: Canvas now defaults to dark theme on marketing site — matches the dark `#0D1117` page background; calls `set_theme(true)` on WASM init + adds `.dark-canvas` class to wrapper; eliminates the jarring light/dark visual disconnect
- **SEO (R6.5)**: Added OG social card — `og:image` and `twitter:card` meta tags with a 1200×630 branded preview image (`site/og-card.png`); sharing on social platforms now shows a rich preview with "Fast Draft — Design as Code" branding
- **UX (R6.5)**: Accent evolved to purple→blue gradient (`#6C5CE7` → `#0A84FF`) — applied to `.gradient-text`, primary CTA button, feature card hover borders, mode card hover borders, and `--accent-glow` / `--shadow-glow` tokens; creates a distinctive brand identity
- **UX (R6.5)**: Typography upgraded to Geist Sans + Geist Mono — replaces Inter + JetBrains Mono via jsDelivr CDN; sharper, more modern dev-tool aesthetic; Inter and JetBrains Mono remain as fallbacks
- **UX (R6.5)**: Feature card micro-interactions — icon bounces up and scales 1.15× on hover via spring-curve easing; subtle gradient overlay fades in on hover; staggered scroll-reveal with `calc(var(--i) * 80ms)` delay per card for sequential animation
- **SITE**: Changes in `site/style.css`, `site/index.html`, `site/playground.js`, new `site/og-card.png`

### v0.11.117 — Auto Cache-Bust Deploy Pipeline (DX)

- **INFRA (DX)**: `pages.yml` auto-bust step — replaces `?v=X.Y.Z` query strings in `index.html` with `?v=<7-char-git-sha>` before deploying; every deploy produces unique asset URLs, eliminating stale browser cache forever; no manual version bumps needed
- **INFRA (DX)**: `site/_headers` — added `Cache-Control: no-cache` for `/*.js` and `/*.css` files; browsers always revalidate (304 if unchanged), matching the existing WASM caching rule; belt-and-suspenders defense against stale assets
- **FIX**: Bumped `playground.js?v=0.11.4` → `?v=0.11.5` and `style.css?v=0.11.3` → `?v=0.11.5` in `index.html` — previous deploy of v0.11.116 fix was invisible to users because the query string wasn't updated, causing browsers to serve 4-hour-cached stale JS

### v0.11.116 — Fix Canvas Blank After Clicking a Node (R6.9)

- **FIX (R6.9)**: Canvas no longer goes blank after clicking a node — root cause: ResizeObserver/RAF race condition; clicking a node opens the Properties panel (`.visible`), changing wrapper layout → ResizeObserver fires `resizeCanvas()` → `canvas.width = newW` clears pixel buffer (HTML5 spec); the RAF loop already consumed `renderDirty=true` earlier in the same frame, so the cleared canvas was composited blank; fix: `resizeCanvas()` now calls `renderCanvas()` synchronously after clearing the buffer instead of relying on `renderDirty` + next RAF tick
- **DOCS**: New LESSONS.md entry — "ResizeObserver Must Repaint Synchronously After canvas.width Assignment"

### v0.11.115 — Web Canvas Consistency Audit (R6.6)

- **FEATURE (R6.6)**: Inline text editing on double-click — double-click text/shape to edit in-place via floating textarea; double-click empty canvas to create new text node with immediate editor; Enter commits, Escape cancels; undo snapshot on commit
- **FEATURE (R6.6)**: Frame tool shortcut — `F` key activates Frame tool, matching VS Code extension
- **FEATURE (R6.6)**: Arrow-key nudge — Arrow keys nudge selected node 1px (Shift+Arrow = 10px); uses pointer sequence through WASM for correct constraint handling
- **FEATURE (R6.6)**: Zoom keyboard shortcuts — `⌘+`/`⌘-` zoom in/out by 1.25×, `⌘0` fits to content (matching VS Code extension behavior)
- **FEATURE (R6.6)**: Select All — `⌘A` selects first visible node on canvas (basic implementation)
- **FIX (R6.6)**: Zoom-reset button now calls `fitToContent()` instead of resetting to 1.0/origin — matches extension behavior where reset = fit-to-content
- **FIX (R6.6)**: Context menu undo — all context menu mutations (duplicate, delete, group, ungroup, lock, rename, z-order) now push undo snapshots via `push_undo_snapshot()`, enabling ⌘Z rollback
- **SITE**: All changes in `site/playground.js` — ~200 lines added (nudge, inline editor, zoom shortcuts, select all, undo integration)

### v0.11.114 — Fix Canvas Background Fill in Transformed Space (R6.9)

- **FIX (R6.9)**: Canvas background no longer shifts or leaves white gaps when panning/zooming — root cause: WASM `render_scene()` filled the background after JS applied the zoom/pan transform (`setTransform(dpr*z, 0, 0, dpr*z, panX*dpr, panY*dpr)`), so the fill started at the transformed origin instead of canvas pixel (0,0); fix: background is now filled in identity transform space by JS before applying zoom/pan, and WASM `render()` accepts a new `skip_bg: bool` parameter to skip its own background fill
- **WASM**: New `skip_bg` parameter on `render()` and `render_scene()` — when `true`, skips the `fill_rect(0, 0, w, h)` background fill, delegating to the JS caller
- **SITE**: `renderCanvas()` in `playground.js` — clears canvas, fills background in identity space (`setTransform(1,0,0,1,0,0)` + `fillRect`), then applies zoom/pan transform before calling WASM `render(ctx, t, grid, true)`
- **EXTENSION**: Updated all 3 VS Code webview `fdCanvas.render()` call sites — main render (`skip_bg=true` with JS bg fill), export (`skip_bg=true`, already has own bg), minimap (`skip_bg=false`, manages own transform)

### v0.11.113 — Optimize Browser Recording Size (DX)

- **DX**: `GEMINI.md` Browser Subagent rules expanded — viewport must be resized to 900×600 as the **first action** inside every `browser_subagent` task (not just before screenshots); recordings at 3008×1575 are ~25× larger than at 900×600
- **DX**: `RecordingName` convention — `{tier}_{phase}` format (`smoke_canvas`, `full_draw_select`, `deploy_verify`) for easy audit and cleanup
- **DX**: Minimize subagent duration rule — return immediately after the last action; idle time inflates recording size
- **DX**: Recording cleanup rule — `find ~/.gemini/antigravity/brain/ -name "*.webp" -mmin +60 -delete` before E2E runs
- **DX**: `/e2e` Full tier merged from 9 phases → 4 phases — reduces recording count by ~56% while maintaining identical test coverage
- **DX**: `/e2e` context guard softened — E2E can run in the same conversation unless it's very heavy; fresh conversation only needed for extremely large contexts
- **DX**: `/e2e` "Recording Size Rules" section added — documents all recording-related constraints in one place

### v0.11.112 — Context Menu Enhancements (R6.6, R3.1)

- **FEATURE (R3.1)**: Edge right-click — right-clicking an edge on the canvas opens the edge context menu (VS Code) or selects the edge with a toast (site); uses new `hit_test_edge_at()` WASM API with 5px proximity detection
- **FEATURE (R6.6)**: Lock/Unlock node — `locked: bool` field on `SceneNode` parsed/emitted/roundtripped; locked nodes cannot be moved, resized, or deleted; context menu dynamically shows 🔒 Lock / 🔓 Unlock; `is_node_locked()` and `toggle_node_locked()` WASM APIs
- **FEATURE (R6.6)**: Inline Rename — context menu "Rename" item prompts for new ID, regex-replaces all `@oldId` references in source text (nodes, edges, constraints) with `@newId`; validates identifier format
- **FEATURE (R3.1)**: Edge Delete — "Delete Edge" button in edge context menu removes the edge via `select_by_id` + `delete_selected`
- **FEATURE (R3.1)**: Edge Reverse Direction — "Reverse Direction" button swaps `from:` and `to:` values in the edge block
- **UX (R6.6)**: Context menu open animation — 120ms fade-in with `scale(0.96)` + `translateY(-4px)` on both node and edge context menus; applied to VS Code extension and site playground
- **CLEANUP (R6.6)**: Merged duplicate "Show Specs" and "View Spec" into single "View Spec" menu item — removed `ctx-show-specs` HTML and event handler
- **PARITY (R6.6)**: Site playground context menu updated with Lock, Rename, and edge right-click actions matching VS Code extension
- **TESTING**: Roundtrip test for `locked` property; all existing tests pass
- **CORE**: `locked: false` added to all `SceneNode` constructors in `mermaid.rs`
- **CSS**: `.ecm-action` class for clickable edge menu rows (Delete, Reverse)

### v0.11.111 — Copy/Paste + Context-Aware Right-Click Menu (R6.6, R3.59)

- **FEATURE (R3.59)**: ⌘C/⌘V/⌘X Copy/Cut/Paste now works on playground canvas — copies selected node's `.fd` block to internal + system clipboard; paste renames IDs with `_N` suffix to avoid conflicts, offsets `x:` by `(width + 20) × pasteCount` for horizontal stagger with gap; undo support via `push_undo_snapshot()`
- **FEATURE (R6.6)**: ⌘D Duplicate shortcut on playground — calls `duplicate_selected()` with `preventDefault` to block browser bookmark dialog
- **FEATURE (R6.6)**: Context-aware right-click menu — right-clicking a node shows node menu (Copy, Cut, Duplicate, Delete, z-order, Group/Ungroup, Copy as .fd with shortcut badges); right-clicking empty space shows canvas menu (Paste, Add Rectangle/Ellipse/Text, Fit to Content)
- **UX**: Keyboard shortcut badges in context menu items — `⌘C`, `⌘X`, `⌘D`, `⌫`, `⌘V`, `R`, `O`, `T` shown right-aligned in muted style
- **CSS**: New `#ctx-menu-canvas` element styled identically to `#ctx-menu`; `.ctx-shortcut` badge class; `.ctx-item` changed from `display: block` to `display: flex` for shortcut alignment; orange hover on Cut action
- **SITE**: Changes in `site/playground.js`, `site/index.html`, `site/style.css`

### v0.11.110 — Harden Spatial Index Rebuild (R3.16)

- **FIX (R3.16)**: `finalize_bounds()` now calls `rebuild_spatial_index()` after expanding parent groups — previously the spatial index retained pre-expand AABBs, causing hit-test misses on expanded parents
- **FIX (R3.16)**: `update_text_metrics()` now calls `rebuild_spatial_index()` when text bounds change — JS-measured text dimensions were updating cached bounds without rebuilding the spatial index, causing stale hit-test after text measurement
- **DIAG (R3.16)**: Temporary diagnostic `console.warn` in `hit_test()` — compares spatial index result vs brute-force for every hit test; logs `[FD DIAG] Stale spatial index!` when they disagree; **to be removed after verification**

### v0.11.109 — Fix Hover/Click State Conflation (R1.5)

- **FIX (R1.5)**: Clicking a node no longer triggers `:hover` animations — `handle_pointer_down` and `handle_pointer_up` no longer set `hovered_id`; only `handle_pointer_move` manages hover state, aligning with CSS behavior where `:hover` is cursor-proximity based, not click-based; most visible on nodes with no base fill (transparent → colored on click)
- **FIX**: `@nav_projects` and `@nav_settings` in `demo.fd` now have a base fill (`#3D3A6E`) so hover transitions go from muted purple to bright purple, matching `@nav_dashboard`'s pattern
- **DOCS**: New LESSONS.md entry — "Pointer Down Must Not Set Hover State"

### v0.11.108 — Fix Drawing Tools + Playground UI (R6.6)

- **FIX (R6.6)**: Drawing tools (Rect/Ellipse/Pen/Text/Arrow) now work on the playground — shapes appear on canvas AND sync to the code editor; root cause: `handle_pointer_up` computed `visual_changed` without `tool_switched`, so after a draw gesture the JS never called `syncCanvasToEditor()`; the node existed in WASM (flushed by `end_batch()`) but `changed=false` in the JSON response because the tool's `PointerUp` returns empty mutations (all work done in PointerDown/PointerMove); fix: compute `tool_switched` early and include it in both the `flush_to_text()` gate and `visual_changed`; JS now syncs on `result.toolSwitched` too
- **FIX (R6.6)**: Layers panel no longer auto-collapses from stale `localStorage` — `fd-layers-collapsed` key from previous sessions no longer hides the layers panel on playground load; hardcoded `layersCollapsed = false` so first-time visitors always see the scene tree
- **UX (R6.6)**: Property panel number inputs (W/H/Stroke W/Corner) now auto-select all text on focus — click an input field and immediately type a new value without manual text selection

### v0.11.107 — Fix Node Can Only Be Moved Once (R3.16)

- **FIX (R3.16)**: Nodes can now be moved repeatedly on the canvas — root cause: `SpatialIndex` for O(log N) hit testing was never rebuilt after move/resize operations; `apply_mutations()` skipped `rebuild_spatial_index()` for MoveNode/ResizeNode batches (to avoid `resolve()` → bounds clobbering); cached bounds were updated in-place but the spatial index still held pre-move AABBs; on the next `pointerdown`, `hit_test()` queried the stale index and returned `None` at the node's new position
- **FIX (R3.16)**: Added `self.rebuild_spatial_index()` in `handle_pointer_up()` after `flush_to_text()` — spatial index is rebuilt once per gesture using already-updated cached bounds; O(N log N) but only once per pointer-up, not per frame
- **TESTING**: New `spatial_index_stale_after_move` regression test — builds index, moves bounds in-place, verifies stale index misses at new position, rebuilds index, verifies hit at new position and miss at old position
- **DOCS**: New LESSONS.md entry — "Spatial Index Must Be Rebuilt After Bounds Mutation"

### v0.11.106 — Fix Text Alignment Shift in Managed Layouts (R3.46)

- **FIX (R3.46)**: Text inside column/row/grid frames no longer shifts from centered to left-aligned after clicking the frame — root cause: `update_text_metrics()` overwrote the layout-stretched text width with the narrower measured text width (e.g. 420px → 184px), destroying the column layout stretch; `draw_text()` then centered within the shrunken bounds, which appeared left-aligned relative to the frame; fix: `update_text_metrics` now preserves the wider of measured vs layout-assigned width when the text node is inside a managed layout (`is_parent_managed` guard)
- **FIX (R3.46)**: Inline text editor default `textAlign` fallback in `inline-edit.js` now uses context-aware defaults matching the WASM renderer — previously hardcoded `"left"`, now falls back to `"center"` for non-standalone-text nodes; the WASM API always returns the effective alignment, so this is a safety net only

### v0.11.105 — Fix Centered Text Shifts Left on Click (R3.28)

- **FIX (R3.28)**: Centered text inside shapes (rect/ellipse/frame) no longer shifts to left-aligned when clicking the node — root cause: `update_text_metrics()` shrank text bounds to JS-measured size while preserving x/y position, breaking the layout solver's auto-centering for text children; fix: after updating bounds dimensions, re-center text within parent shape when text has no explicit `Position` constraint or `place:` property
- **TESTING**: New `layout_text_stays_centered_after_bounds_shrink` regression test — creates text inside rect, shrinks bounds to simulated measured size, verifies text center still matches parent center
- **DOCS**: New LESSONS.md entry — "Text Metrics Update Must Re-Center in Parent"

### v0.11.104 — Fix Z-Order Operations (R3.41)

- **FIX (R3.41)**: Z-order operations (Bring to Front, Send to Back) now work from context menu, properties panel, and keyboard shortcuts — root cause: JS handlers called `render()` + `syncTextToExtension()` but skipped `bumpGeneration()`, so the layers panel never refreshed and the animation loop didn't mark the canvas dirty for subsequent frames; all 5 z-order handlers across `context-menu.js`, `panels.js`, and `shortcuts.js` now call `bumpGeneration()` before `render()`
- **FIX (R3.41)**: Keyboard shortcuts `⌘[` / `⌘]` / `⌘⇧[` / `⌘⇧]` now reach the canvas — VS Code intercepted these for Indent/Outdent Line and Fold/Unfold; added `keybindings` overrides in `package.json` with `when: activeCustomEditorId == 'fd.canvas'` to disable the default bindings when the FD canvas editor is focused
- **TESTING**: 5 new z-order unit tests in `model.rs` — `z_order_bring_forward`, `z_order_send_backward`, `z_order_bring_to_front`, `z_order_send_to_back`, `z_order_emitter_roundtrip`

### v0.11.103 — Canvas Performance: Spatial Index + Bounds-Hash Skip (R5.9)

- **PERF (R5.9)**: `SpatialIndex` in `fd-render/src/hit.rs` — sorted-bounds spatial index with O(log N + K) `query_point()` and `query_rect()` methods, replacing O(N) brute-force walk for hit testing; index rebuilt after layout resolve; cached in `FdCanvas` for use in `hit_test()`; falls back to brute-force when index unavailable
- **PERF (R5.9)**: Bounds-hash skip — `set_text()` now returns JSON `{"ok":bool,"layout_changed":bool}` instead of `bool`; after every parse+resolve, computes a deterministic hash of all resolved bounds; when hash matches previous, `layout_changed` is false → JS skips re-render, `measureAllTextNodes()`, and UI panel updates for comment/spec/style-name-only edits
- **PERF (R5.9)**: Cached `CanvasTheme` — theme rebuilt only on `set_theme()`, not per-frame; eliminates per-frame allocation
- **PERF (R5.9)**: `get_scene_bounds()` WASM API — returns all node bounds in single call; minimap uses this instead of N separate `get_node_bounds()` calls
- **PERF (R5.9)**: Bundled `handle_pointer_move()` — returns JSON with `changed` flag + drag bounds, eliminating separate WASM calls for dimension tooltip
- **PERF (R5.9)**: `skip_grid` parameter on `render()` — grid rendering skipped for minimap and export, shifting responsibility to JS
- **PERF (R5.9)**: `uiDirty` flag in `playground.js` — gates minimap, layers panel, and properties panel updates; only set on user interactions, not text-only changes
- **TESTING**: 3 new tests — `spatial_index_query_point_matches_hit_test`, `spatial_index_query_rect_matches_hit_test_rect`, `spatial_index_empty`

### v0.11.102 — README Rewrite + CONTRIBUTING.md

- **DOCS**: Rewrote README.md from 238 → ~115 lines — added hero screenshot (Code+Canvas side-by-side), shortened tagline, corrected token ratio from "~5×" to "~6×" (matching benchmark average of 6.5×), trimmed feature list from 13 to 6 differentiating items, added live playground CTA to fast-draft.com, fixed `group` → `frame` in code example, added "Web playground 🟢 Live" to platform roadmap
- **DOCS**: Extracted architecture, crate structure, build instructions, design decisions, and git workflow from README into new `CONTRIBUTING.md` — README now links to it; contributor-facing detail no longer clutters the user-facing landing page
- **DOCS**: Added `docs/images/hero-code-canvas.png` — screenshot of fast-draft.com playground showing Code Mode (left) and Canvas Mode (right) rendering a card component

### v0.11.101 — Fix Canvas Interactions After CodeMirror Refactor (R6.11)

- **FIX (R6.11)**: All canvas interactions (click, drag, shape creation, selection) were completely broken — `pointerdown` handler called `editor.blur()` but `editor` was undefined after the CodeMirror 6 refactor (commit `4d6ab749`); `ReferenceError` crashed the handler before `handle_pointer_down()` could run; fixed to `editorView?.contentDOM.blur()`
- **FIX (R6.11)**: Keyboard shortcuts fired while typing in CodeMirror — `document.activeElement === editor` check was broken (same undefined `editor`); replaced with idiomatic `editorView?.hasFocus ?? false`
- **CLEANUP**: Removed 2 dead `const editor = document.getElementById('fd-editor')` declarations left behind by CodeMirror refactor in `aiTouch` and `renamify` functions
- **SITE**: Changes in `site/playground.js`, `site/index.html` (cache-bust v0.11.2)

### v0.11.100 — Mobile Touch Interactions (R6.11)

- **FIX (R6.11)**: Canvas touch interactions now work on mobile — single-finger tap, drag, draw all functional; root cause was missing `e.preventDefault()` on canvas `pointerdown` and missing `touch-action: none` CSS, causing browser to intercept touch gestures for page scrolling
- **FIX (R6.11)**: Node flashing eliminated — render loop now uses dirty-flag pattern instead of unconditional 60fps re-render; `renderDirty` flag set by pointer/wheel/UI events, cleared after each paint; reduces idle GPU usage to zero
- **UX (R6.11)**: Two-finger pan on mobile — touching canvas with two fingers simultaneously initiates pan mode (drag to pan); cancels any in-progress single-finger interaction
- **UX (R6.11)**: Pinch-to-zoom on mobile — two-finger pinch gesture zooms canvas centered on pinch midpoint; zoom level clamped to 0.1×–5×; zoom indicator updates in real-time
- **FIX (R6.11)**: `pointercancel` handler — properly cleans up multi-touch state when browser cancels pointer events (app switch, incoming call, gesture timeout)
- **UX (R6.11)**: Light theme editor background set to `#FAFAFA` (Atom One Light) — previously used dark Atom One bg in both themes
- **CSS**: `touch-action: none; user-select: none` on `#canvas-wrapper` — prevents browser scroll/zoom and text selection during canvas interactions
- **SITE**: Changes in `site/style.css`, `site/playground.js`, `site/index.html` (cache-bust v0.11.106)

### v0.11.99 — Code Mode Scroll Fix + Atom One Dark Theme (R6.11)

- **FIX (R6.11)**: Code Mode scroll sync fixed — syntax highlight overlay (`#fd-highlight`) now uses `overflow: hidden` instead of `overflow: auto`, relying entirely on JS `scrollTop` sync; previously the overlay had independent scroll behavior that diverged from the textarea
- **UX (R6.11)**: Syntax highlighting switched from VS Code dark+ to **Atom One Dark** palette — warmer, more cohesive colors: comments `#5C6370` (muted gray), keywords `#C678DD` (purple), node IDs `#E06C75` (red), properties `#D19A66` (orange), strings `#98C379` (green), other keywords `#56B6C2` (cyan), style names `#E5C07B` (yellow)
- **UX (R6.11)**: Light theme overrides updated to **Atom One Light** palette — comments `#A0A1A7`, keywords `#A626A4`, node IDs `#E45649`, strings `#50A14F`, properties/numbers `#986801`, other keywords `#0184BC`
- **UX (R6.11)**: Code editor background changed to `#282C34` (Atom One Dark) for thematic consistency
- **FIX (R6.11)**: WASM error fallback improved — shows "Canvas couldn't start" with actual error message instead of misleading "Playground requires WebAssembly"
- **PERF (R6.11)**: Scroll sync throttled via `requestAnimationFrame` — prevents redundant scroll handler calls for smoother 60fps scrolling
- **SITE**: Changes in `site/style.css`, `site/playground.js`, `site/index.html` (cache-bust v0.11.105)

### v0.11.98 — Cross-Platform Foundations (R5.9, R6.12)

- **CORE (R5.9)**: `DrawBackend` trait — platform-agnostic 2D rendering abstraction in `fd-render/src/backend.rs`; ~30 methods (fill, stroke, path, text, transform, clip) mirroring Canvas2D API; ready for `Canvas2dBackend`, `CoreGraphicsBackend`, and `VelloBackend` implementations
- **CORE (R6.12)**: `ThemeContract` — single source of truth for visual constants in `fd-core/src/theme.rs`; light/dark constructors matching Apple HIG; `to_json()` serialization for JS consumption; 5 unit tests (non-empty fields, light≠dark, JSON roundtrip)
- **WASM**: `get_theme_json()` API on `FdCanvas` — returns current `ThemeContract` as JSON for cross-platform theming; `CanvasTheme` refactored to derive from `ThemeContract` via `from_contract()`
- **NEW (R6.12)**: `fd-canvas-ui` TypeScript package skeleton — `PlatformHost` interface (document I/O, UI feedback, state persistence, optional clipboard/messaging), `ThemeContract` types + `LIGHT_THEME`/`DARK_THEME` constants matching Rust values, barrel re-export index
- **TESTING**: 5 new Rust tests (theme contract), TypeScript compiles cleanly

### v0.11.97 — Code Mode Syntax Highlighting + Hero Stats Cleanup (R6.11)

- **FEATURE (R6.11)**: Code Mode now has live syntax highlighting — FD tokens (keywords, node IDs, properties, strings, hex colors, numbers, comments) are colorized using a transparent textarea + highlighted `<pre>` overlay pattern; token colors follow VS Code dark+ theme palette with light theme variants; zero external dependencies
- **CLEANUP**: Removed hero stats badges ("5× fewer tokens", "6.5× smaller", "370 tests passing") from hero section — data already shown in the Benchmarks table lower on the page; reduces visual clutter
- **SITE**: Changes in `site/index.html`, `site/style.css`, `site/playground.js`

### v0.11.96 — Taller Playground + Resizable Split (R6.6)

- **UX (R6.6)**: Playground min-height bumped from `70vh` to `80vh` — ~100px more workspace on typical laptop screens
- **UX (R6.6)**: Draggable split resize handle between Code Mode and Canvas — drag to adjust editor/canvas ratio (25–75% range); double-click to reset to 50/50; ratio persists in `localStorage`; handle highlights with accent on hover/drag; hidden in zen mode and mobile breakpoint
- **SITE**: Changes in `site/index.html`, `site/style.css`, `site/playground.js`

### v0.11.95 — Hero Section Compaction (R6.5)

- **UX (R6.5)**: Compacted hero section to push the live playground above the fold — removed "Open Source · MIT License" badge (already in footer), inlined 3 stats (5× / 6.5× / 370) as a single compact text row below CTAs, removed "▶ Live Playground" toolbar label; tightened `#hero` padding (80→64px top, 48→32px bottom), `hero-content` margin (40→16px), CTA margin (32→16px); ~200px vertical savings
- **CLEANUP**: Removed dead CSS for `.hero-badge`, `.playground-label`, old `.hero-stats`/`.stat-value`/`.stat-label`/`.stat-divider` rules; cleaned stale mobile responsive overrides
- **SITE**: Changes in `site/index.html`, `site/style.css`

### v0.11.94 — Top Toolbar + AI Features (R6.10)

- **UX (R6.10)**: Apple HIG frosted-glass top toolbar inside canvas with 3-zone layout — AI buttons (left), view toggle (center), status + zen + settings (right)
- **UX (R6.10)**: All / Design / Spec segmented view toggle — Design hides `spec {}` blocks, Spec shows only annotated nodes
- **AI (R6.10)**: ✦ AI Touch button — refines selected node styling and naming via Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`)
- **AI (R6.10)**: ✦ Renamify button — heuristic rename engine (analyzes text content, shape, parent context) with AI enhancement fallback
- **INFRA (R6.10)**: Cloudflare Pages Function at `/api/ai` — serverless AI proxy, no client-side API keys, 10k neurons/day free tier
- **UX (R6.10)**: Settings ☰ and Zen 🧘 moved from floating buttons into toolbar; zen case removed from settings menu
- **UX (R6.10)**: Keyboard Shortcuts item added to settings menu

### v0.11.93 — Canvas Parity + Minimap Fix (R6.9)

- **UX (R6.9)**: Default canvas theme → light — matches VS Code extension's first impression; users with saved preference keep their choice via `localStorage`
- **FIX (R6.9)**: Minimap now renders actual scene via `fdCanvas.render()` instead of drawing plain purple rectangles — shows real shapes, colors, and text exactly as on the main canvas
- **UX (R6.9)**: Minimap uses theme-aware background (`#F5F5F7` light / `#1C1C1E` dark) and blue viewport indicator with filled overlay, matching the VS Code extension
- **FIX (R6.9)**: Minimap node-ID parsing now deduplicates with `Set` — prevents double-counting nodes that appear multiple times in source (e.g., `from: @node` references)
- **SITE**: Changes in `site/playground.js`

### v0.11.92 — Theme Toggle in Navbar + Canvas Toolbar (R3.13)

- **UX (R3.13)**: Discoverable Light/Dark theme toggle — ☀️/🌙 icon button added to navbar (between nav links and Install Extension) and canvas toolbar (after Eraser, separated by divider); removed hidden Dark Mode from ☰ settings menu
- **UX (R3.13)**: OS preference detection — respects `prefers-color-scheme: dark` on first visit; manual choice persists in `localStorage` (`fd-theme` key); FOUC-preventing `<script>` in `<head>` applies theme before first paint
- **UX (R3.13)**: Canvas toolbar keyboard shortcut `D` toggles theme — matches tool shortcut pattern (V/R/O/T/A/P/E)
- **SITE**: Changes in `site/index.html`, `site/style.css`, `site/playground.js`

### v0.11.91 — Remove Example Selector (R6.8)

- **CLEANUP (R6.8)**: Removed multi-example selector from playground — collapsed 3 example files (`card`, `login`, `welcome`) into a single `DEFAULT_FD` constant keeping only the card example; removed `<select>` dropdown, `<label>`, event listener, and `.toolbar-label`/`.toolbar-select` CSS rules; ~150 lines removed across `playground.js`, `index.html`, `style.css`

### v0.11.90 — Fix Frame Auto-Resize (R3.2)

- **FIX (R3.2)**: Frames no longer involuntarily resize to enclose their children — frames have declared `width`/`height` and should maintain those dimensions; previously `finalize_child_bounds()` and `expand_group_to_children()` treated frames identically to groups, auto-expanding bounds to fit the child bounding box on every pointer release; now all frames (not just `clip: true`) are skipped in auto-sizing logic; only groups auto-size
- **CORE**: `finalize_child_bounds()` in `sync.rs` — guard changed from `clip: true` frames only → ALL frames; `expand_group_to_children()` — early return added for `NodeKind::Frame` preventing callers (`erase_node_immediately`, `detach_child_from_group`) from resizing frames
- **TESTING**: New `sync_frame_does_not_auto_resize` regression test — verifies non-clip frame retains declared 200×100 dimensions after child overflow + `finalize_child_bounds()`

### v0.11.89 — Bigger Canvas (R6.8)

- **UX (R6.8)**: Playground canvas height changed from fixed `420px` to `70vh` — fills ~70% of the viewport on any screen size, making the canvas feel like a real workspace rather than a demo widget
- **SITE**: `site/style.css` — `.playground-split { min-height: 70vh }`

### v0.11.88 — Unified Zen Mode Toggle (R6.8)

- **UX (R6.8)**: Zen toggle moved from outer toolbar into the canvas wrapper — single 🧘/✕ button that stays visible in both normal and zen mode; clicking toggles zen on/off with icon swap; positioned top-right of canvas as frosted-glass 32×32 pill; settings menu "Zen Mode" and Escape key both sync the button icon
- **FIX**: Fixed scoping bug in Escape key handler — `resizeCanvas()` was called from `setupContextMenu()` but scoped inside `initPlayground()`; replaced with `window.dispatchEvent(new Event('resize'))` to trigger the `ResizeObserver`
- **CLEANUP**: Removed separate `#zen-exit-btn` and outer toolbar `#zen-toggle-btn`; unified into one `#zen-toggle-btn` inside `#canvas-wrapper`
- **SITE**: Changes in `site/index.html`, `site/style.css`, `site/playground.js`

### v0.11.87 — Animation Duration & Breaks (R1.5, R5.6)

- **FEATURE (R1.5)**: Trigger-specific default durations — `:hover` 300ms, `:press` 150ms (faster for tactile feedback), `:enter` 500ms (dramatic reveals); explicit `ease:` overrides the default
- **FEATURE (R5.6)**: New `delay: Nms` property inside animation blocks — optional post-revert cooldown before re-triggering; parsed, emitted, and roundtripped correctly; `None` by default
- **FIX**: Proportional time envelope — renderer now uses node's actual `duration_ms` instead of hardcoded 700ms (200+300+200) envelope; envelope phases: ease-in = `duration_ms`, hold = 60%, ease-out = 50%
- **FIX**: Duration mismatch bug — `render2d.rs` now looks up the hover animation's `duration_ms` from the node's `AnimKeyframe` instead of ignoring it
- **TESTING**: 6 new tests — `parse_animation_press_default_duration`, `parse_animation_enter_default_duration`, `parse_animation_delay`, `roundtrip_animation_delay`, `parse_animation_explicit_duration_overrides_default`, `parse_animation_no_delay_default`

### v0.11.86 — Fix Node Flashing After Move

- **FIX**: Nodes no longer flash/flicker after being moved on the canvas — root cause was an async echo-back race in the VS Code extension: `suppressEchoBack` was cleared synchronously after `applyEdit()`, but VS Code fires `onDidChangeTextDocument` asynchronously, sending text back to the webview → `set_text()` → `resolve()` → fresh bounds that clobber in-place move deltas for one frame; fixed by timeout-guarding `suppressEchoBack` for 200ms (matching existing `suppressCursorSync` pattern)
- **FIX (site)**: Website playground no longer flashes after canvas interaction — `syncCanvasToEditor()` now clears the pending editor→canvas debounce timer, preventing a stale 50ms callback from calling `set_text()` → `resolve()` after `suppressSync` is already cleared

### v0.11.85 — Edge Selection (R3.1)

- **FEATURE (R3.1)**: Edges are now selectable on canvas — click an edge stroke (5px hit radius) to select, Shift+click for multi-select, marquee box selection includes edges; selected edges show #4FC3F7 highlight stroke; Delete/Backspace removes selected edges via `RemoveEdge` mutation (undoable); properties panel shows edge-specific properties (from/to, arrow, curve, stroke, flow)
- **CORE**: New `hit_test_edge()` in `hit.rs` — point-to-curve distance testing for all 3 curve types: Straight (line segment), Smooth (quadratic Bézier flattened to 8 segments), Step (3-segment orthogonal path); closest-edge wins when multiple overlap
- **CORE**: New `hit_test_rect_edges()` in `hit.rs` — marquee rectangle intersection testing for edges using segment-vs-rect cross-product orientation test
- **WASM**: `hit_test()` falls back to edges when no node is hit (nodes take priority); `select_by_id()` accepts edge IDs; `delete_selected()` emits `RemoveEdge` for edge IDs; `edge_props_json()` serializes edge properties for the inspector panel
- **RENDER**: `draw_edges()` renders 3px-wider #4FC3F7 highlight stroke on selected edges
- **TESTING**: 6 new tests — `point_to_segment_dist_basic`, `point_to_segment_dist_endpoint`, `hit_test_edge_straight`, `hit_test_edge_point_anchors`, `hit_test_edge_step`, `hit_test_rect_edges_marquee`

### v0.11.84 — Canvas UI Parity: Site ↔ VSCode (R6.8)

- **UX (R6.8)**: Floating scroll toolbar — replaced static top toolbar with wooden scroll handles, paper rolls, and SVG icon tool buttons matching VSCode extension's scroll toolbar design
- **UX (R6.8)**: Settings menu inside canvas — moved settings from outer toolbar to a hamburger (☰) icon inside the canvas wrapper; frosted glass dropdown with toggle switches for dark mode, sketchy mode, grid, zen mode, and export actions
- **UX (R6.8)**: Light/dark theme toggle — canvas chrome (toolbar, panels, FAB, minimap) now supports both themes via `.dark-canvas` CSS class; light theme is default with CSS variables, dark overrides scoped to class
- **UX (R6.8)**: Frosted glass FAB — floating action bar upgraded with `backdrop-filter: blur(20px)`, stroke-width number input, opacity slider with percentage readout, and red delete button
- **UX (R6.8)**: Minimap zoom pill — replaced simple zoom buttons with Google Maps-style pill (`[− 100% +]`) overlaid on minimap; frosted glass background
- **UX (R6.8)**: Zen mode toggle button — dedicated button in canvas area for quick Zen mode activation
- **SITE**: All changes in `site/index.html`, `site/style.css`, `site/playground.js` — no Rust crate changes

### v0.11.83 — CI/CD Hardening (R6.10)

- **CI (R6.10)**: Added WASM build check to CI — `wasm-pack build crates/fd-wasm` now runs on every push/PR to `main`, catching WASM-breaking Rust changes before merge (previously only caught at deploy time in `pages.yml`)
- **CI (R6.10)**: Replaced manual `actions/cache` with `Swatinem/rust-cache@v2` across all workflows — smarter per-crate caching with partial restore keys; ~30–60s faster CI runs; shared cache keys (`ci`, `wasm`) reduce cache duplication
- **CI (R6.10)**: Added explicit `permissions: contents: read` to `ci.yml` and `pages.yml` — minimal token scope prevents accidental write access in CI jobs
- **CI (R6.10)**: Unified release workflow — merged `publish.yml` + `release.yml` into a single `release.yml` with job dependency graph: CI gate → extension publish + LSP binary builds + Zed extension (parallel) → GitHub Release; atomic all-or-nothing release prevents half-published states
- **CLEANUP**: Deleted `publish.yml` (absorbed into unified `release.yml`)

### v0.11.82 — Complete `theme` → `style` Keyword Cleanup (R4.18)

- **CLEANUP (R4.18)**: Replaced all remaining `theme` keywords with `style` across the entire codebase — playground examples in `site/playground.js` (3 example strings, 6 occurrences), 3 library `.fd` files (`wireframe`, `flowchart`, `ui-kit`), 9 benchmark `.fd` files, 3 design doc `.fd` files, 3 example `.fd` files; also updated `# ─── Themes ───` section headers to `# ─── Styles ───` in all 13 affected files
- **DOCS (R4.18)**: Updated `LIBRARIES.md` (code examples + convention table), `ARCHITECTURE.md` (SceneGraph/SceneNode field descriptions), `REQUIREMENTS.md` (R1.4, R1.17, R4.21 wording) to reflect `style` as the primary keyword with `theme` as legacy alias

### v0.11.81 — Simplify "Under the Hood" Section

- **SITE**: Removed redundant ASCII architecture diagram — crate cards already conveyed the same info; eliminates responsive breakage on narrow screens
- **SITE**: Merged 5 crate cards into 3 logical groups (Core Engine, GPU Renderer, Canvas Editor) with data flow pipeline one-liners (e.g. `.fd text → Parser → SceneGraph → Emitter → .fd text`)
- **SITE**: Simplified subtitle from "Five Rust crates, one TypeScript extension, zero compromises" to "Rust + WASM, from parser to pixel."
- **CLEANUP**: Removed `.arch-diagram` and `.arch-ascii` CSS (~18 lines); added `.crate-flow` monospace style for pipeline one-liners

### v0.11.80 — Migrate to Cloudflare Pages (R6.5)

- **INFRA (R6.5)**: Migrated site hosting from GitHub Pages to Cloudflare Pages — 330+ edge PoPs (was ~10 Fastly), HTTP/3+QUIC, custom response headers, unlimited bandwidth; hybrid deploy: GitHub Actions builds WASM → `wrangler-action@v3` pushes to CF Pages
- **PERF**: Added `site/_headers` — WASM binary cached for 1 year (`Cache-Control: immutable`); security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`) on all responses
- **CLEANUP**: Removed `site/CNAME` (not needed for CF Pages custom domain binding)
- **DOCS**: Updated `GEMINI.md` Tier 2 table, `REQUIREMENTS.md` R6.5

### v0.11.79 — Cross-Framework Property Aliases (R4.16)

- **FEATURE (R4.16)**: `border:` accepted as alias for `stroke:` — CSS/Tailwind's most common expectation for outline/border styling; emitter outputs canonical `stroke:`
- **FEATURE (R4.16)**: `apply:` accepted as alias for `use:` — Tailwind's `@apply` convention for referencing style blocks; emitter outputs canonical `use:`
- **EMITTER (R4.16)**: Standalone padding now emits `padding:` instead of `pad:` — `padding` is the universal term across CSS, Flutter, SwiftUI, and Compose; parser still accepts both `pad:` and `padding:`
- **TESTING**: 3 new tests — `parse_property_alias_border` (border→stroke roundtrip), `parse_property_alias_apply` (apply→use roundtrip), `roundtrip_padding_canonical` (padding: survives parse/emit)

### v0.11.78 — Import CSS Styles (R6.9)

- **FEATURE (R6.9)**: "Import CSS" button in canvas settings menu (⚙️) — click to select a `.css` file; class selectors are parsed and converted to FD `style` blocks using `parseCssToFdStyles()`, then prepended to the editor with a section header comment
- **CSS→FD MAPPING**: `background-color`/`background` → `fill`; `color` → `fill`; `border-radius` → `corner`; `opacity` → `opacity`; `box-shadow` → `shadow`; `border` → `stroke`; `font-family`/`font-size`/`font-weight` → `font`; unsupported properties silently ignored
- **UX**: Class names sanitized to FD identifiers (`.btn-primary` → `btn_primary`); RGB/RGBA colors auto-converted to hex; toast shows import count or "No mappable CSS classes found"
- **SITE**: `parseCssToFdStyles()` + `rgbToHex()` in `playground.js`; hidden `<input type="file" accept=".css">` element; `import-css` case in settings menu handler
- **EXTENSION**: Same `parseCssToFdStyles()` + `rgbToHex()` in `main.js`; Import CSS button + hidden file input in `webview-html.ts`; handler wired in `setupSettingsMenu()`

### v0.11.77 — Apple HIG Canvas Parity (R6.8)

- **UX (R6.8)**: Website playground canvas redesigned with Apple HIG design language — frosted glass toolbar, panels, and overlays using `backdrop-filter: blur(20px) saturate(180%)`; blue accent `#007AFF` replacing purple `#6C5CE7`; SF Pro system font stack; `0.5px` hairline borders; Apple-style color tokens (`--fd-*` CSS variables)
- **UX (R6.8)**: Horizontal frosted toolbar replaces vertical floating toolbar — tool buttons with text labels + keyboard shortcut hint badges (`V`, `R`, `O`, `T`, `A`, `P`, `E`); segmented control active state with blur shadow; undo/redo buttons + zoom pill in right zone
- **UX (R6.8)**: Properties panel enriched — `props-inner` wrapper with section labels ("Position & Size", "Appearance"), kind badge (blue capsule), Apple-style input fields
- **UX (R6.8)**: Layers panel indent guides — thin vertical lines (`::before` pseudo-element) showing hierarchy depth; Apple blue accent on selected items
- **UX (R6.8)**: Dimension tooltip — `W × H` tooltip appears below dragged/resized nodes during pointer interaction; frosted glass pill with monospace font
- **UX (R6.8)**: Modifier cursor feedback — ⌘/Meta shows grab cursor, Alt/Option shows copy cursor; matches VS Code extension behavior
- **SITE**: All canvas components (minimap, FAB, context menu, minimap zoom) updated to Apple HIG frosted glass tokens

### v0.11.76 — Resizable Panels (R6.7)

- **UX (R6.7)**: Layers panel is now resizable — drag the right edge handle to resize between 120–360px (site) or 140–400px (VS Code); handle highlights with accent color on hover/drag; double-click handle to collapse panel to 0px; click thin restore strip to uncollapse
- **UX (R6.7)**: Properties panel is now resizable — same drag/collapse mechanism on the left edge; canvas area dynamically adjusts via CSS variables `--layers-width` / `--props-width`
- **UX (R6.7)**: Panel widths persist across sessions — site uses `localStorage`, VS Code uses `vscode.setState()`; collapsed state also persisted
- **UX (R6.7)**: Floating toolbar offset dynamically tracks layers panel width — `left: calc(var(--layers-width) + 12px)` replaces hardcoded `192px`
- **SITE**: `setupPanelResize()` in `playground.js` — pointer capture drag handler, MutationObserver for props visibility, localStorage persistence
- **EXTENSION**: `setupPanelResize()` in `panels.js` — same drag handler pattern with `vscode.setState()` persistence; `getLayersPanelWidth()` in `navigation.js` already reads `offsetWidth` dynamically, so all zoom/fit/snap calculations auto-adapt

### v0.11.75 — Context Menu (R6.6)

- **UX (R6.6)**: Right-click context menu on playground canvas — glassmorphic dropdown with 8 actions: Duplicate, Delete, Bring Forward, Send Backward, Group, Ungroup, Copy as .fd; auto-selects node under cursor via `hit_test_at()`; dismisses on outside click, Escape, or pointerdown
- **SITE**: `setupContextMenu(editor)` wires contextmenu event, action dispatch via `handle_key` / `group_selected` / `ungroup_selected` / `duplicate_selected` / `delete_selected`, and viewport-aware positioning

### v0.11.74 — Properties Panel (R6.6)

- **UX (R6.6)**: Properties panel (right sidebar) in playground canvas — 200px panel showing selected node's ID, kind, position (X/Y readonly), size (W/H editable), fill color, stroke color + width, corner radius, opacity slider, duplicate + delete actions
- **SITE**: `updatePropertiesPanel()` reads `get_selected_node_props()` JSON; input handlers call `set_node_prop(key, value)` with debounce; minimap shifts right when panel is visible
- **SITE**: Panel hidden by default, appears on node selection (pointerup, layer click, render loop throttle)

### v0.11.74 — Remove Redundant Auto-Comments on Text Nodes (R4.21)

- **CLEANUP (R4.21)**: Text nodes no longer get `# [auto] label: "..."` comments — text content is already visible inline in the node declaration (e.g. `text @title "Dashboard"`), making the auto-comment 100% redundant; saves ~6% tokens in typical files; container, styled-shape, and edge-connection auto-comments are preserved
- **TESTING**: Updated `emit_no_auto_comment_text_node` (asserts text nodes produce no `[auto]`), `roundtrip_auto_comments_not_duplicated` (uses group node which still gets auto-comments)

### v0.11.73 — Layers Panel (R6.6)

- **UX (R6.6)**: Layers panel (tree view sidebar) in playground canvas — 180px left sidebar with glassmorphic background showing hierarchical document tree parsed from FD text; displays node kind icons (◻ group, ▢ rect, ○ ellipse, T text, ⟶ edge, ◆ style), click-to-select, and chevron expand/collapse for groups
- **SITE**: Ported `parseLayerTree()` and `renderLayerNode()` from VS Code extension `panels.js`; `refreshLayersPanel()` with diff-based skip (text + selectedId); throttled at ~10fps in render loop
- **SITE**: Canvas and floating toolbar offset by 180px to accommodate sidebar; `resizeCanvas()` and `FdCanvas` init adjusted for panel width

### v0.11.72 — Undo/Redo Buttons + Canvas Header Cleanup (R6.6)

- **UX (R6.6)**: Undo/redo buttons in playground canvas header — ↶ and ↷ ghost buttons with keyboard shortcut tooltips; calls `fdCanvas.undo()` / `fdCanvas.redo()` and syncs canvas + code editor
- **UX (R6.6)**: Clickable zoom indicator — clicking the zoom percentage in the header resets to 100% and pans to origin (0,0); hover shows subtle background highlight
- **SITE**: New `.canvas-header-actions` flex group, `.ch-btn` ghost buttons with border, `.ch-sep` vertical divider; `.zoom-indicator` now has `cursor: pointer` and hover state

### v0.11.71 — Minimap + Zoom Controls (R6.6)

- **UX (R6.6)**: Minimap in playground canvas — glassmorphic 150×100px thumbnail in bottom-right showing scaled scene overview with purple node rects and blue viewport rectangle; click/drag on minimap pans the canvas to that scene position
- **UX (R6.6)**: Zoom control buttons embedded in minimap — `−` (÷1.25), zoom percentage (click to reset 100%/0,0), `+` (×1.25); all zoom centered on canvas midpoint; synced with header zoom indicator and Ctrl+scroll zoom
- **SITE**: `renderMinimap()` extracts `@id` tokens from FD text, queries `get_node_bounds()` per node, computes scene bounding box, renders scaled rects + viewport rect; throttled to ~10fps in render loop
- **SITE**: `updateZoomIndicator()` now also syncs `#zoom-reset-btn` text

### v0.11.70 — Floating Toolbar on Playground Canvas (R6.6)

- **UX (R6.6)**: Floating toolbar on playground canvas — vertical glassmorphic toolbar on left side of canvas with 7 SVG tool buttons (Select, Rect, Ellipse, Text, Arrow, Pen, Eraser) matching the VS Code extension's floating toolbar; replaces inline header tool buttons
- **SITE**: Removed inline `#canvas-tools` div from `.editor-header`; added `#floating-toolbar` inside `#canvas-wrapper` with `position: absolute; left: 12px; top: 50%; transform: translateY(-50%)`; `.ft-btn` buttons styled as 32×32 rounded with accent highlight on active; SVG icons from `fd-vscode/src/webview-html.ts`
- **SITE**: Updated `playground.js` selectors from `.canvas-tool` to `.ft-btn` in `updateToolbar()` and click handler

### v0.11.69 — Rename `theme` → `style` Keyword (R4.18)

- **RENAME (R4.18)**: `theme` keyword → `style` — reusable property bundles now use the universal CSS/Figma term; emitter outputs `style` keyword and `# ─── Styles ───` section header; parser still accepts `theme` for backward compatibility
- **RENAME (R4.18)**: Internal Rust struct `Style` → `Properties` — better reflects the struct's role as a collection of visual properties (fill, stroke, font, etc.); field accessor `.style` → `.props` across all crates
- **COMPAT**: Parser accepts both `theme` and `style` keywords, and both `# ─── Themes ───` and `# ─── Styles ───` section separators; existing `.fd` files parse without changes
- **DOCS**: Updated `GEMINI.md` (style reuse rule), `REQUIREMENTS.md` (R4.18), `SKILL.md` (style grammar)

### v0.11.68 — Remove Click-to-Raise (R3.41)

- **REMOVED (R3.41)**: Click-to-raise — selecting a node via click no longer auto-brings it forward one z-level; this caused surprise z-order changes and silent `.fd` text reordering, polluted undo stack, and was a recurring bug surface (3+ patches for group-raise, idempotency, and dead-zone guards); explicit ⌘] / ⌘⇧] remain for intentional z-order changes
- **CORE**: Removed `prev_selected` snapshot, auto `bring_forward` block, and `zorder_changed` tracking from `pointer_up` in `lib.rs` (~33 lines)

### v0.11.67 — Free Frame Padding (R1.21)

- **FEATURE (R1.21)**: `pad:` property for Free-layout frames — insets the content area so children, text centering, and `place:` positioning all respect padding; standalone `pad: N` or inline `layout: column pad=N` both work; `pad: 0` is default and omitted from emitted output
- **CORE**: `LayoutMode::Free` now carries `{ pad: f32 }` matching Column/Row/Grid; manual `Default` impl returns `pad: 0.0`; layout solver computes padded content area for child defaults, text auto-centering, and `place:` alignment
- **PARSER**: New `"pad"` / `"padding"` standalone property arms for frames; updates all layout variants
- **DOCS**: Updated FD format SKILL.md with `pad:` in frame grammar and 2 new best practices (always use padding, prefer managed layouts); demo.fd sidebar converted to `layout: column gap=8 pad=16`
- **TESTING**: 6 new tests — `parse_free_frame_pad`, `roundtrip_free_frame_pad`, `parse_free_frame_pad_zero_omitted`, `layout_free_frame_pad_insets_children`, `layout_free_frame_pad_text_centered_in_padded_area`, `layout_free_frame_pad_zero_matches_no_pad`

### v0.11.66 — Interactive Playground (R6.6)

- **FEATURE (R6.6)**: Playground canvas is now fully interactive — pointer events (click to select, drag to move/resize, draw shapes) wired through WASM `handle_pointer_down/move/up` APIs; bidirectional sync with `suppressSync` echo prevention ensures canvas→code and code→canvas stay in sync
- **UX (R6.6)**: 7-tool toolbar in canvas header — Select (↖), Rect (□), Ellipse (○), Text (T), Arrow (→), Pen (✎), Eraser (◎); active tool highlighted with accent purple; auto-switches back to Select after drawing gesture
- **UX (R6.6)**: Floating action bar (FAB) — frosted-glass popup above selected nodes with Fill/Stroke color pickers and Delete button; positioned relative to node bounds accounting for zoom/pan
- **UX (R6.6)**: Zoom/pan navigation — scroll wheel pans, Ctrl/⌘+scroll zooms, Space+drag for hand-tool pan, middle-click pan; zoom indicator shows current level in canvas header
- **UX (R6.6)**: Keyboard shortcuts — V/R/O/T/A/P/E for tool switching, Delete/Backspace to remove nodes, ⌘Z/⌘⇧Z for undo/redo; focus management ensures shortcuts fire on canvas (not textarea)
- **SITE**: Zero Rust changes — all interactivity implemented in `playground.js` (~330 lines), `index.html` (toolbar + FAB markup), `style.css` (+95 lines)

### v0.11.65 — Playground-First Landing Page (R6.5)

- **UX (R6.5)**: Playground now visible on landing — embedded live playground directly in the hero section; users see code editor + canvas split-pane within the first viewport without scrolling
- **UX (R6.5)**: Removed `100vh` hero minimum height — hero now uses content-driven height with compact padding (`80px 24px 48px`), pushing interactive content above the fold
- **UX (R6.5)**: Removed redundant Code Preview section — the static syntax showcase (40 lines HTML + 50 lines CSS) is superseded by the live editable playground
- **PERF (R6.5)**: Added WASM preload hints in `<head>` — `<link rel="modulepreload">` for `fd_wasm.js` and `<link rel="preload" as="fetch">` for `fd_wasm_bg.wasm`; reduces perceived playground load time by ~1–2s on typical connections
- **UX (R6.5)**: Replaced loading spinner with animated skeleton — shimmering placeholder shapes (rect, circle, lines) mirror expected canvas content while WASM initializes; CSS-only animation, no additional JS
- **SITE**: Updated nav links — removed "Try Playground" (playground is now hero content); kept Features, Benchmarks, Architecture, Install Extension

### v0.11.64 — Fix Edge Flow Animation Freeze

- **FIX**: Edge flow animations (`flow: pulse`, `flow: dash`) now animate continuously when idle — previously froze until mouse interaction because the JS render loop's dirty-flag optimization had no knowledge of WASM-side time-dependent flow effects; added `has_active_flows()` WASM API that checks if any edge has a flow animation, cached in JS on scene change, and included in the render loop condition
- **WASM**: New `has_active_flows()` on `FdCanvas` — returns `true` if any edge in the scene graph has `flow.is_some()`
- **JS**: `hasFlowEdges` flag in `state.js` refreshed via `bumpGeneration()` and on initial load; render loop condition extended to `renderDirty || activeTweens.length > 0 || erasePoofs.length > 0 || hasFlowEdges`

### v0.11.63 — Demo Cleanup + Test Coverage

- **DOCS**: Rewrote `examples/demo.fd` from 562 lines of testing debris to a polished 236-line product dashboard showcase — demonstrates styles, edge_defaults, specs, animations, flows, frames with column layout, and semantic naming throughout
- **TEST**: Added `sync_bring_forward_already_front_is_noop` — z-order edge case: bring_forward on frontmost child is a no-op
- **TEST**: Added `sync_clone_name_sequence` — chained duplication produces `card`, `card_2`, `card_3`, `card_4` correctly
- **TEST**: Added `sync_near_detach_warning_zone` — exercises near-detach evaluation code path without panic
- **TEST**: Added `eraser_tool_hover_only_no_crash` — hover-only (no drag) produces no mutations and no crash
- **TEST**: Added `select_tool_reclick_keeps_selection` — re-clicking an already-selected node keeps it selected

### v0.11.62 — Fix Shift+Drag Bugs (R3.54)

- **FIX (R3.54)**: Near-origin jitter — Shift+drag axis constraint now uses a 4px dead-zone threshold before locking; within the dead-zone, movement is free (unconstrained); once past 4px, axis locks to horizontal or vertical and **stays locked** for the entire drag; previously the axis flipped every frame when `total_dx ≈ total_dy ≈ 0`
- **FIX (R3.54)**: Multi-select Shift+drag — Shift+clicking an already-selected node now defers the deselection to PointerUp, so Shift+drag can constrain axis movement of the full multi-selection; previously the clicked node was immediately deselected in PointerDown (toggle behavior), causing only the remaining nodes to move
- **CORE**: New `locked_axis: Option<bool>` field on `SelectTool` — `None` = undecided (below threshold), `Some(true)` = horizontal, `Some(false)` = vertical; reset on PointerUp and Esc-cancel
- **CORE**: New `shift_toggled_off: Option<NodeId>` field on `SelectTool` — tracks deferred deselection; cleared on PointerUp (fires deselect) or on drag start (cancels deselect since user intends to drag)
- **TESTING**: 3 new regression tests — `select_tool_shift_drag_dead_zone` (free move → axis lock → stays locked), `select_tool_shift_drag_multi_select_moves_all` (3 nodes all receive MoveNode), `select_tool_shift_click_deselects_on_pointerup` (deferred deselect fires correctly)

### v0.11.61 — Fix Alt+Drag Clone Bugs (R3.54)

- **FIX (R3.54)**: Selection coupling — cloning a node via Alt+drag no longer causes the clone and original to select together; root cause: clone inherited original's `Position` constraint, giving both identical resolved bounds → hit-test couldn't distinguish them; fix: `clone_node_recursive` now strips all positioning constraints and assigns a fresh `Position` from resolved bounds + offset
- **FIX (R3.54)**: Drag inversion — dragging the original after cloning no longer moves only the clone; same root cause as selection coupling (overlapping bounds from shared `Position` constraint)
- **FIX (R3.54)**: `DuplicateNode` mutation in `sync.rs` now also strips positioning constraints and uses resolved bounds + 20px offset, matching the WASM Alt+drag fix
- **UX**: Incremental clone naming — `rect_0` → `rect_2` → `rect_3` instead of `rect_0_copy_42`; new `next_clone_name()` scans graph for existing `{stem}_N` patterns and picks `max(N)+1`
- **TESTING**: 3 new regression tests — `sync_duplicate_position_independent` (moving original doesn't move clone), `sync_duplicate_incremental_naming` (card → card_2 → card_3 → card_4), `sync_duplicate_no_overlapping_bounds` (clone offset by 20px)

### v0.11.60 — Format Precision & AI Comprehensibility (R4.21)

- **FEATURE (R4.21)**: Comprehensibility Score requirement — R4.21 documents a planned 0–100 score measuring AI comprehensibility (semantic naming ratio, comment density, style reuse, edge default coverage, token cost)
- **CORE**: 1-decimal precision — `format_num` emits 1dp instead of 2dp for coordinates, dimensions, and scales (token efficiency)
- **CORE**: Edge defaults — `edge_defaults {}` block defines document-level default stroke/arrow/curve; individual edges skip matching properties
- **CORE**: ReadMode::Diff — `snapshot_graph()` creates hash-based snapshot; `emit_diff(graph, &snapshot)` outputs `+`/`~`/`-` prefixed changes
- **CORE**: Inline doc-comments — emitter generates `# [auto]` comments (text labels, child counts, style refs, edge connections); parser skips `[auto]` on round-trip
- **EXTENSION**: Edge-based naming — `ai-renamify.ts` adds `edgeTargets` to `NodeContext`; anonymous nodes connected to named nodes get `_to_target` suffix
- **EXTENSION**: Unified Refactor command — `ai-refactor.ts` orchestrates Renamify + style hoisting; `fd.refactor` command registered in palette
- **TESTING**: 14 new tests — F1 precision (2), F2 edge defaults (3), F5 snapshot/diff (4), F6 auto-comments (4), comprehensibility score (1)

### v0.11.59 — Path Serialization + Image Embedding + Parent-Aware Pen (R3.32, R3.62)

- **FEATURE (R3.62)**: Path command serialization — `d:` inline property uses SVG-like syntax (`M`, `L`, `Q`, `C`, `Z`) for pen tool path roundtrip; coordinates rounded to 2 decimals for token efficiency
- **FEATURE (R3.32)**: Image node support — new `NodeKind::Image` with `ImageSource::File`, `ImageFit` enum (cover/contain/fill/none); parser recognizes `image` keyword with `src:` and `fit:` properties; emitter serializes image nodes; renderers draw placeholder rect until WASM texture pipeline
- **FEATURE**: Parent-aware pen tool — `PenTool` now accepts `set_parent(id)` to create path nodes inside frames/groups instead of always at root level
- **CORE**: `ImageSource` and `ImageFit` enums added to `model.rs`; exhaustive `NodeKind::Image` match arms across 10 files (emitter, layout, transform, paint, render2d, svg, hover, lib.rs)
- **WASM**: Image props exposed in `get_selected_node_props` (kind, width, height, src, fit); `collect_node_tree` returns `"image"` kind; SVG export emits `<rect data-src="...">` placeholder
- **LSP**: Hover info for `image` keyword and `@id` hover shows src/dimensions/fit
- **TESTING**: 8 new roundtrip tests — 4 path (`roundtrip_path_with_commands`, `_cubic_and_close`, `_quad`, `_empty_commands`) + 4 image (`roundtrip_image_basic`, `_with_fit`, `_in_frame`, `_with_styles`)

### v0.11.58 — Mermaid Import + Detach Snap + Alt-Draw-From-Center (R1.18, R3.35, R3.19)

- **NEW (R1.18)**: Mermaid flowchart import — `parse_mermaid()` in fd-core parses `flowchart TD/LR` syntax into FD nodes + edges; supports node shapes (`[rect]`, `(rounded)`, `((circle))`, `{diamond}`), edge types (`-->`, `---`, `-->|label|`), subgraphs as frames; auto-layout grid positioning; `import_mermaid()` WASM API merges into current document
- **DONE (R3.35)**: Detach snap animation — purple glow + rubber-band line on near-detach; `playDetachAnimation()` with scale pop + glow overlay on structural detach (250ms); `evaluate_near_detach` WASM API returns parent/child centers for JS rendering
- **DONE (R3.19)**: Alt-draw-from-center — holding Alt/⌥ during RectTool/EllipseTool draw anchors the start point as center; combinable with Shift for constrained square/circle from center

### v0.11.57 — Remove Mid-Drag Alt Duplication (R3.54)

- **FIX (R3.54)**: Pressing Alt mid-drag no longer triggers node duplication — clone only activates when Alt is held at pointer-down time and the user drags ≥3px; previously pressing Alt while already dragging would clone instantly since the pointer was already in motion, exceeding the 3px threshold on the next frame
- **CORE**: Removed mid-drag `alt_press_pos` assignment from `handle_pointer_move` — `alt_press_pos` is now exclusively set in `handle_pointer_down`

### v0.11.56 — Alt+Drag 3px Threshold + Ghost Preview (R3.54)

- **FIX (R3.54)**: Alt+drag no longer clones immediately on Alt keypress — duplication is deferred until the pointer moves ≥3px from the Alt press position (Figma-style threshold); prevents accidental clones when pressing Alt during a drag or on click
- **UX (R3.54)**: Ghost preview during Alt+drag — translucent dashed outlines (#4FC3F7, 30% opacity) show the original node positions while dragging clones, providing clear visual feedback that duplication occurred
- **CORE**: New `alt_press_pos: Option<(f32, f32)>` field tracks the scene-space position where Alt was first detected; threshold check uses squared distance (≥9.0) for performance
- **CORE**: New `alt_clone_origins: Vec<(f32, f32, f32, f32)>` captures original node bounds at duplication time; exposed to JS via `get_alt_drag_ghost()` WASM API returning JSON array
- **JS**: Ghost state tracked in `altDragGhosts[]`; read from WASM during pointermove, rendered after scene paint, cleared on pointerup and Esc-cancel

### v0.11.55 — Fix Shift-Constraint Bugs (R3.54)

- **FIX (R3.54)**: Shift+drag axis-lock no longer jitters during diagonal movement — constraint now uses total displacement from drag origin (Figma-style) instead of per-frame delta, which was too small (~1-3px) and caused the locked axis to flip every frame
- **FIX (R3.54)**: Shift+draw Rect in northwest direction no longer jumps — origin (top-left corner) now computed from constrained square dimensions instead of raw cursor position; previously `x.min(start_x)` ignored the Shift-expanded size
- **FIX (R3.54)**: Shift+draw Ellipse in northwest direction — same origin fix as Rect (identical code pattern)
- **CORE**: Added `drag_start_x`/`drag_start_y` fields to `SelectTool` for tracking total drag displacement
- **TESTING**: 4 new regression tests — `select_tool_shift_drag_no_jitter_on_diagonal` (3-frame multi-move), `select_tool_shift_drag_locks_vertical`, `rect_tool_shift_draw_northwest_correct_origin`, `ellipse_tool_shift_draw_northwest_correct_origin`

### v0.11.54 — Esc-to-Cancel Drag (R3.61)

- **FEATURE (R3.61)**: Pressing Esc during a node drag (move/resize/draw) now cancels the gesture and restores the node to its pre-drag position — uses `abandon_batch()` on `CommandStack` to restore the text snapshot captured at `begin_batch()`, producing a pixel-perfect rollback with no undo entry
- **FEATURE (R3.61)**: Pressing Esc during toolbar drag-to-create cancels the gesture — ghost preview removed, all dtc state cleaned up
- **CORE**: New `abandon_batch()` on `CommandStack` — restores `batch_snapshot` text, resets `batch_depth` and `batch_dirty`; no undo entry created for cancelled gestures
- **WASM**: New `cancel_drag()` API — calls `abandon_batch()`, resets all tool drag states (SelectTool, RectTool, EllipseTool, PenTool, ArrowTool, EraserTool), clears interaction state, re-resolves layout
- **CORE**: New `is_drawing()` and `cancel()` methods on `RectTool`, `EllipseTool`, `PenTool` for querying and resetting drawing state
- **TESTING**: New `abandon_batch_restores_position` test — verifies 3 MoveNode mutations are fully reverted and no undo entry is created

### v0.11.53 — Click-to-Highlight Code (R2.5)

- **UX (R2.5)**: Clicking an already-selected node on the canvas now re-highlights its `@id` line in the code editor — previously only the first click (selection change) triggered the highlight; re-clicks on the same node were silently ignored by the dedup guard; this implements the "show me the code" intent for spatial navigation
- **ARCH**: Split canvas→code notification into two paths in `pointer.js`: selection-change triggers full `syncSelection()` (panels + code + dedup), re-click of same node posts `nodeSelected` directly (code highlight only, no redundant panel rebuilds)

### v0.11.52 — Renamify Tests + Heuristic Renamer (R4.20)

- **TESTING (R4.20)**: 50 new unit tests for Renamify in `ai-renamify.test.ts` — `parseRenamifyResponse` (17 tests: valid/malformed JSON, conflict resolution, sanitization, order), `applyGlobalRenames` (13 tests: declarations, constraints, edges, word-boundary safety), `buildRenamifyPrompt` (7 tests: prompt structure), `heuristicRename` (13 tests: text extraction, parent context, shape detection, conflicts)
- **FEATURE (R4.20)**: Heuristic renamer (`heuristicRename`) — no-API fallback that generates semantic names from FD document context: text content (`"Login"` → `login_label`), parent group name (`rect` inside `@sidebar` → `sidebar_rect`), shape detection (equal w/h ellipse → `circle`, wide rect → `bar`); wired as automatic fallback when no AI API key is configured
- **FIX**: `stripMarkdownFences` now supports `json`, `javascript`, `typescript`, `html`, `css` language tags — previously only matched `fd|text|plaintext`, causing partial stripping of ` ```json ``` ` fences that broke `parseRenamifyResponse`
- **INFRA**: Added `__mocks__/vscode.ts` stub and `vitest.config.ts` alias for `vscode` module resolution in test environment

### v0.11.51 — Alt+Drag Multi-Select (R3.60)

- **FEATURE (R3.60)**: Alt+drag now duplicates ALL selected nodes (was single-node only); `duplicate_selected_at` loops all selected with `clone_node_recursive`
- **FEATURE (R3.60)**: Deep copy — Alt+drag on Group/Frame recursively clones all descendants, preserving parent–child hierarchy via `clone_node_recursive`
- **FEATURE (R3.60)**: Internal reference remapping — cloned nodes' constraints (`Offset.from`, `CenterIn`) are remapped to point at sibling clones, not originals
- **FEATURE (R3.60)**: Edge duplication — edges where both endpoints are in the cloned set are duplicated with remapped anchors via `clone_edges_between`
- **WASM**: Lifted `selected.len() == 1` guards on both Alt+click (L287) and Alt+mid-drag (L352) to `!selected.is_empty()`

### v0.11.50 — Copy/Paste Improvements (R3.59)

- **FEATURE (R3.59)**: Paste offset — ⌘V now places pasted nodes +20px from the original (cumulative: +20, +40, +60… per successive paste); offset resets on new ⌘C; previously pasted nodes landed directly on top of the original
- **FEATURE (R3.59)**: Multi-select copy — ⌘C copies all selected nodes (was single-node only); uses `get_selected_ids()` and extracts text blocks for each
- **FEATURE (R3.59)**: ⌘X (cut) keyboard shortcut — copy + delete in one action; previously only available via context menu
- **FEATURE (R3.59)**: Paste undo — ⌘Z now correctly reverts a paste operation via text snapshot pushed to the undo stack; new `push_undo_snapshot` WASM API
- **WASM**: New `push_undo_snapshot(text_before, text_after)` API — allows JS-driven operations to register undoable snapshots without going through the mutation system
- **CORE**: New `push_snapshot()` on `CommandStack` — public method for external callers to push text snapshot undo entries

### v0.11.49 — Fix Alt+Drag Architecture (R3.54)

- **FIX (R3.54)**: Alt+drag no longer causes jumping/jittery behavior — unified duplication onto `FdCanvas::duplicate_selected_at(0,0)` which properly transfers selection to the clone; previously SelectTool emitted `DuplicateNode` but never updated selection, causing `MoveNode` to move the original instead of the clone
- **FIX (R3.54)**: Alt pressed mid-drag now works correctly — FdCanvas intercepts Alt modifier in `handle_pointer_move` before SelectTool, calls `duplicate_selected_at(0,0)` to clone-in-place with proper selection transfer
- **ARCH**: SelectTool no longer handles Alt duplication; FdCanvas is the single owner of Alt+dup logic since it can coordinate selection state, undo batching, and layout resolve
- **FIX**: Removed JS-side `select_by_id(hitId)` pre-selection on Alt+click in `pointer.js`/`main.js` — was fighting with WASM SelectTool handling

### v0.11.48 — Fix Alt+Drag Mid-Drag Activation (R3.54)

- **FIX (R3.54)**: Alt+drag to duplicate now works when Alt/Option is pressed mid-drag — macOS Option key pressed during active pointer capture was not updating `e.altKey` on `pointermove` events in Electron/VS Code webviews; added global modifier state tracking via `keydown`/`keyup`/`blur` listeners and wired `(e.altKey || modAltHeld)` across all pointer event handlers (down/move/up)
- **ROBUSTNESS**: Also tracks `modCtrlHeld`, `modMetaHeld`, `modShiftHeld` for consistent modifier detection across all pointer phases; state resets on `window.blur` to prevent stale modifiers after Alt+Tab

### v0.11.47 — Fix Alt+Drag Double-Duplicate + Mid-Drag Clone

- **FIX (R3.54)**: Alt+drag no longer duplicates a node twice — removed redundant JS-side `duplicate_selected_at(0,0)` call from `pointer.js`; WASM `SelectTool::handle()` is now the single source of truth for Alt+click duplication
- **FEATURE (R3.54)**: Pressing Alt mid-drag now triggers clone-and-drag (Figma behavior) — if you start dragging a node normally and press Alt during the drag, the original stays in place and you continue dragging a clone; `alt_duplicated` flag prevents re-duplication on subsequent move events
- **TESTING**: New `select_tool_mid_drag_alt_produces_duplicate` test — verifies DuplicateNode + MoveNode on first Alt move, and MoveNode-only on subsequent moves

### v0.11.46 — Ghost Resizes Dynamically During Zoom

- **FIX (R3.39)**: Drag-to-create ghost now resizes in real-time when zooming mid-drag — scroll-wheel zoom during a drag updates ghost width/height every frame to match the current zoom level

### v0.11.45 — Ghost Scales with Zoom Level

- **FIX (R3.39)**: Drag-to-create ghost now scales with canvas zoom — at 200% zoom the ghost is 2× larger, at 50% it's half-sized, matching how the created shape will actually appear on screen

### v0.11.44 — Alt-Gated Snap-to-Node + Auto-Edge

- **UX (R3.43)**: Snap-to-node + auto-edge on toolbar drag-to-create now requires ⌥ Alt modifier — without Alt, shapes drop freely at the cursor position without snapping or creating edges; reduces false positives in flowchart workflows
- **UX (R3.43)**: Alt-aware ghost preview during drag — when ⌥ Alt is held near a node, ghost snaps to the nearest cardinal position and a dashed edge preview line (accent color) renders from target node center to ghost center with endpoint indicator circle
- **DOCS**: Updated `floating-toolbar.md` (R3.43 section) and `SHORTCUTS.md` (floating toolbar table) to document ⌥ Alt requirement

### v0.11.43 — Fix Toolbar Snap & Ghost Shape Bugs (4 Fixes)

- **FIX (R3.39)**: Toolbar now lands at the exact ghost position — `pointerup` reuses `getSnapPosition()` instead of computing a separate `vw`/`vh` position that could diverge
- **FIX (R3.39)**: Ghost shapes now match WASM `create_node_at` defaults — rect: 100×80 (was 120×80), ellipse: 100×80 oval (was 100×100 circle), frame: 200×150 (was 140×100)
- **FIX (R3.39)**: Toolbar tooltips now visible in horizontal mode — changed `.scroll-paper-body` from `overflow: hidden` to `overflow: visible`
- **FIX (R3.39)**: Vertical toolbar tooltips now appear to the right instead of above, preventing overlap

### v0.11.42 — Fix Toolbar Ghost Orientation on Cross-Side Drag

- **FIX (R3.39)**: Snap guide ghost now correctly shows vertical orientation when dragging toolbar to the opposite left/right edge — previously the ghost appeared horizontal because `getSnapPosition()` used live `offsetWidth`/`offsetHeight` which flip with toolbar orientation; now captures canonical (horizontal-layout) dimensions at drag start and uses those for ghost sizing regardless of current state

### v0.11.41 — Fix Text Wrap Regressions (3 Bugs)

- **FIX (R3.46)**: Text height no longer reverts on pointer release — `set_text()` now skips re-parse and `resolve()` when incoming text is identical to current text, preventing JS-measured bounds from being overwritten by heuristic (KI Lesson #9)
- **FIX (R3.46)**: Wrap threshold no longer triggers prematurely — `intrinsic_size` with `max_width` now returns single-line placeholder height; JS `measureText()` is the sole authority for wrapped height; removed heuristic multi-line estimation from `sync.rs` ResizeNode handler
- **TESTING**: Updated 3 tests — `layout_text_max_width_wraps_height` (single-line placeholder), `sync_resize_parent_sets_child_text_max_width` (width-only), `sync_resize_text_preserves_height` (renamed, height unchanged)

### v0.11.40 — Text Wrap Boundary Expansion + Parent Resize Propagation

- **FEATURE (R3.46)**: Text nodes with `max_width` now correctly expand their bounding box vertically to enclose wrapped text — `intrinsic_size` heuristic in `layout.rs` accounts for `max_width` and estimates multi-line height
- **FEATURE (R3.46)**: Resizing a parent shape smaller than child text's bounds now auto-sets `max_width` on the child text (Option A: permanent), causing auto-wrap and vertical expansion — propagation logic in `sync.rs` handles Rect/Ellipse/Frame parents, respects layout padding, skips explicitly positioned children
- **FEATURE (R3.46)**: Direct text node resize now estimates wrapped height from content length instead of using drag height — more accurate immediate feedback during resize
- **WASM**: New `get_text_children(node_id)` API — returns JSON array of text child IDs for JS remeasurement after parent resize
- **WASM**: `get_node_props` now returns `maxWidth` for text nodes — enables JS `measureAndUpdateTextBounds` to detect wrap constraints
- **JS**: Post-resize text remeasurement — `pointer.js` now calls `measureAndUpdateTextBounds` on text nodes and text children after any interaction that changes the canvas
- **TESTING**: 3 new regression tests — `layout_text_max_width_wraps_height`, `sync_resize_parent_sets_child_text_max_width`, `sync_resize_text_estimates_wrapped_height`

### v0.11.39 — Fix FAB Popup on Layers/Code Selection

- **FIX (R3.8)**: Floating Action Bar (fill/stroke/opacity controls) no longer pops up when selecting a node via Layers panel or Code cursor — FAB is now canvas-contextual only; Properties panel is the correct surface for non-canvas interactions

### v0.11.38 — Properties Panel Actions + FAB Cleanup

- **UX (R3.8)**: Added "Actions" section to the Properties panel — 8 buttons in a 2-column grid (Group, Ungroup, Duplicate, Frame, Front, Back, Copy PNG, Delete) with keyboard shortcut hints; Group/Frame buttons auto-disable when <2 nodes selected; Ungroup auto-disables when no group is selected; matches Figma right-inspector pattern
- **CLEANUP**: Removed FAB overflow menu (⋯ button + 5-item dropdown) — all actions now in Properties panel + context menu + keyboard shortcuts; declutters the Floating Action Bar to style-only controls
- **CLEANUP**: Removed `fab-overflow-menu` reference from `hideFloatingBar()` in context-menu.js

### v0.11.37 — Fix Default Style Chain + Drag-to-Create UX

- **FIX (R3.52)**: New shapes (canvas-drawn and click-to-create) now render with transparent fill + bordered stroke — previously `RectTool`/`EllipseTool` created bare nodes with no style, renderer defaulted `None` fill to grey `#CCCCCC`, and `set_node_prop("fill", "none")` silently failed because `Color::from_hex("none")` returned None.
- **FIX**: `set_node_prop("fill")` now handles `"none"` and `"transparent"` values — clears fill to `None` instead of silently returning false.
- **FIX**: Renderer `apply_fill()` no longer paints grey for `None` fill — `draw_rect`/`draw_ellipse` now guard `ctx.fill()` with `style.fill.is_some()`, matching `draw_path`'s existing behavior.
- **UX**: Cancel/re-drag on toolbar re-entry — dragging a tool back over the toolbar cancels the operation (ghost removed); dragging out again reactivates it.
- **NEW**: Alignment guides during drag-to-create — pink snap lines (Keynote/Freeform-style) appear when the ghost shape aligns with existing nodes, via new `compute_guides_for_rect()` WASM API.
- **TESTING**: 2 new tests — `rect_tool_creates_with_default_stroke`, `ellipse_tool_creates_with_default_stroke`.

### v0.11.36 — Snap Guide: Ghost Rectangle + Closest-Edge Detection

- **IMPROVE**: Snap guide now shows a ghost rectangle matching toolbar size at exact landing position (not a thin edge line).
- **FIX**: Snap detection uses closest-edge comparison instead of if-else chain — top snap is now reachable without dragging to the very edge.
- **FIX**: Left snap guide accounts for Layers panel width (232px offset).

### v0.11.35 — Fix Toolbar Drag Jump + Snap Guide Preview

- **FIX**: Toolbar no longer jumps on initial click — position normalization deferred from `pointerdown` to `pointerup`; uses `transform: translate()` during drag only.
- **FEATURE**: Snap destination preview — dashed border guide appears at the target edge (top/bottom/left/right) while dragging the toolbar, providing visual feedback before releasing.

### v0.11.34 — Fix Context Menu Shown on Launch

- **FIX**: Close context menu, floating action bar, and edge context menu at end of `main()` init to prevent stale menus appearing on canvas launch.

### v0.11.33 — Fix Init Crash: setupSelectionBar + CSP Inline Styles

- **FIX (R3.42)**: Remove call to non-existent `setupSelectionBar()` in `main()` — this crashed WASM init and prevented `setupFloatingToolbar()` (including drag-to-create) from ever executing. Dead code from a prior refactor.
- **FIX**: Add `'unsafe-inline'` to CSP `style-src` — JS-set inline styles (ghost preview, toolbar drag, minimap overlays) were being silently blocked by Content Security Policy.

### v0.11.32 — Fix Drag-to-Create: Prevent Native Drag Hijack on SVG Icons

- **FIX (R3.42)**: Drag-to-create now works — added `e.preventDefault()` in tool button `pointerdown` handler to prevent browser-native drag-and-drop on `<svg>` icons inside `<button>` elements, which was hijacking all `pointermove` events before the drag threshold could be reached (7th fix attempt — previous 6 fixed event routing but not the native drag takeover)
- **FIX (R3.42)**: Added CSS `pointer-events: none; -webkit-user-drag: none` on `.ft-tool-btn svg` as belt-and-suspenders protection against native SVG drag

### v0.11.31 — Fix Pointer Event Regressions (from v0.11.30)

- **FIX (R3.42)**: Drag-to-create from toolbar no longer triggers context menu — canvas `pointerup` handler now skips entirely when `canvasPointerId === -1` (no canvas `pointerdown` started the interaction); previously, drag-to-create's `pointerup` handler cleared `dtcTool` before the canvas handler ran, allowing fallthrough
- **FIX (R3.39)**: Floating toolbar is now draggable again — canvas `pointermove` handler now checks `ftDragging` (hoisted from closure to module scope) to skip processing during toolbar drag; prevents cursor interference and WASM hover calls during toolbar repositioning

### v0.11.30 — Fix Drag-to-Create from Toolbar (Remove setPointerCapture)

- **FIX (R3.42)**: Drag-to-create from floating toolbar now works reliably — removed all `canvas.setPointerCapture` calls from `pointer.js` which stole pointer events from the toolbar's document-level `pointermove`/`pointerup` listeners, preventing ghost preview from appearing and shapes from being created on drop
- **REFACTOR (R3.39)**: Canvas pointer event handling now uses document-level listeners with `canvasPointerId` tracking — same pattern already proven by toolbar drag and drag-to-create handlers; eliminates entire class of "pointer capture steals events from sibling overlays" bugs
- **FIX (R3.39)**: Toolbar guard in canvas `pointerdown` replaced from fragile `getBoundingClientRect()` comparison to robust `e.target.closest('#floating-toolbar')` DOM ancestry check — works regardless of toolbar orientation, transforms, or rolled-up state
- **REFACTOR**: `dtcTool` and `dtcActive` hoisted from `setupFloatingToolbar()` closure to module scope in `navigation.js` — enables cross-module coordination with canvas pointer handlers

### v0.11.29 — Consolidated `syncSelection()` + Edge Sync

- **REFACTOR (R2.5)**: All selection sync logic consolidated into one `syncSelection(id, source)` function in `sync.js` — previously scattered across 4 files (pointer.js, panels.js, shortcuts.js, sync.js); single source of truth for Canvas↔Layers↔Code synchronization; future panels stay in sync automatically
- **UX (R2.5)**: Edge selection now syncs across Layers and Code panels — clicking an edge `⟶` in Layers highlights the edge's `@id` line in Code; clicking a Code line with `edge @id` highlights it in Layers and scrolls into view; Canvas edge selection is a no-op (gracefully handled, waiting for WASM edge highlight support)

### v0.11.28 — Cross-Panel Selection Sync

- **UX (R2.5)**: Clicking a node in any panel now syncs selection across all three panels (Code, Canvas, Layers):
  1. **Layers scroll-into-view**: When a node is selected via Canvas click or Code cursor, the Layers panel now scrolls the selected item into view (`scrollIntoView({ block: 'nearest', behavior: 'smooth' })`)
  2. **Code→Canvas focus**: Clicking a node line in Code now pans/zooms the Canvas to focus on the node (via `focusOnNode()`), matching the existing Layers→Canvas behavior
  3. **Debounced Code sync**: Code→Canvas focus uses a 150ms debounce to prevent animation jitter when rapidly arrowing through lines

### v0.11.27 — Fix Toolbar Drag (v2 — 3-Layer Defense)

- **FIX (R3.39)**: Toolbar drag now actually works — previous fix (v0.11.23) was ineffective because canvas `pointerdown` intercepted events over the toolbar area. Applied 3 defensive fixes:
  1. Canvas `pointerdown` guard: skips events whose coordinates fall inside the toolbar bounding rect
  2. Canvas CSS `position: relative; z-index: 1` for proper stacking context (toolbar z-index: 25)
  3. `releasePointerCapture` on every canvas `pointerup` to prevent stale captures from blocking toolbar events

### v0.11.23 — Fix Toolbar Drag "Select All" + Unmovable Toolbar

- **FIX (R3.39)**: Dragging the floating toolbar no longer triggers browser text selection ("select all") — added `user-select: none` and `touch-action: none` to `#floating-toolbar` CSS
- **FIX (R3.39)**: Toolbar is now draggable from anywhere on its body — replaced scroll-handle-only `pointerdown` with a toolbar-wide handler that initiates drag from the toolbar background, paper body, and scroll handles (tool buttons excluded to preserve click-to-select and drag-to-create)

### v0.11.26 — Absolute Positioning in Managed Layouts

- **FEATURE (R3.2)**: Children inside Column/Row/Grid frames can now be freely moved — dragging a managed-layout child adds a `Position` constraint that pulls it out of the layout flow (Figma-style "Absolute Position" toggle)
- **FIX (R3.2)**: Position constraints now apply inside managed layouts — `resolve_constraints_top_down` no longer skips Position for managed children; Column/Row/Grid layouts filter out positioned children from their flow instead
- **TESTING**: Updated `layout_column_position_constraint_becomes_absolute` + `sync_move_managed_layout_child_converts_to_absolute` tests

### v0.11.25 — Fix Frame Resize Children Jump

- **FIX (R3.2)**: Resizing a Free-layout frame/rect/ellipse no longer resets child bounds — `resolve_children` Free branch now uses `or_insert` to preserve existing cached bounds (JS-measured text sizes, explicit positions) during `resolve_subtree`; managed layouts (Column/Row/Grid) still use `insert` for correct re-flow
- **TESTING**: `resolve_subtree_preserves_cached_bounds_and_recenters` regression test — verifies JS-measured child sizes survive parent resize while auto-centering still works

### v0.11.23 — Fix Canvas Resize + Text Editing Shape Preservation

- **FIX (R3.2, R3.28)**: Resizing parent shapes (rect/ellipse/frame) is now smooth — `apply_mutations` in `lib.rs` now skips the full `resolve_layout()` call for resize-only mutation batches (same as move-only batches). Previously, `resolve()` created a fresh HashMap that discarded all in-place bounds updates including JS-measured text sizes, causing a "resize fight" that snapped shapes back every frame
- **FIX (R3.28)**: Frame resize and child movement now works — same root cause as above; `resolve_subtree` in `SyncEngine::apply_mutation` handles subtree re-layout during drag, `resolve()` was undoing it
- **FIX (R3.28)**: Inline text editor now renders correctly before textarea appears — added `render()` call after `clear_pressed()` in `openInlineEditor` to flush bounds changes from `measureAndUpdateTextBounds` to the canvas
- **TESTING**: Updated `resolve_subtree_recenters_child_after_resize` regression test

### v0.11.20 — Child Placement & Auto-Center Multi-Child

- **FEATURE (R3.36)**: New `place:` property — 9-position child alignment within parent (top-left, center, bottom-right, etc.); supports both compound (`top-left`) and two-arg (`left top`) syntax
- **IMPROVEMENT (R3.36)**: Lifted single-child restriction for auto-centering — all text children in shape parents (Rect/Ellipse/Frame) without explicit Position constraint are now auto-centered
- **LAYOUT**: Priority order: explicit `Position` constraint > `place:` > auto-center > parent origin
- **PARSER**: `parse_place_value` with hyphenated keyword support; `place:` is distinct from `align:` (text rendering alignment)
- **TESTING**: 9 new/updated tests — 4 parser tests + 5 layout tests

### v0.11.19 — Fix Parent Frame Resize Children

- **FIX (R3.2)**: Resizing a parent frame/rect/ellipse now re-resolves children during drag — Column/Row/Grid children re-flow to fit new dimensions, centered text re-centers within resized parent; previously children stayed at old positions until pointer-up flush
- **CORE**: New `resolve_subtree(graph, idx, bounds, viewport)` in `layout.rs` — lightweight single-subtree re-resolve (reuses `resolve_children` + `resolve_constraints_top_down` + `recompute_group_auto_sizes`) called from `ResizeNode` handler
- **TESTING**: 4 new regression tests — `sync_resize_frame_children_reflow` (Column re-stack), `sync_resize_frame_centered_text_recenters` (text re-center), `sync_move_frame_flush_no_jump` (no visual jump on flush), `sync_move_frame_children_follow_after_flush` (children relative positions preserved)

### v0.11.18 — Modifier Key Cursor Feedback

- **UX (R3.48)**: Holding a bare modifier key now shows a cursor preview — Cmd/⌘ → grab (pan), Alt/Option → copy (duplicate), Ctrl → red eraser (delete); cursor appears immediately on keydown, clears on keyup or click; handles edge cases (window blur, tab-away, active pointer interaction)
- **CSS**: 3 new cursor classes (`modifier-cmd`, `modifier-alt`, `modifier-ctrl`) with `!important` to override tool-specific cursors during modifier hold
- **DOCS**: Updated `SHORTCUTS.md` with Alt (hold) and Ctrl (hold) cursor preview entries

### v0.11.17 — Fix Text Child Movement in Managed Layouts

- **FIX (R3.34)**: Moving a text child inside a frame with `layout: column/row/grid` is now a no-op — the layout solver owns child placement in managed layouts, so dragging individual children was causing snap-back, useless `x:/y:` properties, and frame expansion weirdness; matches Figma behavior where auto-layout children cannot be freely repositioned
- **CORE**: Made `is_parent_managed()` public in `layout.rs` so `sync.rs` can check layout mode before applying `MoveNode`
- **TESTING**: New `sync_move_managed_layout_child_noop` regression test — verifies bounds unchanged and no Position constraint added when moving a Column-layout child

### v0.11.16 — Fix Floating Toolbar Drag

- **FIX (R3.39)**: Floating toolbar is now draggable again — three compounding bugs fixed: (1) document-level `pointermove`/`pointerup` handlers now filter by `e.pointerId` to prevent cross-handler interference with drag-to-create; (2) `pointerdown` on scroll handles now normalizes toolbar position to absolute `px` values, eliminating CSS anchor conflicts between hardcoded `left: 244px` and JS-set `vw`/`vh` units; (3) `.scroll-handle` hit area expanded from 6px wood-core to 16px min-width with padding
- **UX (R3.39)**: Dragging the toolbar now shows visual feedback — lifted shadow (`0 8px 32px`) and slight opacity reduction (0.92) during drag, cleared on release

### v0.11.15 — Apple Preview-Style Text Editing

- **FIX (R3.28)**: Text nodes now show only 2 horizontal resize handles (MiddleLeft + MiddleRight) instead of 8-point handles — matches Apple Preview / Figma behavior where text height is intrinsic (auto-sized from font content); selection border reduced from 2px to 1px for text nodes
- **FIX (R3.28)**: Inline text editor now uses minimal Apple Preview-style overlay — thin 1px border, no box-shadow, no border-radius (was 2px outline + drop shadow + 8px radius); shape labels retain their visible styling
- **FIX (R3.46)**: Text bounding box padding reduced from 4px to 2px per side — matches renderer's `draw_text` y-offset (+2.0), eliminating oversized height boundary that made text boxes extend well below visible content
- **FIX (R3.28)**: Text node resize hit-test and cursor feedback now restricted to MiddleLeft/MiddleRight — `hit_test_resize_handle` (WASM), `getResizeHandleCursor` (JS), and `draw_selection_handles` (renderer) all filter handles by `NodeKind::Text`
- **FIX (R3.28)**: Inline editor minimum height now uses `lineHeight + 4px` instead of arbitrary `28px` — font calculation moved above screen-space computation so `lineHeight` is available for tight height sizing

### v0.11.14 — Inline Editor Zero-Jump Editing

- **FIX (R3.28)**: Inline text editor now visually matches canvas-rendered text with zero jump — replaced `border` with `outline` (outlines don't affect layout), fixed vertical padding to match Canvas2D `text_baseline` positioning exactly (`top` → scaled 2px offset, `middle` → symmetric padding, `bottom` → bottom-anchored), matched font-family fallback chain to renderer (`"Inter, sans-serif"`)

### v0.11.13 — Fix Text Rendering Mismatch + Bounding Box Sizing

- **FIX (R3.28)**: Inline text editor now visually matches canvas-rendered text — textarea positioning, padding, and line-height aligned with Canvas2D `draw_text`: line-height reduced from `fontSize*1.4` to `fontSize*1.2`, left padding removed (0px), top padding set to 2px matching renderer's `b.y+2.0` offset, textarea positioned exactly at node bounds
- **FIX (R3.46)**: Text bounding box now fully wraps content — JS `measureAndUpdateTextBounds` uses `fontSize*1.2` as minimum height floor (tight glyph metrics can be smaller than visual font height for descender-less text); WASM `update_text_metrics` padding increased from 2px to 4px per side

### v0.11.12 — Transparent Defaults + Copy/Paste Style

- **UX (R3.52)**: Newly created rect/ellipse shapes now default to transparent fill with visible stroke — removes the opaque white rectangle that previously obscured content underneath; consistent with Excalidraw/ScreenBrush behavior
- **UX (R3.52)**: Stroke color is now theme-contextual — dark stroke (`#333`) on light canvas, light stroke (`#A0A0B0`) on dark canvas; adapts via `self.dark_mode` flag in WASM `create_node_at`
- **NEW (R3.53)**: Copy Style (⌥⌘C) / Paste Style (⌥⌘V) — copies the selected node's full `Style` (fill, stroke, corner radius, opacity, font, shadow) to a clipboard, then applies it to another selected node; toast feedback "Style copied" / "Style pasted"
- **CORE**: `style_clipboard: Option<Style>` field on `FdCanvas` for cross-node style transfer via `CopyStyle` / `PasteStyle` `ShortcutAction` dispatch
- **TESTING**: New `resolve_copy_paste_style` test — verifies ⌥⌘C → CopyStyle, ⌥⌘V → PasteStyle, ⌘C → Copy (no alt regression)

### v0.11.11 — Fix Nested Group Drill-Down

- **FIX (R3.24)**: Clicking a node nested inside multiple groups (e.g., `OuterGroup > InnerGroup > Rect`) now correctly drills down through the hierarchy — first click selects outer group, second click selects inner group, third click selects the leaf node; previously clicks oscillated between the two groups forever because `effective_target` required cumulative selection `[outer, inner]` but `SelectTool` replaced selection to `[inner]`; fixed by using `rposition` (deepest match) instead of linear scan
- **TESTING**: 2 new regression tests — `test_effective_target_nested_drill_down_three_levels` (4 levels: A→B→C→leaf), non-cumulative selection assertion in `test_effective_target_nested_groups_selects_topmost`

### v0.11.10 — Fix Drag-to-Create from Toolbar

- **FIX (R3.39)**: Drag-to-create now works in VS Code webview — moved `pointermove`/`pointerup` listeners from button-level to document-level; same root cause as v0.11.8 (toolbar drag handles): `setPointerCapture` silently fails in VS Code webview iframes, so pointer events stopped firing when cursor left the toolbar button

### v0.11.9 — Remove Onboarding Overlay

- **REMOVED (R3.51)**: Removed the "Start drawing" / "Create something beautiful" onboarding overlay — it obstructed the canvas with a z-index 950 full-screen backdrop that flashed on every file open (even non-empty files like `dark_theme.fd`); the floating scroll toolbar with tooltips and `?` shortcut help already provide sufficient tool discovery
- **CLEANUP**: ~85 lines CSS, 22 lines HTML, ~57 lines JS removed from `webview-html.ts` and `main.js`

### v0.11.8 — Fix Floating Toolbar Drag Handles

- **FIX (R3.39)**: Floating toolbar drag handles now work reliably in VS Code webview — moved `pointermove`/`pointerup` listeners from handle elements to document level; `setPointerCapture` silently fails in VS Code webview iframes, causing drag events to stop when pointer leaves the small handle element

### v0.11.7 — Eraser Context Menu Fix + Lock Icon + Undo Dismissal

- **FIX (R3.48)**: Ctrl+click eraser no longer opens context menu on macOS — `contextmenu` event is now suppressed when eraser tool is active (temp or permanent)
- **UX (R3.49)**: Floating toolbar tool buttons now show 🔒 lock badge at top-right when tool is locked (double-press) — matches existing top toolbar behavior
- **FIX (R3.50)**: Undo/redo now dismisses open context menus and annotation cards — prevents stale popups after graph state changes

### v0.11.6 — Fix Eraser Tool Crash

- **FIX (R3.48)**: Pressing E (eraser tool) no longer crashes/freezes the canvas — `handle_pointer_move` in WASM had `unreachable!()` for eraser when not dragging; replaced with `vec![]` no-op for hover state
- **UX (R3.48)**: Added eraser button to floating toolbar — 8th tool button with eraser SVG icon and tooltip showing shortcut `E`
- **UX (R3.48)**: Added `e: "eraser"` to JS `toolShortcuts` map — double-press `EE` now locks the eraser tool (consistent with `RR`, `OO`, etc.)
- **UX (R3.48)**: Added `tool-eraser` CSS cursor — red X-crosshair SVG cursor appears when eraser is active
- **UX (R3.48)**: Added `E → Eraser` entry to keyboard shortcuts help overlay (`?`)

### v0.11.5 — Fix Duplicate Section Separators

- **FIX (R4.12)**: Section separator comments (`# ─── Layout ───`, `# ─── Themes ───`, etc.) no longer duplicate on each parse→emit round-trip — parser now skips emitter-generated separators via `is_section_separator()` check in `collect_leading_comments`; user comments are preserved
- **TESTING**: 2 new regression tests — `roundtrip_no_duplicate_separators` (3 round-trips verifying exactly 1 separator each), `roundtrip_user_comments_not_stripped`

### v0.11.4 — Visual Child Highlight

- **UX (R3.24)**: Clicking a child inside a group now highlights the **child** visually (blue border + resize handles) while logically selecting the **group** for operations (drag, delete, duplicate) — gives immediate visual feedback about the clicked element without breaking group behavior
- **CORE**: Added `visual_highlight: Vec<NodeId>` to `SelectTool` — tracks which nodes the renderer highlights, separate from `selected` (logical selection for operations)
- **CORE**: `render()` now passes `visual_highlight` to `render_scene()` instead of `selected`; all callsites that modify `selected` now sync `visual_highlight` (marquee, delete, duplicate, group, ungroup, deselect, add_node, select_by_id)
- **TESTING**: New `test_visual_highlight_differs_from_selected` — verifies the contract that `effective_target` returns the group while the raw hit (the child) is used for visual highlighting

### v0.11.3 — Canvas Interaction Fixes

- **FIX (R3.16)**: Shapes (rect, ellipse) can now be drawn in all directions — dragging north or west now correctly repositions the origin via `MoveNode` alongside `ResizeNode`; previously shapes only drew toward south-east
- **FIX (R1.19)**: Standalone arrows — arrows can now be drawn without connecting to a source or target node; uses `EdgeAnchor::Point` for unconnected endpoints; minimum 10px drag distance required to create
- **FIX (R1.19)**: Arrow preview line is now solid — removed dashed `setLineDash` from arrow preview rendering in `main.js`
- **UX (R3.24)**: Arrow target highlight — hovering over a node during arrow drag now shows a blue glow ring (#4FC3F7) around the potential target; WASM `get_arrow_preview` now includes `target_id` in JSON response
- **FIX (R3.24)**: Groups no longer have resize handles — `hit_test_resize_handle` returns `None` for Group nodes; group size derives purely from children
- **TESTING**: 6 new tests — `rect_tool_draw_northwest_emits_move`, `ellipse_tool_draw_northwest_emits_move`, `rect_tool_draw_southeast_no_extra_move`, `arrow_tool_standalone_creates_edge`, `arrow_tool_too_short_creates_nothing`, `arrow_tool_connected_still_works`; updated `arrow_tool_no_source_no_edge` → `arrow_tool_half_connected_point_to_node`

### v0.11.2 — Group Render + Text Bounds Fix

- **FIX (R5.4)**: Groups no longer appear as solid rectangles — selected groups now show dashed border instead of solid stroke + 8-point resize handles; matches Figma behavior where groups are purely organizational
- **FIX (R3.28)**: Inline text editor now preserves text style on double-click — WASM `get_selected_node_props` always returns resolved font properties (fontSize, fontFamily, fontWeight) including defaults, preventing mismatched rendering
- **FIX (R3.46)**: Text boundary tighter — WASM padding reduced from 4px→2px per side; JS `measureAndUpdateTextBounds` uses precise Canvas2D glyph metrics (`actualBoundingBoxAscent + Descent`) instead of `fontSize * 1.4` approximation

### v0.11.1 — Empty Parent Cleanup on Detach

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
- **FIX**: Implemented Pointer Capture API on canvas to resolve ghost touch and zoom drift issues caused by window blur/focus events
