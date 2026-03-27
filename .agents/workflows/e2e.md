---
description: E2E browser testing via GitHub Codespace — systematic UX behavior checks
---

# E2E Testing Workflow

> Browser-based UX testing via Codespace. Each check: **action → expected result**.

// turbo-all

---

## Prerequisites

1. Ensure a Codespace is available:

   ```bash
   gh codespace list
   ```

2. Open the Browser via `browser_subagent`:

   **MANDATORY:** You MUST retrieve the `ReusedSubagentId` from the previous turn and pass it to prevent spawning disjointed browser sessions.
   Provide the following exact instruction in your `Task` prompt:
   ```
   MANDATORY: Call list_browser_pages first to check existing tabs.
   - If ANY tab URL matches *.github.dev, fast-draft.com, or localhost → use switch_page to switch to it. DO NOT open a new tab.
   - If the tab is loading/restarting, wait up to 30 seconds before retrying.
   - ONLY if no relevant tab exists: use open_url to navigate to the target (e.g. fast-draft.com or https://github.com/codespaces -> Khang's FD codespace).
   ```

3. Keep max 2 editor panels open. Close extras.

4. **Sync Codespace to `main`** before testing:

   ```bash
   gh cs ssh -c <CODESPACE_NAME> -- "cd /workspaces/fast-draft && git checkout main && git pull origin main"
   ```

5. Open an `.fd` file (e.g., `examples/dark_theme.fd`) and activate Design View.

---

## Phase 0: WASM Health Check (mandatory gate)

> [!IMPORTANT]
> This phase MUST pass before any other testing begins. A false-positive E2E pass where WASM never loaded is worse than no test at all.

| #   | Action                                     | Expected Result                                      |
| --- | ------------------------------------------ | ---------------------------------------------------- |
| 0.1 | After Design View opens, wait up to 15s    | "Loading FD engine…" overlay disappears              |
| 0.2 | Run JS: `document.getElementById('loading')` | Returns `null` or element with `display: none`       |
| 0.3 | Run JS: `typeof window.__wasm_initialized` | Returns truthy (WASM init completed)                 |

If 0.1 fails (loading hangs), **STOP ALL TESTING** and report:
- Codespace branch: `git branch --show-current`
- WASM file exists: `ls fd-vscode/webview/wasm/fd_wasm_bg.wasm`
- Browser console errors

---

## Phase 1: Canvas Load & Render (3 checks)

| #   | Action                               | Expected Result                              |
| --- | ------------------------------------ | -------------------------------------------- |
| 1.1 | Open `.fd` file → Toggle Design View | Canvas renders with shapes visible           |
| 1.2 | Check Layers panel                   | Node tree with correct hierarchy             |
| 1.3 | Check Toolbar                        | Shows Select, Rect, Ellipse, Pen, Text tools |

> Screenshot the canvas after loading.

---

## Phase 2: Drawing Tools (6 checks)

| #   | Action                              | Expected Result                                 |
| --- | ----------------------------------- | ----------------------------------------------- |
| 2.1 | Click Rect tool → drag on canvas    | Rectangle appears; tool switches back to Select |
| 2.2 | Click Ellipse tool → drag on canvas | Ellipse appears; tool switches back to Select   |
| 2.3 | Press P → draw freehand on canvas   | Smooth pen path appears                         |
| 2.4 | Click Text tool → click on canvas   | Text node created; inline editor opens          |
| 2.5 | Check Layers panel after drawing    | New nodes appear in layer tree                  |
| 2.6 | Check code editor after drawing     | New FD code appears with @id, dimensions        |

> Screenshot after each draw. Verify bidi sync.

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

---

## Phase 5: Navigation (6 checks)

| #   | Action                              | Expected Result                     |
| --- | ----------------------------------- | ----------------------------------- |
| 5.1 | Hold Space → drag canvas            | Canvas pans smoothly                |
| 5.2 | Ctrl/Cmd + scroll wheel             | Zoom in/out; zoom indicator updates |
| 5.3 | Trackpad pinch                      | Smooth zoom at cursor               |
| 5.4 | Click zoom indicator (e.g., "100%") | Resets to 100% zoom                 |
| 5.5 | Press Ctrl/Cmd+0 (zoom-to-fit)      | All nodes fit in viewport           |
| 5.6 | Press Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z | Undo/redo actions reverse           |

---

## Phase 6: Panels & UI (5 checks)

| #   | Action                               | Expected Result                          |
| --- | ------------------------------------ | ---------------------------------------- |
| 6.1 | Click a layer item in Layers panel   | Corresponding node selects on canvas     |
| 6.2 | Double-click layer name              | Inline rename field opens                |
| 6.3 | Select node → check Properties panel | Shows fill, stroke, dimensions, position |
| 6.4 | Change fill color in Properties      | Color updates on canvas immediately      |
| 6.5 | Click 🌙 button                      | Dark/light theme switches                |

---

## Phase 7: Bidi Sync (3 checks)

| #   | Action                                        | Expected Result                           |
| --- | --------------------------------------------- | ----------------------------------------- |
| 7.1 | Edit code → add `rect @test { w: 100 h: 50 }` | New rect appears on canvas                |
| 7.2 | Delete a node on canvas                       | Code for that node disappears from editor |
| 7.3 | Undo (Ctrl/Cmd+Z) after delete                | Node reappears on canvas AND in code      |

> Most critical phase — bidi sync failures are the #1 UX blocker.

---

## Phase 8: Keyboard Shortcuts (6 checks)

| #   | Action                         | Expected Result           |
| --- | ------------------------------ | ------------------------- |
| 8.1 | Press V                        | Switches to Select tool   |
| 8.2 | Press R                        | Switches to Rect tool     |
| 8.3 | Press E                        | Switches to Ellipse tool  |
| 8.4 | Press T                        | Switches to Text tool     |
| 8.5 | Select node → press Arrow keys | Node nudges 1px per press |
| 8.6 | Press ?                        | Help overlay shows        |

> Verify toolbar highlights match active tool.

---

## Reporting

After all phases, report:

```
Phase 1: Canvas Load         ✅ 3/3
Phase 2: Drawing Tools       ✅ 6/6
Phase 3: Selection           ⚠️ 5/6 (3.4 group click fails)
Phase 4: Inline Editing      ✅ 3/3
Phase 5: Navigation          ✅ 6/6
Phase 6: Panels & UI         ✅ 5/5
Phase 7: Bidi Sync           ❌ 2/3 (7.3 undo doesn't restore)
Phase 8: Keyboard Shortcuts  ✅ 6/6
```

For failures: screenshot, document expected vs actual, file as bug.

---

## Cleanup

After all phases complete:

```bash
git checkout main
git pull origin main
```
