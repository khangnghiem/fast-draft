# FD Format Cheatsheet

Quick reference for all `.fd` (Fast Draft) keywords and syntax.

## Node Types

```fd
rect @id { ... }              # Rectangle
ellipse @id { ... }           # Ellipse / circle
text @id "content" { ... }    # Text label
group @id { ... }             # Group container (auto-sizes to children)
frame @id { ... }             # Frame container (explicit w/h, optional clip)
path @id { ... }              # Freeform path
@id { ... }                   # Generic placeholder (renders as dashed box)
```

## Properties

```fd
# Dimensions
w: 200  h: 100                # Width, height (px suffix accepted: w: 200px)
x: 50   y: 120                # Position relative to parent

# Appearance
fill: #6C5CE7                 # Fill color (hex)
fill: purple                  # Fill color (named — see Named Colors)
stroke: #333 2                # Stroke color + width
corner: 12                    # Border radius
opacity: 0.8                  # Transparency (0–1)
shadow: (0,4,20,#0000001A)    # Drop shadow (x, y, blur, color)
clip: true                    # Clip children to frame bounds

# Typography
font: "Inter" bold 16         # Font family, weight, size
align: center middle          # Text alignment (h: left|center|right, v: top|middle|bottom)

# Style reuse
use: style_name               # Apply a named style
```

## Property Aliases

| Alias         | Canonical |
| ------------- | --------- |
| `background:` | `fill:`   |
| `color:`      | `fill:`   |
| `rounded:`    | `corner:` |
| `radius:`     | `corner:` |

## Style Definitions

```fd
style accent {
  fill: purple
  font: "Inter" semibold 14
  corner: 8
  opacity: 1
}

rect @btn { use: accent }     # Apply the style
```

## Layout

```fd
layout: column gap=12 pad=16  # Vertical stack
layout: row gap=12 pad=16     # Horizontal row
layout: grid cols=3 gap=12 pad=16  # Grid
```

## Constraints

```fd
@id -> center_in: canvas      # Center in canvas
@id -> center_in: @other      # Center in another node
@id -> offset: @ref 20, 10    # Offset from reference node
@id -> fill_parent: 16        # Fill parent with padding
```

## Edges (Connections)

```fd
edge @connection {
  from: @source
  to: @target
  label: "on success"
  stroke: #10B981 2
  arrow: end                  # none | start | end | both
  curve: smooth               # straight | smooth | step
}
```

## Animations

```fd
anim :hover {
  fill: #5A4BD1
  scale: 1.05
  opacity: 1
  rotate: 5
  ease: spring 200ms
}
```

| Triggers    | Easing Functions |
| ----------- | ---------------- |
| `:hover`    | `linear`         |
| `:press`    | `ease_in`        |
| `:enter`    | `ease_out`       |
| `:<custom>` | `ease_in_out`    |
|             | `spring`         |

## Spec Annotations

```fd
# Inline
rect @btn { spec "Primary CTA" }

# Block form
rect @btn {
  spec {
    "Primary CTA — triggers login"
    accept: "disabled when fields empty"
    status: in_progress        # draft | in_progress | done
    priority: high             # low | medium | high
  }
}
```

## Imports

```fd
import "shared/tokens.fd" as t
rect @hero { use: t.accent }
```

## Background Shorthand

```fd
bg: #FFF corner=12 shadow=(0,4,20,#0002)
```

## Named Colors

| Name               | Hex     | Name                | Hex     |
| ------------------ | ------- | ------------------- | ------- |
| `red`              | #EF4444 | `blue`              | #3B82F6 |
| `orange`           | #F97316 | `indigo`            | #6366F1 |
| `amber` / `yellow` | #F59E0B | `purple` / `violet` | #8B5CF6 |
| `lime`             | #84CC16 | `pink`              | #EC4899 |
| `green`            | #22C55E | `rose`              | #F43F5E |
| `teal`             | #14B8A6 | `white`             | #FFFFFF |
| `cyan`             | #06B6D4 | `black`             | #000000 |
| `slate`            | #64748B | `gray` / `grey`     | #6B7280 |

## Font Weights

| Name        | Numeric |
| ----------- | ------- |
| `thin`      | 100     |
| `light`     | 300     |
| `regular`   | 400     |
| `medium`    | 500     |
| `semibold`  | 600     |
| `bold`      | 700     |
| `extrabold` | 800     |
| `black`     | 900     |

## Comments

```fd
# Single-line comment (discarded by parser)
```
