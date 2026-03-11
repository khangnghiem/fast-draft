---
description: Publish all FD packages to their respective registries
---

# Publish Workflow

> [!IMPORTANT]
> **Every release MUST publish to ALL registries. Never publish to just one.**

// turbo-all

---

## Pre-flight Checks

1. **Read `.env`** for registry tokens:
   - `CARGO_REGISTRY_TOKEN`, `NPM_TOKEN`, `VSCE_PAT`, `VSX_PAT`
   - `GEMINI_API_KEY` (for AI features in fd-vscode)

2. **Verify CI passes** (local + remote):

   ```bash
   cargo clippy --workspace -- -D warnings && cargo test --workspace
   ```

   If there's an open PR, also wait for remote CI:

   ```bash
   gh pr checks <PR_NUMBER> --watch --fail-fast
   ```

3. **Bump versions** in all affected `Cargo.toml` / `package.json`

4. **Update CHANGELOG**

---

## Publish Order (dependencies first)

```
fd-core → fd-lsp → tree-sitter-fd → fd-vscode (Marketplace + Open VSX)
```

### Rust Crates (crates.io)

```bash
cargo publish -p fd-core
```

```bash
cargo publish -p fd-lsp
```

### tree-sitter-fd (npm)

```bash
cd tree-sitter-fd && npm publish
```

### fd-vscode (VS Code Marketplace + Open VSX)

```bash
cd fd-vscode && pnpm run compile
```

```bash
cd fd-vscode && pnpm vsce publish
```

```bash
cd fd-vscode && pnpm ovsx publish -p <VSX_PAT from .env>
```

> **NEVER** publish to only one registry — both Marketplace AND Open VSX are required.

---

## Post-publish

5. **Create git tag**:

   ```bash
   git tag v0.x.y && git push origin v0.x.y
   ```

   > This also triggers the **Zed extension update** automatically via `huacnlee/zed-extension-action`.
   > It creates a PR to `zed-industries/extensions` with the updated submodule pointer.

6. **Site auto-deploys** — merging to `main` triggers `.github/workflows/pages.yml`, which rebuilds WASM and deploys `site/` to [fast-draft.com](https://fast-draft.com). No manual deploy needed.

7. Report publish results to user.
