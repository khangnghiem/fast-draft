---
name: ftd-format
description: How to read, write, and modify .ftd (Fast Draft) files
---

# FTD Format Skill

## Overview

The `.ftd` format is a token-efficient text DSL for 2D graphics, layout, and animation. This skill explains how to read and write valid `.ftd` files.

## Grammar Reference

### Comments

```
# This is a comment
```

### Style Definitions

Named, reusable sets of visual properties:

```
style <name> {
  fill: <color>
  font: "<family>" <weight> <size>
  corner: <radius>
  opacity: <0-1>
}
```

### Node Types

Every visual element is a node with an optional `@id`:

```
rect @my_rect {
  w: <width> h: <height>
  fill: <color>
  stroke: <color> <width>
  corner: <radius>
  use: <style_name>
}

ellipse @my_circle {
  w: <rx> h: <ry>
  fill: <color>
}

text @label "Content goes here" {
  font: "<family>" <weight> <size>
  fill: <color>
  use: <style_name>
}

group @container {
  layout: column gap=<px> pad=<px>
  layout: row gap=<px> pad=<px>
  layout: grid cols=<n> gap=<px> pad=<px>

  # Children go here (nested nodes)
  rect @child1 { ... }
  text @child2 "..." { ... }
}

path @drawing {
  # Path data (SVG-like commands) — future
}
```

### Colors

Hex format: `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`

```
fill: #6C5CE7
fill: #FF000080    # with alpha
```

### Background Shorthand

```
bg: #FFF corner=12 shadow=(0,4,20,#0002)
```

### Animations

```
anim :<trigger> {
  fill: <color>
  opacity: <0-1>
  scale: <factor>
  rotate: <degrees>
  ease: <easing> <duration>ms
}
```

Triggers: `:hover`, `:press`, `:enter`, `:<custom>`
Easing: `linear`, `ease_in`, `ease_out`, `ease_in_out`, `spring`

### Constraints (Top-Level)

```
@node_id -> center_in: canvas
@node_id -> center_in: @other_node
@node_id -> offset: @ref 20, 10
@node_id -> fill_parent: 16
```

### Annotations

Structured metadata attached to nodes via `##` lines. Unlike `#` comments (which are discarded), annotations are parsed, stored on the scene graph, and survive round-trips.

```
rect @login_btn {
  ## "Primary CTA — triggers login API call"
  ## accept: "disabled state when fields empty"
  ## status: in_progress
  ## priority: high
  ## tag: auth, mvp
  w: 280 h: 48
}
```

| Syntax               | Kind        | Purpose                        |
| -------------------- | ----------- | ------------------------------ |
| `## "text"`          | Description | What this node is/does         |
| `## accept: "text"`  | Accept      | Acceptance criterion           |
| `## status: value`   | Status      | `draft`, `in_progress`, `done` |
| `## priority: value` | Priority    | `high`, `medium`, `low`        |
| `## tag: value`      | Tag         | Categorization labels          |

## Token Efficiency Tips

1. Use `w:` / `h:` shorthand, not `width:` / `height:`
2. Use `style` blocks for shared properties — reference with `use:`
3. Short hex colors: `#FFF` not `#FFFFFF`
4. Inline `w: 100 h: 50` on one line
5. Use constraints instead of absolute coordinates

## Example: Complete Card

```
style body { font: "Inter" 14; fill: #333 }
style accent { fill: #6C5CE7 }

group @card {
  layout: column gap=12 pad=20
  bg: #FFF corner=8 shadow=(0,2,8,#0001)

  text @heading "Dashboard" { font: "Inter" 600 20; fill: #111 }
  text @desc "Overview of metrics" { use: body }

  rect @cta {
    w: 180 h: 40
    corner: 8
    use: accent
    text "View Details" { font: "Inter" 500 14; fill: #FFF }
    anim :hover { scale: 1.03; ease: spring 200ms }
  }
}

@card -> center_in: canvas
```

## Crate Locations

- Parser: `crates/ftd-core/src/parser.rs`
- Emitter: `crates/ftd-core/src/emitter.rs`
- Data model: `crates/ftd-core/src/model.rs`
- Layout solver: `crates/ftd-core/src/layout.rs`
