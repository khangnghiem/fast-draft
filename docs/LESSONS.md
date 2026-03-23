# Lessons Learned

Engineering lessons discovered through building FD.

<!-- KEYWORD INDEX — grep these keywords to find relevant sections:
  resize, bounds, ownership     → L7-23   (Resize Fight: Bounds Ownership Chain)
  e2e, unit-test, canvas-bug    → L26-33  (Unit Tests Can't Catch Canvas Interaction Bugs)
  reparent, drag, context-menu  → L36-43  (Auto-Reparent on Drag Is Fragile)
  containment, child, overlap   → L46-53  (Child Containment)
  bidi, cursor, echo-back       → L56-66  (Bidi-Sync: Cursor Echo-Back)
  layout, bounds, text-center   → L69-79  (Layout Solver: Bounds ≠ Visual Position)
  defaults, renderer, multi-layer → L82-94 (Multi-Layer Defaults)
  layer, selection, panel       → L97-107 (Layer Panel Skips Selection Highlight)
  snap, smart-guides, threshold → L110-120 (Smart Guides: 1px Threshold)
  group, detach, chasing        → L123-133 (Group Detach: Chasing Envelope)
  webview, context-menu, vscode → L136-143 (VS Code Webview Context Menu)
  drag-state, truncation, frame → L146-153 (Continuous Drag State Truncation)
  git, push, main, hook         → L156-166 (Git: Never Push to Main)
  text, reparent, animation     → L169-183 (Text Reparent Blocked)
  hit-test, handle, radius      → L186-196 (Hit Radius Must Match Visual Handle Size)
  text, padding, inline-editor  → L199-209 (Text Intrinsic Sizing Padding)
  group, selection, handles     → L212-222 (Group Selection Handles)
  wasm, props, defaults, json   → L225-234 (Always Return Resolved Defaults)
  feature, removal, cleanup     → L237-246 (Feature Removal Requires Full Cleanup)
  resize, cached-bounds, model  → L249-259 (Cached Bounds Must Track Mutations)
  animation, time, hover        → L262-272 (Animations: Always Add Time Limits)

  codespace, cp, target, sync   → L304-318 (gh codespace cp Hangs)
  browser, subagent, context, spiral → L320-344 (Browser Subagent Context Spiral)
  native-drag, svg, preventDefault → L347-355 (Native Drag Hijacks SVG Pointerdown)
  e2e, verify, bug-fix, behavior   → L496 (Verify Bug Fixes With Targeted Browser Measurement)
  localStorage, stale, DOM, state  → L514 (localStorage ≠ Runtime Visual State)
  undo, batch, snapshot, resolve  → L358-375 (Snapshot Undo Clobbers Bounds)
  text, metrics, center, bounds   → L377-389 (Text Metrics Update Must Re-Center)
  spatial-index, hit-test, stale, move → L391-403 (Spatial Index Must Be Rebuilt After Bounds Mutation)
  hover, click, press, pointer-down    → L405-417 (Pointer Down Must Not Set Hover State)
  resize-observer, raf, canvas-blank, click → L419-431 (ResizeObserver Must Repaint Synchronously)
  deploy, cache-bust, stale, cdn, browser → L433-445 (Deploy Without Cache-Bust = Invisible Fix)
  wasm, modulepreload, import, cache, chrome → L447-459 (WASM Modulepreload Cache Mismatch)
  wasm-opt, blank, canvas2d, dead-code, optimization → (wasm-opt -O2 Strips Canvas2D Draw Calls)
  import, cache-bust, immutable, module, stale → (Local ES Module Imports Need Cache-Busting Too)
  sidebar, toggle, chrome, adaptive, refactor → (Sidebar Toggle DOM Duplication Regression)
  grid-column, absolute, containing-block, shorthand → (CSS Grid: Shorthand grid-column on Absolute Items)
-->


## Resize Fight: Bounds Ownership Chain (SyncEngine ↔ Layout Engine ↔ JS)

**Date**: 2026-03-04
**Context**: Parent shape/frame resize caused children to jump, text shapes to snap back, and frames to be unresizable. Three PRs (#356, #358, #360) were needed to fully fix this.
**Root Cause**: Three layers of bounds overwrite:

1. **`apply_mutations()` called `self.engine.resolve()`** after ResizeNode, which runs `resolve_layout()` — creates a **FRESH** HashMap from scratch, discarding ALL in-place bounds updates from `resolve_subtree`.
2. **`resolve_subtree()` used `insert` in Free layout**, which overwrote existing cached JS-measured text sizes with `intrinsic_size` heuristic every frame.
3. **`openInlineEditor` didn't `render()` before textarea**, so canvas bounds were stale when reading for textarea positioning.

**Fix**: Two-layer defense:

- `lib.rs`: Skip `resolve()` for `MoveNode | ResizeNode` batches (bounds already updated in-place by `apply_mutation`)
- `layout.rs`: `or_insert` in Free layout branch preserves cached bounds during `resolve_subtree`

**Rule**: Never overwrite bounds that were explicitly set by a more authoritative source. The ownership chain is: **JS measureText > SyncEngine apply_mutation > resolve_subtree > resolve_layout (cold start only)**. Higher-authority sources must not be clobbered by lower ones.

---

## Unit Tests Can't Catch Canvas Interaction Bugs — E2E Is Required

**Date**: 2026-03-04
**Context**: Frame child movement was silently blocked by `is_parent_managed` for 3 versions (v0.10.22→v0.10.25). I ran `cargo test`, `clippy`, and `fmt` — all passed. The bug was only caught by the user manually testing.
**Root Cause**: Canvas interaction bugs live in the **runtime flow**: pointer events → WASM mutations → bounds updates → rendering. Unit tests exercise the data structures and algorithms, but NOT the pointer event → tool → mutation → layout → render pipeline as a whole.
**Fix**: Added frame-specific tests to `/e2e` workflow: frame resize, child move, Column child move, inline edit in frame. The `/e2e` workflow must be a required gate, not optional.
**Rule**: For any change touching `apply_mutation`, `resolve_subtree`, `resolve_children`, or the SelectTool, **always run E2E browser tests** before publishing. `cargo test` passing is necessary but NOT sufficient.

---

## Auto-Reparent on Drag Is Fragile — Use Explicit Context Menus

**Date**: 2026-03-02
**Context**: Text nodes dragged onto shapes auto-reparented + centered. This caused multiple bugs.
**Root Cause**: The auto-adopt system (`evaluateTextAdoption` + `reparentTextIntoShape`) had ~150 lines that raced with: the `&& changed` gate from WASM (→ textDropTarget nullified), the animation picker (→ wrong handler fires first), and `evaluate_drop` (→ detach right after adopt). Center-snap guides added visual noise during positioning-only drags.
**Fix**: Replace auto-reparent with an explicit context menu shown on drop. User clicks "Make child" → reparent + center. This eliminates all race conditions, is discoverable, and works for any node type (not just text).
**Rule**: Never auto-reparent on drag. Structural changes to the document tree must be explicit user actions.

---

## Child Containment — Children Must Never Be Fully Outside Parent

**Date**: 2026-03-02
**Context**: Group/frame reparenting logic.
**Root Cause**: Without this constraint, the parent-child relationship becomes invisible — a child fully outside its parent looks identical to a sibling.
**Fix**: `handle_child_group_relationship` in `sync.rs` enforces this: if a child's bounds have zero overlap with the parent's bounds, the child auto-detaches and reparents to the nearest ancestor. Partial overlap is fine (the parent doesn't expand during drag — that caused the "chasing envelope" bug).
**Rule**: Always enforce `bboxes_overlap(child, parent)`. Zero overlap = detach. Partial overlap = stay.

---

## Bidi-Sync: Cursor Echo-Back on Document Edit

**Date**: 2026-03-02
**Context**: Selection cleared after every drag-and-release on canvas.

**Root cause**: When the canvas syncs text to the extension via `textChanged`, the extension calls `vscode.workspace.applyEdit()` to update the document. This fires `onDidChangeTextEditorSelection` (cursor position can shift). The cursor sync handler then sends `selectNode` with empty `nodeId` back to the canvas — clearing selection. The `suppressEchoBack` flag prevented text echo, but `suppressCursorSync` was only used in the `nodeSelected` flow, not in `textChanged`.

**Fix**: Set `suppressCursorSync = true` before `applyEdit()` in the `textChanged` handler, with a 200ms delayed re-enable (`setTimeout`) to cover asynchronous selection events.

**Lesson**: Any document edit in VS Code can trigger side effects beyond `onDidChangeTextDocument` — cursor/selection events also fire and can create echo-back loops. Always suppress ALL bidirectional sync channels (text sync + cursor sync) around programmatic edits.

---

## Layout Solver: Bounds ≠ Visual Position

**Date**: 2026-02-27
**Context**: Text nodes inside shapes (rect/ellipse/frame) appeared at the top-left instead of centered.

**Root cause**: The layout solver placed text children at the parent's origin with their _intrinsic_ size (e.g., 60×14 for a short label). The renderer correctly centered text _within its own bounds_, but those bounds were a tiny rectangle at the parent's corner — not spanning the full parent.

**Fix**: In `LayoutMode::Free`, when a shape parent has exactly one text child (no explicit position), expand the text bounds to fill the parent. The renderer's existing center/middle alignment then handles the visual centering.

**Lesson**: In a layout-then-render pipeline, the renderer can only center text within the bounds the layout gives it. If the bounds are wrong, alignment defaults are irrelevant. Always verify the _bounds_ passed to the renderer, not just the renderer's alignment logic.

---

## Multi-Layer Defaults: Model vs Renderer vs UI

**Date**: 2026-02-27
**Context**: The properties panel showed `textAlign: center` and `textVAlign: middle` as defaults, but the text wasn't visually centered.

**Root cause**: Defaults existed in 3 places:

1. **Renderer** (`render2d.rs`): defaults `center`/`middle` when `in_shape` is true ✅
2. **Properties panel** (`main.js`): defaults `center`/`middle` for display ✅
3. **Layout solver** (`layout.rs`): no text-in-shape awareness ❌

**Lesson**: When a feature spans multiple layers (model → layout → renderer → UI), ensure each layer agrees on behavior. A default in the UI (panel) or renderer is useless if the layout solver doesn't produce the right geometry.

---

## Layer Panel Skips Selection Highlight on Canvas Click

**Date**: 2026-02-28
**Context**: Clicking a node on canvas did not highlight it in the Layers panel. Reported multiple times.

**Root cause**: `refreshLayersPanel()` in `main.js` uses a generation-counter optimization: `if (sceneGeneration === lastLayerGeneration && selectedId === lastLayerSelectedId) return;`. When the user clicks a node on canvas, `sceneGeneration` doesn't change (no structural edit), so when the _selection_ changes but the _scene_ doesn't, the function skips the entire DOM update — including the `.selected` CSS class toggle.

**Fix**: Added a separate code path: when `sceneGeneration` matches but `selectedId` differs, update `.selected` class on existing layer items without a full DOM rebuild.

**Lesson**: Optimization shortcuts that skip DOM updates must account for all change dimensions. Selection changes and structural changes are independent — caching on one dimension (generation) can silently skip the other (selection state).

---

## Smart Guides: 1px Threshold Too Tight + Scoping Concerns

**Date**: 2026-02-28
**Context**: Smart guides (snap alignment lines) stopped appearing when dragging nodes, especially text outside parent shapes.

**Root cause**: The `compute_smart_guides()` function in `lib.rs` used a `snap_threshold` of 1.0px — guides only appeared at near-pixel-perfect alignment, making them practically invisible during normal drag operations. Additionally, while the function iterates all nodes (not just siblings), the tight threshold meant guides disappeared before the user could see them.

**Fix**: Increased `snap_threshold` from 1.0 to 5.0 pixels, matching industry-standard snap distances (Figma uses ~5px).

**Lesson**: Snap thresholds should match user interaction precision, not render precision. A 1px snap window is mathematically correct but practically useless at standard zoom levels. Always test snap features by dragging — not by computing distances in code.

---

## Group Detach: "Chasing Envelope" Bug

**Date**: 2026-02-28
**Context**: Dragging a child node outside a group never detached it, despite the detach logic being correct in unit tests.

**Root cause**: `handle_child_group_relationship` called `expand_group_to_children` every frame when the child partially overlapped the parent. This grew the parent to contain the child — so next frame, the child was always inside the expanded group. The group **chased** the child indefinitely. Unit tests passed because they used a single large `MoveNode(dx:500)` jump, bypassing intermediate frames.

**Fix**: Skip group expansion during continuous drag. Check overlap against the parent's **current stored bounds** without expanding. The group bounds stay stable; when the child fully exits, it detaches.

**Lesson**: When a per-frame mutation (drag) modifies both A and B, and then checks A against B, ensure neither mutation feeds back into the other's state. The expand-then-compare loop created an implicit dependency where the group (B) always contained the child (A), making the check tautological. Unit tests that use large single-step inputs miss frame-by-frame feedback bugs — always write tests that simulate real gestures (many small increments).

---

## VS Code Webview Context Menu Interception

**Date**: 2026-03-01
**Context**: Added a custom right-click context menu to items in the Layers panel inside the FD custom editor extension. The `contextmenu` event handler fired in regular browsers but failed to show the custom menu inside VS Code.
**Root cause**: VS Code webviews run inside an iframe hierarchy where the host application (VS Code itself) aggressively intercepts right-click (`contextmenu`) events to display its own native developer/extension menus. Even using `e.stopPropagation()`, `e.stopImmediatePropagation()`, and `true` (capture phase) on the webview DOM cannot consistently beat the host iframe interception.
**Fix**: Pivoted to a standard VS Code UI pattern — added an explicit `⋮` (more actions) button to each layer item that appears on hover. Clicking the button safely triggers the custom context menu without competing with the host's right-click capture.
**Lesson**: Never rely on native `contextmenu` events inside VS Code webviews for critical functionality. Always provide an explicit UI button (like a `⋮` or `⚙` icon) as an alternative or primary interaction method for webview-level context menus.

---

## Continuous Drag State Truncation

**Date**: 2026-03-01
**Context**: Fixing the group detach bug, but the UI still didn't reflect the detach despite the Rust core correctly executing the structural reparenting on the first frame of exiting the group.
**Root cause**: The `last_detach` flag in the Rust `SyncEngine` was unconditionally overwritten on every frame (`MoveNode` mutation). As the user continued dragging the detached node outside the group, the overlap check correctly evaluated to `None` (since the node was already detached), which overwrote `last_detach` with `None`. By the time the user released the mouse (`pointerup`), the UI read `None` instead of the original detach event.
**Fix**: Changed the update logic to accumulate the state: `if let Some(info) = check_detach() { self.last_detach = Some(info); }`. The accumulated state is then taken (`.take()`) when the UI finally reads it on `pointerup`.
**Lesson**: When bridging continuous events (like 60fps drag frames) to discrete event handlers (like `pointerup` UI syncs), ensure that one-shot trigger states (like "did detach") accumulate and persist rather than getting overwritten by the steady state of subsequent frames.

---

## Git: Never Push Directly to Main

**Date**: 2026-03-01
**Context**: After merging a PR locally with `git merge --no-ff`, attempted `git push origin main` to push the merge commit.

**Root cause**: The `.githooks/pre-push` hook blocks all direct pushes to the `main` branch. This is by design (configured via `git config core.hooksPath .githooks`). The local merge succeeded, but the push was rejected — leaving local main ahead of remote with no way to sync without force-push.

**Fix**: Never run `git push origin main`. Instead, merge PRs via `gh pr merge <number> --merge --delete-branch` (GitHub CLI) or the GitHub web UI. Then sync local main with `git pull origin main`. If local main diverges, reset with `git reset --hard origin/main` before pulling.

**Lesson**: In this repo, the merge workflow is: create branch → push branch → create PR → merge PR via `gh pr merge` → `git pull origin main` locally. Never attempt `git checkout main && git merge && git push` — the pre-push hook will always reject it.

---

## Editor: Text Reparent Blocked by `&& changed` Gate + Animation Picker Race

**Date**: 2026-03-01
**Context**: Dragging a text node onto a rect/group/frame to reparent it (R3.38 text-consume) silently did nothing — no error, no visual feedback, text stayed at root.

**Root cause**: Two bugs compounded:

1. **`&& changed` gate** (`main.js` line 724): The `evaluateTextAdoption()` call sits inside `if (isDraggingNode && draggedNodeId && changed)`. The `changed` flag comes from `handle_pointer_move()` (WASM). On the last frame of a drag, when the pointer slows down or rests over the target, the WASM reports `changed = false` (no position delta). The `else` branch (line 766) then executes `textDropTarget = null`, erasing the adoption target right before `pointerup`.

2. **Animation picker intercepts** (`main.js` line 849 vs 861): In `pointerup`, the animation drop handler (`if (animDropTargetId && ...)`) fires _before_ the text reparent handler. When dragging text onto a node, `animDropTargetId` is set for that same node (because any node under the cursor gets flagged as an animation drop target). `openAnimPicker()` fires, stealing the interaction. Even if `textDropTarget` survived bug #1, the animation picker already consumed the gesture.

**Fix**: (1) Move `evaluateTextAdoption()` outside the `&& changed` gate — text adoption should evaluate on every pointer-move frame regardless of WASM position change. (2) In `pointerup`, skip the animation drop handler when `textDropTarget` is set (text reparent takes priority over animation binding).

**Lesson**: When gating side-effect evaluations on a `changed` flag from a lower layer (WASM), distinguish between "model changed" (position moved) and "interaction continues" (still dragging). Adoption detection depends on _cursor position vs target bounds_, not on _model state change_. Similarly, when multiple drop-zone handlers compete in the same `pointerup`, priority must be explicit — the first `if` to fire wins and silently blocks everything below it.

---

## Renderer: Hit Radius Must Match Visual Handle Size

**Date**: 2026-03-01
**Context**: Users reported that 8-point resize handles on selected nodes were visible but couldn't be grabbed. Resize didn't work at all.

**Root cause**: The hit test radius for resize handles was 5px in scene-space (`lib.rs:hit_test_resize_handle` and `main.js:getResizeHandleCursor`), while the visual handle size was 7px (`render2d.rs:draw_selection_handles`). At any zoom level below ~1.5×, the hit area was smaller than a finger/cursor — making handles practically unusable. The WASM hit test and JS cursor feedback both used the same tight radius, so neither layer compensated.

**Fix**: Increased hit radius from 5px to 8px in both `lib.rs:hit_test_resize_handle` (Rust/WASM side) and `main.js:getResizeHandleCursor` (JS cursor feedback side). The hit area now exceeds the visual handle, matching Figma/Sketch behavior.

**Lesson**: Hit test radii for interactive handles should be **at least 1.5× the visual radius** to account for cursor imprecision and zoom levels. When the same hit test exists in two layers (WASM + JS), update **both** — mismatched radii cause cursor feedback to not match actual interaction.

---

## WASM: Text Intrinsic Sizing Padding Accumulates Visually

**Date**: 2026-03-01 (updated 2026-03-03)
**Context**: Users reported text node boundaries extending beyond visible text, and inline text editor appearing at different position/size than canvas-rendered text.

**Root cause**: Three layered issues: (1) `update_text_metrics()` padding was too small — 2px didn't account for `draw_text`'s `b.y + 2.0` baseline offset. (2) JS `measureAndUpdateTextBounds` used tight glyph metrics (`actualBoundingBoxAscent + Descent`) which can be smaller than the font's visual height — e.g. "Settings" with no descenders has a tiny box. (3) Inline editor `<textarea>` used different line-height (1.4x vs renderer's effective 1.2x), 6px left padding (vs 0 in Canvas2D), and position offsets that didn't match `draw_text`.

**Fix**: (v0.10.13) WASM padding → 4px per side. JS height → `Math.max(glyphMetrics, fontSize * 1.2)`. Textarea: line-height → `fontSize * 1.2`, padding → `2px 0px 2px 0px`, positioned exactly at node bounds, added `-webkit-text-size-adjust: 100%`.

**Lesson**: The inline editor `<textarea>` CSS must **exactly mirror** the Canvas2D `draw_text` call: same line-height multiplier, same padding offsets, same position. Always use `fontSize * 1.2` as a minimum height floor for text measurement — tight glyph bounding boxes undercount for descender-less text.

---

## Renderer: Group Selection Handles Make Groups Look Like Shapes

**Date**: 2026-03-02
**Context**: Users reported that groups appear as "rectangular nodes" on canvas — visually indistinguishable from rect shapes when selected.

**Root cause**: `draw_selection_handles()` in `render2d.rs` drew 8-point resize handles for ALL selected nodes, including Groups. Combined with the solid 2px stroke on the group bounding box, groups looked identical to selected rectangles. Groups should be organizational-only (Figma behavior).

**Fix**: Added `!matches!(&node.kind, NodeKind::Group)` guard to skip handles for groups. Changed group selection border from solid 2px to dashed 1.5px (`set_line_dash([6, 4])`).

**Lesson**: When adding selection overlays, always check `NodeKind` — organizational containers (Group) need different visual treatment than shapes (Rect, Ellipse, Frame). Figma pattern: groups get dashed bounding box only, no resize handles.

---

## WASM API: Always Return Resolved Defaults in Props JSON

**Date**: 2026-03-02
**Context**: Double-clicking a text node to edit showed text at wrong size/style — the inline editor didn't match what the canvas rendered.

**Root cause**: `get_selected_node_props()` only returned `fontSize`/`fontFamily`/`fontWeight` when `style.font.is_some()`. Text nodes using the default font (no explicit `font:` in FD source) got no font keys in the JSON. The JS fallback (`14`/`"Inter"`/`400`) happened to match the renderer defaults, but broke when styles set different sizes.

**Fix**: Always return `fontSize`, `fontFamily`, `fontWeight` using `style.font.as_ref().map_or(default, |f| f.field)` — same defaults as the renderer.

**Lesson**: WASM→JS property APIs should always return **resolved** values including defaults, not just explicit overrides. The JS consumer shouldn't need to know what the "right" default is — that's the WASM engine's responsibility.

## Editor: Feature Removal Requires Full Call-Chain Cleanup

**Date**: 2026-03-01
**Context**: Removing the animation-picker-on-drag feature (bug #4). Initial attempt only removed the `openAnimPicker()` call in `pointerup`, but the glow ring kept rendering and the drop detection kept running.

**Root cause**: The animation drop feature had 3 code sites: (1) drop-zone detection in `pointermove` (L724-738), (2) glow ring rendering in `render()` (L441-457), (3) picker trigger in `pointerup` (L855-863). Removing only the trigger left the detection and rendering running — wasting CPU cycles and causing a purple glow ring with no purpose.

**Fix**: Removed all 3 code sites together: detection, rendering, and trigger. Also cleaned up the state variables (`animDropTargetId`, `animDropTargetBounds`) in the reset block at L901-904.

**Lesson**: When removing a feature, trace its full call chain: **detect → render → trigger → cleanup**. Search for all variable names associated with the feature (e.g., `animDropTargetId`, `animDropTargetBounds`) and remove every read/write site. A partial removal leaves orphaned state and wasted computation.

---

## Resize: Cached Bounds Must Track Model Mutations

**Date**: 2026-03-01
**Context**: 5 of 8 resize handles only resized down and to the right. BottomRight was the only handle that worked correctly.

**Root cause**: `ResizeNode` in `sync.rs` updated the node's `NodeKind` dimensions (width/height) but NOT the cached `ResolvedBounds`. The `SelectTool` computed incremental `dx = new_x - resize_origin.0` using `resize_origin` which was updated from the _tool's_ local state, but the actual bounds used for hit-testing and rendering were stale. For handles that need to move the node's position (all except BottomRight), the stale bounds caused `MoveNode` deltas to fight with the tool's geometry.

**Fix**: Added `bounds.width = rw; bounds.height = rh;` after the `ResizeNode` mutation. One-line fix, massive impact.

**Lesson**: The sync engine maintains cached `ResolvedBounds` as a performance optimization. Every mutation that changes a node's dimensions or position **must update both** the graph model AND the cached bounds map. Failing to sync these creates subtle bugs where interactive operations work on stale data.

---

## Animations: Always Add Time Limits

**Date**: 2026-03-01
**Context**: Hover scale animation persisted indefinitely while the cursor was over a node — the "bigger on hover" effect never ended.

**Root cause**: `resolve_style()` applies the `when :hover` animation properties (including `scale`) instantly and for the entire duration the trigger is active. There was no time-based envelope — the animation started at full strength and stayed there.

**Fix**: Added a time envelope in `render_node`: 200ms ease-in (smoothstep) → 300ms hold → 200ms ease-out. After 700ms total, scale returns to 1.0 even while still hovered. `hover_start_ms` tracked in `FdCanvas` and passed to renderer.

**Lesson**: Interactive animations must always have explicit time bounds. An indefinite animation on a state trigger (hover, press) feels broken because it never "finishes." Use ease-in/hold/ease-out envelopes to give animations a perceptible start and end.

---

## CI/CD: `gh codespace cp -r -e .` Hangs on Large Projects

**Date**: 2026-03-04
**Context**: Running `/e2e` workflow to sync local code to the Codespace before testing. The `gh codespace cp -r -e . remote:/workspaces/fast-draft` command hung for 20+ minutes with no output.

**Root cause**: `gh codespace cp -r -e .` copies the **entire** working directory recursively — including `target/` (17GB of Rust build artifacts), `.git/` (85MB), `node_modules/`, and other generated files. The `gh codespace cp` command uses `scp` under the hood and has no `--exclude` flag, so there's no way to skip directories. The upload over the network becomes effectively infinite for large Rust projects.

**Fix**: Never use `gh codespace cp -r -e .` on projects with build artifacts. Instead, use one of these approaches:

1. **Git push + SSH pull** (preferred): Push changes to the remote, then `gh codespace ssh -- 'cd /workspaces/fast-draft && git pull origin <branch>'`
2. **Targeted cp**: Copy only the directories that changed: `gh codespace cp -r -e crates/ fd-vscode/ examples/ remote:/workspaces/fast-draft/`
3. **SSH rsync**: `gh codespace ssh -- rsync` with `--exclude target/ --exclude node_modules/ --exclude .git/`

**Lesson**: **Never `gh codespace cp` the project root of a Rust project.** The `target/` directory alone can be 10-20GB. Always use git-based sync or targeted directory copies. The `/e2e` workflow's `gh codespace cp -r -e .` command is a trap for any project with substantial build artifacts.

---

## Browser Subagent May Spiral on Very Heavy Context

**Date**: 2026-03-04

Browser subagents inherit the full parent conversation context. When context exceeds ~10,000 lines of loaded source code, the subagent's reasoning can enter an infinite loop. If you've done extensive research or code editing, consider starting a fresh conversation for E2E browser testing.

---

## Native Drag Hijacks SVG Pointerdown — Always preventDefault

**Date**: 2026-03-05
**Context**: Drag-to-create from floating toolbar buttons never worked despite 6 prior fix attempts (v0.10.8 through v0.10.31). All those fixes addressed event routing — `setPointerCapture` removal, document-level listeners, pointer ownership tracking — but the feature STILL didn't work.

**Root cause**: The tool button `pointerdown` handler called `e.stopPropagation()` but NOT `e.preventDefault()`. Without `preventDefault`, the browser initiates **native HTML drag-and-drop** on the `<svg>` icons inside `<button>` elements. Native drag completely hijacks all subsequent `pointermove` events at the browser level — document-level listeners never fire, the drag threshold is never reached, the ghost preview never appears.

**Fix**: (v0.10.32) Added `e.preventDefault()` in the tool button `pointerdown` handler. Also added CSS `pointer-events: none; -webkit-user-drag: none` on `.ft-tool-btn svg` as belt-and-suspenders.

**Lesson**: **Any custom drag interaction on elements containing `<svg>`, `<img>`, or `<a>` MUST call `e.preventDefault()` in the `pointerdown` handler.** These elements have browser-native drag behavior that overrides pointer event tracking. `e.stopPropagation()` only prevents parent handlers from firing — it does NOT prevent the browser's default drag behavior. This is the #1 reason custom drag interactions silently fail and is nearly impossible to debug from code review alone because the code logic is correct — the browser just never delivers the events.

---

## Snapshot Undo Clobbers Bounds — Don't Batch Single-Action Operations

**Date**: 2026-03-09
**Context**: Creating a text node on canvas (T tool click) then pressing ⌘Z rearranged all other nodes. Same class as Resize Fight (L33-48).

**Root cause**: Two compounding issues:

1. **TextTool's single AddNode was unnecessarily batched** — `begin_batch()`/`end_batch()` wrapped every pointer gesture, so even a single-click text placement became a `Command::Snapshot`. Snapshot undo calls `set_text(text_before)` → full `parse_document()` + `resolve_layout()`, creating a fresh bounds HashMap with `intrinsic_size` heuristics that clobber JS-measured text bounds.
2. **Redundant `resolve()` in `undo()`** — after snapshot undo already resolved via `set_text()`, `lib.rs` called `resolve()` again, double-clobbering any bounds that survived the first pass.

**Fix**:
- Skip `begin_batch()`/`end_batch()` for TextTool (single-action), so AddNode goes through `Command::Single` with `RemoveNode` inverse — no re-parse
- `undo()`/`redo()` return `(desc, is_snapshot)` — skip `resolve()` when snapshot already resolved

**Rule**: **Only batch operations that emit multiple incremental mutations (drag gestures).** Single-action operations (click-to-place) should use `Command::Single` for atomic inverse undo without full document re-parse. The bounds ownership chain (L48) applies equally to undo paths.

---

## Text Metrics Update Must Re-Center in Parent

**Date**: 2026-03-11
**Context**: Centered text inside shapes (rect/ellipse/frame) visually shifted to left-aligned when clicked.

**Root cause**: `update_text_metrics()` (lib.rs) shrinks text bounds to JS `measureText()` size but preserved x/y position. The layout solver initially centered text within parent shapes by setting bounds equal to the parent. After shrink, the narrower bounds at the old position made text appear left-shifted relative to the parent.

**Fix**: After updating bounds dimensions in `update_text_metrics()`, re-center text within parent shape — matching the layout solver's auto-center behavior for text children without explicit Position or place constraints.

**Rule**: **Any function that modifies a node's bounds dimensions must also re-resolve or re-center position when the node participates in auto-centering.** The layout solver's centering is position-dependent on size — shrinking without re-centering breaks the invariant.

---

## Spatial Index Must Be Rebuilt After Bounds Mutation

**Date**: 2026-03-11
**Context**: Nodes could only be moved once on the canvas — after the first drag, the node became un-selectable and un-movable.

**Root cause**: `apply_mutations()` in `lib.rs` deliberately skips `rebuild_spatial_index()` for MoveNode/ResizeNode batches (to avoid `resolve()` → bounds clobbering). The cached bounds ARE updated in-place, but the `SpatialIndex` still holds the node's **pre-move AABB**. On the next `pointerdown`, `hit_test()` queries the stale spatial index and returns `None` at the node's new visual position.

**Fix**: Added `self.rebuild_spatial_index()` in `handle_pointer_up()` after `flush_to_text()` — the spatial index is rebuilt once per gesture, using the already-updated cached bounds. O(N log N) but only once per pointer-up, not per frame.

**Rule**: **Any optimization cache derived from bounds must be invalidated/rebuilt whenever bounds change.** The spatial index, like cached bounds themselves (L249), is a derived data structure — when the authoritative data (bounds HashMap) changes in-place, all caches must follow.

---

## Pointer Down Must Not Set Hover State

**Date**: 2026-03-11
**Context**: Clicking `@nav_projects` and `@nav_settings` in `demo.fd` triggered their `:hover` fill animation, making them change color on click (not just hover).

**Root cause**: `handle_pointer_down` set both `pressed_id` AND `hovered_id` to the hit node (L342-344). `handle_pointer_up` also set `hovered_id` (L608-610). Since the renderer pushes `AnimTrigger::Hover` whenever `hovered_id` matches the node, clicking a node activated `:hover` animations immediately — even without a `pointer_move` event. The bug was most visible on nodes with no base `fill` (transparent → colored on "hover").

**Fix**: Removed `hovered_id` assignment from both `handle_pointer_down` and `handle_pointer_up`. Only `handle_pointer_move` manages `hovered_id`, aligning with CSS behavior where `:hover` is cursor-proximity based, not click-based. Also added base fill to affected `demo.fd` nav items.

**Rule**: **Hover and press/click are independent pointer states.** `hovered_id` should only be set by `pointer_move`; `pressed_id` should only be set by `pointer_down`/`pointer_up`. Conflating them causes `:hover` animations to fire on click, which is incorrect behavior.

---

## ResizeObserver Must Repaint Synchronously After canvas.width Assignment

**Date**: 2026-03-12
**Context**: Clicking any node on fast-draft.com caused the entire canvas to go blank. Scene graph intact (Layers/Properties panels worked), but nothing was painted.

**Root cause**: ResizeObserver / RAF race condition. When clicking a node, `updatePropertiesPanel()` adds `.visible` → wrapper layout changes → ResizeObserver fires `resizeCanvas()` → `canvas.width = newW` clears all pixels (HTML5 spec). The RAF-based render loop had already consumed `renderDirty=true` from the `pointerup` handler earlier in the same frame, so the cleared canvas was painted blank. Setting `renderDirty=true` inside `resizeCanvas()` deferred the repaint to the NEXT RAF tick, but by then the browser had already composited and displayed the blank frame.

**Fix**: Call `renderCanvas()` synchronously at the end of `resizeCanvas()` when the buffer was cleared, instead of relying on `renderDirty` + RAF. Set `renderDirty = false` to prevent a redundant double-render on the next RAF tick.

**Rule**: **Never rely on RAF `renderDirty` flags after `canvas.width/height` assignment.** The HTML5 spec clears the entire pixel buffer on any dimension assignment. Since ResizeObserver callbacks fire after RAF in Chrome's rendering pipeline, the cleared canvas will be composited before the next RAF can repaint. Always repaint synchronously after clearing.

---

## Deploy Without Cache-Bust = Invisible Fix

**Date**: 2026-03-12
**Context**: v0.10.116 deployed a critical canvas fix to Cloudflare Pages. CDN had the new `playground.js`, but users still saw the bug. `pages.yml` even purges the CF CDN cache — yet the fix was invisible.

**Root cause**: `index.html` loads `playground.js?v=0.11.4`. The `?v=` query string wasn't bumped. Cloudflare's default `Cache-Control: public, max-age=14400` (4 hours) caused browsers to serve stale JS. The CDN purge only clears Cloudflare's edge cache — it cannot purge individual browser caches. The query string acts as the real cache key.

**Fix**: (1) Bumped `?v=0.11.5` immediately. (2) Added `pages.yml` auto-bust step that replaces `?v=X.Y.Z` with `?v=<git-sha>` before every deploy. (3) Added `Cache-Control: no-cache` for `/*.js` and `/*.css` in `_headers` as belt-and-suspenders.

**Rule**: **Every site deploy must produce unique asset URLs.** Content-hash or git-SHA query strings are the only reliable way to invalidate browser caches. CDN purge alone is insufficient — browsers own their cache independently. Automate this in CI; never rely on manual version bumps.

---

## WASM Modulepreload Cache Mismatch Breaks Chrome/Edge

**Date**: 2026-03-12
**Context**: Canvas broken on Chrome with `WebAssembly.instantiate(): Import #0 "./fd_wasm_bg.js" "__wbg_instanceof_Window_ed49b2db8df90359": function import requires a callable`. Very slow on Edge.

**Root cause**: `index.html` had `<link rel="modulepreload" href="./wasm/fd_wasm.js" />` and `playground.js` had `import('./wasm/fd_wasm.js')` — neither with cache-busting `?v=` query strings. The `_headers` file specified `no-cache` for `/wasm/*`, but `modulepreload` and dynamic `import()` bypass that in some browsers, serving a stale JS glue file that's missing functions the newer WASM binary expects.

**Fix**: Added `?v=0.11.5` to all four WASM paths (modulepreload, preload, import, init). Extended `pages.yml` auto-bust to also `sed` `playground.js`.

**Rule**: **Cache-bust every resource loaded by `modulepreload`, `import()`, and `fetch()` — not just `<script src>`.** The `_headers` `no-cache` directive only affects `fetch()`-style loads; `modulepreload` has its own caching behavior in Chrome/Edge. All importable resources must have version-stamped URLs.


## wasm-opt -O2 Strips Canvas2D Draw Calls

**Date**: 2026-03-13
**Context**: Canvas rendered completely blank — no shapes, text, or UI elements despite all nodes having valid bounds and correctly resolved styles. The rendering pipeline was fully functional (nodes traversed, styles resolved, draw functions called) but no pixels appeared.

**Root cause**: `wasm-opt -O2` (wasm-pack's default optimization level) was stripping Canvas2D API calls (`fill_rect`, `stroke`, `fill`, `set_fill_style_str`, etc.) as dead code. These are imported JavaScript functions with void return, which `wasm-opt` at `-O2` treats as side-effect-free and eligible for elimination. Adding debug `console.log` and `fill_rect` calls prevented the optimization from triggering, which is why the canvas worked with debug code but not without.

**Fix**: Added `[package.metadata.wasm-pack.profile.release] wasm-opt = ["-O1"]` to `crates/fd-wasm/Cargo.toml`. `-O1` preserves all imported JS side-effects while still applying safe optimizations.

**Rule**: **Never use `wasm-opt -O2` or higher for WASM modules that call external JS functions with void return (Canvas2D, DOM manipulation, console).** The optimizer cannot distinguish side-effect-free pure functions from side-effectful DOM API calls. Use `-O1` or explicitly mark imports as having side effects.


## Local ES Module Imports Need Cache-Busting Too

**Date**: 2026-03-18
**Context**: The canvas stopped loading on fast-draft.com after `clearChatHistory` was added to `ai-chat.js`. No visible errors in the console — the entire `playground.js` module failed silently.

**Root cause**: `_headers` sets `Cache-Control: public, max-age=31536000, immutable` for all `*.js` files. The CI pipeline's `sed` replaces `?v=X.Y.Z` with `?v=<sha>` in `playground.js`, but the `import {...} from './ai-chat.js'` statements used bare paths without `?v=`. Browsers served the old cached `ai-chat.js` which didn't export `clearChatHistory`, causing an ES module resolution error that silently killed the entire module graph.

**Fix**: Added `?v=0.11.5` to all local import paths in `playground.js` so CI's `sed` finds and replaces them with the commit SHA on each deploy.

**Rule**: **When using immutable cache headers (`max-age=31536000, immutable`), every local `import` path MUST include a `?v=` cache-busting parameter that CI can replace.** Bare import paths will serve stale cached versions forever. ES module import errors kill the entire module graph silently — no console errors, just a blank page.

---

## Editor: Sidebar Toggle DOM Duplication Regression

**Date**: 2026-03-22
**Context**: CSS Grid layout refactor moved panel positioning from `position: absolute` to CSS Grid columns. After the refactor, the sidebar toggle icons appeared floating on the canvas instead of staying in the panel headers.

**Root cause**: The sidebar toggle icon existed in **two DOM locations**: (1) `#sidebar-toggle-btn` inside `#chrome-left` (canvas chrome, absolutely positioned on the canvas), and (2) `.lp-tab-toggle` inside the left panel header. An "adaptive" system hid the canvas chrome icon and showed the panel header icon when the panel was open, using CSS classes (`.lp-open`/`.rp-open`). During the refactor, these class-based selectors were replaced with `[data-lp]`/`[data-rp]` attribute selectors, but the original `.lp-open`/`.rp-open` rules were left in place as dead code. The data-attr selectors were added alongside (not replacing) the old rules. Additionally, the z-index of the toolbar (25) matched the panels (25), causing the toolbar to be hidden behind panels.

**Fix**: (1) Remove the canvas chrome sidebar toggle icons entirely — sidebar toggles belong ONLY in panel headers. (2) Make `.lp-tab-toggle`/`.rp-tab-toggle` always visible (`display: flex`). (3) Bump toolbar z-index to 30. (4) When panel is collapsed (grid column = 0px), show a slim expand strip so the toggle remains accessible.

**Lesson**: **Never maintain the same interactive control in two DOM locations with conditional visibility.** It creates a fragile adaptive system that breaks during refactors because agents must remember to update both the toggle logic AND all visibility CSS selectors. The correct pattern is ONE authoritative DOM location for each control. For sidebar toggles, that location is the panel header — not the canvas chrome.

---

## CSS Grid: Shorthand `grid-column` on Absolute Items Spans to End

**Date**: 2026-03-23
**Context**: Chrome icons (share, settings) positioned with `grid-column: 2; position: absolute; right: 8px` inside a 3-column CSS Grid. Expected them at 8px from the canvas column's right edge, but they appeared at 8px from the grid container's right edge — overlapping the right panel.

**Root cause**: `grid-column: 2` is shorthand for `grid-column: 2 / auto`. For absolutely positioned grid items, `auto` resolves to the end of the implicit grid — NOT just the end of column 2. The containing block extends from column 2 to the grid container's right edge, so `right: 8px` positions relative to the entire remaining width.

**Fix**: Use explicit end lines: `grid-column: 2 / 3; grid-row: 1 / 2`. This constrains the containing block to exactly the canvas grid area (column 2, row 1).

**Rule**: **When using `position: absolute` on CSS Grid items, always use explicit grid range syntax (`start / end`).** Shorthand `grid-column: N` resolves to `N / auto`, which for absolute items means the containing block extends to the grid boundary. Use `grid-column: N / (N+1)` to constrain to a single column.

---

## Testing: Verify Bug Fixes With Targeted Browser Measurement

**Date**: 2026-03-23
**Context**: Toolbar grip double-click caused a position jump. Fix touched JS event handlers. "Verified" with cargo test (Rust-only) + generic site deploy check ("page loads, WASM renders"). Shipped 3 PRs (#784, #785, #786) because each fix only addressed one layer of the bug.

**Root cause**: E2E verification tested the wrong thing. A generic "site loads" check cannot catch a behavioral bug like "element X shifts position on double-click." The actual bug required measuring `getBoundingClientRect()` before and after the interaction — a 5-line JS snippet that would have caught all 3 issues in one test.

**Fix**: For any UI interaction bug fix, write a **targeted browser measurement** before deploying:
```javascript
// Template: measure element position before/after interaction
const el = document.getElementById('target');
const before = el.getBoundingClientRect();
// ... trigger interaction ...
const after = el.getBoundingClientRect();
console.assert(Math.abs(before.centerX - after.centerX) < 2, 'Position shifted!');
```
Run this via `execute_browser_javascript` in the browser subagent BEFORE merging, not after deploy.

**Lesson**: **Generic E2E ("page loads") is NOT verification of a specific bug fix.** For interaction bugs, the E2E test must reproduce the exact user-reported behavior with quantitative measurement. Code review ("this looks correct") is necessary but not sufficient — never ship a UI fix without empirical browser verification of the specific behavior.

---

## Editor: localStorage ≠ Runtime Visual State

**Date**: 2026-03-23
**Context**: Toolbar dblclick minimize handler read `parseToolbarPos().side` from localStorage to determine which side to re-snap to. But auto-overflow at init had silently moved the toolbar from `'bottom'` (localStorage default) to `'left'` (visual state). Result: double-clicking a left-docked toolbar moved it to the bottom.

**Root cause**: localStorage stores the **user's last explicit choice**, but multiple runtime processes can override it: auto-overflow, window resize reclamp, panel toggle reclamp. These overrides update the DOM classes but do NOT always update localStorage. The gap between stored intent and visual reality grows over time.

**Fix**: Read the ACTUAL state from the DOM:
```javascript
const currentSide = toolbar.classList.contains('toolbar-docked-left') ? 'left'
  : toolbar.classList.contains('toolbar-docked-right') ? 'right'
  : toolbar.classList.contains('toolbar-docked-top') ? 'top'
  : 'bottom';
```
Never use `localStorage.getItem(...)` as the source of truth for current visual state.

**Lesson**: **DOM is the source of truth for current visual state; localStorage is the source of truth for user intent.** When an action needs to preserve the current visual position (minimize, reclamp), read from the DOM. When an action needs to restore user preference (fresh page load, clear state), read from localStorage. Confusing the two causes state desync bugs that are invisible in code review.
