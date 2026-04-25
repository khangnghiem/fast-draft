### Language and communication

- If the user writes in Vietnamese, reply in Vietnamese.
- Keep source code, identifiers, comments, and structured project artifacts in English unless the user explicitly asks otherwise.

### Clean code expectations

- Favor SRP, DRY, KISS, and YAGNI.
- Use semantic names that reveal intent.
- Prefer small functions, limited argument lists, shallow nesting, and guard clauses.
- Fix root causes instead of layering one-off patches.

### Dependency-aware changes

Before changing any file:

1. Identify dependent crates, packages, modules, tests, and docs.
2. Update all affected surfaces together.
3. Never leave broken imports, trait bounds, types, or generated outputs behind.
4. After cross-boundary changes, run the relevant validation for the impacted area.

### Lessons and requirement hygiene

- Check `docs/LESSONS.md` for relevant pitfalls before implementation.
- If you uncover a repeated pitfall, document it so the next change starts with the lesson.
- Before adding or rewriting a requirement, search `docs/REQUIREMENTS.md`, `docs/CHANGELOG.md`, and `docs/specs/` first.
- If an existing requirement already covers the behavior, extend it instead of duplicating it.

### Search tool hygiene

- Prefer the host-native content-search tool when searching file contents.
- When shell-based content search is necessary, use `rg` instead of `grep`.
- Use shell `grep` only when `rg` is unavailable or a specific environment constraint requires it, and state the reason briefly.

### Branch, review, and secret safety

- Never work directly on `main`.
- Use a topic branch and land changes through reviewable pull requests.
- Sync from the latest `main` when branching or preparing a pull request.
- Never stage or commit `.env` files, tokens, API keys, or other secrets.

### Rust and workspace patterns

| Pattern | Expectation |
| --- | --- |
| Error handling | Prefer explicit `Result` returns in parser and workspace code, and avoid `unwrap()` on user-controlled paths in library code. |
| Ownership | Prefer borrowing over cloning when it keeps the code clear. |
| Lifetimes | Let the compiler infer lifetimes unless explicit annotations improve correctness or readability. |
| Generics | Use generics only when they add real leverage; prefer concrete types otherwise. |
| Platform gates | Keep platform-specific behavior isolated behind clear feature or target gates. |

- Parser-facing changes should normally add `parse_<x>`, `emit_<x>`, and `roundtrip_<x>` coverage.

### FD authoring rules

> [!IMPORTANT]
> Code-oriented output should optimize for agent readability and correctness before token compression.

| Rule | Guidance |
| --- | --- |
| Semantic IDs | Prefer intent-rich identifiers such as `@login_form` over opaque auto-numbered names. |
| Constraints over coords | Prefer relational layout constraints over brittle pixel-only positioning when the design allows it. |
| Accurate comments | Keep `#` comments truthful and useful; stale comments are worse than none. |
| Theme reuse | Reuse shared theme or style definitions instead of repeating ad-hoc values. |
| Structured intent | Use `spec { ... }` metadata when intent, status, or acceptance details matter. |
| Clear shorthand | Short forms are fine when they stay unambiguous in context. |

### Rendering and interaction quality

- Treat visual bugs as multi-layer problems: confirm model, layout, bounds, and renderer all agree.
- Preserve responsive interaction and stable visual state across resize, drag, hover, and selection flows.
- Prefer browser-level verification for pointer, layout, resize, drag, and paint regressions.
- Keep visual verification short and focused. Reuse an existing browser session or page when the host supports it.
- If a browser rule must reach a secondary executor, place it directly in the verification instructions instead of relying only on a higher-level policy file.

### Completion checklist

- Relevant build, test, lint, and format checks passed, or were skipped with a stated reason.
- Tests were added or updated when behavior changed materially.
- No broken cross-file dependencies remain.
- No avoidable panic paths remain on user-controlled library inputs.
- The completion report clearly states what changed and what was validated.
