---
description: E2E browser testing via GitHub Codespace (smoke + full tiers)
---

# E2E Testing Workflow

> Canvas editor testing via Codespace browser subagent.
> **Smoke** (3 checks, 1 subagent call) for routine PRs.
> **Full** (9 phases, ~10 subagent calls) for major features / pre-release.

> [!CAUTION]
> **Context guard**: If this conversation has done significant research, file reading,
> or code editing before reaching this point, **STOP**. Start a **fresh conversation**
> with just `/e2e`. Browser subagents spiral on heavy context (see LESSONS.md L348).

// turbo-all

---

## Pre-flight

1. **Check browser state.** If the Codespace tab is already open with a canvas visible **and** you already pushed code to this branch earlier in this conversation, **skip directly to the test phases** (no sync needed).

2. If the canvas is open but you haven't pushed yet, push first, then SSH pull (step 4), then skip to test phases.

3. Otherwise, full setup:

   ```bash
   gh codespace list
   ```

   Note the codespace name (e.g. `special-space-invention-j74pj54jgxv35rw7`).

4. **Ensure Codespace is running.** Check the status column from step 3. If it shows `Stopped` or `ShuttingDown`:

   ```bash
   gh codespace start -c <codespace-name>
   ```

   Wait ~30s for it to become `Available` before proceeding.

5. **Sync latest code** (git-based — never use `gh codespace cp -r -e .` on Rust projects; `target/` is 17GB+):

   ```bash
   # Push current branch to remote
   git push origin HEAD
   # Pull in Codespace
   gh codespace ssh -c <codespace-name> -- 'cd /workspaces/fast-draft && git fetch origin && git checkout <branch> && git pull origin <branch>'
   ```

   > If you only changed a few files and they're not committed, use targeted cp instead:
   > `gh codespace cp -r -e fd-vscode/ crates/ examples/ remote:/workspaces/fast-draft/ -c <codespace-name>`

6. **Open Codespace in browser subagent** — navigate directly to `https://<codespace-name>.github.dev`. Do NOT use `gh codespace code --web`. If a tab with this URL already exists, **reuse it**.

7. Open an `.fd` file (e.g. `examples/demo.fd`) → Command Palette (Ctrl+Shift+P) → "FD: Open Canvas Editor". Keep max 2 editor panels open.

---

## Tier: Smoke (default)

> Run for every PR that touches WASM, JS, or canvas code.
> **One browser subagent call — copy the task below verbatim.**
> These 3 checks cover the three failure modes that `cargo test` cannot catch:
> canvas render, pointer→tool→mutation pipeline, and bidi sync.

### Browser subagent task:

```
On the open FD canvas editor, execute these 3 checks in sequence:

1. CANVAS RENDER: Verify shapes are visible on the canvas (not blank/black).
2. DRAW RECT: Press R, click-drag on canvas → rect appears, tool switches to Select.
3. BIDI SYNC: In the code editor panel, manually add "rect @smoke_test { w: 80 h: 40 }"
   on a new line → new rect appears on canvas.

Take ONE screenshot at the end. Return PASS/FAIL for each check (1-3) and stop.
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

### Browser subagent task:

```
Navigate to https://fast-draft.com and verify the site is live after deploy:

1. SITE LOADS: Page title contains "Fast Draft", hero section visible with "Design as Code".
2. PLAYGROUND VISIBLE: Live Playground section with code editor and canvas area visible.
3. WASM LOADS: Canvas renders shapes (not blank/black). Wait up to 5s for WASM init.

Take ONE screenshot at the end. Return PASS/FAIL for each check (1-3) and stop.
```

### Reporting:

```
Site Deploy: ✅ 3/3 — site loads, playground visible, WASM renders. Screenshot attached.
```

---

## Tier: Full

> Run for major feature PRs or pre-release. Includes all phases below.
> Each phase = ONE browser subagent call with the verbatim task.

### Phase 1 — Canvas Load & Render

```
On the open FD canvas: verify (1.1) shapes are visible on canvas,
(1.2) Layers panel shows node tree, (1.3) Toolbar shows Select/Rect/Ellipse/Pen/Text.
Take ONE screenshot. Return PASS/FAIL per check.
```

### Phase 2 — Drawing Tools

```
On the open FD canvas:
(2.1) Press R, drag to create rect — rect appears, tool switches to Select.
(2.2) Press O, drag to create ellipse — ellipse appears.
(2.3) Press T, click canvas, type "test" — text node created.
(2.4) Check Layers panel — new nodes appear.
(2.5) Check code editor — new FD code with @id and dimensions.
Take ONE screenshot showing all created shapes. Return PASS/FAIL per check.
```

### Phase 3 — Selection & Manipulation

```
On the open FD canvas:
(3.1) Click a node — selection handles (8 blue dots) appear.
(3.2) Drag selected node — node moves, code updates with new x/y.
(3.3) Select node → right-click → Duplicate — copy appears with new @id.
(3.4) Select a node → press Delete — node removed from canvas AND code.
Take ONE screenshot. Return PASS/FAIL per check.
```

### Phase 4 — Inline Editing

```
On the open FD canvas:
(4.1) Double-click a text node — inline textarea opens with current text.
(4.2) Type new text, press Enter — text updates on canvas AND in code.
(4.3) Double-click another text → press Escape — edit cancelled, original text preserved.
Take ONE screenshot. Return PASS/FAIL per check.
```

### Phase 5 — Navigation

```
On the open FD canvas:
(5.1) Hold Space, drag canvas — canvas pans.
(5.2) Ctrl+scroll wheel — zoom in/out, zoom indicator updates.
(5.3) Click zoom indicator — resets to 100%.
(5.4) Press Ctrl+0 — all nodes fit in viewport.
Take ONE screenshot. Return PASS/FAIL per check.
```

### Phase 6 — Panels & Properties

```
On the open FD canvas:
(6.1) Click a layer item in Layers panel — node selects on canvas.
(6.2) Select a node, check Properties panel — fill, stroke, dimensions shown.
(6.3) Change fill color in Properties — color updates on canvas.
Take ONE screenshot. Return PASS/FAIL per check.
```

### Phase 7 — Bidi Sync

```
On the open FD canvas:
(7.1) In code editor, add "rect @bidi_test { w: 100 h: 50 }" — new rect on canvas.
(7.2) Delete a node on canvas — code for that node disappears.
(7.3) Undo (Ctrl+Z) — node reappears on canvas AND in code.
Take ONE screenshot. Return PASS/FAIL per check.
```

### Phase 8 — Keyboard Shortcuts

```
On the open FD canvas:
(8.1) Press V — Select tool active (toolbar highlights).
(8.2) Press R — Rect tool active.
(8.3) Press E — Ellipse tool active.
(8.4) Press T — Text tool active.
(8.5) Press V, select a node, press Arrow keys — node nudges 1px.
Take ONE screenshot. Return PASS/FAIL per check.
```

### Phase 9 — Frames & Containment

```
On the open FD canvas:
(9.1) Press F, drag to create a frame — frame appears with label.
(9.2) Drag frame corner — frame resizes, children stay in place.
(9.3) Click child inside frame, drag — child moves independently.
(9.4) Draw rect, draw text, drag text onto rect — context menu appears.
(9.5) Click "Make child" — text becomes child, auto-centered, code updates.
Take ONE screenshot. Return PASS/FAIL per check.
```

---

## Reporting

> Keep report under 200 tokens total.

**Smoke (3 checks):**

```
Smoke: ✅ 3/3 — canvas renders, rect draws, bidi syncs. Screenshot attached.
```

**Full (9 phases):**

```
P1: ✅ 3/3 | P2: ✅ 5/5 | P3: ⚠️ 3/4 (3.3 no-op) | P4: ✅ 3/3
P5: ✅ 4/4 | P6: ✅ 3/3 | P7: ✅ 3/3 | P8: ✅ 5/5 | P9: ❌ 4/5 (9.5 fail)
Bug: P9.5 — "Make child" click no effect. Screenshot attached.
```

For failures: one-line description + screenshot. No extended prose.

---

## Tips

- If the Codespace is stopped, it needs ~30s to start
- Use Ctrl (not ⌘) in the Codespace terminal — it runs Linux
- All keyboard shortcuts are listed in the `?` help overlay
- When running Smoke tier, the entire test is ONE subagent call
