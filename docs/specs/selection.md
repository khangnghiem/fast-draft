# Selection & Manipulation

> R3.1, R3.2, R3.16, R3.24, R3.26 | Status: done

## Behavior

### Click Select (R3.1)

| Action               | Result                                       |
| -------------------- | -------------------------------------------- |
| Click node           | Select it (deselect all others)              |
| Shift+click node     | Toggle it in/out of selection                |
| Click empty canvas   | Deselect all                                 |
| Drag on empty canvas | Marquee (rubber-band) selection              |
| Shift+drag           | Additive marquee — add to existing selection |

Marquee selects any node whose bounding box **intersects** the rectangle (not requires full containment).

### Drag to Move (R3.2)

- Pointer-down on selected node → drag moves all selected nodes
- If pointer-down on an **unselected** node → select it first, then drag
- Shift-drag: constrain movement to X or Y axis (whichever has more displacement after 4px dead zone)
- Drag updates node `x:` / `y:` in FD source via `MoveNode` mutation

### Resize Handles (R3.16)

8-point resize grips appear on selected shapes:

```
  NW ──── N ──── NE
  │                │
  W                E
  │                │
  SW ──── S ──── SE
```

| Handle | Cursor        | Behavior                    |
| ------ | ------------- | --------------------------- |
| NW, SE | `nwse-resize` | Diagonal resize from corner |
| NE, SW | `nesw-resize` | Diagonal resize from corner |
| N, S   | `ns-resize`   | Vertical resize from edge   |
| E, W   | `ew-resize`   | Horizontal resize from edge |

- **Opposite corner anchored** — resizing NW anchors SE in place
- **Shift+resize** → constrain to square proportions
- **Min size** → 4px prevents collapsing to zero
- Resize updates `w:` / `h:` and adjusts `x:` / `y:` to keep anchor fixed

### Group Drill-down (R3.24)

State machine for nested group selection (Figma/Sketch behavior):

```
Click child of UNSELECTED group → selects the GROUP (parent)
Click child of SELECTED group   → drills into child (selects child)
Click child of SELECTED child   → stays on that child
```

Visual feedback:

- **Hover** on group → dashed blue border
- **Selected** group → solid blue border + `"Group @id"` badge
- **Drill-down** → child shows its own selection handles

Implementation:

- `effective_target()` in `model.rs` — bubbles up to nearest unselected group
- Click-vs-drag distinction: pointer-down captures target, pointer-up without drag drills, pointer-up with drag moves the group
- `is_ancestor_of()` helper for traversing parent chains

### Arrow-Key Nudge (R3.26)

| Key               | Distance |
| ----------------- | -------- |
| Arrow key         | 1px      |
| Shift + arrow key | 10px     |

Nudge applies to all selected nodes. Updates `x:` / `y:` in FD source.

## Edge Cases

- **Marquee on empty doc** → no crash, empty selection
- **Resize to negative dimensions** → min clamped to 4×4px
- **Drag a group child that's already selected** → moves only the child, not the parent group
- **3+ level nested groups** → drill-down works recursively (click outer → click inner → click leaf)
- **Resize handle hit zone** → 8px radius around visual handle center for touch/trackpad friendliness

## Implementation Notes

| Module      | File                               | Key Functions                                 |
| ----------- | ---------------------------------- | --------------------------------------------- |
| Hit testing | `crates/fd-render/src/hit.rs`      | `hit_test_node()`, `hit_test_resize_handle()` |
| Selection   | `crates/fd-editor/src/tools.rs`    | `SelectTool`, `handle_pointer_down/up()`      |
| Group logic | `crates/fd-core/src/model.rs`      | `effective_target()`, `is_ancestor_of()`      |
| Mutations   | `crates/fd-editor/src/commands.rs` | `MoveNode`, `ResizeNode`                      |

## Test Coverage

| Test                 | Location         | What it covers                                      |
| -------------------- | ---------------- | --------------------------------------------------- |
| `select_tool_*`      | `tools.rs`       | Click, shift-click, deselect (5 tests)              |
| `hit_test_*`         | `hit.rs`         | Point→node, nested groups, resize handles (3 tests) |
| `effective_target_*` | `model.rs`       | Group drill-down, 3-level nesting (5 tests)         |
| `select_tool_drag`   | `tools.rs`       | Drag moves selection                                |
| E2E: nudge, resize   | `e2e-ux.test.ts` | Arrow-key 1px/10px, resize proportions (4 tests)    |
