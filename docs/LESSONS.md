# Lessons Learned

Engineering lessons discovered through building FD.

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
