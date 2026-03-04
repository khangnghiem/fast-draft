---
description: E2E browser testing via GitHub Codespace
---

# E2E Testing Workflow

> Open the project in a GitHub Codespace via Chrome and manually test the FD canvas editor.

## Prerequisites

- GitHub CLI (`gh`) authenticated with codespace scope
- Run once: `gh auth refresh -h github.com -s codespace`

## Steps

1. **List available Codespaces**:

   ```bash
   gh codespace list
   ```

2. **Open in browser** (starts if stopped):

   ```bash
   gh codespace code -c <codespace-name> --web
   ```

3. **Open a `.fd` file** — e.g. `examples/demo.fd`

4. **Open with Canvas editor** — Command Palette → "FD: Open Canvas Editor"

5. **Test checklist**:

   | Feature            | How to test                     | Expected                                        |
   | ------------------ | ------------------------------- | ----------------------------------------------- |
   | Draw rect          | Press R, click-drag on canvas   | Rectangle appears, tool switches back to Select |
   | Draw ellipse       | Press O, click-drag             | Ellipse appears                                 |
   | Pen draw           | Press P, draw freehand          | Smooth path appears                             |
   | Text               | Press T, click on canvas, type  | Text node created                               |
   | Select & move      | V, click node, drag             | Node moves, FD source updates                   |
   | Pan                | Space+drag or middle-click drag | Canvas pans                                     |
   | Zoom in/out        | ⌘+/⌘− or Ctrl+scroll            | Canvas zooms, indicator updates                 |
   | Zoom to fit        | ⌘0                              | Content fills viewport                          |
   | Pinch zoom         | Trackpad pinch                  | Smooth zoom at cursor                           |
   | Reset zoom         | Click zoom indicator            | Returns to 100%                                 |
   | Properties         | Select node, check right panel  | Fill, stroke, size shown                        |
   | Inline edit        | Double-click text node          | Textarea appears                                |
   | Undo/redo          | ⌘Z / ⌘⇧Z                        | Actions reverse                                 |
   | Theme toggle       | Click 🌙 button                 | Dark/light switch                               |
   | Keyboard shortcuts | Press ?                         | Help overlay shows                              |
   | Code ↔ Canvas sync | Edit FD source, watch canvas    | Bidirectional updates                           |
   | Frame resize       | F, draw frame, drag corner      | Frame resizes, children stay in place           |
   | Frame child move   | Click child in frame, drag      | Child moves independently (gets Position)       |
   | Column child move  | Move child in `layout: column`  | Child becomes absolute-positioned               |
   | Inline edit frame  | Double-click text in frame      | Editor matches text shape and position          |

6. **Report** any bugs or visual issues found.

## AI Automation (Browser Subagent)

Antigravity can use **Chrome browser subagents** to run E2E tests automatically — no manual browser interaction needed.

Prompt the agent with:

> "Run the /e2e tests using the browser subagent. Navigate to https://github.com/codespaces, open the active codespace, ensure the UI renders correctly, and run `pnpm test` inside the `fd-vscode` terminal."

## Tips

- The Codespace needs ~30s to start if stopped
- All keyboard shortcuts are listed in the `?` help overlay
- Use ⌘ on Mac, Ctrl on Linux/Windows in the Codespace
