---
description: E2E browser testing via GitHub Codespace (smoke + full tiers)
---

# E2E Testing Workflow

> Canvas editor testing via Codespace browser subagent.
> **Smoke** (3 checks, 1 subagent call) for routine PRs.
> **Full** (4 phases, ~4 subagent calls) for major features / pre-release.

> [!IMPORTANT]
> **Context guard**: If this conversation has accumulated very heavy context (many
> large file reads, extensive code generation, dozens of tool calls), consider
> starting a **fresh conversation** for E2E. For normal-sized conversations with
> a few file edits and commits, running E2E in the same conversation is fine.

// turbo-all

---

## Pre-flight

1. **Clean up old recordings** — delete stale WebP recordings to free space:

   ```bash
   find ~/.gemini/antigravity/brain/ -name "*.webp" -mmin +60 -delete 2>/dev/null
   ```

2. **Check browser state.** If the Codespace tab is already open with a canvas visible **and** you already pushed code to this branch earlier in this conversation, **skip directly to the test phases** (no sync needed).

3. If the canvas is open but you haven't pushed yet, push first, then SSH pull (step 5), then skip to test phases.

4. Otherwise, full setup:

   ```bash
   gh codespace list
   ```

   Note the codespace name (e.g. `special-space-invention-j74pj54jgxv35rw7`).

5. **Ensure Codespace is running.** Check the status column from step 4. If it shows `Stopped` or `ShuttingDown`:

   ```bash
   gh codespace start -c <codespace-name>
   ```

   Wait ~30s for it to become `Available` before proceeding.

6. **Sync latest code** (git-based — never use `gh codespace cp -r -e .` on Rust projects; `target/` is 17GB+):

   ```bash
   # Push current branch to remote
   git push origin HEAD
   # Pull in Codespace
   gh codespace ssh -c <codespace-name> -- 'cd /workspaces/fast-draft && git fetch origin && git checkout <branch> && git pull origin <branch>'
   ```

   > If you only changed a few files and they're not committed, use targeted cp instead:
   > `gh codespace cp -r -e fd-vscode/ crates/ examples/ remote:/workspaces/fast-draft/ -c <codespace-name>`

7. **Open Codespace in browser subagent** — navigate directly to `https://<codespace-name>.github.dev`. Do NOT use `gh codespace code --web`. If a tab with this URL already exists, **reuse it**.

8. Open an `.fd` file (e.g. `examples/demo.fd`) → Command Palette (Ctrl+Shift+P) → "FD: Open Canvas Editor". Keep max 2 editor panels open.

---

## Recording Size Rules

> [!CAUTION]
> **Every `browser_subagent` call creates a WebP video recording.** Follow these
> rules to keep recordings small:
>
> 1. **Resize to 900×600 as the FIRST action** inside every subagent task — before
>    any navigation, clicking, or screenshots. 3008×1575 produces ~25× larger files.
> 2. **Use the prescribed `RecordingName`** from each phase below.
> 3. **Return immediately** after the last action — idle time inflates recording size.
> 4. **Take ONE screenshot** at the end, not multiple throughout.

---

## Tier: Smoke (default)

> Run for every PR that touches WASM, JS, or canvas code.
> **One browser subagent call — copy the task below verbatim.**
> These 3 checks cover the three failure modes that `cargo test` cannot catch:
> canvas render, pointer→tool→mutation pipeline, and bidi sync.

### Browser subagent task (RecordingName: `smoke_canvas`):

```
FIRST ACTION: Resize browser viewport to 900×600.
TAB REUSE: If a tab for the target hostname is already open, reuse it via navigate_browser. Do NOT call open_browser_url.

On the open FD canvas editor, execute these 3 checks in sequence:

1. CANVAS RENDER: Verify shapes are visible on the canvas (not blank/black).
2. DRAW RECT: Press R, click-drag on canvas → rect appears, tool switches to Select.
3. BIDI SYNC: In the code editor panel, manually add "rect @smoke_test { w: 80 h: 40 }"
   on a new line → new rect appears on canvas.

Take ONE screenshot at the end. Return PASS/FAIL for each check (1-3) and stop immediately.
```

---

## Tier: Site Deploy Verification

> Run **after merge** to confirm the deploy landed on [fast-draft.com](https://fast-draft.com).
> Requires the `pages.yml` workflow to have completed successfully.
> **One browser subagent call — copy the task below verbatim.**

### Pre-check

1. **Verify the deploy workflow passed:**

   ```bash
   gh run list --workflow=pages.yml --limit 1 --json status,conclusion
   ```

   If `conclusion` is not `success`, do NOT proceed — fix the deploy first.

### Browser subagent task (RecordingName: `deploy_verify`):

```
FIRST ACTION: Resize browser viewport to 900×600.
TAB REUSE: If a tab for fast-draft.com is already open, reuse it via navigate_browser. Do NOT call open_browser_url.

Navigate to https://fast-draft.com and verify the site is live after deploy:

1. SITE LOADS: Page title contains "Fast Draft", hero section visible with "Design as Code".
2. PLAYGROUND VISIBLE: Live Playground section with code editor and canvas area visible.
3. WASM LOADS: Canvas renders shapes (not blank/black). Wait up to 5s for WASM init.

Take ONE screenshot at the end. Return PASS/FAIL for each check (1-3) and stop immediately.
```

### Reporting:

```
Site Deploy: ✅ 3/3 — site loads, playground visible, WASM renders. Screenshot attached.
```

---

## Tier: Production Feature Verification

> Run **after Site Deploy Verification** to validate the **specific feature that changed**
> works correctly on production. Unlike the deploy check (generic "does it load?"), this
> tier runs targeted JS tests against the deployed code on [fast-draft.com](https://fast-draft.com).
> **One browser subagent call.**

### When to run

- After **every** merge + deploy that touches `site/`, `crates/fd-wasm/`, or `crates/fd-core/`
- Tests must be **specific to the change** — not generic page-load checks
- Use `execute_browser_javascript` for quantitative DOM/state measurements

### Browser subagent task (RecordingName: `prod_feature_verify`):

Design the task based on what changed. Use this template:

```
FIRST ACTION: Resize browser viewport to 900×600.

An existing tab for fast-draft.com may be open — reuse it via navigate_browser.
Navigate to https://fast-draft.com and wait for WASM init (up to 5s).

Run feature-specific tests via execute_browser_javascript:

TEST 1: [Describe what the deployed code should contain or produce]
// Use DOM queries, getBoundingClientRect(), getComputedStyle(), classList, etc.
// Return JSON with quantitative measurements and PASS/FAIL verdict

TEST 2: [Describe a state or interaction the feature enables]
// Measure before/after if testing an interaction
// Return JSON with measurements and PASS/FAIL verdict

TEST 3: [Describe an edge case or regression guard]
// Return JSON with measurements and PASS/FAIL verdict

Take ONE screenshot at the end. Return JSON results for all tests and stop immediately.
```

### Examples of good feature-specific tests

| Change | Test |
|--------|------|
| Snap threshold | Measure `getCanvasRect()` width, compute expected threshold, verify it's proportional |
| Toolbar containment | Check toolbar `getBoundingClientRect()` is within canvas bounds |
| Panel resize | Toggle panel, measure canvas width before/after, verify toolbar reclamps |
| New CSS class | Query `classList.contains()` on the target element |
| WASM API change | Call the API via `window.fdCanvas?.someMethod()` and verify output |

### Reporting

```
Prod Feature: ✅ 3/3 — [one-line summary of what was verified]. Screenshot attached.
```

---

## Tier: Full

> Run for major feature PRs or pre-release. Consolidated into **4 phases** to
> minimize recording count and total file size.
> Each phase = ONE browser subagent call with the verbatim task.
> **Always resize viewport to 900×600 as the FIRST ACTION** in each phase.

### Phase 1 — Canvas & Drawing (RecordingName: `full_canvas_draw`)

```
FIRST ACTION: Resize browser viewport to 900×600.

On the open FD canvas, execute all checks in sequence:

CANVAS LOAD:
(1.1) Shapes are visible on canvas (not blank/black).
(1.2) Layers panel shows node tree.
(1.3) Toolbar shows Select/Rect/Ellipse/Pen/Text.

DRAWING TOOLS:
(1.4) Press R, drag to create rect — rect appears, tool switches to Select.
(1.5) Press O, drag to create ellipse — ellipse appears.
(1.6) Press T, click canvas, type "test" — text node created.
(1.7) Check Layers panel — new nodes appear.
(1.8) Check code editor — new FD code with @id and dimensions.

Take ONE screenshot showing all created shapes. Return PASS/FAIL per check and stop immediately.
```

### Phase 2 — Selection, Manipulation & Inline Editing (RecordingName: `full_select_edit`)

```
FIRST ACTION: Resize browser viewport to 900×600.

On the open FD canvas, execute all checks in sequence:

SELECTION & MANIPULATION:
(2.1) Click a node — selection handles (8 blue dots) appear.
(2.2) Drag selected node — node moves, code updates with new x/y.
(2.3) Select node → right-click → Duplicate — copy appears with new @id.
(2.4) Select a node → press Delete — node removed from canvas AND code.

INLINE EDITING:
(2.5) Double-click a text node — inline textarea opens with current text.
(2.6) Type new text, press Enter — text updates on canvas AND in code.
(2.7) Double-click another text → press Escape — edit cancelled, original text preserved.

Take ONE screenshot. Return PASS/FAIL per check and stop immediately.
```

### Phase 3 — Navigation, Panels & Bidi Sync (RecordingName: `full_nav_sync`)

```
FIRST ACTION: Resize browser viewport to 900×600.

On the open FD canvas, execute all checks in sequence:

NAVIGATION:
(3.1) Hold Space, drag canvas — canvas pans.
(3.2) Ctrl+scroll wheel — zoom in/out, zoom indicator updates.
(3.3) Click zoom indicator — resets to 100%.
(3.4) Press Ctrl+0 — all nodes fit in viewport.

PANELS & PROPERTIES:
(3.5) Click a layer item in Layers panel — node selects on canvas.
(3.6) Select a node, check Properties panel — fill, stroke, dimensions shown.
(3.7) Change fill color in Properties — color updates on canvas.

BIDI SYNC:
(3.8) In code editor, add "rect @bidi_test { w: 100 h: 50 }" — new rect on canvas.
(3.9) Delete a node on canvas — code for that node disappears.
(3.10) Undo (Ctrl+Z) — node reappears on canvas AND in code.

Take ONE screenshot. Return PASS/FAIL per check and stop immediately.
```

### Phase 4 — Shortcuts & Frames (RecordingName: `full_keys_frames`)

```
FIRST ACTION: Resize browser viewport to 900×600.

On the open FD canvas, execute all checks in sequence:

KEYBOARD SHORTCUTS:
(4.1) Press V — Select tool active (toolbar highlights).
(4.2) Press R — Rect tool active.
(4.3) Press E — Ellipse tool active.
(4.4) Press T — Text tool active.
(4.5) Press V, select a node, press Arrow keys — node nudges 1px.

FRAMES & CONTAINMENT:
(4.6) Press F, drag to create a frame — frame appears with label.
(4.7) Drag frame corner — frame resizes, children stay in place.
(4.8) Click child inside frame, drag — child moves independently.
(4.9) Draw rect, draw text, drag text onto rect — context menu appears.
(4.10) Click "Make child" — text becomes child, auto-centered, code updates.

Take ONE screenshot. Return PASS/FAIL per check and stop immediately.
```

---

## Reporting

> Keep report under 200 tokens total.

**Smoke (3 checks):**

```
Smoke: ✅ 3/3 — canvas renders, rect draws, bidi syncs. Screenshot attached.
```

**Full (4 phases):**

```
P1: ✅ 8/8 | P2: ⚠️ 6/7 (2.3 no-op) | P3: ✅ 10/10 | P4: ❌ 9/10 (4.10 fail)
Bug: P4.10 — "Make child" click no effect. Screenshot attached.
```

For failures: one-line description + screenshot. No extended prose.

---

## Tips

- If the Codespace is stopped, it needs ~30s to start
- Use Ctrl (not ⌘) in the Codespace terminal — it runs Linux
- All keyboard shortcuts are listed in the `?` help overlay
- When running Smoke tier, the entire test is ONE subagent call
- **Resize viewport to 900×600 as the FIRST ACTION** in every subagent — not just before screenshots
- **RecordingName** must match the prescribed name for each phase (enables easy audit + cleanup)
