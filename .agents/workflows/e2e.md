---
description: E2E browser testing via GitHub Codespace — systematic UX behavior checks
---

# E2E Testing Workflow

> Browser-based UX testing. Structured in 3 tiers to optimize token and Codespace usage. Each check: **action → expected result**.

// turbo-all

---

## Browser Subagent Rules

**MANDATORY:** You MUST retrieve the `ReusedSubagentId` from the previous turn and pass it to prevent spawning disjointed browser sessions.
Provide the following exact instruction in your `Task` prompt:
```
TAB REUSE: Call list_browser_pages first to check existing tabs.
- If ANY tab URL matches *.github.dev, fast-draft.com, or localhost → use switch_page to switch to it. DO NOT open a new tab.
- If the tab is loading/restarting, wait up to 30 seconds before retrying.
- ONLY if no relevant tab exists: use open_url to navigate to the target (e.g. fast-draft.com or https://github.com/codespaces -> Khang's FD codespace).
```

Keep max 2 editor panels open. Close extras.

---

## Tier 1: Smoke (WASM Health)

> **Goal:** Validate WASM loads and canvas renders.
> **When:** Every `/yolo local`. Fast, deterministic.

1. Navigate to target URL (`localhost`, `fast-draft.com`, or codespace).
2. Open an `.fd` file (if inside Codespace) and activate Design View.

| #   | Action                                     | Expected Result                                      |
| --- | ------------------------------------------ | ---------------------------------------------------- |
| 1.1 | After Design View opens, wait up to 15s    | "Loading FD engine…" overlay disappears              |
| 1.2 | Run JS: `document.getElementById('loading')` | Returns `null` or element with `display: none`       |
| 1.3 | Run JS: `typeof fdCanvas !== 'undefined' && typeof fdCanvas.get_text === 'function'` | Returns `true` (WASM init completed)                 |
| 1.4 | Visual verify                              | Canvas renders with shapes visible and Toolbar shows |

If 1.1 hangs, **STOP ALL TESTING** and report errors.

---

## Tier 2: JS Assertions (Bidi-Sync)

> **Goal:** Validate core Editor-to-Canvas bidisync programmatically without manual clicks.
> **When:** Every `/yolo deploy` (post-merge). Run against `fast-draft.com` or `localhost`. 

1. Using `execute_browser_javascript`, inject and run the following assertion script:

```javascript
(function() {
  if (typeof fdCanvas === 'undefined' || !fdCanvas.get_text) return "FAIL: WASM not loaded";
  
  const beforeText = fdCanvas.get_text();
  // 1. programmatic draw
  fdCanvas.insert_node_at('rect', 100, 100, 80, 80);
  const afterRectText = fdCanvas.get_text();
  if (beforeText === afterRectText) return "FAIL: Drawing rect did not update text";
  
  // 2. Select & manipulate
  if (!fdCanvas.hit_test_at) return "FAIL: hit_test_at missing";
  const idStr = fdCanvas.hit_test_at(120, 120);
  if (!idStr) return "FAIL: Rect hit test failed";
  
  fdCanvas.select_by_id(idStr);
  fdCanvas.delete_selected();
  
  const afterDeleteText = fdCanvas.get_text();
  if (beforeText !== afterDeleteText) return "FAIL: Undo/Delete bidi sync failed";

  return "PASS: Bidi-Sync and Canvas APIs intact";
})();
```
2. Verify the script returns `PASS: Bidi-Sync and Canvas APIs intact`. Highlight any assertion failures.

---

## Tier 3: Full Visual E2E 

> **Goal:** Comprehensive OS-level layout/font verification using a standardized Linux render.
> **When:** Monthly or before major release. Run strictly inside a synchronized **Codespace**.

1. **Sync Codespace to `main`** before testing:
   ```bash
   gh cs ssh -c <CODESPACE_NAME> -- "cd /workspaces/fast-draft && git checkout main && git pull origin main"
   ```

### Phase 1: Drawing & Manipulation (6 checks)
| #   | Action                              | Expected Result                                 |
| --- | ----------------------------------- | ----------------------------------------------- |
| 1.1 | Click Rect tool → drag on canvas    | Rectangle appears; tool switches back to Select |
| 1.2 | Click Text tool → click on canvas   | Text node created; inline editor opens          |
| 1.3 | Drag selected node                  | Node moves; code updates with new x/y           |
| 1.4 | ⌘/Ctrl+Drag node onto a container   | Node nests & centers inside container           |
| 1.5 | Select 2 nodes → right-click → Group| Group wraps both; layers panel shows group      |
| 1.6 | Press Delete key                    | Node removed from canvas AND code               |

> Validate Bidi-Sync visually.

### Phase 2: Navigation & Panels (7 checks)
| #   | Action                              | Expected Result                     |
| --- | ----------------------------------- | ----------------------------------- |
| 2.1 | Hold Space → drag canvas            | Canvas pans smoothly                |
| 2.2 | Ctrl/Cmd + scroll wheel             | Zoom in/out                         |
| 2.3 | Press Ctrl/Cmd+Z                    | Undo action reverses                |
| 2.4 | Click a layer item in Layers panel  | Corresponding node selects on canvas|
| 2.5 | Double-click layer name             | Inline rename field opens           |
| 2.6 | Change fill color in Properties     | Color updates on canvas immediately |
| 2.7 | Press ?                             | Help overlay shows                  |

---

## Reporting

After requested tiers run, report pass/fail status:
```
Tier 1: Smoke         ✅ Pass
Tier 2: JS Assertions ✅ Pass
```
For failures: screenshot, document expected vs actual, file as bug.

---

## Cleanup

After taking action on a Codespace (Tier 3):
```bash
gh cs ssh -c <CODESPACE_NAME> -- "git checkout main && git pull origin main"
gh codespace stop -c <CODESPACE_NAME>
```
