---
description: Systematic debugging using ODD (Observe → Reproduce → Fix) methodology.
---
# /debug

$ARGUMENTS

> **Paradigm**: Observability-Driven Development (ODD) + Test-Driven Development (TDD)

// turbo-all

## Phase 1: Observe (ODD)

Before touching any code, **gather data**.

1. Capture the exact symptom: error message, stack trace, screenshot, or unexpected behavior.
2. Ask the user clarifying questions if symptom is ambiguous. **Wait for answers.**
3. Evaluate existing logs at the failure point:

| Log Priority | Action |
|-------------|--------|
| `ERROR` | Read first — this is the crash site |
| `WARN` | Read second — often the precondition that led to failure |
| `INFO` | Trace backward to reconstruct the execution path |
| `DEBUG` | Deep-dive into state only if higher levels are insufficient |

4. If existing logs are **insufficient**, inject temporary telemetry:
   - Add structured `DEBUG` logging around the suspected area.
   - Rerun the failing scenario to capture the exact state at failure.
   - This is your **first code change** — not a fix attempt.

5. Apply the **5 Whys** to trace from symptom to root cause:
   ```
   WHY did the user see an error? → API returned 500
   WHY did the API return 500?    → Database query failed
   WHY did the query fail?        → Table doesn't exist
   WHY doesn't the table exist?   → Migration skipped in deploy
   WHY was migration skipped?     → Deploy script has no migration step ← ROOT CAUSE
   ```

## Phase 2: Reproduce (TDD)

6. Write a **regression test** that reliably reproduces the bug.
   - The test must **fail** (Red) before any fix is applied.
   - Never skip this step — the test prevents the bug from ever returning.

7. For UI/visual bugs that can't be unit-tested:
   - Use `browser_subagent` to reproduce the visual failure.
   - Capture a screenshot as evidence of the broken state.

## Phase 3: Fix

8. Implement the **minimal fix** to make the regression test pass (Green).
   - One change at a time. Never batch multiple hypotheses into one fix.

9. Clean up temporary debug logs, but **keep** any structured `WARN` or `ERROR` logs that would have caught this faster. These become permanent observability improvements.

10. Re-run the **full** test suite to confirm zero regressions.

## Phase 4: Verify & Prevent

11. Verify the fix:

| Verification Type | Method |
|-------------------|--------|
| **Functional** | Regression test passes (Green) |
| **Visual** | `browser_subagent` screenshot confirms fix (for UI bugs) |
| **Full suite** | All existing tests still pass |

12. Document a **Debug Report** covering: Symptom → Root Cause (5 Whys chain) → Regression Test (file + test name) → Fix (before/after) → Prevention (what observability was added).
13. Formulate a learning: Ask yourself, "What project-level rule or constraint would prevent this class of bug?" and execute the `/learn` workflow to codify this insight.
---

## Rules & Anti-Patterns

| ✅ Rule | ❌ Anti-Pattern |
|---------|----------------|
| First code change is telemetry, not a fix | Random changes hoping to fix |
| One hypothesis at a time — isolate, test, verify | Multiple changes batched together |
| Every fix must have a regression test | Fixing without a test to guard it |
| Keep structured `WARN`/`ERROR` logs permanently | Removing error logs to "fix" the noise |
| Fix the root cause, not the surface symptom | "Works on my machine" — no reproduction |
| Read logs and measure before guessing | Guessing without data |
| Follow prior context in this conversation | Ignoring recommendations from a preceding /research or /review |
