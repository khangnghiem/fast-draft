# Edge System

> R1.10, R1.11, R1.12, R5.7, R5.8 | Status: done

## Format (R1.10)

### Basic Edge

```fd
edge @flow_login_to_dashboard {
  from: @login_screen
  to: @dashboard
  arrow: end
  stroke: #6C5CE7 2
}
```

### Edge Properties

| Property  | Values                         | Default      |
| --------- | ------------------------------ | ------------ |
| `from:`   | `@node_id`                     | _(required)_ |
| `to:`     | `@node_id`                     | _(required)_ |
| `arrow:`  | `none`, `start`, `end`, `both` | `end`        |
| `curve:`  | `straight`, `smooth`, `step`   | `smooth`     |
| `stroke:` | `#color width`                 | `#999 1`     |
| `label:`  | `"text"`                       | _(none)_     |
| `flow:`   | `pulse Nms`, `dash Nms`        | _(none)_     |

### With Annotations

```fd
edge @user_login_flow {
  from: @login_form
  to: @dashboard
  arrow: end
  curve: smooth
  stroke: #6C5CE7 2
  label: "POST /auth"

  spec {
    "Authentication flow — form submit to dashboard redirect"
    accept: "shows loading spinner during request"
    status: done
    priority: high
    tag: auth, flow
  }
}
```

## Trigger Animations (R1.11)

Edges support the same `anim` blocks as nodes:

```fd
edge @nav_link {
  from: @page_a to: @page_b
  stroke: #CCC 1

  anim :hover {
    stroke: #6C5CE7 3
    ease: ease_out 200ms
  }
}
```

Supported triggers: `:hover`, `:press`, `:enter` — identical to node animation triggers.

## Flow Animations (R1.12)

Continuous animations that visualize data flow direction:

```fd
edge @data_pipe {
  from: @api to: @db
  flow: pulse 800ms     # traveling dot from → to
}

edge @sync_channel {
  from: @client to: @server
  flow: dash 600ms      # marching dashes from → to
}
```

| Flow Type | Visual                                 | Parameters    |
| --------- | -------------------------------------- | ------------- |
| `pulse`   | Animated dot traveling along edge path | Duration (ms) |
| `dash`    | Marching dashes moving along edge path | Duration (ms) |

Flow direction follows `from → to`. Animation loops continuously.

## Rendering (R5.7, R5.8)

### Curve Algorithms

| `curve:`   | Algorithm                             | Use Case             |
| ---------- | ------------------------------------- | -------------------- |
| `straight` | Direct line segment                   | Simple connections   |
| `smooth`   | Cubic Bézier with auto control points | Most edges (default) |
| `step`     | Right-angle step routing              | Flowcharts, UML      |

### Arrowhead Rendering

Arrowheads are drawn as filled triangles at the edge endpoints:

- Size scales with `stroke` width
- Arrow at `start` points toward source, arrow at `end` points toward target
- Both arrows drawn when `arrow: both`

### Label Positioning

Edge labels are positioned at the midpoint of the edge path:

- Horizontally centered on the path
- Offset slightly above the line to avoid overlap
- Uses the edge's font settings (or defaults)

### Flow Animation Rendering

**Pulse dot:**

- Small filled circle traveling along the edge path
- Position interpolated by `(time_ms % duration) / duration`
- Color matches edge `stroke` color

**Marching dashes:**

- Dash pattern with animated offset
- `stroke-dashoffset` decremented each frame
- Speed determined by duration parameter

## Edge Cases

- **Self-referencing edge** (`from: @a to: @a`) → draws a loop arc
- **Deleted source/target node** → edge becomes orphaned; parser handles gracefully
- **Overlapping edges between same nodes** → rendered side-by-side with slight offset
- **Edge label collision** → no automatic avoidance (manual positioning via constraints)
- **Hover on edge** → hit testing uses distance-to-curve threshold (6px)

## Implementation Notes

| Module     | File                               | Key Functions                     |
| ---------- | ---------------------------------- | --------------------------------- |
| Parser     | `crates/fd-core/src/parser.rs`     | `parse_edge()`, `parse_flow()`    |
| Emitter    | `crates/fd-core/src/emitter.rs`    | `emit_edge()`, `emit_flow()`      |
| Model      | `crates/fd-core/src/model.rs`      | `Edge`, `EdgeFlow`, `EdgeArrow`   |
| Rendering  | `crates/fd-wasm/src/render2d.rs`   | `draw_edge()`, `draw_edge_flow()` |
| Mutations  | `crates/fd-editor/src/commands.rs` | `AddEdge`, `RemoveEdge`           |
| Arrow tool | `crates/fd-editor/src/tools.rs`    | `ArrowTool`                       |

## Test Coverage

| Test                          | Location     | What it covers                                   |
| ----------------------------- | ------------ | ------------------------------------------------ |
| `parse_edge_*`                | `parser.rs`  | Basic edges, properties, annotations             |
| `emit_edge_*`                 | `emitter.rs` | Edge serialization with all properties           |
| `roundtrip_edge_*`            | `emitter.rs` | Parse→emit round-trip fidelity                   |
| `emit_edge_with_trigger_anim` | `emitter.rs` | `:hover`/`:press` animation blocks on edges      |
| `roundtrip_edge_hover_anim`   | `emitter.rs` | Animation round-trip                             |
| `emit_edge_flow_*`            | `emitter.rs` | `flow: pulse`/`dash` serialization               |
| `roundtrip_edge_flow_*`       | `emitter.rs` | Flow animation round-trip                        |
| `arrow_tool_*`                | `tools.rs`   | Create edge, same-node reject, preview (5 tests) |
