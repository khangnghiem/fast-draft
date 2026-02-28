# FD Libraries

> Reusable component collections stored as plain `.fd` files.

## Overview

FD libraries are `.fd` files that export **themes** (reusable styles) and **components** (named groups) for use in other `.fd` files via the `import` statement.

```
import "libraries/ui-kit.fd" as ui
```

Libraries are:

- **Plain text** — readable, diffable, AI-writable
- **Version-controlled** — just another file in your repo
- **Composable** — import multiple libraries, nest components
- **Zero build step** — no compilation, no registry

## Built-in Libraries

| Library       | File                     | Components                                                                                          |
| ------------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| **UI Kit**    | `libraries/ui-kit.fd`    | Buttons (primary, secondary, danger, ghost), inputs (text, labeled, search), cards, badges, avatars |
| **Flowchart** | `libraries/flowchart.fd` | Start/end, process box, decision diamond, I/O, connector labels, simple flow template               |
| **Wireframe** | `libraries/wireframe.fd` | Navbar, sidebar, content area, image placeholders, footer, card grid, full page layout              |

## Creating Your Own Library

### 1. Create the file

```
# @library "My Components"
# Description of what this library provides.
# Usage: import "libraries/my-lib.fd" as my

# ─── Themes ───

theme my_accent {
  fill: #FF6B6B
  corner: 8
}

# ─── Components ───

group @my_button {
  text @my_btn_label "Click Me" {
    fill: #FFFFFF
    font: "Inter" 600 14
  }
  w: 140 h: 44
  use: my_accent
  when :hover {
    scale: 1.03
    ease: spring 200ms
  }
}
```

### 2. Place it in `libraries/`

Put your `.fd` file in the workspace `libraries/` directory. The Library Panel in Canvas Mode will auto-discover it.

### 3. Use it

```
import "libraries/my-lib.fd" as my

# Reference themes and components with the namespace prefix
rect @hero {
  w: 400 h: 200
  use: my.my_accent
}
```

## Convention

| Rule               | Description                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| **Header comment** | Start with `# @library "Name"` for panel discovery                     |
| **Semantic IDs**   | Use descriptive names: `@btn_primary`, `@nav_sidebar`                  |
| **Themes first**   | Define themes before components that use them                          |
| **Grouped**        | Related components should share section comments (`# ─── Buttons ───`) |
| **Self-contained** | Each component should work standalone (include all needed styles)      |

## Library Panel (Canvas Mode)

Press **L** in Canvas Mode to open the Library Panel. It shows:

- All `.fd` files found in the workspace `libraries/` directory
- Components grouped by library file
- Click a component to insert its FD code into the current document

## Future: Community Directory

> Phase 3 (planned) — A searchable directory at `libraries.fastdraft.dev` where users can publish and discover community libraries. Similar to [Excalidraw Libraries](https://libraries.excalidraw.com), but with plain `.fd` files instead of opaque JSON blobs.
