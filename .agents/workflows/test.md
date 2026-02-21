---
description: Write tests before implementation (TDD)
---

# Test Workflow

// turbo-all

1. **Identify what to test**: Read the acceptance criteria from the spec or PR description.

2. **Write tests FIRST** in the relevant crate:
   - Parser features → `crates/fd-core/src/parser.rs` (in `mod tests`)
   - Emitter features → `crates/fd-core/src/emitter.rs` (in `mod tests`)
   - Layout features → `crates/fd-core/src/layout.rs` (in `mod tests`)
   - Sync features → `crates/fd-editor/src/sync.rs` (in `mod tests`)
   - Hit testing → `crates/fd-render/src/hit.rs` (in `mod tests`)

3. **Test naming convention**:

   ```rust
   #[test]
   fn parse_<feature>() { ... }

   #[test]
   fn emit_<feature>() { ... }

   #[test]
   fn roundtrip_<feature>() { ... }

   #[test]
   fn layout_<feature>() { ... }

   #[test]
   fn sync_<direction>_<feature>() { ... }
   ```

4. **Run tests** to confirm they fail (red):

   ```bash
   cargo test --workspace
   ```

5. **Implement** the feature to make tests pass (green).

6. **Run again** to confirm green:

   ```bash
   cargo test --workspace
   ```

7. **Check for regressions**:

   ```bash
   cargo test --workspace -- --nocapture 2>&1 | tail -20
   ```

8. **Edge cases to always test**:
   - Empty / missing input
   - Nested structures (groups within groups)
   - Special characters in strings / IDs
   - Round-trip: parse → emit → re-parse produces identical graph
   - Boundary values (0-size rect, empty path)
