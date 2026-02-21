---
name: vscode-extension
description: How to build and debug the VS Code custom editor extension for .ftd files
---

# VS Code Extension Skill

## Overview

The `ftd-extension` extension provides a custom editor for `.ftd` files — a side-by-side view with a text editor and a WASM-powered canvas. All rendering and editing logic runs in Rust/WASM; TypeScript is minimal glue code.

## Architecture

```
VS Code
├── CustomTextEditorProvider (TypeScript)
│   ├── resolveCustomTextEditor()
│   │   ├── Creates WebviewPanel
│   │   └── Loads WASM canvas in <canvas> element
│   ├── onDidChangeTextDocument → posts text to WASM
│   └── WASM → postMessage → updates text document
└── ftd-wasm.js (wasm-pack output)
    ├── init_canvas(canvas_element)
    ├── set_text(ftd_source)     → text→canvas
    ├── get_text() → string      → canvas→text
    └── handle_event(type, x, y, pressure)
```

## Directory Structure (planned)

```
ftd-extension/
├── package.json          # Extension manifest
├── src/
│   └── extension.ts      # CustomTextEditorProvider
├── webview/
│   ├── index.html        # Canvas webview
│   ├── main.js           # WASM loader + message bridge
│   └── wasm/             # wasm-pack build output
│       ├── ftd_render.js
│       └── ftd_render_bg.wasm
└── tsconfig.json
```

## Building

```bash
# 1. Build WASM from Rust
wasm-pack build crates/ftd-render --target web --out-dir ../../ftd-extension/webview/wasm

# 2. Install extension deps
cd ftd-extension && pnpm install

# 3. Compile TypeScript
pnpm run compile

# 4. Test in VS Code
# Press F5 in VS Code with the extension project open
```

## Custom Editor Registration

In `package.json`:

```json
{
  "contributes": {
    "customEditors": [
      {
        "viewType": "ftd.canvas",
        "displayName": "FTD Canvas",
        "selector": [{ "filenamePattern": "*.ftd" }],
        "priority": "default"
      }
    ]
  }
}
```

## Message Protocol (Webview ↔ Extension)

| Direction           | Message        | Data               |
| ------------------- | -------------- | ------------------ |
| Extension → Webview | `setText`      | `{ text: string }` |
| Webview → Extension | `textChanged`  | `{ text: string }` |
| Webview → Extension | `nodeSelected` | `{ id: string }`   |
| Extension → Webview | `toolChanged`  | `{ tool: string }` |

## Key Rules

- TypeScript is ONLY for VS Code API glue — no rendering/parsing logic
- All rendering happens in WASM via Vello
- Use `pnpm` (NOT npm) for the extension project
- Canvas element gets full webview dimensions
- Handle dark/light theme via VS Code CSS variables
