---
description: E2E browser testing via GitHub Codespace
---

# E2E Testing Workflow

> Test the FD canvas editor in a GitHub Codespace via the Chrome browser subagent.

## Prerequisites

- GitHub CLI (`gh`) authenticated with codespace scope
- Run once: `gh auth refresh -h github.com -s codespace`

## Steps

// turbo

1. **List available Codespaces** (terminal):

   ```bash
   gh codespace list
   ```

   Note the codespace name (e.g. `special-space-invention-j74pj54jgxv35rw7`).

// turbo 2. **Sync latest code to Codespace** (terminal):

```bash
gh codespace cp -r -e . remote:/workspaces/fast-draft -c <codespace-name>
```

3. **Open Codespace in Chrome browser subagent**:

   Navigate the browser subagent to `https://<codespace-name>.github.dev`
   (e.g. `https://special-space-invention-j74pj54jgxv35rw7.github.dev`).

   > **IMPORTANT**: Do NOT use `gh codespace code --web` in the terminal.
   > The browser subagent must navigate to the URL directly.

   Wait for VS Code to fully load (file explorer visible).

4. **Open a `.fd` file** — e.g. `examples/constraints.fd` or `examples/demo.fd`

5. **Open with Canvas editor** — Command Palette (Ctrl+Shift+P) → "FD: Open Canvas Editor"

6. **Test checklist**:

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

7. **Report** any bugs or visual issues found.

## Tips

- If the Codespace is stopped, it needs ~30s to start — the browser will show a loading screen
- If a tab with the Codespace URL already exists, **reuse it** instead of opening a new one
- All keyboard shortcuts are listed in the `?` help overlay
- Use Ctrl (not ⌘) in the Codespace terminal since it runs Linux
