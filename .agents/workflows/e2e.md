---
description: E2E browser testing via GitHub Codespace
---

# E2E Testing Workflow

> Test via Codespace browser subagent. Smoke (1 call) or Full (4 phases).
> Resize viewport to 900x600 as FIRST ACTION in ALL subagents.

// turbo-all

## Pre-flight
1. Clean old recordings: `find ~/.gemini/antigravity/brain/ -name "*.webp" -mmin +60 -delete 2>/dev/null`
2. Sync code: If Codespace is open and pushed, pull via SSH: `gh codespace ssh -c <codespace-name> -- 'cd /workspaces/fast-draft && git pull origin <branch>'`
3. If not, start and sync: `gh codespace list`, `gh codespace start`, then SSH pull.

## Tier: Smoke (RecordingName: `smoke_canvas`)
```
FIRST ACTION: Resize browser to 900x600.
TAB REUSE: Reuse existing tab via navigate_browser. Do NOT call open_browser_url.

Execute 3 checks on FD editor:
1. CANVAS RENDER: Shapes visible.
2. DRAW RECT: Press R, drag rect, tool switches to Select.
3. BIDI SYNC: Add "rect @smoke { w: 80 h: 40 }" in code Editor -> appears on canvas.
Take ONE screenshot. Return PASS/FAIL per check.
```

## Tier: Site Deploy Verify (RecordingName: `deploy_verify`)
Check `gh run list --workflow=pages.yml` first.
```
FIRST ACTION: Resize to 900x600. TAB REUSE: Reuse fast-draft.com tab.
Check https://fast-draft.com:
1. Site loads.
2. Playground visible.
3. WASM renders shapes.
Take ONE screenshot. Return PASS/FAIL.
```

## Tier: Prod Feature Verify (RecordingName: `prod_feature_verify`)
Required after merge. MUST set `ReusedSubagentId` to deploy verify subagent.
```
FIRST ACTION: Resize to 900x600. Reuse fast-draft.com tab.
Run feature-specific quantitative tests via execute_browser_javascript:
- TEST 1, TEST 2, TEST 3 (Measure bounds, classes, transitions corresponding to feature).
Take ONE screenshot. Return PASS/FAIL.
```

## Tier: Full (4 Phases)

Phase 1 (RecordingName: `full_canvas_draw`):
```
FIRST ACTION: Resize to 900x600.
Checks: Load shapes, Layers panel, Toolbar. Draw Rect (R), Ellipse (O), Text (T). Verify in Layers and code editor. Screenshot.
```

Phase 2 (RecordingName: `full_select_edit`):
```
FIRST ACTION: Resize to 900x600. TAB REUSE.
Checks: Select, drag, duplicate (right-click), delete. Inline edit text (double-click), cancel edit (Esc). Screenshot.
```

Phase 3 (RecordingName: `full_nav_sync`):
```
FIRST ACTION: Resize to 900x600. TAB REUSE.
Checks: Pan (Space), Zoom (Cmd+wheel), Z-to-fit (Cmd+0). Select layer item -> syncs to canvas. Change Properties fill -> syncs. Bidi sync from code addition/deletion. Screenshot.
```

Phase 4 (RecordingName: `full_keys_frames`):
```
FIRST ACTION: Resize to 900x600. TAB REUSE.
Checks: Shortcuts (V, R, E, T, arrow nudges). Draw Frame (F), resize frame, drag child inside. Context menu "Make child". Screenshot.
```
