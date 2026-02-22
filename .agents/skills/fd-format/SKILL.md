---
name: fd-format
description: How to read, write, and modify .fd (Fast Draft) files
---

# FD Format Skill

## Overview

The `.fd` format is a human- and AI-readable text DSL for 2D graphics, layout, and animation. In **Code mode**, prefer explicit property names for accuracy over shorthand for token savings. This skill explains how to read and write valid `.fd` files.

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
  width: <width> height: <height>
  fill: <color>
  stroke: <color> <width>
  corner: <radius>
  use: <style_name>
}

ellipse @my_circle {
  width: <rx> height: <ry>
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

## Code Mode — Readability Tips

> In Code mode, prefer clarity and AI-agent accuracy over token savings.

1. Use `width:` / `height:` — explicit names reduce parsing ambiguity for AI agents
2. Use full hex colors: `#FFFFFF` not `#FFF` — unambiguous for tooling
3. Use `style` blocks for shared properties — reference with `use:`
4. Use constraints instead of absolute coordinates
5. One property per line when possible — easier for diffs and LLM context

## Example: Complete Card

```
style body { font: "Inter" 14; fill: #333333 }
style accent { fill: #6C5CE7 }

group @card {
  layout: column gap=12 pad=20
  bg: #FFFFFF corner=8 shadow=(0,2,8,#00000011)

  text @heading "Dashboard" { font: "Inter" 600 20; fill: #111111 }
  text @desc "Overview of metrics" { use: body }

  rect @cta {
    width: 180 height: 40
    corner: 8
    use: accent
    text "View Details" { font: "Inter" 500 14; fill: #FFFFFF }
    anim :hover { scale: 1.03; ease: spring 200ms }
  }
}

@card -> center_in: canvas
```

## Crate Locations

- Parser: `crates/fd-core/src/parser.rs`
- Emitter: `crates/fd-core/src/emitter.rs`
- Data model: `crates/fd-core/src/model.rs`
- Layout solver: `crates/fd-core/src/layout.rs`
