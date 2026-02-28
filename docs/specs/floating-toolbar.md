# Floating Toolbar Spec

> Covers R3.39–R3.44: draggable floating toolbar, tooltips, click-to-raise, drag-to-create, snap-to-node, and text consume.

---

## 1. Toolbar Structure (R3.39)

A bottom-anchored floating toolbar with 7 tool buttons and a drag handle.

```
┌──────────────────────────────────────┐
│ ⋮⋮  V  □  ○  ✎  →  T  ⊞           │
│      ↑  ↑  ↑  ↑  ↑  ↑  ↑           │
│      7 SVG-icon tool buttons         │
└──────────────────────────────────────┘
```

**Drag handle** (`⋮⋮`): pointer-drag moves toolbar vertically. If vertical center crosses 80px threshold from top/bottom, toolbar snaps to opposite edge.

**Collapse**: Double-click drag handle → toggles `.collapsed` class → toolbar shrinks to a circle showing only the active tool icon.

**State persistence**: Position (top/bottom) and collapsed state saved to `vscodeApi.setState()` and restored on load.

---

## 2. Tooltips (R3.40)

Apple-style frosted glass pills on hover, appearing 400ms after mouseenter.

| Property     | Value                                                                 |
| ------------ | --------------------------------------------------------------------- |
| Background   | `var(--fd-surface)` with `backdrop-filter: blur(12px) saturate(180%)` |
| Border       | `0.5px solid var(--fd-border)`, `border-radius: 8px`                  |
| Position     | `bottom: calc(100% + 8px)`, centered via `translateX(-50%)`           |
| Content      | Tool name + shortcut, e.g. "Rectangle (R)"                            |
| Show delay   | 400ms via CSS `transition-delay`                                      |
| Native title | Removed to prevent double-tooltip                                     |

---

## 3. Click-to-Raise (R3.41)

On fresh click-select (not drag), the selected node is automatically brought forward one z-level.

**Rules**:

- Only raises on _fresh selection_ — if node was already selected, no-op
- Only on clean click — if pointer moved >5px between down/up, no-op (it was a drag)
- Reuses existing `bring_forward()` WASM API (same as ⌘])

---

## 4. Drag-to-Create (R3.42)

Dragging a tool button from the toolbar onto the canvas creates a shape at the drop location.

### Interaction Model

```
pointerdown on button → track start position
  │
  ├─ pointer moves <5px → normal click (tool activation)
  │
  └─ pointer moves ≥5px → DRAG MODE
       │
       ├─ Show ghost preview (position:fixed, pointer-events:none)
       │   Ghost: dashed outline matching shape type
       │   - Rect/Frame: 120×80 / 200×150 rounded rect
       │   - Ellipse: 100×100 circle
       │   - Text: "T" label
       │   - Arrow: diagonal line
       │
       ├─ pointermove → update ghost position
       │
       └─ pointerup
            ├─ Over canvas → convert screen→scene coords → create shape
            └─ Outside canvas → cancel (no-op)
```

### Coordinate Conversion

```
sceneX = ((clientX - canvasRect.left) - panX) / zoomLevel
sceneY = ((clientY - canvasRect.top)  - panY) / zoomLevel
```

### Default Style Cascade

1. Check sticky smart defaults (per-tool session memory)
2. If none → WASM fallback: `fill: transparent`, `stroke: #333333 2.5`, `corner: 8` (rect only)
3. Stroke caps/joins: Round for bezeled look

---

## 5. Snap-to-Node Algorithm (R3.43)

When a shape is dropped near an existing node, it snaps to an adjacent position with an auto-created edge.

### Detection

Sample 11 points around drop position via `hit_test_at()`:

```
offsets = [
  (0,0), (±T, 0), (0, ±T),           // cardinal
  (±T, ±T),                            // diagonal
  (±2T, 0), (0, ±2T)                  // extended
]
where T = 40px (snap threshold)
```

First hit wins → get its bounds via `get_node_bounds()`.

### Snap Position Calculation

Compute 4 cardinal candidates relative to target node bounds:

```
RIGHT:  x = target.right + GAP,          y = target.centerY - newH/2
LEFT:   x = target.left  - GAP - newW,   y = target.centerY - newH/2
BOTTOM: x = target.centerX - newW/2,     y = target.bottom + GAP
TOP:    x = target.centerX - newW/2,     y = target.top - GAP - newH
```

Where `GAP = 20px`. Pick the candidate nearest to the original drop position.

Reject if `best.dist > 3 × SNAP_THRESHOLD` (too far).

### Auto-Edge Creation

After snapping, create edge via WASM `create_edge(existingId, newId)`:

- Arrow: `end` (points at new node)
- Curve: `smooth`
- Edge ID: auto-generated `@edge_XXXX`

### Edge Context Menu

Frosted glass popover shown at the edge midpoint (average of drop position and target center):

| Control       | Options                   | Default |
| ------------- | ------------------------- | ------- |
| Arrow         | none / start / end / both | end     |
| Curve         | straight / smooth / step  | smooth  |
| Stroke color  | Color picker              | #999999 |
| Stroke width  | 0.5–10 (step 0.5)         | 1       |
| Flow          | none / pulse / dash       | none    |
| Flow duration | 100–5000ms (step 100)     | 800ms   |

**Dismiss**: Click outside or press Escape.

Changes are applied by regex-rewriting the edge block in the FD source text.

---

## 6. Text Consume on Drag (R3.44)

When the Text tool is dragged from the toolbar, drop detection follows a three-priority cascade:

### Hit Priority

```
1. SHAPE (rect/ellipse/frame) — via hit_test_at()
   → Create text node, then reparent inside shape
   → Strips position constraints, auto-centers (R3.36/R3.38)

2. EDGE (≤30px from edge line) — via point-to-segment distance
   → Insert child text node in edge block: `text @id "Text"`
   → Scans all `edge @id { from: @a to: @b }` blocks
   → Computes distance from drop point to from-center→to-center line segment

3. EMPTY CANVAS — normal text creation at drop position
```

### Point-to-Segment Distance

```
function pointToSegmentDist(px, py, ax, ay, bx, by):
  dx = bx - ax, dy = by - ay
  lenSq = dx² + dy²
  if lenSq == 0: return hypot(px-ax, py-ay)
  t = clamp(((px-ax)·dx + (py-ay)·dy) / lenSq, 0, 1)
  return hypot(px - (ax + t·dx), py - (ay + t·dy))
```

---

## Implementation Files

| File                                                     | What                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`webview-html.ts`](../../fd-vscode/src/webview-html.ts) | CSS for toolbar, tooltips, edge context menu; HTML structure                                    |
| [`main.js`](../../fd-vscode/webview/main.js)             | `setupFloatingToolbar()`, `dtcFindSnapTarget()`, `dtcTextConsume()`, edge context menu handlers |
| [`lib.rs`](../../crates/fd-wasm/src/lib.rs)              | `create_edge()` WASM API, `create_node_at()` ScreenBrush defaults                               |
| [`commands.rs`](../../crates/fd-editor/src/commands.rs)  | `GraphMutation::AddEdge`                                                                        |

---

## Version History

| Version | Feature                                              |
| ------- | ---------------------------------------------------- |
| v0.8.72 | Toolbar drag + collapse (R3.39)                      |
| v0.8.73 | Frosted glass tooltips (R3.40)                       |
| v0.8.74 | Click-to-raise z-order (R3.41)                       |
| v0.8.75 | SVG toolbar icons                                    |
| v0.8.76 | ScreenBrush default styles                           |
| v0.8.77 | Drag-to-create (R3.42)                               |
| v0.8.78 | Snap-to-node + auto-edge + edge context menu (R3.43) |
| v0.8.79 | Text drop-to-consume (R3.44)                         |
