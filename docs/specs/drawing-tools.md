# Drawing Tools

> R3.3, R3.4, R3.5, R3.15, R3.19, R3.22, R3.23 | Status: partial

## Tool Lifecycle

All drawing tools follow the same state machine:

```
IDLE → pointer-down → DRAWING → pointer-up → commit node → switch to Select
```

**Exceptions:**

- **Double-press** shortcut (RR, OO, PP, TT) → locks tool in **Sticky Mode** (🔒 badge); stays active after placing shapes
- **⌘+drag** while in a drawing tool → **temporary Select** (move/marquee); auto-restores tool on pointer-up

## Shape Tools (R3.3)

### Rectangle (`R` key)

| Action                          | Result                                          |
| ------------------------------- | ----------------------------------------------- |
| Click on canvas                 | Create 120×80 rect **centered** at click point  |
| Click + drag                    | Create rect from drag origin to current pointer |
| Shift + drag                    | Constrain to square                             |
| Alt/⌥ + drag _(R3.19, planned)_ | Anchor center at drag origin                    |

Default style: `fill: #D5D5E0`, `corner: 0`, `stroke: none`

### Ellipse (`O` key)

| Action          | Result                                        |
| --------------- | --------------------------------------------- |
| Click on canvas | Create 100×100 circle centered at click point |
| Click + drag    | Create ellipse from bounding box              |
| Shift + drag    | Constrain to circle                           |

### Text (`T` key)

| Action                    | Result                                           |
| ------------------------- | ------------------------------------------------ |
| Click on canvas           | Create text node, immediately open inline editor |
| Double-click empty canvas | Same as pressing T + click                       |

Default: `font: "Inter" 400 16`, `fill: #333333`, initial bounds 80×24

### Frame (`F` key)

| Action       | Result                                            |
| ------------ | ------------------------------------------------- |
| Click + drag | Create frame container (visible, clippable group) |

Default: 200×150, `fill: #FAFAFA`, `stroke: #E0E0E0 1`, `corner: 0`

### Arrow/Connector (`A` key)

| Action                                  | Result                                    |
| --------------------------------------- | ----------------------------------------- |
| Click source node → drag to target node | Create edge with smooth curve + arrowhead |
| Drag over node                          | Dashed preview line follows cursor        |
| Release on same node                    | No edge created                           |
| Release on empty canvas                 | No edge created                           |

## Pen Tool (R3.4)

### Current (done)

- Freehand drawing with Catmull-Rom smoothing
- Pressure captured from pointer events (`pointerEvent.pressure`)
- Creates `path` node with smoothed control points

### Planned (R3.22)

- Map `pressure` → stroke `width` in real-time
- Width range configurable (e.g. 1px–8px)
- Apple Pencil Pro + Wacom support

### Planned (R3.23) — Shape Recognition

After pen stroke completes:

1. Analyze path geometry (bounding box aspect ratio, point distribution)
2. If near-rectangular → offer "Snap to Rect" action
3. If near-circular → offer "Snap to Ellipse"
4. If near-linear → offer "Snap to Line"
5. One-click converts freehand path to clean geometric node

## Live Preview (R3.15, planned)

During drag-to-create:

- **Rect/Ellipse** → dashed outline ghost at current dimensions
- **Pen** → smooth curve preview (no jagged `LineTo` visible to user)
- Ghost disappears on pointer-up and is replaced by the committed shape

## Visual Feedback

| Tool          | Cursor      | Toolbar state |
| ------------- | ----------- | ------------- |
| Select (`V`)  | `default`   | Highlighted   |
| Rect (`R`)    | `crosshair` | Highlighted   |
| Ellipse (`O`) | `crosshair` | Highlighted   |
| Pen (`P`)     | `crosshair` | Highlighted   |
| Text (`T`)    | `text`      | Highlighted   |
| Frame (`F`)   | `crosshair` | Highlighted   |
| Arrow (`A`)   | `crosshair` | Highlighted   |

## Smart Defaults (Sticky Styles)

Changing fill/stroke/opacity/fontSize on any node stores it as the default for future shapes of that tool type. Alt+click a node to copy its entire style as defaults for all tools.

Per-tool session memory — rect remembers rect defaults, text remembers text defaults. Resets on reload.

## Implementation Notes

| Module        | File                                | Key Functions                                                 |
| ------------- | ----------------------------------- | ------------------------------------------------------------- |
| Tool dispatch | `crates/fd-editor/src/tools.rs`     | `RectTool`, `EllipseTool`, `PenTool`, `TextTool`, `ArrowTool` |
| Node creation | `crates/fd-wasm/src/lib.rs`         | `create_node_at(kind, x, y)`                                  |
| Mutations     | `crates/fd-editor/src/commands.rs`  | `AddNode`, `AddEdge`                                          |
| Shortcuts     | `crates/fd-editor/src/shortcuts.rs` | `resolve_shortcut()`                                          |

## Test Coverage

| Test                     | Location       | What it covers                                                                 |
| ------------------------ | -------------- | ------------------------------------------------------------------------------ |
| `rect_tool_*`            | `tools.rs`     | Click-create centered, drag-create (3 tests)                                   |
| `ellipse_tool_*`         | `tools.rs`     | Click-create, drag-create (2 tests)                                            |
| `text_tool_*`            | `tools.rs`     | Click-create (1 test)                                                          |
| `arrow_tool_*`           | `tools.rs`     | Edge between nodes, same-node reject, no-source reject, preview line (5 tests) |
| `resolve_arrow_shortcut` | `shortcuts.rs` | Arrow key → tool switch                                                        |
| R3.4 pen tool            | —              | ⚠️ No unit tests (E2E only)                                                    |
