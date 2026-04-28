### Communication

- If the user writes in Vietnamese, reply in Vietnamese.
- Keep code, identifiers, comments, and project artifacts in English unless explicitly asked otherwise.

### Clean code expectations

- Favor SRP, DRY, KISS, and YAGNI with semantic names and guard clauses.
- Micro-style limits: keep functions around 30 lines or less when practical, prefer at most 3 parameters, and keep nesting to 2 levels; allow exceptions when readability or type constraints demand it.

### Change discipline

- Before edits, identify affected crates, packages, modules, generated outputs, tests, and docs; update dependent surfaces together.
- Use host-native file/content search first; use `rg` for shell content search.
- Check `docs/LESSONS.md` for relevant pitfalls before implementation.
- Before adding or rewriting requirements, inspect `docs/REQUIREMENTS.md`, `docs/CHANGELOG.md`, and `docs/specs/`; extend existing requirements instead of duplicating them.
- Work on topic branches and reviewable PRs; never stage `.env`, tokens, credentials, or other secrets.

### Bounded exploration

- For broad discovery, set scope and budgets up front, search narrowly, read only high-value files, and stop when results stop narrowing.
- Default budget: ≤12 searches, ≤8 reads, ≤4 rounds; ask before exceeding it.
- Return evidence, confidence, files searched/read, gaps, and next queries instead of chasing exhaustive certainty.

### Rust and FD-specific rules

- Parser-facing changes should normally add `parse_<x>`, `emit_<x>`, and `roundtrip_<x>` coverage.
- Prefer explicit `Result` returns in parser/workspace code; parser code may use `Result<T, String>` when appropriate; avoid `unwrap()` on user-controlled library inputs.
- Prefer borrowed `&str` over owned `String` for parser inputs/internal views when clear.
- Keep platform-specific behavior isolated behind clear feature or target gates.
- FD authoring: prefer semantic IDs, relational constraints over brittle coordinates, shared themes/styles, truthful `#` comments, and `spec { ... }` metadata when acceptance intent matters.

### Rendering and interaction quality

- Treat visual bugs as model + layout + bounds + renderer problems; verify the layer that owns the state.
- Keep renderer/platform-specific behavior behind clear target gates such as `#[cfg(target_arch = "wasm32")]`, and preserve `<16ms` layout/paint/sync budgets for interactive canvas paths where relevant.
- Browser-level checks are expected for pointer, layout, resize, drag, hover, selection, and paint regressions.
- Keep visual verification short and focused on the changed behavior.
- Browser/agent protocol: reuse an existing browser agent/session when available and pass its reuse id; start by asking it to inspect the current page before acting, wait for user/app state instead of reloading unless requested, and keep UI checks narrowly scoped.

### Memory harness

- If `.memory/config.yml` exists, start by running `git -C ~/.config/agent-memory pull --ff-only` and `agentmem repo read-config`; continue with local memory if the pull fails and fresh cross-machine context is not required.
- For every new feature, bug, refactor, or investigation, search memory first with 2–4 concrete terms via `agentmem repo search` plus relevant project/global lessons.
- Use `.scratch/` only for ephemeral notes; promote durable lessons through `agentmem promote`, never by bypassing the scratch → project/global → canonical flow.
- `/memory-sync` is only for `~/.config/agent-memory`; keep it separate from project git operations.
- Secret hygiene applies to both the project repo and memory repo.

### Completion

- Run the relevant build, test, lint, format, or browser check for the touched area; state any skipped validation and why.
- Report changed files, commands run, command results, and remaining risks.
