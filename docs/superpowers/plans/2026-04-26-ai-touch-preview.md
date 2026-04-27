# AI Touch Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single AI Touch workflow where selected canvas nodes are refined by AI, previewed visually on canvas, then accepted as one undoable edit or rejected with no undo entry.

**Architecture:** Add Rust/WASM preview state to keep baseline text and selection while previewing candidate FD. Add a focused browser-side `AiTouchSession` that owns request, preview, accept, reject, and chat-code-block routing. Keep current `/api/ai` refine response compatible and defer server-side structured proposals.

**Tech Stack:** Rust `fd-wasm`/`fd-editor`, vanilla ES modules in `site/`, CodeMirror, Playwright E2E, existing Cloudflare `/api/ai` endpoint.

---

### Task 1: WASM Preview State

**Files:**
- Modify: `crates/fd-wasm/src/lib.rs`
- Create: `crates/fd-wasm/src/ai_touch.rs`
- Modify: `crates/fd-wasm/src/tests.rs`

- [ ] Add failing Rust tests for `ai_begin_preview`, `ai_apply_preview`, `ai_discard_preview`, and `ai_commit_preview`.
- [ ] Implement `AiPreviewState` in `FdCanvas` with `baseline_id`, `baseline_text`, `preview_text`, and `selected_ids`.
- [ ] Implement preview methods that parse-before-preview, leave invalid candidates untouched, restore baseline on reject, and push one snapshot on commit.
- [ ] Run `cargo test -p fd-wasm ai_preview` and confirm passing.

### Task 2: Browser AI Touch Session

**Files:**
- Create: `site/canvas-core/ai-touch/session.js`
- Create: `site/canvas-core/ai-touch/types.d.ts`
- Modify: `site/app.js`
- Modify: `site/ai-chat.js`

- [ ] Add an E2E test that fails because no session preview path exists.
- [ ] Create `AiTouchSession` with `start`, `previewCandidate`, `accept`, `reject`, and `previewFdCode` methods.
- [ ] Route the toolbar AI Touch button through `AiTouchSession.start()`.
- [ ] Route chat Apply/Replace buttons through `AiTouchSession.previewFdCode()` instead of immediate editor mutation.
- [ ] Ensure preview mutates canvas only; editor text changes only on accept.

### Task 3: UI and Safety

**Files:**
- Modify: `site/css/ai.css`
- Modify: `site/canvas-core/ai-touch/session.js`
- Modify: `site/app.js`

- [ ] Reuse the existing AI diff toolbar for preview Accept/Reject.
- [ ] Add baseline hash checks before accept.
- [ ] Surface invalid FD parse errors without entering preview.
- [ ] Preserve selected IDs on reject and after accept when IDs still exist.

### Task 4: Browser E2E and Manual QA

**Files:**
- Create: `tests/ai_touch_session.mjs`

- [ ] Mock `/api/ai` deterministically with Playwright routing.
- [ ] Cover selected-node preview → reject restores baseline.
- [ ] Cover selected-node preview → accept updates editor and undo restores baseline.
- [ ] Cover invalid FD response leaves baseline unchanged.
- [ ] Capture screenshots/logs for manual review.

### Task 5: Verification

- [ ] Build and copy WASM with `wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm --quiet && cp -a fd-vscode/webview/wasm/. site/wasm/`.
- [ ] Run `cargo test -p fd-wasm ai_preview`.
- [ ] Run `node tests/check_wasm.mjs`.
- [ ] Run `node tests/ai_touch_session.mjs`.
- [ ] Run `just smoke`.
- [ ] Run browser/manual QA and inspect console/page errors.

Self-review: this plan covers the approved scope, contains no placeholder tasks, and intentionally defers server-side typed `mode:'touch'` until the shared preview/apply path is stable.
