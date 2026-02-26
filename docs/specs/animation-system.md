# Animation System

> R1.5, R3.29, R5.6 | Status: done

## Format (R1.5)

### Trigger Animations

```fd
rect @button {
  w: 200 h: 48
  fill: #6C5CE7

  anim :hover {
    fill: #5A4BD1
    scale: 1.02
    ease: ease_out 300ms
  }

  anim :press {
    scale: 0.95
    ease: spring 150ms
  }

  anim :enter {
    opacity: 0 -> 1
    ease: ease_in 500ms
  }
}
```

### Triggers

| Trigger  | Fires when                     | Reverts when              |
| -------- | ------------------------------ | ------------------------- |
| `:hover` | Pointer enters node bounds     | Pointer exits node bounds |
| `:press` | Pointer-down on node           | Pointer-up anywhere       |
| `:enter` | Node first appears in viewport | _(never — plays once)_    |

### Animatable Properties

| Property  | Type          | Range             |
| --------- | ------------- | ----------------- |
| `fill`    | Color         | Any hex color     |
| `stroke`  | Color + width | `#color width`    |
| `opacity` | Float         | 0.0–1.0           |
| `scale`   | Float         | 0.0+ (1.0 = 100%) |
| `corner`  | Float         | 0+                |
| `x`, `y`  | Float         | Offset in px      |

### Easing Functions

| Keyword       | Curve                            |
| ------------- | -------------------------------- |
| `linear`      | Constant speed                   |
| `ease_in`     | Slow start, fast end             |
| `ease_out`    | Fast start, slow end             |
| `ease_in_out` | Slow start and end               |
| `spring`      | Overshoot bounce (damped spring) |

Duration format: `Nms` (e.g. `300ms`, `1500ms`)

## Tween Engine (R5.6)

Animation state machine per node:

```
IDLE → trigger fires → ANIMATING → duration elapsed → HOLD
                                                        ↓
                                         trigger reverts → REVERTING → IDLE
```

### Interpolation

For each frame during animation:

1. Calculate `t = elapsed / duration` (clamped to [0, 1])
2. Apply easing function to get `eased_t`
3. Interpolate each property: `value = from + (to - from) * eased_t`
4. Color interpolation in RGB space (per-channel lerp)

### Property Resolution with Animations

Style resolution order:

1. Base style (`use:` referenced styles)
2. Inline style (node's own `fill:`, `stroke:`, etc.)
3. Animation override (if animating — blended value at current `t`)

The animation value **temporarily overrides** the resolved style during rendering. It never mutates the SceneGraph — it's a rendering-only effect.

## Animation Drop (R3.29)

### Gesture Flow

```
1. Select a node (the "preset source")
2. Drag it onto another node (the "target")
3. Target shows magnetic glow ring (purple pulse border)
4. Release → Animation Picker popover opens
5. Hover presets → live preview plays on target
6. Click preset → commit anim block to FD source
```

### Magnetic Glow Ring

When dragging over a valid target node:

- Purple pulsing border (CSS `box-shadow` with keyframe animation)
- Appears when pointer enters target bounds
- Disappears when pointer exits

### Animation Picker Popover

Glassmorphism UI with 3 groups:

| Group     | Presets                              |
| --------- | ------------------------------------ |
| **Hover** | Glow, Lift, Color Shift, Scale Up    |
| **Press** | Bounce, Shrink, Flash                |
| **Enter** | Fade In, Slide Up, Scale In, Blur In |

Each preset maps to a specific `anim` block:

```fd
# "Lift" preset generates:
anim :hover {
  y: -4
  shadow: 0,8,24,#0003
  ease: ease_out 200ms
}
```

### Live Preview

Hovering a preset in the picker:

1. Temporarily applies the animation values to the target node
2. Plays the tween at normal speed
3. Reverts on mouse-leave
4. No SceneGraph mutation — rendering-only preview

### Commit

Clicking a preset:

1. Generate the `anim :trigger { ... }` FD text block
2. Call `add_animation_to_node(target_id, anim_text)` via WASM
3. WASM applies `SetAnimations` mutation (with undo/redo support)
4. `emit_document()` → FD source updated in Code Mode

## Edge Cases

- **Multiple animations on same trigger** → last one wins (replacement, not merge)
- **Animation on deleted node** → animation block removed with the node
- **`:enter` fires repeatedly on re-parse** → debounced by `entered` flag per node
- **Scale animation causes hit-test mismatch** → hit testing uses base bounds, not animated bounds
- **`:press` during inline edit** → `clear_pressed()` suppresses press animation state
- **Animation during drag** → `:hover` suppressed during active drag to prevent flicker

## Implementation Notes

| Module          | File                               | Key Functions                                           |
| --------------- | ---------------------------------- | ------------------------------------------------------- |
| Animation model | `crates/fd-core/src/model.rs`      | `AnimKeyframe`, `AnimTrigger`, `Easing`                 |
| Parser          | `crates/fd-core/src/parser.rs`     | `parse_animation()`, `parse_easing()`                   |
| Emitter         | `crates/fd-core/src/emitter.rs`    | `emit_animations()`                                     |
| Tween engine    | `crates/fd-wasm/src/render2d.rs`   | `apply_anim_state()`, `interpolate_color()`             |
| WASM API        | `crates/fd-wasm/src/lib.rs`        | `add_animation_to_node()`, `get_node_animations_json()` |
| Mutations       | `crates/fd-editor/src/commands.rs` | `SetAnimations`                                         |
| Picker UI (JS)  | `fd-vscode/webview/main.js`        | Animation Picker popover DOM                            |

## Test Coverage

| Test                      | Location         | What it covers                           |
| ------------------------- | ---------------- | ---------------------------------------- |
| `parse_animation`         | `parser.rs`      | Trigger parsing, easing, properties      |
| `emit_animations`         | `emitter.rs`     | Animation block serialization            |
| `roundtrip_animation_*`   | `emitter.rs`     | Parse→emit fidelity                      |
| `sketchy_jitter_*`        | `render2d.rs`    | Deterministic rendering jitter (3 tests) |
| E2E: tween engine         | `e2e-ux.test.ts` | Interpolation accuracy (2 tests)         |
| `arrow_tool_preview_line` | `tools.rs`       | Preview line during arrow drag           |
