---
description: Systematic debugging using ODD (Observe → Reproduce → Fix) methodology.
---
# /debug

$ARGUMENTS

> **Paradigm**: Observability-Driven Development (ODD) + Test-Driven Development (TDD)
> **Stack**: Rust (fd-core, fd-render, fd-editor), TypeScript (fd-vscode, zed-extensions)

// turbo-all

## Phase 1: Observe (ODD)

Before touching any code, **gather data**.

1. Capture the exact symptom: compiler error, runtime panic, test failure, or unexpected rendering.
2. Evaluate existing logs at the failure point:

| Log Priority | Action |
|-------------|--------|
| `ERROR` / `panic!` | Read first — this is the crash site |
| `WARN` / `eprintln!` | Read second — often the precondition that led to failure |
| `INFO` / `log::info!` | Trace backward for execution path |
| `TRACE` / `dbg!` | Deep-dive only if higher levels are insufficient |

3. Run the failing test or command and capture exact output:
   ```bash
   cargo test --workspace -- --nocapture 2>&1 | tail -50
   ```

4. Isolate to the specific crate:
   ```bash
   cargo test -p fd-core    # or fd-render, fd-editor, fd-wasm
   ```

5. For Rust-specific errors, classify the failure type:

| Error Class | Investigation |
|-------------|--------------|
| **Type / trait mismatch** | Check function signatures, generic bounds, `Into`/`From` impls |
| **Borrow / lifetime** | Trace ownership flow, check `&mut` exclusivity, lifetime annotations |
| **Parse errors** | Test with minimal `.fd` input file first |
| **WASM bridge** | Check serialization boundary (`JsValue`, `serde_wasm_bindgen`) |
| **Layout regression** | Compare constraint solver output: expected vs actual coordinates |

6. If logs are **insufficient**, inject temporary telemetry:
   ```bash
   RUST_LOG=trace cargo test -p <crate> -- <test_name> --nocapture
   ```
   Or add `dbg!()` / `log::trace!()` at key decision points. This is your **first code change** — not a fix attempt.

7. Apply the **5 Whys** to trace from symptom to root cause.

## Phase 2: Reproduce (TDD)

8. Write a **regression test** that reliably reproduces the bug.
   - The test must **fail** (Red) before any fix is applied.
   - For layout bugs: assert coordinate bounds (e.g., `assert!(node.y >= 35.0 && node.y <= 40.0)`).
   - For parser bugs: use a minimal `.fd` fixture as test input.
   - Never skip this step — the test prevents the bug from ever returning.

9. For visual/rendering bugs that can't be unit-tested:
   - Use `browser_subagent` to reproduce the visual failure.
   - Capture a screenshot as evidence of the broken state.

## Phase 3: Fix

10. Implement the **minimal fix** to make the regression test pass (Green).
    - One change at a time. Never batch multiple hypotheses.

11. Clean up: remove `dbg!()` calls, but **keep** any structured `warn!` or `error!` logs that would have caught this faster. These become permanent observability.

12. Re-run the full suite:
    ```bash
    cargo test --workspace
    ```

## Phase 4: Verify & Prevent

13. Verify: regression test Green → `cargo test --workspace` all green → `browser_subagent` screenshot (for rendering bugs).
14. Cross-platform: if bug is CI-only, use `gh cs ssh -c <codespace-name> -- "cargo test --workspace -- --nocapture 2>&1 | tail -80"`.
15. Document a **Debug Report** covering: Symptom → Root Cause (5 Whys) → Regression Test → Fix (before/after) → Prevention (observability added).

---

## Rules & Anti-Patterns

| ✅ Rule | ❌ Anti-Pattern |
|---------|----------------|
| First code change is telemetry, not a fix | Random changes hoping to fix |
| One hypothesis at a time — isolate, test, verify | Multiple changes batched together |
| Every fix must have a regression test | Fixing without a test to guard it |
| Keep structured `warn!`/`error!` logs permanently | Removing error logs to "fix" the noise |
| Fix the root cause, not the surface symptom | "Works on my machine" — no reproduction |
