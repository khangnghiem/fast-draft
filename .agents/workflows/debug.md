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
   cargo test -p fd-core    # or fd-render, fd-editor
   ```

3. **Read the error**: Parse the compiler/runtime error carefully. For Rust:
   - Type errors → check function signatures and trait bounds
   - Borrow errors → check lifetimes and ownership flow
   - Parse errors → test with minimal `.fd` input first

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

8. **Remote Debug** (if bug only reproduces in CI/Linux, not locally):

   One-off command in Codespace:

   ```bash
   gh cs ssh -c <codespace-name> -- "cargo test --workspace -- --nocapture 2>&1 | tail -80"
   ```

   Or open an interactive shell for deeper investigation:

   ```bash
   gh cs ssh -c <codespace-name>
   ```

   > **Note**: Requires `gh auth refresh -h github.com -s codespace` (one-time setup). List available codespaces with `gh cs list`.

9. **Backend Debugging via Modal** (if the issue involves a deployed Modal server):

   To check backend logs for integration debugging:
   
   ```bash
   # View recent logs from the Modal app (replace <app-name> with the actual deployment name)
   modal app logs <app-name>
   
   # Or tail logs continuously during testing
   modal app logs -f <app-name>
   ```
   
   > **Note**: Requires `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` to be set in your `.env` or environment.
