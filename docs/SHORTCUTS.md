# FD Canvas Keyboard Shortcuts

> Complete reference for all keyboard shortcuts and modifier behaviors in the FD canvas editor.
> Source of truth: [`crates/fd-editor/src/shortcuts.rs`](../crates/fd-editor/src/shortcuts.rs)

---

## Tools

| Key   | Action                | Notes                                 |
| ----- | --------------------- | ------------------------------------- |
| `V`   | Select / Move         | Default tool                          |
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
| `Space` (hold)    | Pan / hand tool                   |
| `⌘` (hold)        | Temporary hand tool (Select mode) |
| `Alt` (hold)      | Copy cursor preview               |
| `Ctrl` (hold)     | Eraser cursor preview             |
| Pinch             | Trackpad zoom                     |
| Middle-click drag | Pan                               |

---

## Modifier Behaviors (During Pointer Interaction)

### When a Drawing Tool is active (R, O, P, A, T, F)

| Modifier       | On Object                     | On Empty Space                   |
| -------------- | ----------------------------- | -------------------------------- |
| None           | Draw new shape                | Draw new shape                   |
| `⌘`            | **Move object** (temp Select) | **Marquee select** (temp Select) |
| `Alt`          | **Clone + drag**              | Draw new shape                   |
| `Shift`        | Constrain (square/axis)       | Constrain                        |
| `Space` (hold) | Pan                           | Pan                              |

### When Select Tool is active (V)

| Modifier           | On Object                                                 | On Empty Space |
| ------------------ | --------------------------------------------------------- | -------------- |
| None               | Move / select                                             | Marquee select |
| `Alt`              | **Clone + drag**                                          | Marquee select |
| `Alt` (click only) | **Style picker** — copies fill/stroke/opacity as defaults | —              |
| `Shift`            | Add to selection                                          | Add to marquee |
| `⌘` (hold)         | Pan                                                       | Pan            |
| `Space` (hold)     | Pan                                                       | Pan            |

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
Defaults **reset** on page reload (session only, not saved to `.fd` file).

---

## Zen Mode

| Action                         | Effect                                  |
| ------------------------------ | --------------------------------------- |
| Click 🧘/🔧 toggle (top-right) | Switch between Zen ↔ Full mode          |
| `L`                            | Toggle Layers panel (works in Zen mode) |

Zen mode hides: Layers, Properties, Minimap, AI Assist, Grid, Export, Theme, Zoom, Help, Status.
Zen mode keeps: 6 core tools (Select, Rect, Ellipse, Pen, Arrow, Text), Sketchy toggle.

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
