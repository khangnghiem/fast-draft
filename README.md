# Fast Draft

> **Design as Code.** A text format and live canvas for drawing, design, and animation — right inside your code editor.

<p align="center">
  <a href="https://fast-draft.com"><strong>🌐 Try the Live Playground</strong></a> · 
  <a href="https://marketplace.visualstudio.com/items?itemName=khangnghiem.fast-draft"><strong>⚡ Install Extension</strong></a> · 
  <a href="https://github.com/khangnghiem/fast-draft"><strong>★ GitHub</strong></a>
</p>

<p align="center">
  <img src="docs/images/hero-code-canvas.png" alt="Code Mode (left) shows .fd text — Canvas Mode (right) renders it live" width="900" />
</p>

**Two modes, one file:**

- 🤖 **Code Mode** — LLMs and coding agents read, write, and reason about `.fd` text directly. ~6× fewer tokens than Excalidraw JSON, so entire UIs fit in a single prompt.
- 🎨 **Canvas Mode** — designers drag, resize, and draw on a fast, GPU-powered canvas inside VS Code, Cursor, or Zed. No code knowledge needed.

Changes in one mode instantly appear in the other.

---

## See It in Action

A card component with a hover animation — in 20 lines:

```
# A card with a button that reacts on hover

style accent {
  fill: #6C5CE7
}

frame @card {
  layout: column gap=16 pad=24
  bg: #FFF corner=12 shadow=(0,4,20,#0002)

  text @title "Hello World" {
    font: "Inter" 600 24
    fill: #1A1A2E
  }

  rect @button {
    w: 200 h: 48
    corner: 10
    use: accent

    when :hover {
      fill: #5A4BD1
      scale: 1.02
      ease: spring 300ms
    }
  }
}

@card -> center_in: canvas
```

---

## Why Fast Draft?

| Benefit                        | How                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------- |
| **AI-friendly**                | Text DSL ~6× smaller than Excalidraw JSON — LLMs can read and write entire UIs   |
| **Version-control ready**      | Plain text — `git diff`, `git merge`, code review all work naturally             |
| **Design + specs in one file** | Attach requirements, status, and acceptance criteria directly to visual elements |
| **No context switching**       | Design and code live side-by-side in your editor                                 |

## Features

- ↔️ **Two-way sync** — edit code or canvas, the other updates in <16ms
- 🤖 **AI Assist** — press ⌘I to improve designs with AI (supports 5 providers)
- 📋 **Spec blocks** — attach requirements, status, and acceptance criteria directly to shapes
- ✏️ **Sketchy rendering** — hand-drawn mode with wobbly, organic lines
- 👆 **Touch & gestures** — two-finger pan, pinch-to-zoom, Apple Pencil support
- 🎬 **Drag-and-drop animations** — drag a shape onto another to add hover/press effects

## Built-In Specs

Attach requirements directly to visual elements:

```
rect @login_btn {
  spec {
    "Primary CTA — triggers login API call"
    accept: "disabled state when fields empty"
    accept: "loading spinner during auth"
    status: in_progress
    priority: high
  }
  w: 280 h: 48
  fill: #6C5CE7 corner=10
}
```

| What you write   | What it means                                  |
| ---------------- | ---------------------------------------------- |
| `spec "text"`    | A short description of what the element does   |
| `accept: "text"` | What counts as "done" (acceptance criteria)    |
| `status: draft`  | Current status: `draft`, `in_progress`, `done` |
| `priority: high` | Importance: `high`, `medium`, `low`            |

## Editor Support

| Editor           | Syntax | LSP | Canvas |
| ---------------- | :----: | :-: | :----: |
| VS Code / Cursor |   ✅   |  —  |   ✅   |
| Zed              |   ✅   | ✅  |   —    |
| Neovim           |   ✅   |  —  |   —    |
| Sublime Text     |   ✅   |  —  |   —    |
| Helix            |   ✅   |  —  |   —    |
| Emacs            |   ✅   |  —  |   —    |

## Platform Roadmap

| Platform                  | Status         |
| ------------------------- | -------------- |
| VS Code / Cursor IDE      | 🟡 In progress |
| Zed                       | 🟢 Published   |
| Neovim / Helix / Sublime  | 🟢 Syntax only |
| Web playground            | 🟢 Live        |
| Desktop (macOS/Win/Linux) | ⬜ Planned     |
| iOS / Android             | ⬜ Planned     |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture, crate structure, build instructions, and development setup.

## License

MIT — see [LICENSE](LICENSE)
