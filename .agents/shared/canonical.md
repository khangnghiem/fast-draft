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

### Codebase exploration contract

When delegating or performing broad codebase exploration, optimize for an evidence map rather than exhaustive discovery.

- Start with a bounded prompt: scope, known target symbols or terms, search budget, file-read budget, and expected output format.
- Default to at most 12 searches, 8 file reads, 4 search rounds, and 3 files opened per round; for explicitly large scopes use at most 18 searches, 12 file reads, 5 rounds, and 4 files per round.
- Never exceed 24 searches, 16 file reads, or 6 rounds unless the user explicitly asks for deeper exploration.
- A search round is one hypothesis → targeted search → rank files → read top files → evidence update cycle.
- Search ladder: use file-pattern search once when the path family is unknown, use `rg` or the host-native content search for targeted text matches, use AST-aware search when available for structural matches, read only the highest-value files, then stop and summarize.
- Stop early and return a partial report when two rounds add no useful evidence, queries become near-duplicates, candidate files do not narrow, results stay broad after discovery, or 75% of the search budget is gone with confidence below 0.5.
- Treat useful negative searches as evidence; track queries already issued and do not keep reformulating the same query.
- Do not spawn nested exploration agents unless the caller explicitly allows it; if allowed, use at most two child agents with disjoint scopes and smaller budgets.
- Always return a structured report with status, confidence, scope assessment, budget used, primary findings with path evidence, files examined, searches performed, symbols found, unanswered questions, suggested next queries, stuck signals, and handoff notes.

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

### Memory harness

This repo is wired into the [agent-memory](https://github.com/khangnghiem/agent-memory) harness (`~/.config/agent-memory/`). When working in a project with `.memory/config.yml`, follow this contract.

- **Read `.memory/config.yml` first.** It declares `project_id`, `canonical_doc_paths`, `scratch_dir`, and optional indices. Use the host's `agentmem repo read-config` (CLI) or `repo__read_config` (MCP) — never re-derive paths.
- **Automate session-start memory retrieval.** On the first turn in an adopted repo, run `git -C ~/.config/agent-memory pull --ff-only` and `agentmem repo read-config` before planning. If the pull fails, report it and continue only with local memory unless the task requires fresh cross-machine context.
- **Automate pre-plan memory lookup.** For every new feature, bug, refactor, or investigation prompt, extract 2–4 concrete search terms and query `agentmem repo search` plus relevant project/global lessons before proposing a plan. Keep this quiet unless the retrieved context changes the plan or reveals a warning.
- **Retrieval order**: open files → canonical docs (via `repo.search`, scoped by `canonical_doc_paths`) → per-project subtree under `~/.config/agent-memory/projects/<project_id>/` → global lessons / snippets / web → external web (last resort, `web.capture`).
- **Use `.scratch/` as ephemeral working memory.** It is gitignored. Write freely and silently with `agentmem repo write-scratch <path>` (stdin = body) during planning/debugging. Promote to the per-project subtree with `agentmem promote scratch_to_project_global` when worth keeping; promote to canonical docs via draft PR with `agentmem promote scratch_to_canonical`.
- **Promotion requires judgment.** Do not automatically promote scratch notes into durable project/global/canonical memory unless the user has explicitly requested that promotion. Propose a concise promotion when a lesson is durable.
- **Never bypass the promotion contract.** Writes flow upward: `.scratch/` → per-project subtree → global. Cross-repo promotions go through draft PRs in the destination repo, never direct pushes to `main`.
- **Secret hygiene is shared.** The harness pre-commit hook rejects `sk-*`, `ghp_*`, `xoxb-*`, `AKIA*`, and 32+ char base64 in credential context. Do not stage `.env` files or tokens in either repo.
- **Sync model**: memory sync is separate from project `/sync-push`. Use `/memory-sync` for `~/.config/agent-memory` only. It inspects dirty state before pulling, may auto-push clean committed-ahead memory, may commit known durable promotion outputs after scanning exact paths and staged content, and must stop for unknown dirty files or non-fast-forward state. No daemons.

If `.memory/config.yml` is absent, the repo has not adopted the harness — fall back to `docs/` and `openspec/` directly and do not invent paths.

### Completion checklist

- Relevant build, test, lint, and format checks passed, or were skipped with a stated reason.
- Tests were added or updated when behavior changed materially.
- No broken cross-file dependencies remain.
- No avoidable panic paths remain on user-controlled library inputs.
- The completion report clearly states what changed and what was validated.
