---
description: How to build, test, and develop the FD workspace
---

# Build Workflow

// turbo-all

1. Check all crates compile:

   ```bash
   cargo check --workspace
   ```

2. Run all tests:

   ```bash
   cargo test --workspace
   ```

3. Run a specific crate's tests:

   ```bash
   cargo test -p fd-core
   cargo test -p fd-render
   cargo test -p fd-editor
   ```

4. Build for WASM (when ready):

   ```bash
   wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm
   ```

5. Build the VS Code extension (when ready):

   ```bash
   cd fd-vscode && npm install && npm run compile
   ```

6. Lint:

   ```bash
   cargo clippy --workspace -- -D warnings
   ```

7. Format:

   ```bash
   cargo fmt --all
   ```

8. Check Tauri desktop crate (excluded from workspace):

   ```bash
   cd fd-desktop/src-tauri && cargo check && cargo clippy -- -D warnings && cargo fmt -- --check
   ```

9. Build Tauri desktop app (for local testing):

   ```bash
   cd fd-desktop && npm install && npm run build
   ```

10. **Remote Smoke Test** (if results differ from CI, use Codespace for a clean Linux environment):

   ```bash
   gh cs list
   gh cs ssh -c <codespace-name> -- "cargo check --workspace && cargo test --workspace 2>&1 | tail -80"
   ```

   > Requires `gh auth refresh -h github.com -s codespace` (one-time setup).
