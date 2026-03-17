---
description: Quick sanity check — run before committing or as a lightweight CI gate
---

# Smoke Workflow

> Fast sanity check: compile → lint → test. Runs in ~30s. Use before `/yolo` or after large refactors.

// turbo-all

1. **Check** all crates compile:

   ```bash
   cargo check --workspace
   ```

2. **Lint**:

   ```bash
   cargo clippy --workspace -- -D warnings
   ```

3. **Test**:

   ```bash
   cargo test --workspace
   ```

4. **Format check** (non-mutating):

   ```bash
   cargo fmt --all -- --check
   ```

5. **Tauri desktop check** (excluded from workspace):

   ```bash
   cd fd-desktop/src-tauri && cargo check && cargo clippy -- -D warnings && cargo fmt -- --check
   ```

6. **Live site health check** (if on `main` or post-merge):

   ```bash
   curl -sL -o /dev/null -w '%{http_code}' https://fast-draft.com
   ```

   Should return `200`. If not, check `gh run list --workflow=pages.yml --limit 1`.

7. **Report** results to user. If all pass, it's safe to `/yolo`.

---

## If Errors Appear

**Remote smoke via Codespace** (clean Linux environment, mirrors CI):

```bash
gh cs list
gh cs ssh -c <codespace-name> -- "cargo check --workspace && cargo clippy --workspace -- -D warnings && cargo test --workspace 2>&1 | tail -80"
```

> Requires `gh auth refresh -h github.com -s codespace` (one-time setup).
> Use this when errors don't reproduce locally or when you suspect a toolchain/platform difference.
