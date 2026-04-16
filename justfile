# FD – Development Task Runner
# Install: cargo install just
# Usage:  just smoke    — quick pre-commit gate
#         just test     — full test suite
#         just extended — full + proptest / nextest
#         just wasm     — build WASM + copy to site/vscode
#         just ci       — smoke + wasm + tauri + ts (full local CI gate)

# Default: run smoke check
default: smoke

# ─── Smoke (fast gate) ─────────────────────────────────────────────
smoke:
    @echo "🔍 Checking compilation…"
    cargo check --workspace
    @echo "🧹 Clippy…"
    cargo clippy --workspace -- -D warnings
    @echo "📝 Format check…"
    cargo fmt --all -- --check
    @echo "🧪 Running tests…"
    cargo test --workspace
    @echo "✅ Smoke passed"

# ─── Full Test Suite ───────────────────────────────────────────────
test:
    cargo test --workspace

# ─── Extended (nextest + proptest) ────────────────────────────────
extended:
    @echo "🧪 Running extended tests with nextest…"
    cargo nextest run --workspace
    @echo "🎲 Property-based tests…"
    cargo test --workspace -- --include-ignored
    @echo "✅ Extended passed"

# ─── Individual commands ──────────────────────────────────────────
check:
    cargo check --workspace

clippy:
    cargo clippy --workspace -- -D warnings

fmt:
    cargo fmt --all -- --check

fix:
    cargo fmt --all
    cargo clippy --workspace --fix --allow-dirty

# ─── WASM Build ────────────────────────────────────────────────────
wasm:
    @echo "🔧 Building WASM…"
    wasm-pack build crates/fd-wasm --target web --out-dir ../../fd-vscode/webview/wasm --quiet
    @echo "📦 Copying to site/wasm…"
    cp -a fd-vscode/webview/wasm/. site/wasm/
    @echo "✅ WASM built and copied"

# ─── Full CI Gate (local) ──────────────────────────────────────────
ci: smoke wasm tauri ts
    @echo "🚀 Full CI gate passed — ready to deploy"

# ─── Tauri Desktop Check ──────────────────────────────────────────
tauri:
    @echo "🖥️  Checking Tauri desktop…"
    cd fd-desktop/src-tauri && cargo check --quiet && cargo clippy --quiet -- -D warnings && cargo fmt -- --check
    @echo "✅ Tauri desktop passed"

# ─── VS Code Extension TS Tests ──────────────────────────────────
ts:
    @echo "🧪 Running VS Code TS tests…"
    cd fd-vscode && pnpm install && pnpm test
    @echo "✅ TS tests passed"
