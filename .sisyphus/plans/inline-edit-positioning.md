# Fix Inline Text Editor Positioning Bug

## TL;DR

> **Quick Summary**: Fix the inline text editor (textarea overlay) appearing at the wrong position when double-clicking styled/positioned text nodes. The root cause is coordinate math mismatches between `inline-edit.js` and Rust `draw_text()` in `render2d.rs`, compounded by stale bounds, alignment differences for single vs multi-line, and inconsistent centering for text-in-shape vs standalone text.
> 
> **Deliverables**:
> - Correct textarea overlay positioning for standalone text nodes with x:/y: properties
> - Correct textarea overlay positioning for text-in-shape (rect, ellipse, frame)
> - Correct textarea overlay positioning for multi-line text (word-wrapped and explicit newlines)
> - Correct vertical alignment padding matching Rust draw_text() for all valign modes
> - E2E Playwright browser tests for all positioning scenarios
> - Bug fix for unused `_start_y` dead code in render2d.rs
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 7 → F1-F4

---

## Context

### Original Request
The inline text editor appears at an incorrect position when double-clicking to edit text nodes that have been styled or have explicit position properties (x: / y:). All scenarios affected: standalone text, text-in-shape, multi-line.

### Interview Summary
**Key Discussions**:
- User confirmed: bug affects ALL text node scenarios (standalone, in-shape, multi-line)
- Both platforms affected (site/ and fd-vscode/ share canvas-core/inline-edit.js)
- E2E browser tests (Playwright) for verification — unit tests don't catch pointer→WASM→render pipeline bugs

**Research Findings**:
- Canvas2D setTransform: `dpr * zoomLevel` scale, `panX * dpr` translate — Rust draws at scene coords
- Inline editor positioning: `sx = (b.x||0)*zoomLevel + panX + canvasOffsetX - centerX`
- Standalone text: `centerX=0, centerY=0`; text-in-shape: `centerX=(sw-scaledW)/2`
- Rust draw_text() uses fundamentally different y-positioning for single-line (baseline "middle") vs multi-line (baseline "top" + manual offset)
- `_start_y` unused variable in render2d.rs:606 — dead code from incomplete refactoring
- `measureAndUpdateTextBounds()` only updates w/h, NOT x/y
- `canvasOffsetX/Y` calculated once at dblclick time — can be stale
- LESSONS.md: extensive history of related inline-edit positioning bugs

### Self-Performed Gap Analysis
**Identified Gaps (addressed)**:
- Single-line vs multi-line vertical positioning mismatch between Rust and JS
- Text-in-shape centerX/centerY computation doesn't account for padding/alignment correctly
- No bounds freshness guarantee — stale bounds from layout solver
- Missing E2E test infrastructure for inline edit scenarios

**Guardrails Applied**:
- Do NOT change Canvas2D rendering — only fix the CSS overlay positioning
- Do NOT add new features — only fix positioning bugs
- Do NOT touch the WASM ABI — fixes are JS-side only (except render2d.rs dead code cleanup)
- Both platforms must remain in sync via shared canvas-core module

---

## Work Objectives

### Core Objective
Make the inline editor textarea overlay appear exactly over the rendered text in the canvas, for all text node types and alignment modes, at any zoom/pan level.

### Concrete Deliverables
- Fixed `site/canvas-core/inline-edit.js` coordinate calculations
- Cleaned up `crates/fd-wasm/src/render2d.rs` dead code (`_start_y`)
- E2E Playwright test scripts in `tests/` directory
- Position alignment that matches Rust `draw_text()` for all valign/halign combos

### Definition of Done
- [ ] Double-clicking any text node positions the textarea exactly over the rendered text
- [ ] Works at zoom levels 0.5x, 1x, 2x
- [ ] Works with pan offsets
- [ ] Works for standalone text with x:/y: properties
- [ ] Works for text inside rect/ellipse/frame
- [ ] Works for single-line and multi-line text
- [ ] Works for all vertical alignments (top, middle, bottom)
- [ ] All E2E tests pass

### Must Have
- Textarea position matches canvas-rendered text position within 2px tolerance
- All valign modes (top, middle, bottom) correct for both single and multi-line
- Text-in-shape editor centered over parent shape bounds
- Bounds freshness guaranteed before reading position
- Both platforms (site + VS Code) fixed via shared module

### Must NOT Have (Guardrails)
- NO changes to Canvas2D rendering pipeline — only fix the CSS overlay
- NO new WASM ABI methods — fixes are JS-side positioning math
- NO feature additions (no new alignment modes, no new node types)
- NO AI slop: no excessive comments, no over-abstraction, no generic variable names
- NO Math.round on sub-pixel values — CSS handles sub-pixel positioning natively
- NO removing existing working behaviors (type-to-create still works)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Playwright scripts in `tests/` directory)
- **Automated tests**: YES (Tests-after — implement fix, then write E2E tests)
- **Framework**: Playwright (existing pattern in `tests/*.mjs`)
- **Note**: WASM API calls crash from `page.evaluate()` — E2E tests must use DOM-only assertions (screenshot comparison, textarea position checks via CSS properties)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate to site, interact, assert textarea position, screenshot
- **E2E pattern**: Follow existing `tests/check_drag.mjs` — `import { chromium } from 'playwright'`, `page.evaluate()` for DOM-only assertions, `page.screenshot()` for visual checks
- **Server**: `npx serve site -l 5558` before tests

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — analysis + dead code fix + E2E scaffolding):
├── Task 1: Audit all coordinate paths in inline-edit.js [deep]
├── Task 2: Fix _start_y dead code in render2d.rs [quick]
├── Task 3: Create E2E test harness for inline edit [quick]
└── Task 4: Add .fd test fixtures for each scenario [quick]

Wave 2 (After Wave 1 — core positioning fixes):
├── Task 5: Fix standalone text positioning (x:/y: props) [deep]
├── Task 6: Fix text-in-shape centering [deep]
├── Task 7: Fix multi-line vertical alignment [deep]
└── Task 8: Fix bounds freshness guarantee [unspecified-high]

Wave 3 (After Wave 2 — E2E tests + integration):
├── Task 9: Write E2E tests for standalone text [unspecified-high]
├── Task 10: Write E2E tests for text-in-shape [unspecified-high]
├── Task 11: Write E2E tests for multi-line alignment [unspecified-high]
└── Task 12: Write E2E tests for zoom/pan combinations [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 5 → Task 9 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | - | 5, 6, 7 |
| 2 | - | - |
| 3 | - | 9, 10, 11, 12 |
| 4 | - | 5, 6, 7, 9, 10, 11, 12 |
| 5 | 1, 4 | 9 |
| 6 | 1, 4 | 10 |
| 7 | 1, 4 | 11 |
| 8 | 1 | 5, 6, 7 |
| 9 | 3, 5 | F3 |
| 10 | 3, 6 | F3 |
| 11 | 3, 7 | F3 |
| 12 | 3, 5, 6, 7 | F3 |
| F1-F4 | All | User okay |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `deep`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave 2**: 4 tasks — T5-T7 → `deep`, T8 → `unspecified-high`
- **Wave 3**: 4 tasks — T9-T12 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Audit All Coordinate Paths in inline-edit.js

  **What to do**:
  - Read `site/canvas-core/inline-edit.js` end-to-end, build a coordinate flow diagram
  - Document every place scene coordinates are converted to screen/CSS coordinates
  - Identify exact mismatch points between JS positioning and Rust `draw_text()` positioning
  - Focus on:
    - `sx/sy` computation (lines 232-233) — how `(b.x||0)` and `(b.y||0)` map to screen
    - `centerX/centerY` computation (lines 228-229) — when they're 0 vs when they offset
    - `padTop/padBottom` computation (lines 276-290) — how they relate to Rust's y-offsets
    - `sw/sh` computation (lines 219-220) — how min-width/height affect the textarea rectangle
  - For each mismatch, document: the Rust formula, the JS formula, and the delta
  - Create a "positioning truth table" mapping each combo (standalone/in-shape × top/middle/bottom × single/multi-line) to exact expected sx/sy/padding values
  - Write findings as inline comments in the draft or a separate analysis doc

  **Must NOT do**:
  - Do NOT make any code changes — this is analysis only
  - Do NOT change Canvas2D rendering
  - Do NOT touch the WASM ABI

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires thorough code reading and cross-referencing two codebases (Rust + JS)
  - **Skills**: [`fd-format`]
    - `fd-format`: Needed to understand .fd grammar for node properties (x:/y:) and how they affect bounds
  - **Skills Evaluated but Omitted**:
    - `bidi-sync`: Not needed — we're not modifying the sync engine, just analyzing coordinates
    - `rust-wasm`: Could help but the Rust code is simple enough to read directly

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `site/canvas-core/inline-edit.js:141-340` — The entire `openInlineEditor()` function. Focus on: how `b.x`/`b.y` are read from `get_node_bounds()`, how `sx/sy` are computed, how `centerX/centerY` adjust positioning, how `padTop/padBottom` handle vertical alignment.
  - `site/canvas-core/inline-edit.js:43-103` — `measureAndUpdateTextBounds()` — understand what it measures and what it updates (w/h only, NOT x/y).
  - `site/canvas-core/render.js:1-50` — `render()` function showing `setTransform()` call, how panX/panY/zoomLevel/dpr are applied to the Canvas2D context.

  **API/Type References** (contracts to implement against):
  - `crates/fd-wasm/src/render2d.rs:508-634` — Rust `draw_text()` function. The single-source-of-truth for where text is rendered on canvas. Line 617-626: multi-line uses baseline="top" with manual y-offset. Line 627-634: single-line uses baseline="middle"/"top"/"bottom" natively. The JS must match these exact positions.
  - `crates/fd-wasm/src/render2d.rs:599-603` — Horizontal alignment x-position: Left=b.x, Center=b.x+b.width/2, Right=b.x+b.width. The JS textarea `text-align` property should match where text starts rendering.
  - `crates/fd-wasm/src/render2d.rs:606-614` — `_start_y` dead code (unused). The ACTUAL y-positions are at lines 619-623 (multi) and 629-633 (single). Note the discrepancy: single-line Middle uses `b.y + b.height/2`, multi-line Middle uses `b.y + (b.height - total_text_height)/2`.

  **Test References** (testing patterns to follow):
  - `tests/check_drag.mjs` — Existing Playwright E2E pattern: `import { chromium } from 'playwright'`, serve site, `page.evaluate()` for DOM assertions, `page.screenshot()` for visual checks.

  **External References**:
  - Canvas2D API: `setTransform(a, b, c, d, e, f)` — a=scaleX, d=scaleY, e=translateX, f=translateY

  **WHY Each Reference Matters**:
  - `inline-edit.js:232-233` — This is THE line that computes where the textarea appears. If it doesn't match Rust's draw coordinates, the editor is mispositioned.
  - `render2d.rs:617-634` — The Rust code has TWO different positioning strategies for text. The JS must handle both. Single-line Middle uses canvas baseline "middle" (vertically centered at midpoint of bounds); multi-line Middle uses manual centering with baseline "top". These produce DIFFERENT pixel positions.
  - `inline-edit.js:228-229` — The centerX/centerY adjustment is applied to sx/sy. For standalone text, both are 0. For text-in-shape, they offset to center the editor over the shape. If these are wrong, the editor floats away from the text.

  **Acceptance Criteria**:

  - [ ] Positioning truth table created covering all 18 combinations (3 node types × 3 valign × 2 line modes)
  - [ ] Each entry documents: Rust y-position formula, JS sy/padTop formula, expected delta
  - [ ] Specific bug locations identified with line numbers for each mismatch

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Audit completeness
    Tool: Bash
    Preconditions: Task 1 analysis output available
    Steps:
      1. Check that analysis covers all 3 node types (standalone, text-in-shape, text-in-ellipse)
      2. Check that analysis covers all 3 valign modes (top, middle, bottom)
      3. Check that analysis covers both single-line and multi-line (word-wrap)
      4. Verify each entry has: Rust formula, JS formula, delta calculation
    Expected Result: All 18 combinations documented with formulas
    Failure Indicators: Missing combinations, vague descriptions without exact formulas
    Evidence: .sisyphus/evidence/task-1-audit-complete.txt
  ```

  **Commit**: NO (analysis only, no code changes)

- [x] 2. Fix `_start_y` Dead Code in render2d.rs

  **What to do**:
  - In `crates/fd-wasm/src/render2d.rs:606-614`, the `_start_y` variable is computed but never used
  - The actual y-positions are computed separately at lines 619-623 (multi-line) and 629-633 (single-line)
  - Remove the dead `_start_y` computation entirely (lines 606-614)
  - Add a comment explaining WHY single-line and multi-line use different formulas
  - Verify this doesn't break any existing tests: `cargo test -p fd-wasm`
  - Run `cargo clippy` and `cargo fmt`

  **Must NOT do**:
  - Do NOT change the actual y-positioning formulas — only remove dead code
  - Do NOT modify the single-line or multi-line rendering paths
  - Do NOT add new features

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file dead code removal, ~10 lines affected
  - **Skills**: [`rust-wasm`]
    - `rust-wasm`: Needed for Rust crate structure and testing patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: None (dead code removal doesn't affect behavior)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `crates/fd-wasm/src/render2d.rs:606-614` — The `_start_y` dead code to remove
  - `crates/fd-wasm/src/render2d.rs:617-634` — The ACTUAL y-position code (multi-line and single-line). Do NOT change these.

  **API/Type References**:
  - `crates/fd-wasm/Cargo.toml` — Package config for test commands

  **Test References**:
  - Run `cargo test -p fd-wasm` after changes
  - Run `cargo clippy --workspace -- -D warnings`
  - Run `cargo fmt --all -- --check`

  **WHY Each Reference Matters**:
  - The `_start_y` variable is misleading — it suggests it's used for positioning but it's not. Removing it prevents future confusion about which y-formula is "the real one".

  **Acceptance Criteria**:
  - [ ] `_start_y` variable and its `match` block removed from render2d.rs
  - [ ] Comment added explaining the single vs multi-line positioning strategy
  - [ ] `cargo test -p fd-wasm` → PASS
  - [ ] `cargo clippy --workspace -- -D warnings` → PASS
  - [ ] `cargo fmt --all -- --check` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dead code removed, tests pass
    Tool: Bash
    Preconditions: Changes made to render2d.rs
    Steps:
      1. grep -n "_start_y" crates/fd-wasm/src/render2d.rs → no matches
      2. cargo test -p fd-wasm → 0 failures
      3. cargo clippy --workspace -- -D warnings → exit 0
    Expected Result: No references to _start_y, all tests pass
    Failure Indicators: grep finds _start_y, any test failure, any clippy warning
    Evidence: .sisyphus/evidence/task-2-dead-code-fix.txt

  Scenario: Build succeeds after removal
    Tool: Bash
    Preconditions: Changes made
    Steps:
      1. cargo build -p fd-wasm → success
    Expected Result: Build completes without errors
    Failure Indicators: Compilation error
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `fix(render2d): remove unused _start_y variable in draw_text()`
  - Files: `crates/fd-wasm/src/render2d.rs`
  - Pre-commit: `cargo test -p fd-wasm && cargo clippy -- -D warnings`

- [x] 3. Create E2E Test Harness for Inline Edit

  **What to do**:
  - Create `tests/check-inline-edit-harness.mjs` — a shared test utility module
  - Provide helper functions:
    - `startServer()` — starts `npx serve site -l 5558` in background
    - `stopServer()` — kills the server process
    - `openPage(browser, url)` — creates a new page at the playground
    - `loadFdContent(page, fdText)` — injects .fd content into the editor via DOM manipulation (textarea value + trigger re-parse)
    - `dblClickTextNode(page, nodeId)` — double-clicks on a text node by finding its rendered position
    - `getTextareaPosition(page)` — returns `{left, top, width, height}` of the inline editor textarea
    - `getCanvasTextNodePosition(page, nodeId)` — returns the canvas-rendered bounds of the text node (from DOM/getBoundingClientRect on canvas hit-test result)
    - `closeInlineEditor(page, key)` — presses Escape or Enter to close
    - `screenshot(page, name)` — saves screenshot to `tests/screenshots/`
  - IMPORTANT: Cannot call WASM APIs from `page.evaluate()`. Must use DOM-only methods. Options:
    - Load .fd content by setting the source textarea value and dispatching an `input` event
    - Find text node positions by querying the canvas or using known coordinates
    - The textarea overlay IS a DOM element — can read its position directly
  - Test the harness by launching a basic test that creates a text node and verifies the textarea appears

  **Must NOT do**:
  - Do NOT call any WASM API from page.evaluate() — it crashes
  - Do NOT modify the existing app code
  - Do NOT use `fdCanvas.*` calls in browser context

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Creating a utility module with well-defined helper functions
  - **Skills**: [`dev-browser`]
    - `dev-browser`: Browser automation patterns for persistent page state and screenshots
  - **Skills Evaluated but Omitted**:
    - `playwright`: The dev-browser skill already covers Playwright usage patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 9, 10, 11, 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/check_drag.mjs` — Existing E2E test pattern: `import { chromium } from 'playwright'`, serve site, page.evaluate() for DOM-only assertions
  - `tests/check_wasm.mjs` — Another E2E pattern reference
  - `tests/check_errors.mjs` — Error checking pattern

  **API/Type References**:
  - `site/app.js` — The main app. Contains the source textarea (for setting .fd content), the canvas element, panX/panY/zoomLevel variables, and the `openInlineEditor()` call flow.
  - `site/canvas-core/inline-edit.js` — The inline editor creates a `<textarea>` DOM element with specific CSS properties (position:absolute, left, top, width, height).

  **Test References**:
  - `tests/check_drag.mjs` — Full pattern: start server, launch browser, create page, navigate, evaluate, screenshot, close.

  **WHY Each Reference Matters**:
  - `tests/check_drag.mjs` — The existing E2E tests are the ONLY reliable pattern for this codebase. WASM crashes from Playwright evaluate, so DOM-only assertions are mandatory.
  - `site/app.js` — Need to understand how to programmatically set .fd content. The source textarea in the app has an `input` event listener that triggers re-parse.

  **Acceptance Criteria**:
  - [ ] `tests/check-inline-edit-harness.mjs` exists with all helper functions
  - [ ] Basic smoke test of harness works: loads page, creates text node, opens editor, reads textarea position
  - [ ] No WASM API calls from page.evaluate()

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Harness loads and finds textarea
    Tool: Bash
    Preconditions: Site served at localhost:5558
    Steps:
      1. node -e "import('./tests/check-inline-edit-harness.mjs').then(m => console.log(Object.keys(m)))" → lists all exported functions
      2. Run a minimal test script using the harness that:
         - Starts server
         - Opens browser + page at localhost:5558
         - Loads minimal .fd content with a text node
         - Double-clicks the text node area
         - Gets textarea position (should be non-null)
         - Takes screenshot
      3. Verify: textarea position is not {0,0,0,0}
    Expected Result: Harness functions exported, basic test finds textarea overlay
    Failure Indicators: Missing exports, textarea not found, WASM crash
    Evidence: .sisyphus/evidence/task-3-harness-works.png (screenshot)

  Scenario: No WASM crash from harness
    Tool: Bash
    Preconditions: Harness created
    Steps:
      1. Run harness test script
      2. Check console for "memory access out of bounds" or "recursive use of object" errors
      3. Verify no WASM-related crash in page errors
    Expected Result: No WASM crash errors in console
    Failure Indicators: Any WASM error in console output
    Evidence: .sisyphus/evidence/task-3-no-wasm-crash.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `test(inline-edit): add E2E test harness for inline editor positioning`
  - Files: `tests/check-inline-edit-harness.mjs`

- [x] 4. Add .fd Test Fixtures for Each Scenario

  **What to do**:
  - Create `site/test-fixtures/` directory with .fd files for each inline-edit scenario:
    - `standalone-text.fd` — Simple text node at origin: `text @t1 "Hello" { font: "Inter" 14 }`
    - `positioned-text.fd` — Text with explicit x:/y:: `text @t2 "World" { x: 200 y: 150 font: "Inter" 14 }`
    - `styled-text.fd` — Text with font size/weight changes: `text @t3 "Styled" { font: "Inter" bold 24 }`
    - `text-in-rect.fd` — Text inside a rect: `rect @box { w: 200 h: 80 fill: #EEE; text @label "Inside" {} }`
    - `text-in-ellipse.fd` — Text inside an ellipse: `ellipse @circle { w: 120 h: 120 fill: #EEE; text @inner "O" {} }`
    - `multiline-text.fd` — Multi-line text with newlines: `text @multi "Line1\nLine2\nLine3" { font: "Inter" 14 }`
    - `wordwrap-text.fd` — Text with explicit maxWidth causing word wrap
    - `valign-top.fd`, `valign-middle.fd`, `valign-bottom.fd` — Text with different vertical alignments
  - Each fixture should be minimal — just enough to test one specific scenario
  - Add a `site/test-fixtures/README.md` explaining what each fixture tests

  **Must NOT do**:
  - Do NOT add edge/test labels or IDs that wouldn't appear in real usage
  - Do NOT create fixtures that require features not yet implemented
  - Do NOT modify existing .fd files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Creating simple text files following existing .fd grammar
  - **Skills**: [`fd-format`]
    - `fd-format`: Required to write valid .fd syntax (grammar, property names, value formats)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 5, 6, 7, 9, 10, 11, 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `docs/REQUIREMENTS.md` — Feature spec showing example .fd content
  - `site/canvas-core/inline-edit.js:196` — Default props for text nodes (fontSize: 14, fontFamily: "Inter, sans-serif", fontWeight: 400)

  **API/Type References**:
  - `.agents/skills/fd-format/SKILL.md` — Complete .fd grammar reference. Critical for: text node syntax, font property format, x:/y: positioning, text-in-shape nesting, maxWidth property.

  **Test References**:
  - The fixtures themselves ARE the test data — they'll be loaded by the E2E test harness

  **WHY Each Reference Matters**:
  - `fd-format` skill — Must write valid .fd that parses correctly. Invalid .fd will cause the parser to fail silently or produce wrong node structure.

  **Acceptance Criteria**:
  - [ ] All 10 fixture files created in `site/test-fixtures/`
  - [ ] Each fixture parses correctly when loaded into the FD playground (no errors)
  - [ ] `site/test-fixtures/README.md` exists with descriptions

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Fixtures load in playground without errors
    Tool: Bash (Playwright)
    Preconditions: Site served at localhost:5558
    Steps:
      1. For each .fd fixture file:
         - Open playground at localhost:5558
         - Paste fixture content into source textarea
         - Wait 1s for parse + render
         - Read console for errors (page.on('console'))
         - Screenshot the result
      2. Verify: 0 console errors for each fixture
    Expected Result: All fixtures parse and render without errors
    Failure Indicators: Any console error, empty canvas, visible error overlay
    Evidence: .sisyphus/evidence/task-4-fixtures-load.png (per fixture screenshots)

  Scenario: Fixture content matches expected node structure
    Tool: Bash
    Preconditions: Fixtures created
    Steps:
      1. For each fixture, verify it contains expected .fd syntax:
         - standalone-text.fd: contains `text @` with no x:/y:
         - positioned-text.fd: contains `x:` and `y:` properties
         - text-in-rect.fd: contains `rect` with nested `text`
      2. grep for key patterns in each file
    Expected Result: Each fixture has the expected syntax elements
    Failure Indicators: Missing expected patterns
    Evidence: .sisyphus/evidence/task-4-fixture-structure.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `test(inline-edit): add .fd test fixtures for inline editor positioning scenarios`
  - Files: `site/test-fixtures/*.fd`, `site/test-fixtures/README.md`

- [x] 5. Fix Standalone Text Positioning (x:/y: props)

  **What to do**:
  - Based on Task 1 audit findings, fix the `sx`/`sy` computation in `inline-edit.js:232-233` for standalone text nodes with explicit x:/y: position properties
  - The current code: `sx = (b.x || 0) * zoomLevel + panX + canvasOffsetX - centerX` where `centerX = 0` for standalone text
  - The issue: `b.x` comes from `get_node_bounds()` which returns resolved layout bounds. For positioned text nodes, `b.x` SHOULD be correct, but there may be a timing issue where bounds aren't fresh after the latest mutation
  - Fix approach:
    - After `measureAndUpdateTextBounds()` (line 158), re-read bounds with `fdCanvas.get_node_bounds(nodeId)` to guarantee freshness
    - Verify that `b.x`/`b.y` from `get_node_bounds()` matches the position where the canvas actually renders (compare with `screenToScene` or reverse-compute from setTransform)
    - If bounds are stale, add a `fdCanvas.finalize_bounds()` call before reading bounds
  - Also check: for standalone text, the `padTop` computation for "top" valign should match Rust's `2.0` pixel top-padding offset (line 607: `b.y + 2.0`)

  **Must NOT do**:
  - Do NOT change Canvas2D rendering
  - Do NOT change the Rust draw_text() function
  - Do NOT add new WASM API methods
  - Do NOT introduce Math.round on sub-pixel values

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires understanding coordinate systems and careful math changes
  - **Skills**: [`fd-format`]
    - `fd-format`: Understanding how x:/y: properties in .fd translate to node bounds

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (depends on Task 1 audit)
  - **Blocks**: Tasks 9, 12
  - **Blocked By**: Tasks 1, 4

  **References**:

  **Pattern References**:
  - `site/canvas-core/inline-edit.js:155-175` — The bounds-reading section. `posId` determines which node's bounds are used. For standalone text, `posId = nodeId`.
  - `site/canvas-core/inline-edit.js:228-233` — The `centerX`/`centerY`/`sx`/`sy` computation. For standalone text, `centerX=0`, `centerY=0`, so `sx = b.x * zoomLevel + panX + canvasOffsetX`. This should correctly map scene→screen.
  - `site/canvas-core/inline-edit.js:276-290` — Vertical padding. For "top" valign, `padTop = 2 * zoomLevel`. This must match Rust's `b.y + 2.0` offset (but Rust's 2.0 is in scene pixels, while JS padTop is in screen pixels → `2 * zoomLevel` converts correctly).
  - `site/canvas-core/inline-edit.js:43-103` — `measureAndUpdateTextBounds()` — only updates w/h, not x/y. After calling this, bounds may have stale x/y if the node was recently moved.

  **API/Type References**:
  - `crates/fd-wasm/src/render2d.rs:607` — Rust Top valign: `b.y + 2.0` in scene coords
  - `crates/fd-wasm/src/render2d.rs:631` — Rust Middle valign (single-line): `b.y + b.height/2` with baseline "middle"
  - `crates/fd-wasm/src/render2d.rs:621` — Rust Middle valign (multi-line): `b.y + (b.height - total_text_height)/2` with baseline "top"

  **External References**:
  - AGENTS.md: Bounds ownership chain — JS measureText > SyncEngine > resolve_subtree > resolve_layout

  **WHY Each Reference Matters**:
  - Line 232-233 is THE positioning formula — if this is wrong, the editor floats away
  - Line 158: `measureAndUpdateTextBounds()` is called before reading bounds, but it only updates w/h. If x/y are stale from a recent drag, the textarea will appear at the old position
  - Rust lines 607/621/631 define the exact y-offsets the JS padding must replicate

  **Acceptance Criteria**:
  - [ ] Bounds are guaranteed fresh when read (finalize_bounds() called or bounds re-read after measurement)
  - [ ] Textarea sx/sy matches canvas text position for standalone text with x:/y: at zoom 1x
  - [ ] padTop/padBottom values match Rust draw_text() offsets for top/middle/bottom valign
  - [ ] Sub-pixel precision maintained (no Math.round)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Standalone positioned text - editor appears over text
    Tool: Bash (Playwright)
    Preconditions: Site served at localhost:5558, positioned-text.fd fixture loaded
    Steps:
      1. Open playground, load positioned-text.fd content (text at x:200, y:150)
      2. Double-click on the text node area (approximately at screen coordinates matching x:200,y:150 adjusted for zoom/pan)
      3. Wait 500ms for editor to appear
      4. Read textarea CSS: left, top, width, height
      5. Screenshot the result
      6. Press Escape to close editor
    Expected Result: Textarea 'left' ~ 200*zoom+pan+canvasOffset, 'top' ~ 150*zoom+pan+canvasOffset. Text visible inside textarea at correct position.
    Failure Indicators: Textarea offset by >5px from canvas text, textarea at (0,0), text not visible in textarea
    Evidence: .sisyphus/evidence/task-5-standalone-positioned.png

  Scenario: Standalone text at default position - editor appears correctly
    Tool: Bash (Playwright)
    Preconditions: Site served at localhost:5558, standalone-text.fd loaded
    Steps:
      1. Load standalone-text.fd (text at origin)
      2. Double-click the text
      3. Read textarea position
      4. Verify textarea appears near canvas origin (adjusted for pan)
    Expected Result: Textarea positioned at approximately (panX + canvasOffsetX, panY + canvasOffsetY)
    Failure Indicators: Textarea significantly offset from rendered text
    Evidence: .sisyphus/evidence/task-5-standalone-default.png
  ```

  **Commit**: YES (groups with Tasks 6, 7, 8)
  - Message: `fix(inline-edit): correct standalone text node editor positioning`
  - Files: `site/canvas-core/inline-edit.js`
  - Pre-commit: `node tests/check-inline-edit-standalone.mjs`

- [x] 6. Fix Text-in-Shape Centering

  **What to do**:
  - Fix the `centerX`/`centerY` computation for text-in-shape scenarios (text inside rect, ellipse, frame)
  - Current code (line 228-229): `centerX = (sw - scaledW) / 2` where `sw = Math.max(scaledW, 80) + 2` and `scaledW = bw * zoomLevel`
  - The issue: when `bw < 80`, `sw` becomes `82` (min-width enforced), so `centerX = (82 - bw*zoomLevel) / 2`. But the textarea IS 82px wide, and it's offset by `centerX` pixels from the bounds position. This means the textarea is centered within itself, which is correct ONLY if the shape also renders wider than 82px.
  - For shapes: the parent shape's bounds should be used (current code gets `posId = parentShapeId`, so `b` = parent shape bounds). The textarea should be centered OVER the shape bounds. So:
    - `sx = b.x * zoomLevel + panX + canvasOffsetX` (shape's left edge in screen coords)
    - The textarea width should be `sw = b.w * zoomLevel` (shape width in screen coords)
    - No centerX offset needed — the textarea IS the shape width, positioned at shape's left edge
  - However, if `sw` uses min-width (`Math.max(scaledW, 80)`), then the textarea is narrower than the shape for large shapes, or wider for very small shapes. The centering logic needs to account for this:
    - If textarea is narrower than shape: center textarea within shape → `sx = b.x * zoomLevel + panX + canvasOffsetX + (scaledW - sw) / 2`
    - If textarea is wider than shape (unlikely): textarea extends past shape → `sx = b.x * zoomLevel + panX + canvasOffsetX - (sw - scaledW) / 2`
  - Also: the textarea `text-align` should match the horizontal alignment from Rust (Center for in-shape, Left for standalone). The horizontal alignment determines where text STARTS within the textarea. Currently JS uses `hAlign = "center"` for in-shape which matches Rust's default, but the padding/indent must match too.

  **Must NOT do**:
  - Do NOT change Canvas2D rendering
  - Do NOT change the Rust draw_text() function
  - Do NOT add new WASM API methods

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires understanding centering math for text-in-shape and comparing with Rust rendering
  - **Skills**: [`fd-format`]
    - `fd-format`: Understanding text-in-shape nesting, horizontal/vertical alignment properties

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: After Task 1 (depends on audit findings)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 1, 4

  **References**:

  **Pattern References**:
  - `site/canvas-core/inline-edit.js:161-176` — For text-in-shape, `posId = parentShapeId`, so `b` = parent shape bounds. The textarea overlay is positioned at the parent shape's screen coordinates.
  - `site/canvas-core/inline-edit.js:219-220` — `sw = Math.max(scaledW, 80) + 2`, `sh = Math.max(scaledH, lineHeight + 4)`. The min-width/height affect textarea dimensions.
  - `site/canvas-core/inline-edit.js:228-229` — `centerX`/`centerY` offsets. Currently: `(isTextNode && !isInShape) ? 0 : (sw - scaledW) / 2`. This centers the textarea within the shape bounds when textarea is narrower than shape.
  - `site/canvas-core/inline-edit.js:271-272` — `hAlign` and `vAlign` defaults. For in-shape: hAlign="center", vAlign="middle". These must match Rust defaults.

  **API/Type References**:
  - `crates/fd-wasm/src/render2d.rs:531-536` — Rust default horizontal alignment: Center for in-shape, Left for standalone
  - `crates/fd-wasm/src/render2d.rs:544-549` — Rust default vertical alignment: Middle for in-shape, Top for standalone
  - `crates/fd-wasm/src/render2d.rs:599-603` — Rust horizontal x-position: Center = `b.x + b.width/2`. This means the TEXT is rendered at the horizontal center of bounds. The JS textarea with `text-align:center` should produce text at the same position.

  **WHY Each Reference Matters**:
  - Lines 228-229: The centerX computation is the primary suspect for text-in-shape mispositioning. If `sw > scaledW` (min-width kicks in), the textarea is wider than the rendered shape, and centering may push text away from where Rust renders it.
  - Lines 531-549: Rust's default alignment for in-shape is center-h/middle-v. The JS must match this in the textarea's CSS text-align and vertical padding.

  **Acceptance Criteria**:
  - [ ] Textarea is centered over parent shape bounds for text-in-rect
  - [ ] Textarea is centered over parent shape bounds for text-in-ellipse
  - [ ] Textarea text-align matches Rust horizontal alignment
  - [ ] Textarea padTop/padBottom match Rust vertical alignment for in-shape middle

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Text-in-rect - editor centered over shape
    Tool: Bash (Playwright)
    Preconditions: Site served at localhost:5558, text-in-rect.fd loaded
    Steps:
      1. Load text-in-rect.fd (rect 200x80 with text inside)
      2. Double-click the text area inside the rect
      3. Wait 500ms for editor
      4. Read textarea position: left, top, width, height
      5. Read the canvas rect's approximate rendered position
      6. Verify textarea overlaps the rect bounds (within 5px)
      7. Screenshot
    Expected Result: Textarea left + width/2 ≈ rect center x, textarea top + height/2 ≈ rect center y
    Failure Indicators: Textarea offset from rect by >5px, textarea not visible
    Evidence: .sisyphus/evidence/task-6-text-in-rect.png

  Scenario: Text-in-ellipse - editor centered over ellipse
    Tool: Bash (Playwright)
    Preconditions: Site served at localhost:5558, text-in-ellipse.fd loaded
    Steps:
      1. Load text-in-ellipse.fd
      2. Double-click the text area
      3. Read textarea position
      4. Verify textarea overlaps ellipse bounds
    Expected Result: Textarea centered over ellipse
    Failure Indicators: Textarea offset from ellipse center
    Evidence: .sisyphus/evidence/task-6-text-in-ellipse.png
  ```

  **Commit**: YES (groups with Tasks 5, 7, 8)
  - Message: `fix(inline-edit): correct text-in-shape editor centering`
  - Files: `site/canvas-core/inline-edit.js`

- [x] 7. Fix Multi-Line Vertical Alignment

  **What to do**:
  - Fix the vertical alignment mismatch between Rust `draw_text()` and JS `padTop`/`padBottom` for multi-line text
  - The critical difference: Rust uses TWO different strategies:
    - **Single-line** middle: `y = b.y + b.height/2` with baseline `"middle"` → canvas vertically centers text at midpoint of bounds
    - **Multi-line** middle: `y = b.y + (b.height - total_text_height)/2` with baseline `"top"` → manually offsets so text block is centered in bounds
  - The JS `padTop` computation (lines 281-284) for middle valign:
    ```js
    const lines = (currentValue.match(/\n/g) || []).length + 1;
    const textHeight = lineHeight * lines;
    padTop = Math.max(0, (sh - textHeight) / 2);
    ```
  - This is CLOSE to the Rust formula but has issues:
    1. `sh` is `Math.max(scaledH, lineHeight + 4)` — includes min-height enforcement. If the bounds are taller than the text, `sh` accounts for this. But Rust uses `b.height` (actual bounds height, not min-enforced).
    2. For single-line middle, the JS computes `padTop = (sh - lineHeight) / 2` while Rust uses `y = b.y + b.height/2` with baseline "middle" — these are different strategies. The CSS padding approach centers the text block top-to-bottom within the textarea, while Rust's baseline approach places the text baseline at the vertical center.
    3. For single-line text, the CSS `text-align` doesn't help vertically. The textarea's `line-height` and `padding` control vertical position. For "middle" valign, the text should appear at the vertical center of the bounds.
  - Fix approach:
    - For single-line middle: compute `padTop` such that the text baseline (which is at ~0.35 * lineHeight from the top of the line) aligns with `b.y + b.height/2` in screen coords
    - For multi-line middle: keep the current centering approach but use actual bounds height (not min-enforced `sh`)
    - Add a branch: if single-line + middle → use "baseline centering" formula; if multi-line + middle → use "block centering" formula

  **Must NOT do**:
  - Do NOT change Canvas2D rendering
  - Do NOT change the Rust draw_text() function
  - Do NOT add Math.round to sub-pixel values

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex math involving text baselines, line heights, and CSS box model
  - **Skills**: [`fd-format`]
    - `fd-format`: Understanding textAlign/textVAlign properties and how they map to CSS

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (after Task 1, parallel with Tasks 5, 6, 8)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1, 4

  **References**:

  **Pattern References**:
  - `site/canvas-core/inline-edit.js:276-290` — The padTop/padBottom computation. Currently uses a simplified centering formula that doesn't distinguish single vs multi-line.
  - `site/canvas-core/inline-edit.js:207-210` — `fontSize = rawFontSize * zoomLevel`, `lineHeight = rawFontSize * 1.2 * zoomLevel`. These are in screen pixels.

  **API/Type References**:
  - `crates/fd-wasm/src/render2d.rs:617-626` — Multi-line rendering: baseline="top", y = `b.y + (b.height - total_text_height)/2` for Middle valign
  - `crates/fd-wasm/src/render2d.rs:627-634` — Single-line rendering: baseline="middle", y = `b.y + b.height/2` for Middle valign
  - `crates/fd-wasm/src/render2d.rs:558` — `line_height = size * 1.2` (Rust, in scene pixels)

  **WHY Each Reference Matters**:
  - Lines 627-634 vs 617-626: The FUNDAMENTAL difference in positioning strategy. Single-line uses canvas baseline "middle" which places the baseline at y. Multi-line uses baseline "top" which places the TOP of the text at y. These produce different vertical positions for the same bounds.
  - CSS textarea vertical position is controlled by padding. The JS must compute padding that makes the textarea text appear at the same vertical position as the canvas-rendered text.

  **Acceptance Criteria**:
  - [ ] Single-line middle: textarea text baseline aligns with canvas text within 2px
  - [ ] Multi-line middle: textarea text block is vertically centered matching canvas within 2px
  - [ ] Single-line top: textarea text top aligns with canvas text top within 2px
  - [ ] Multi-line top: textarea first line top aligns with canvas first line top within 2px
  - [ ] Bottom valign also correct for both single and multi-line

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Single-line middle valign matches canvas
    Tool: Bash (Playwright)
    Preconditions: Site served at localhost:5558, styled-text.fd loaded (text with font size 24)
    Steps:
      1. Load styled-text.fd (large text, middle-aligned by default for standalone? or force middle)
      2. Double-click the text
      3. Read textarea top, padding-top
      4. Compare with canvas-rendered text position (approximate by screenshot)
      5. Verify vertical alignment matches within 2px
    Expected Result: Text area text appears at same vertical position as canvas text
    Failure Indicators: Text shifted up or down by >2px relative to canvas text
    Evidence: .sisyphus/evidence/task-7-singleline-middle.png

  Scenario: Multi-line middle valign matches canvas
    Tool: Bash (Playwright)
    Preconditions: Site served at localhost:5558, multiline-text.fd loaded
    Steps:
      1. Load multiline-text.fd (3 lines of text, middle valign)
      2. Double-click the text
      3. Read textarea top, padding-top
      4. Verify the center line of text in textarea aligns with the center line in canvas
    Expected Result: Text block vertically centered in textarea matching canvas rendering
    Failure Indicators: Multi-line text shifted up or down relative to canvas rendering
    Evidence: .sisyphus/evidence/task-7-multiline-middle.png

  Scenario: Top valign for both single and multi-line
    Tool: Bash (Playwright)
    Preconditions: valign-top.fd loaded
    Steps:
      1. Load valign-top.fd
      2. Double-click text
      3. Verify textarea top + padTop matches canvas text top (should be ~2px padding)
    Expected Result: Text at top of bounds with 2px padding matching Rust offset
    Failure Indicators: Different padding than expected
    Evidence: .sisyphus/evidence/task-7-valign-top.png
  ```

  **Commit**: YES (groups with Tasks 5, 6, 8)
  - Message: `fix(inline-edit): match multi-line vertical alignment with canvas rendering`
  - Files: `site/canvas-core/inline-edit.js`

- [x] 8. Fix Bounds Freshness Guarantee

  **What to do**:
  - Ensure that when `openInlineEditor` reads bounds via `get_node_bounds()`, the bounds are guaranteed fresh (reflect the latest text content, mutation, or layout change)
  - Current flow:
    1. `measureAndUpdateTextBounds()` (line 158) — measures text, updates w/h in WASM
    2. `get_node_bounds(posId)` (line 169) — reads bounds for positioning
  - Problem: `measureAndUpdateTextBounds()` only calls `update_text_metrics(nodeId, w, h)` which updates intrinsic size but not position. The layout solver may not have re-run to propagate position changes.
  - After `measureAndUpdateTextBounds()`, call `fdCanvas.finalize_bounds()` to trigger layout resolution (already done inside measureAndUpdateTextBounds when `changed === true`, but NOT when nothing changed)
  - Before reading bounds at line 169, always call `fdCanvas.finalize_bounds()` to guarantee the layout is resolved
  - Also: after bounds are read and BEFORE the textarea is positioned, verify that the `canvasOffsetX/Y` calculation at lines 215-216 is current (not stale from a prior frame). Re-read `getBoundingClientRect()` at the point of use.

  **Must NOT do**:
  - Do NOT change the WASM ABI
  - Do NOT add new API methods
  - Do NOT call finalize_bounds() in a hot loop (only at read time)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding the bounds lifecycle and layout resolution timing
  - **Skills**: [`bidi-sync`]
    - `bidi-sync`: Understanding the sync engine's layout resolution flow and when finalize_bounds is needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (parallel with Tasks 5, 6, 7)
  - **Blocks**: Tasks 5, 6, 7 (should be merged into their code changes)
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `site/canvas-core/inline-edit.js:155-175` — Bounds reading section. `measureAndUpdateTextBounds()` is called at line 158, then `get_node_bounds()` at line 169.
  - `site/canvas-core/inline-edit.js:97-100` — Inside `measureAndUpdateTextBounds()`: `fdCanvas.finalize_bounds()` is called only when `changed === true`. If bounds didn't change, layout isn't re-finalized.
  - `site/canvas-core/inline-edit.js:212-216` — `canvasOffsetX/Y` calculation using `getBoundingClientRect()`. This is the point where the offset between canvas and container is measured.

  **API/Type References**:
  - `crates/fd-wasm/src/lib.rs` — The WASM `finalize_bounds()` method: triggers layout resolution
  - AGENTS.md: "Bounds ownership chain — JS measureText > SyncEngine mutation > resolve_subtree > resolve_layout. Never let a lower-authority source overwrite a higher one."

  **WHY Each Reference Matters**:
  - Line 97-100: `finalize_bounds()` is conditional — only called when text metrics changed. If a node was moved (drag) but text didn't change, bounds may not be re-resolved.
  - Lines 212-216: The canvasOffsetX/Y is read once at editor open time. If the canvas was resized or panels were toggled before the editor opened, the offset may be wrong.

  **Acceptance Criteria**:
  - [ ] `finalize_bounds()` is always called before `get_node_bounds()` in openInlineEditor
  - [ ] `canvasOffsetX/Y` are computed from fresh `getBoundingClientRect()` calls (not cached)
  - [ ] Position bounds match the layout-solved position within 1px

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Bounds fresh after drag
    Tool: Bash (Playwright)
    Preconditions: Site served at localhost:5558
    Steps:
      1. Load positioned-text.fd
      2. Drag the text node to a new position (if possible via E2E, otherwise just test with different x/y fixtures)
      3. Double-click the text node
      4. Read textarea position
      5. Verify it matches the NEW position, not the old one
    Expected Result: Textarea at correct position matching current node location
    Failure Indicators: Textarea at old position (before drag)
    Evidence: .sisyphus/evidence/task-8-bounds-fresh.png

  Scenario: canvasOffset correct after panel toggle
    Tool: Bash (Playwright)
    Preconditions: Site served at localhost:5558
    Steps:
      1. Load a .fd file with a text node
      2. Toggle a side panel (if applicable) to change canvas position
      3. Double-click text node
      4. Read textarea position
      5. Verify textarea still overlays the canvas text
    Expected Result: Textarea positioned correctly regardless of canvas offset changes
    Failure Indicators: Textarea shifted by the panel width amount
    Evidence: .sisyphus/evidence/task-8-canvas-offset.png
  ```

  **Commit**: YES (groups with Tasks 5, 6, 7)
  - Message: `fix(inline-edit): guarantee bounds freshness and canvas offset accuracy`
  - Files: `site/canvas-core/inline-edit.js`

- [x] 9. Write E2E Tests for Standalone Text Positioning

  **What to do**:
  - Create `tests/check-inline-edit-standalone.mjs` using the harness from Task 3
  - Test scenarios:
    1. Text at origin (default position) — verify textarea at ~panX+canvasOffset, panY+canvasOffset
    2. Text with x:/y: (200, 150) — verify textarea offset by 200*zoom+panX
    3. Text with large font (bold 24) — verify textarea height matches larger line-height
    4. Text with top valign — verify padTop = 2*zoomLevel
    5. Text with middle valign (single-line) — verify vertical centering
    6. Text with bottom valign — verify padBottom = 2*zoomLevel
  - Each test: load .fd fixture → dblclick → read textarea position → assert within tolerance
  - Use screenshots for visual verification
  - IMPORTANT: Cannot call WASM from page.evaluate(). Use DOM-only methods.

  **Must NOT do**:
  - Do NOT call WASM APIs from page.evaluate()
  - Do NOT modify application code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test scenarios to implement with DOM-only assertions
  - **Skills**: [`dev-browser`]
    - `dev-browser`: E2E browser automation with Playwright patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (parallel with Tasks 10, 11, 12)
  - **Blocks**: F3
  - **Blocked By**: Tasks 3, 5

  **References**:

  **Pattern References**:
  - `tests/check_drag.mjs` — Full E2E pattern: import playwright, start server, navigate, evaluate, screenshot
  - `tests/check-inline-edit-harness.mjs` (from Task 3) — Shared harness with helper functions

  **Test References**:
  - `site/test-fixtures/standalone-text.fd` — Default text at origin
  - `site/test-fixtures/positioned-text.fd` — Text at x:200, y:150
  - `site/test-fixtures/styled-text.fd` — Text with font changes
  - `site/test-fixtures/valign-top.fd`, `valign-middle.fd`, `valign-bottom.fd` — Alignment fixtures

  **WHY Each Reference Matters**:
  - `tests/check_drag.mjs` — The ONLY proven pattern for E2E in this codebase
  - Harness from Task 3 — Provides the dblClick/getTextareaPosition helpers

  **Acceptance Criteria**:
  - [ ] 6 test scenarios pass
  - [ ] Each scenario takes a screenshot for visual evidence
  - [ ] No WASM crashes during test runs
  - [ ] Tolerance: textarea position within 5px of expected

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All standalone tests pass
    Tool: Bash
    Preconditions: Fix applied (Tasks 5-8 complete), site served
    Steps:
      1. node tests/check-inline-edit-standalone.mjs
      2. Check exit code = 0
      3. Check output for "PASS" on each scenario
    Expected Result: All 6 scenarios PASS with exit code 0
    Failure Indicators: Any scenario FAIL, exit code != 0, WASM crash in output
    Evidence: .sisyphus/evidence/task-9-standalone-tests.txt

  Scenario: Screenshots captured for each test
    Tool: Bash
    Preconditions: Tests run
    Steps:
      1. ls tests/screenshots/check-inline-edit-standalone-*.png
      2. Count files ≥ 6
    Expected Result: At least 6 screenshot files
    Failure Indicators: Missing screenshots
    Evidence: .sisyphus/evidence/task-9-screenshots-list.txt
  ```

  **Commit**: YES (groups with Tasks 10, 11, 12)
  - Message: `test(inline-edit): add E2E tests for standalone text positioning`
  - Files: `tests/check-inline-edit-standalone.mjs`

- [x] 10. Write E2E Tests for Text-in-Shape Positioning

  **What to do**:
  - Create `tests/check-inline-edit-in-shape.mjs` using the harness from Task 3
  - Test scenarios:
    1. Text in rect (200x80) — verify textarea centered over rect
    2. Text in ellipse (120x120) — verify textarea centered over ellipse
    3. Text in frame with layout — verify editor respects frame padding
    4. Small shape (30x30) — verify textarea min-width doesn't break centering
    5. Text in shape with middle valign — verify vertical centering
    6. Text in shape with top valign — verify top-aligned padding
  - Each test: load fixture → dblclick shape interior → read textarea position → assert centered

  **Must NOT do**:
  - Do NOT call WASM APIs from page.evaluate()
  - Do NOT modify application code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test scenarios, shape-specific assertions
  - **Skills**: [`dev-browser`]
    - `dev-browser`: Browser automation patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (parallel with Tasks 9, 11, 12)
  - **Blocks**: F3
  - **Blocked By**: Tasks 3, 6

  **References**:
  - `tests/check-inline-edit-harness.mjs` — Shared harness
  - `site/test-fixtures/text-in-rect.fd`, `text-in-ellipse.fd` — Shape fixtures

  **Acceptance Criteria**:
  - [ ] 6 test scenarios pass
  - [ ] Textarea centered within 5px of shape center for each scenario

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All text-in-shape tests pass
    Tool: Bash
    Preconditions: Fix applied, site served
    Steps:
      1. node tests/check-inline-edit-in-shape.mjs
      2. Check exit code = 0
    Expected Result: All 6 scenarios PASS
    Failure Indicators: Any scenario FAIL, exit code != 0
    Evidence: .sisyphus/evidence/task-10-in-shape-tests.txt
  ```

  **Commit**: YES (groups with Tasks 9, 11, 12)
  - Message: `test(inline-edit): add E2E tests for text-in-shape positioning`
  - Files: `tests/check-inline-edit-in-shape.mjs`

- [x] 11. Write E2E Tests for Multi-Line Vertical Alignment

  **What to do**:
  - Create `tests/check-inline-edit-multiline.mjs`
  - Test scenarios:
    1. Multi-line text with middle valign — verify text block centered vertically
    2. Multi-line text with top valign — verify first line at top with 2px padding
    3. Multi-line text with bottom valign — verify last line at bottom
    4. Word-wrapped text (maxWidth) — verify centering still correct
    5. Single-line vs multi-line middle — verify different positioning strategies
    6. Many lines (5+) — verify no overflow/scroll issues in textarea

  **Must NOT do**:
  - Do NOT call WASM APIs from page.evaluate()
  - Do NOT modify application code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - Reason: Multiple scenarios with alignment-specific assertions
  - **Skills**: [`dev-browser`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (parallel with Tasks 9, 10, 12)
  - **Blocks**: F3
  - **Blocked By**: Tasks 3, 7

  **References**:
  - `tests/check-inline-edit-harness.mjs` — Shared harness
  - `site/test-fixtures/multiline-text.fd`, `wordwrap-text.fd`, `valign-*.fd`

  **Acceptance Criteria**:
  - [ ] 6 test scenarios pass
  - [ ] Vertical alignment within 2px for all scenarios

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All multi-line tests pass
    Tool: Bash
    Preconditions: Fix applied, site served
    Steps:
      1. node tests/check-inline-edit-multiline.mjs
      2. Check exit code = 0
    Expected Result: All 6 scenarios PASS
    Failure Indicators: Any scenario FAIL
    Evidence: .sisyphus/evidence/task-11-multiline-tests.txt
  ```

  **Commit**: YES (groups with Tasks 9, 10, 12)
  - Message: `test(inline-edit): add E2E tests for multi-line vertical alignment`
  - Files: `tests/check-inline-edit-multiline.mjs`

- [x] 12. Write E2E Tests for Zoom/Pan Combinations

  **What to do**:
  - Create `tests/check-inline-edit-zoom-pan.mjs`
  - Test scenarios:
    1. Default zoom (1x) + default pan (0,0) — baseline correctness
    2. Zoom 2x — verify textarea width/height doubles, position scales with zoom
    3. Zoom 0.5x — verify textarea shrinks proportionally
    4. Pan offset (scroll right/down) — verify textarea tracks with pan
    5. Zoom 2x + pan — verify both transform effects combine correctly
    6. Rapid zoom change while editing — verify textarea repositions correctly
  - For zoom/pan: programmatically trigger zoom via keyboard shortcuts (Ctrl+=, Ctrl+-) or scroll events
  - IMPORTANT: After zoom change during editing, the textarea position must be updated. Check if `openInlineEditor` needs to handle zoom/pan changes during editing, or if it's re-opened on each dblclick

  **Must NOT do**:
  - Do NOT call WASM APIs from page.evaluate()
  - Do NOT modify application code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Zoom/pan interaction testing requires simulating input events
  - **Skills**: [`dev-browser`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (parallel with Tasks 9, 10, 11)
  - **Blocks**: F3
  - **Blocked By**: Tasks 3, 5, 6, 7

  **References**:
  - `site/canvas-core/render.js` — Zoom/pan utilities, keyboard shortcut handling

  **Acceptance Criteria**:
  - [ ] 6 test scenarios pass
  - [ ] Position tracking correct at all zoom levels

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All zoom/pan tests pass
    Tool: Bash
    Preconditions: Fix applied, site served
    Steps:
      1. node tests/check-inline-edit-zoom-pan.mjs
      2. Check exit code = 0
    Expected Result: All 6 scenarios PASS
    Failure Indicators: Any scenario FAIL
    Evidence: .sisyphus/evidence/task-12-zoom-pan-tests.txt
  ```

  **Commit**: YES (groups with Tasks 9, 10, 11)
  - Message: `test(inline-edit): add E2E tests for zoom/pan positioning`
  - Files: `tests/check-inline-edit-zoom-pan.mjs`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check code). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `cargo clippy --workspace -- -D warnings` + `cargo fmt --all -- --check`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration. Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Task 1+2**: `fix(inline-edit): audit coordinate paths, clean dead code in render2d.rs` - inline-edit.js, render2d.rs
- **Task 3+4**: `test(inline-edit): add E2E test harness and .fd fixtures` - tests/inline-edit-harness.mjs, site/test-fixtures/
- **Task 5+6+7+8**: `fix(inline-edit): correct textarea overlay positioning for all text scenarios` - inline-edit.js
- **Task 9+10+11+12**: `test(inline-edit): add E2E positioning tests` - tests/check-inline-edit-*.mjs

---

## Success Criteria

### Verification Commands
```bash
just smoke                                  # Expected: PASS
cd fd-vscode && pnpm test                   # Expected: PASS
node tests/check-inline-edit-standalone.mjs  # Expected: all assertions pass
node tests/check-inline-edit-in-shape.mjs    # Expected: all assertions pass
node tests/check-inline-edit-multiline.mjs   # Expected: all assertions pass
node tests/check-inline-edit-zoom-pan.mjs    # Expected: all assertions pass
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All E2E tests pass
- [x] Textarea matches canvas text within 2px at all zoom levels
- [x] Both platforms (site + VS Code) work correctly