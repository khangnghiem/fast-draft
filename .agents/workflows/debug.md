---
description: Systematic debugging methodology for problem investigation
---

# Debug Workflow

1. **Reproduce**: Run the failing test or command and capture exact error output:

   ```bash
   cargo test --workspace -- --nocapture 2>&1 | tail -50
   ```

2. **Isolate**: Narrow down to the specific crate:

   ```bash
   cargo test -p ftd-core    # or ftd-render, ftd-editor
   ```

3. **Read the error**: Parse the compiler/runtime error carefully. For Rust:
   - Type errors → check function signatures and trait bounds
   - Borrow errors → check lifetimes and ownership flow
   - Parse errors → test with minimal `.ftd` input first

4. **Trace**: Add `log::trace!()` or `dbg!()` at key points, then run:

   ```bash
   RUST_LOG=trace cargo test -p <crate> -- <test_name> --nocapture
   ```

5. **Fix**: Make the smallest change that fixes the issue.

6. **Verify**: Re-run the full test suite:

   ```bash
   cargo test --workspace
   ```

7. **Clean up**: Remove any `dbg!()` calls before committing.
