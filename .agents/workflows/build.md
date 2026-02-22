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
