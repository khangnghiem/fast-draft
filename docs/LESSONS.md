# Lessons Learned

Engineering lessons discovered through building FD.

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

**Date**: 2026-03-01 (updated 2026-03-02)
**Context**: Users reported text node boundaries extending well beyond the visible text content. The bounding box was noticeably larger than the text.

**Root cause**: `update_text_metrics()` in `lib.rs` added 8px padding per side (16px total per axis). The JS `measureText()` already returns a width that includes some internal glyph spacing. Combined with the 16px padding, the resulting bounds exceeded the visual text by ~20px — visible as an oversized selection rectangle.

**Fix**: Reduced padding from 8px→4px (v0.8.89), then 4px→2px (v0.10.2) per side. Also replaced `fontSize * 1.4` height approximation in JS with precise Canvas2D metrics (`actualBoundingBoxAscent + actualBoundingBoxDescent`), falling back to `fontSize * 1.2`.

**Lesson**: When bridging text measurement across JS→WASM, use the precise `actualBoundingBox*` metrics from Canvas2D `measureText()` instead of line-height multipliers. Additional WASM-side padding should be 2px per side max — it's a safety margin, not a design element.

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

**Root cause**: `get_selected_node_props()` only returned `fontSize`/`fontFamily`/`fontWeight` when `style.font.is_some()`. Text nodes using the default font (no explicit `font:` in FD source) got no font keys in the JSON. The JS fallback (`14`/`"Inter"`/`400`) happened to match the renderer defaults, but broke when themes set different sizes.

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
