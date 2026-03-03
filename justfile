# FD – Development Task Runner
# Install: cargo install just
# Usage:  just smoke    — quick pre-commit gate
#         just test     — full test suite
#         just extended — full + proptest / nextest

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
