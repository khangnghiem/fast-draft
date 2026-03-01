---
description: Systematic UX behavior testing via browser — simulates Figma/Sketch/Miro/Drawio/Excalidraw
---

# E2E UX Workflow

> Structured browser-based UX testing via Codespace.
> Each phase has specific checks with **action → expected result**.
> Use browser subagent to execute and screenshot each check.

// turbo-all

---

## Prerequisites

1. Ensure a Codespace is available:

   ```bash
   gh codespace list
   ```

2. Open the Codespace in the browser via browser subagent (If the browser subagent already has a tab open with the same link / URL, reuse and refresh that tab instead of opening a new one):

   ```
   Navigate to: https://github.com/codespaces
   Click on the available codespace for khangnghiem/fast-draft
   ```

3. Maintain a maximum of two editor panels open in the Codespace. If there are more than 2, close the third/extra editor panels.

4. Open an `.fd` file (e.g., `examples/dark_theme.fd`) and activate Design View.

---

## Phase 1: Canvas Load & Render (3 checks)

| #   | Action                               | Expected Result                                      |
| --- | ------------------------------------ | ---------------------------------------------------- |
| 1.1 | Open `.fd` file → Toggle Design View | Canvas renders with shapes visible                   |
| 1.2 | Check Layers panel                   | Panel shows node tree with correct hierarchy         |
| 1.3 | Check Toolbar                        | Toolbar shows Select, Rect, Ellipse, Pen, Text tools |

> Screenshot the canvas after loading. Report PASS/FAIL for each check.

---

## Phase 2: Drawing Tools (5 checks)

| #   | Action                              | Expected Result                                 |
| --- | ----------------------------------- | ----------------------------------------------- |
| 2.1 | Click Rect tool → drag on canvas    | Rectangle appears; tool switches back to Select |
| 2.2 | Click Ellipse tool → drag on canvas | Ellipse appears; tool switches back to Select   |
| 2.3 | Click Text tool → click on canvas   | Text node created; inline editor opens          |
| 2.4 | Check Layers panel after drawing    | New nodes appear in layer tree                  |
| 2.5 | Check code editor after drawing     | New FD code appears with @id, dimensions        |

> Take screenshot after each draw action. Verify bidi sync.

---

## Phase 3: Selection & Manipulation (6 checks)

| #   | Action                                     | Expected Result                            |
| --- | ------------------------------------------ | ------------------------------------------ |
| 3.1 | Click a node                               | Node shows selection handles (8 blue dots) |
| 3.2 | Drag selected node                         | Node moves; code updates with new x/y      |
| 3.3 | Select 2 nodes → right-click → Group       | Group wraps both; layers panel shows group |
| 3.4 | Right-click group → Ungroup                | Group dissolved; children become top-level |
| 3.5 | Right-click → Duplicate                    | Copy appears with new @id                  |
| 3.6 | Right-click → Delete (or press Delete key) | Node removed from canvas AND code          |

> Verify code editor updates after each action (bidi sync).

---

## Phase 4: Inline Editing (3 checks)

| #   | Action                      | Expected Result                         |
| --- | --------------------------- | --------------------------------------- |
| 4.1 | Double-click a text node    | Inline textarea opens with current text |
| 4.2 | Type new text → press Enter | Text updates on canvas AND in code      |
| 4.3 | Double-click → press Escape | Edit cancelled; original text preserved |

> Check that textarea matches node shape (rect → rect, ellipse → rounded).

---

## Phase 5: Navigation (4 checks)

| #   | Action                              | Expected Result                     |
| --- | ----------------------------------- | ----------------------------------- |
| 5.1 | Hold Space → drag canvas            | Canvas pans smoothly                |
| 5.2 | Ctrl/Cmd + scroll wheel             | Zoom in/out; zoom indicator updates |
| 5.3 | Click zoom indicator (e.g., "100%") | Resets to 100% zoom                 |
| 5.4 | Press Ctrl/Cmd+0 (zoom-to-fit)      | All nodes fit in viewport           |

> Verify zoom level indicator displays correct percentage.

---

## Phase 6: Panels & UI (4 checks)

| #   | Action                               | Expected Result                          |
| --- | ------------------------------------ | ---------------------------------------- |
| 6.1 | Click a layer item in Layers panel   | Corresponding node selects on canvas     |
| 6.2 | Double-click layer name              | Inline rename field opens                |
| 6.3 | Select node → check Properties panel | Shows fill, stroke, dimensions, position |
| 6.4 | Change fill color in Properties      | Color updates on canvas immediately      |

> Verify that layer click triggers `focusOnNode` (smooth pan animation).

---

## Phase 7: Bidi Sync (3 checks)

| #   | Action                                        | Expected Result                           |
| --- | --------------------------------------------- | ----------------------------------------- |
| 7.1 | Edit code → add `rect @test { w: 100 h: 50 }` | New rect appears on canvas                |
| 7.2 | Delete a node on canvas                       | Code for that node disappears from editor |
| 7.3 | Undo (Ctrl/Cmd+Z) after delete                | Node reappears on canvas AND in code      |

> This is the most critical phase — bidi sync failures are the #1 UX blocker.

---

## Phase 8: Keyboard Shortcuts (5 checks)

| #   | Action                         | Expected Result           |
| --- | ------------------------------ | ------------------------- |
| 8.1 | Press V                        | Switches to Select tool   |
| 8.2 | Press R                        | Switches to Rect tool     |
| 8.3 | Press E                        | Switches to Ellipse tool  |
| 8.4 | Press T                        | Switches to Text tool     |
| 8.5 | Select node → press Arrow keys | Node nudges 1px per press |

> Verify toolbar button highlights match the active tool.

---

## Reporting

After running all phases, report results in this format:

```
Phase 1: Canvas Load         ✅ 3/3
Phase 2: Drawing Tools       ✅ 5/5
Phase 3: Selection           ⚠️ 5/6 (3.4 group click fails)
Phase 4: Inline Editing      ✅ 3/3
Phase 5: Navigation          ✅ 4/4
Phase 6: Panels & UI         ✅ 4/4
Phase 7: Bidi Sync           ❌ 2/3 (7.3 undo doesn't restore)
Phase 8: Keyboard Shortcuts  ✅ 5/5
```

For any failures:

- Take a screenshot
- Document expected vs actual behavior
- File as a bug to fix before deploying

---

## Cleanup

After all phases complete and results are reported:

1. Switch back to main and sync:

   ```bash
   git checkout main
   git pull origin main
   ```
