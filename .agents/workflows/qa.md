---
description: Autonomous overnight QA — exhaustive testing
---

# QA Workflow

> Autonomous overnight QA session (~6-8 hrs).
> Test every interaction pattern and fix bugs inline before moving on.

// turbo-all

## Prerequisites
1. `git checkout -b test/qa-$(date +%Y%m%d)`
2. `cargo check --workspace && cargo test --workspace && cargo clippy --workspace -- -D warnings`
3. `wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm`
4. Open Codespace via browser subagent.

## Fix-As-You-Go Rule
> [!IMPORTANT]
> When a check fails: Screenshot → Fix bug in code → Re-run tests/WASM → Confirm fix → Proceed.
> Commit every ~5 fixes.

## QA Testing Directives

Execute browser_subagents to exhaustively test the following interaction domains. Write detailed scripts for the subagent to perform permutations of these actions:

**1. Drawing & Modifiers:** 
- R (Rect), O (Ellipse), T (Text), A (Arrow), P (Path), F (Frame).
- Modifiers: Shift+drag (constrained), Alt+drag (clone), Space+drag (pan). Tool locking (R R). 
- Toolbar drag-to-create (with snaps and reparenting).

**2. Selection & Manipulation:** 
- Click, click-away, shift-click (additive),marquee.
- Delete, move (drag, arrows, shift+arrows), zoom/pan (minimap, shortcuts).
- Resize (all 8 handles + Shift proportional).

**3. Context Menu & Clipboard:**
- ⌘C/⌘V/⌘X/⌘D cross-node permutations. Right click options.

**4. Group, Frame & Z-Order:** 
- Group/Ungroup (⌘G/⌘⇧G), drill-down selection. Nested frames and clipping.
- Layering (⌘[, ⌘], ⌘⇧[, ⌘⇧]).

**5. Bidi Sync & Panels:**
- Draw/Move/Delete on canvas -> appears in Code.
- Edit Code -> updates on canvas.
- Properties panel color/size updates sync both ways.
- Layers tree accurately reflects hierarchy + rename works.

**6. Edge Cases:**
- Inline text editing (double click, cancel, save).
- Text Reparenting (drag onto rect).
- Shortcuts overview, Zen Mode (🧘). Light/Dark Themes. Multi-modal limits. Stress test undo (⌘Z rapidly).

## Reporting
At the end, report total bugs fixed, severity (🔴 Major, 🟡 Minor), and root causes.
Commit and push a PR.

> **Tip**: If test failures involve backend integration or AI generation timeouts, check the Modal logs in your terminal via `modal app logs <app-name>` or locally using `modal shell`.
