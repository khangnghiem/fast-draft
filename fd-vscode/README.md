# Fast Draft

> A token-efficient file format and interactive canvas for drawing, design, and animation. Built in Rust + WASM.

## What You Get

Install this extension and **every `.fd` file lights up** — syntax colors, instant error detection, and a visual canvas that renders your design in real time. Think Figma meets code.

| You write this...                              | ...and get this                |
| ---------------------------------------------- | ------------------------------ |
| `rect @box { w: 200 h: 100 }`                  | A colored rectangle on canvas  |
| `text @title "Hello" { font: "Inter" 600 24 }` | Styled text, visually rendered |
| `anim :hover { fill: #5A4BD1 }`                | Hover animation metadata       |
| `@card -> center_in: canvas`                   | Constraint-based auto-layout   |

---

## Features

### 🎨 Syntax Highlighting

Rich TextMate-based syntax highlighting for `.fd` files:

- **Node keywords** — `group`, `rect`, `ellipse`, `text`, `path`
- **Style blocks** — `style accent { fill: #6C5CE7 }`
- **Node IDs** — `@login_form`, `@button`
- **Hex colors** — `#FF5733`, `#1A1A2E`
- **Properties** — `w:`, `h:`, `fill:`, `font:`, `layout:`
- **Animations** — `anim :hover { ... }`
- **Comments** — `# This is a comment`

### ✅ Live Parser Validation

Real-time error detection as you type:

- **Mismatched braces** → red squiggles + Problems panel
- **Invalid hex colors** like `#GGG` or `#12345` → instant feedback
- **Debounced** — validates 300ms after you stop typing (no lag)

### 🖼️ Interactive Canvas

A live-rendering canvas powered by Rust/WASM:

- **Bidirectional sync** — change the text and the canvas updates; drag on canvas and the text updates
- **Select tool** (`V`) — click to select nodes, drag to move
- **Rect tool** (`R`) — click + drag to draw new rectangles
- **Undo/Redo** — `Cmd+Z` / `Cmd+Shift+Z`
- **Resize-aware** — canvas adapts to your panel size

### 🌳 Tree Preview

View the parsed scene graph as a structural tree:

- Open via **Command Palette** → `FD: Show Tree Preview`
- Shows node hierarchy: groups → children → properties
- Updates live as you edit

---

## Interactive Usage Guide

### 1. Create a new `.fd` file

```fd
# FD v1
# My first design

rect @hero {
  w: 400 h: 300
  corner: 16
  fill: #6C5CE7
}

@hero -> center_in: canvas
```

Save as `hello.fd` — syntax highlighting activates automatically.

### 2. Open the Canvas Editor

- **Right-click** the file → `Open With...` → `FD Canvas`
- Or use **Command Palette** → `FD: Open Canvas Editor`

The canvas renders your design. Edit the text on the left; see changes on the right.

### 3. Draw on the Canvas

Switch tools with keyboard shortcuts:

| Key           | Tool   | Action                          |
| ------------- | ------ | ------------------------------- |
| `V`           | Select | Click to select, drag to move   |
| `R`           | Rect   | Click + drag to draw rectangles |
| `Cmd+Z`       | Undo   | Undo last action                |
| `Cmd+Shift+Z` | Redo   | Redo last undone action         |

When you draw a rectangle on canvas, the corresponding FD code is **automatically generated** in the text editor.

### 4. Inspect the Scene Graph

Open **Command Palette** → `FD: Show Tree Preview` to see:

```
Scene Graph
├── style accent
├── group @login_form
│   ├── text @title "Welcome Back"
│   ├── rect @email_field
│   │   └── text @email_hint "Email"
│   ├── rect @pass_field
│   │   └── text @pass_hint "Password"
│   └── rect @login_btn
│       └── text @btn_label "Sign In"
└── @login_form → center_in: canvas
```

### 5. Catch Errors Instantly

Try typing an invalid color:

```fd
rect @broken {
  fill: #GGG     # ← red squiggle: "Invalid hex color"
  w: 100 h: 50
```

↑ Missing `}` — the Problems panel shows: _"1 unclosed brace(s)"_

---

## Example: Login Form

```fd
# FD v1
# A login form mockup

style base_text {
  font: "Inter" 14
  fill: #333333
}

style accent {
  fill: #6C5CE7
}

group @login_form {
  layout: column gap=16 pad=32

  text @title "Welcome Back" {
    use: base_text
    font: "Inter" 600 24
    fill: #1A1A2E
  }

  rect @email_field {
    w: 280 h: 44
    corner: 8
    stroke: #DDDDDD 1

    text @email_hint "Email" {
      use: base_text
      fill: #999999
    }
  }

  rect @login_btn {
    w: 280 h: 48
    corner: 10
    use: accent

    text @btn_label "Sign In" {
      font: "Inter" 600 16
      fill: #FFFFFF
    }

    anim :hover {
      fill: #5A4BD1
      scale: 1.02
      ease: spring 300ms
    }
  }
}

@login_form -> center_in: canvas
```

**What this produces:**

- A vertical card with 16px gap between elements
- A title, email input field, and a purple Sign In button
- The button has a hover animation (color shift + subtle scale)
- The entire form is centered on the canvas

---

## Why FD?

| vs. SVG                                         | vs. Figma                                         | vs. HTML/CSS                                            |
| ----------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| **5× fewer tokens** — AI can generate it faster | **Code-first** — version control, diffs, PRs      | **Semantic** — `center_in: canvas` not `margin: 0 auto` |
| **Constraint-based** — no absolute coords       | **Open format** — no vendor lock-in               | **GPU-rendered** — Vello/wgpu pipeline                  |
| **Bidirectional** — edit code or canvas         | **Extensible** — custom nodes, styles, animations | **WASM** — same renderer on web, desktop, mobile        |

## Requirements

- VS Code ≥ 1.85.0

## Links

- [GitHub Repository](https://github.com/khangnghiem/fast-draft)
- [FD Format Specification](https://github.com/khangnghiem/fast-draft/blob/main/REQUIREMENTS.md)
- [Marketplace](https://marketplace.visualstudio.com/items?itemName=KhangNghiem.fd-vscode)

## License

MIT
