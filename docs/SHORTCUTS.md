# FD Canvas Keyboard Shortcuts

> Complete reference for all keyboard shortcuts and modifier behaviors in the FD canvas editor.
> Source of truth: [`crates/fd-editor/src/shortcuts.rs`](../crates/fd-editor/src/shortcuts.rs)

---

## Tools

| Key   | Action                | Notes                                 |
| ----- | --------------------- | ------------------------------------- |
| `V`   | Select / Move         | Default tool                          |
| `H`   | Hand (pan)            | Pan canvas with click+drag            |
| `R`   | Rectangle             |                                       |
| `O`   | Ellipse               |                                       |
| `P`   | Pen (freehand)        |                                       |
| `A`   | Arrow / Connector     | Click-drag between nodes              |
| `T`   | Text                  | Click to create, double-click to edit |
| `F`   | Frame                 | Container for grouping visually       |
| `E`   | Eraser                | Swipe-to-delete; stays active         |
| `Tab` | Toggle last two tools | Screenbrush-style                     |

### Tool Locking (Sticky Mode)

| Action                             | Effect                                           |
| ---------------------------------- | ------------------------------------------------ |
| Double-press shortcut (e.g. `R R`) | 🔒 Lock tool — stays active after placing shapes |
| Double-click tool button           | 🔒 Lock tool                                     |
| `V` or `Escape`                    | Unlock tool → back to Select                     |
| Single-click locked button         | Unlock tool                                      |
| Switch to different tool           | Clears lock                                      |

---

## Edit

| Shortcut               | Action                   |
| ---------------------- | ------------------------ |
| `⌘Z` / `Ctrl+Z`        | Undo                     |
| `⌘⇧Z` / `Ctrl+Y`       | Redo                     |
| `Delete` / `Backspace` | Delete selected          |
| `⌘D`                   | Duplicate (+20px offset) |
| `⌘A`                   | Select all               |
| `⌘G`                   | Group selected           |
| `⌘⇧G`                  | Ungroup                  |
| `⌘C`                   | Copy                     |
| `⌘X`                   | Cut                      |
| `⌘V`                   | Paste                    |
| `⌘⇧L`                  | Lock Selection           |

---

## Transform (Z-Order)

| Shortcut             | Action                   |
| -------------------- | ------------------------ |
| `⌘[`                 | Send backward (one step) |
| `⌘]`                 | Bring forward (one step) |
| `⌘⇧[`                | Send to back             |
| `⌘⇧]`                | Bring to front           |
| Arrow keys           | Nudge 1px                |
| `Shift` + Arrow keys | Nudge 10px               |

---

## View

| Shortcut          | Action                            |
| ----------------- | --------------------------------- |
| `⌘+` / `⌘=`       | Zoom in                           |
| `⌘-`              | Zoom out                          |
| `0`               | Reset zoom to 100%                |
| `⌘0`              | Zoom to fit                       |
| `⌘1`              | Zoom to selection                 |
| `L`               | Toggle Layers panel               |
| `⇧L`              | Toggle Library panel              |
| `G`               | Toggle grid overlay               |
| `⇧M`              | Toggle Reduce Motion              |
| `Space` (hold)    | Pan / hand tool                   |
| `⌘` (hold)        | Pan (drawing/select); Select (hand) |
| `Alt` (hold)      | Copy cursor preview               |
| `Ctrl` (hold)     | Eraser cursor preview             |
| Pinch             | Trackpad zoom                     |
| Middle-click drag | Pan                               |
| Two-finger pan    | Touch pan with inertia            |
| Long-press (500ms)| Context menu (touch, Select/Eraser only) |

### Multi-Finger Touch Gestures (iPadOS-style)

Gesture hierarchy: **1-finger** = object, **2-finger** = viewport, **3-finger** = edit, **4-finger** = app.

#### 3-Finger (Edit Level)

| Gesture              | Action                              | Notes                                |
| -------------------- | ----------------------------------- | ------------------------------------ |
| 3-finger double-tap  | Undo                                | Second tap within 400ms              |
| 3-finger swipe left  | Undo                                | >50px horizontal swipe               |
| 3-finger swipe right | Redo                                | >50px horizontal swipe               |
| 3-finger pinch-in    | Copy selected node                  | Area shrinks >60%                    |
| 3-finger pinch-out   | Paste from clipboard                | Area grows >150%                     |
| 3-finger long-press  | Edit menu (Undo/Redo/Cut/Copy/Paste)| 500ms hold; auto-dismiss after 3s    |

#### 4-Finger (App Level)

| Gesture                   | Action                      | Notes                              |
| ------------------------- | --------------------------- | ---------------------------------- |
| 4-finger tap              | Toggle Full Screen mode     | <250ms, <20px movement             |
| 4-finger swipe up         | Zoom to fit                 | >50px vertical swipe               |
| 4-finger swipe down       | Zoom to selection            | Falls back to 100% if no selection |
| 4-finger swipe left/right | Cycle tool (prev/next)      | Follows toolbar order              |

---

## Modifier Behaviors (During Pointer Interaction)

### When a Drawing Tool is active (R, O, P, A, T, F)

| Modifier       | On Object                                       | On Empty Space                   |
| -------------- | ----------------------------------------------- | -------------------------------- |
| None           | Draw new shape                                  | Draw new shape                   |
| `⌘`            | **Pan**                                         | **Pan**                          |
| `Alt`          | **Clone + drag**                                | Draw new shape                   |
| `Shift`        | Constrain (square/axis) — see per-tool table    | Constrain                        |
| `Shift+Alt`    | Square/circle from center                       | Square/circle from center        |
| `Space` (hold) | Pan                                             | Pan                              |

#### Shift constraint per drawing tool

| Tool        | Shift+drag effect                                     |
| ----------- | ----------------------------------------------------- |
| **Rect**    | Constrain to square                                   |
| **Ellipse** | Constrain to circle                                   |
| **Frame**   | Constrain to square (same as Rect)                    |
| **Arrow**   | Snap angle to nearest 45° (0°, 45°, 90°, 135°…)       |
| **Pen**     | — (no constraint — freehand)                          |
| **Text**    | — (click-to-place, no drag constraint)                |

### When Select Tool is active (V)

| Modifier           | On Object                                                 | On Empty Space |
| ------------------ | --------------------------------------------------------- | -------------- |
| None               | Move parent only (children stay)                          | Marquee select |
| `⌘`/`Ctrl` + drag | **Move with children** — drop on container = **nest + center** | Pan            |
| `Alt`              | **Clone + drag**                                          | Marquee select |
| `Alt` (click only) | **Style picker** — copies fill/stroke/opacity as defaults | —              |
| `Shift`            | Add to selection                                          | Add to marquee |
| `⌘` (click only)   | Add/remove from selection (Layers multi-select)           | —              |
| `⌘+Alt` (click)    | **Deep Select** — bypass group selection, select leaf node| —              |
| `⌘+Alt` + drag     | **Clone with children** — duplicate node + descendants    | —              |
| `Space` (hold)     | Pan                                                       | Pan            |

> **Note**: `⌘`/`Ctrl` behavior splits by interaction type:
> - **Click** (no drag): Multi-select toggle — adds or removes node from selection.
> - **Drag on empty/same parent**: Children-follow — moves the dragged node and all its descendants recursively.
> - **Drag onto different container**: **Nest + Center** — reparents the node into the target container and centers it. Children maintain relative positions. Target must be rect/ellipse/frame/group (not text).
> - **Mid-drag press**: Can be toggled during an active drag.
> - **Deep Select (`⌘+Alt` Click)**: Ignores group boundaries, directly selecting the leaf shape under the cursor.
> - **Clone with children (`⌘+Alt` Drag)**: Duplicates the selection and all its recursive descendants, dragging the clone.

### Mouse & Trackpad Interactions

| Interaction            | Action                                | Notes                             |
| ---------------------- | ------------------------------------- | --------------------------------- |
| Left-click             | Select / Use Tool                     |                                   |
| Right-click            | Context menu                          | Context-aware (Node vs Empty)     |
| Right-drag             | Pan canvas                            | High-efficiency panning           |
| `⌘` + Right-click     | Layer Picker / Quick Insert           | Document context menu             |
| `⌘` + Right-drag      | Zoom Scrub                            | Move mouse up/down to zoom in/out |
| Middle-click drag      | Pan canvas                            |                                   |
| Scroll wheel           | Pan / Scroll                          | Vertical / Horizontal panning     |
| Pinch                  | Zoom                                  | Trackpad / Touchscreen            |

---

## Smart Defaults (Sticky Styles)

Per-tool session memory for style properties. When you change a shape's style, the next shape you create uses those same styles.

| Tracked Property | Applies To          |
| ---------------- | ------------------- |
| Fill color       | rect, ellipse, text |
| Stroke color     | All tools           |
| Stroke width     | All tools           |
| Opacity          | All tools           |
| Font size        | text only           |

Defaults are **captured** from both the Floating Action Bar and the Properties panel.
Defaults are **applied** automatically when a new shape is drawn.
Defaults are **persisted** to `localStorage` (survive page reload).

### Drag-Back-To-Cancel

During a draw gesture, dragging back to within **5px of the starting point** resets the shape.
On pointer-up, the tool treats this as a click-to-place (default size) rather than a tiny drag.

---

## Full Screen Mode

| Action                        | Effect                                |
| ----------------------------- | ------------------------------------- |
| Click ⛶/✕ toggle (toolbar)    | Toggle Full Screen mode               |
| `⇧F` (Shift+F)               | Toggle Full Screen mode               |
| `Escape`                      | Exit Full Screen mode                 |
| `L`                           | Toggle Layers panel (works in Full Screen) |

Full Screen mode hides: Navigation, hero, footer, page chrome, code editor, toolbar, layers, properties, minimap.
Full Screen mode keeps: Canvas, floating toolbar (tools), floating action bar.

---

## Apple Pencil Pro

| Gesture              | Action                |
| -------------------- | --------------------- |
| Squeeze              | Toggle last two tools |
| Squeeze + Shift      | Switch to Pen         |
| Squeeze + Ctrl       | Switch to Rect        |
| Squeeze + Alt        | Switch to Ellipse     |
| Squeeze + Ctrl+Shift | Switch to Ellipse     |
| Barrel Roll          | Rotate brush angle    |

---

## Floating Toolbar

| Interaction                     | Action                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Click tool button               | Activate tool (Select/Rect/Ellipse/Pen/Arrow/Text/Frame)                             |
| Double-click tool button        | Lock tool (sticky mode)                                                              |
| Drag tool button onto canvas    | **Drag-to-create** — ghost preview follows cursor, creates shape at drop             |
| Drag Text onto shape            | **Text consume** — reparents text inside shape, auto-centers                         |
| Drag Text near edge (≤30px)     | **Edge label** — inserts child text node in edge block                               |
| Drop near existing node (≤40px) | **Snap** — requires **⌥ Alt** held; adjacent position (20px gap) + auto-creates edge |
| Drag handle (⋮⋮) up/down        | Move toolbar between top/bottom (80px threshold)                                     |
| Double-click toolbar background | Collapse/expand toolbar                                                              |
| Hover tool button (400ms)       | Frosted glass tooltip with tool name + shortcut                                      |

---

## Help

| Shortcut      | Action                           |
| ------------- | -------------------------------- |
| `?` (Shift+/) | Toggle keyboard shortcuts dialog |

---

## Implementation Notes (for AI agents)

- All shortcut bindings are defined in [`shortcuts.rs`](../crates/fd-editor/src/shortcuts.rs) → `ShortcutMap::resolve()`
- Actions dispatch from [`lib.rs`](../crates/fd-wasm/src/lib.rs) → `FdCanvas::dispatch_action()`
- Modifier drag (⌘/Alt) is handled in JS ([`main.js`](../fd-vscode/webview/main.js)) before WASM delegation
- Z-order operations use `SceneGraph::send_backward/bring_forward/send_to_back/bring_to_front`
- `duplicate_selected_at(dx, dy)` supports custom offset (0,0 for clone-in-place)
- Tool locking state is JS-only (`lockedTool` variable)
