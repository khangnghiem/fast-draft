# Agent Memory Harness — Implementation Tasks

> **Change:** `agent-memory-harness`
> **Design:** [`design.md`](./design.md)
> **Proposal:** [`proposal.md`](./proposal.md)
>
> Tasks ordered by dependency. Each task has explicit acceptance and a
> verification command. Mark `[x]` when complete.

## Phase 0 — Prerequisites

- [ ] **0.1** Confirm topic branch `feat/agent-memory-harness` is checked out.
  - Verify: `git branch --show-current` prints `feat/agent-memory-harness`.
- [ ] **0.2** Confirm `gh` CLI authenticated.
  - Verify: `gh auth status` succeeds.
- [ ] **0.3** Confirm `npx tsx` available.
  - Verify: `npx --yes tsx --version` succeeds.

## Phase 1 — Global `memory` Repo

- [ ] **1.1** Create private GitHub repo `memory` under `khangnghiem`.
  - Command: `gh repo create khangnghiem/memory --private --description "Personal memory harness"`.
  - Verify: `gh repo view khangnghiem/memory --json visibility -q .visibility` prints `PRIVATE`.
- [ ] **1.2** Clone to `~/.config/memory/`.
  - Command: `git clone git@github.com:khangnghiem/memory.git ~/.config/memory`.
- [ ] **1.3** Initialize template directory structure per design Section 3 (L4 subsection):
  ```
  README.md preferences.md .gitignore
  lessons/ snippets/ web/ inbox/ templates/ schemas/
  projects/
  cli/index.ts mcp-server/index.ts scripts/check-secrets.sh
  package.json tsconfig.json
  ```
  - Verify: `find ~/.config/memory -maxdepth 2 -type d` lists all required dirs.
- [ ] **1.4** Add `.gitignore`: `node_modules/`, `*.log`, `.DS_Store`, any
  per-machine cache paths.
- [ ] **1.5** First commit + push.
  - Verify: `cd ~/.config/memory && git log --oneline | head -1` shows initial commit.

## Phase 2 — Secrets Hygiene Foundation

- [ ] **2.1** Confirm `~/.zshrc.secrets` exists and is sourced from `~/.zshrc`.
  Create if missing.
- [ ] **2.2** Write `memory/scripts/check-secrets.sh` per design Section 10.
  Patterns: `sk-*`, `ghp_*`, `xoxb-*`, `AKIA*`, generic 32+ base64 in
  credential context.
  - Verify: `bash ~/.config/memory/scripts/check-secrets.sh < <(echo "ghp_abc123...")` exits non-zero.
- [ ] **2.3** Install pre-commit hook in `memory` invoking
  `scripts/check-secrets.sh` over staged files.
  - Verify: attempt to commit a file containing `ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` is blocked.

## Phase 3 — `mem` CLI

- [ ] **3.1** Initialize `package.json` and `tsconfig.json` in `memory/`.
  Dependencies: `tsx`, `yaml`, `zod`, `simple-git`, `commander` (or `cac`).
- [ ] **3.2** Implement `cli/lib/config.ts`: load + validate `.memory/config.yml`
  with Zod schema v1 from design Section 5.
  - Verify: unit test loads valid config; invalid config throws schema error.
- [ ] **3.3** Implement `cli/lib/paths.ts`: resolve `memory_path`,
  `scratch_dir`, `lancedb_path`, `gitnexus_path` from config + env.
- [ ] **3.4** Implement `cli/lib/global.ts`: `read_lesson`, `list_lessons`,
  `read_snippet`, `read_preferences`, `write_preferences`, `write_draft`,
  `write_project_session`, `read_project_readme`, `search` per design 6.
- [ ] **3.5** Implement `cli/lib/repo.ts`: `read_config`, `read_canonical`,
  `read_scratch`, `write_scratch`, `search`, `openspec_status`,
  `openspec_propose`, `openspec_apply`, `openspec_archive` per design 6.
- [ ] **3.6** Implement `cli/lib/sync.ts`: `status`, `pull` (`--ff-only`),
  `push` per design 6 + 9. Scope: `global` | `project` | `both`.
- [ ] **3.7** Implement `cli/lib/promote.ts`: `scratch_to_canonical`,
  `scratch_to_project_global`, `lesson_to_global`. All open draft PRs via `gh`
  except `scratch_to_project_global` which commits in `memory` only.
- [ ] **3.8** Implement `cli/lib/web.ts`: `capture` via webfetch fallback;
  Tavily MCP integration deferred.
- [ ] **3.9** Implement `cli/lib/lance.ts`: stubs returning "not enabled" unless
  `lancedb_path` set.
- [ ] **3.10** Implement `cli/index.ts`: command router for namespaces
  `global / repo / sync / promote / web / lance`.
  - Verify: `npx tsx ~/.config/memory/cli/index.ts repo read-config`
    in Fast Draft repo prints parsed config.
- [ ] **3.11** Add shell alias to `~/.zshrc`:
  `alias mem='npx tsx ~/.config/memory/cli/index.ts'`.
  - Verify: new shell, `mem --help` prints usage.

## Phase 4 — MCP Wrapper

- [ ] **4.1** Add MCP SDK dependency: `@modelcontextprotocol/sdk`.
- [ ] **4.2** Implement `mcp-server/index.ts` importing CLI library functions
  and exposing them as MCP tools with namespaces from design Section 6.
  - Tool ID format: `<namespace>__<tool>` (e.g., `global__read_lesson`).
- [ ] **4.3** JSON schemas for each tool live in `memory/schemas/`.
  Wire via Zod `.zodToJsonSchema`.
- [ ] **4.4** Smoke test: launch MCP via `npx tsx mcp-server/index.ts`, send
  `tools/list` over stdio, verify all tools enumerated.

## Phase 5 — Fast Draft Project Wiring

- [ ] **5.1** Add `.memory/config.yml` at repo root with schema v1 content from
  design Section 5 (`project_id: khangnghiem__fast-draft`).
- [ ] **5.2** Append to `.gitignore`:
  ```
  .scratch/
  .memory/cache/
  .gitnexus/
  .lancedb/
  ```
  Keep `.memory/config.yml` tracked.
  - Verify: `git check-ignore .scratch/foo` succeeds; `git check-ignore .memory/config.yml` fails.
- [ ] **5.3** Create empty `.scratch/` with placeholder `.gitkeep` is NOT done —
  directory created on first write only.
- [ ] **5.4** Create `memory/projects/khangnghiem__fast-draft/` subtree:
  `README.md` (license flags including GitNexus PolyForm note), `lessons/`,
  `sessions/`, `drafts/`, `transcripts/`, `web/`, `attachments/`. Commit + push
  in `memory`.

## Phase 6 — OpenSpec Initialization

- [ ] **6.1** Run `npx -y openspec init` at Fast Draft repo root.
  - Verify: `openspec/config.yaml` exists; existing `openspec/changes/agent-memory-harness/` intact.
- [ ] **6.2** Create capability spec deltas under
  `openspec/specs/agent-memory-harness/` per OpenSpec conventions discovered
  during init.
- [ ] **6.3** Verify `openspec status` lists this change as in-flight.

## Phase 7 — Agent Surfaces

- [ ] **7.1** Add a generic "Memory Harness" section to
  `.agents/shared/canonical.md` per design Section 8 (read `.memory/config.yml`
  first, retrieval order, promotion via PR, secret hygiene).
- [ ] **7.2** Add Fast Draft-specific paths to `.agents/overrides/repo.md`:
  `~/.config/memory/`, `.memory/config.yml`, MCP launch command,
  `project_id: khangnghiem__fast-draft`.
- [ ] **7.3** Run `npm run render:agent-surfaces`. Commit regenerated
  `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`.
  - Verify: `npm run verify:agent-surfaces` passes.
- [ ] **7.4** Register MCP in `.opencode/mcp.json` (create file if absent):
  ```json
  {
    "mcpServers": {
      "mem": {
        "command": "npx",
        "args": ["tsx", "/Users/khangnghiem/.config/memory/mcp-server/index.ts"]
      }
    }
  }
  ```

## Phase 8 — CI Verifier for `.scratch/`

- [ ] **8.1** Add CI job (extend existing GitHub Actions workflow) that fails if
  any PR adds files matching `.scratch/**`.
  - Implementation: `git diff --name-only origin/main...HEAD | grep -E '^\.scratch/' && exit 1 || exit 0`.
  - Verify: open a test PR adding `.scratch/test.md`; CI fails. Remove file; CI passes.

## Phase 9 — Smoke Test (acceptance gate)

- [ ] **9.1** Open OpenCode session in Fast Draft repo.
- [ ] **9.2** Agent calls `repo.read_config` via MCP. Verify parsed config returned.
- [ ] **9.3** Agent calls `repo.search { query: "wgpu" }`. Verify project hits.
- [ ] **9.4** Agent calls `repo.write_scratch { path: "sessions/smoke-test.md", content: "...", mode: "replace" }`.
  - Verify: file exists at `.scratch/sessions/smoke-test.md`; not staged in git.
- [ ] **9.5** Agent calls `promote.scratch_to_project_global { paths: ["sessions/smoke-test.md"] }`.
  - Verify: file copied to `memory/projects/khangnghiem__fast-draft/sessions/smoke-test.md`; commit present in `memory` log.
- [ ] **9.6** Agent calls `sync.push { scope: "global" }`.
  - Verify: `memory` remote has new commit.
- [ ] **9.7** Agent calls `global.list_lessons { project_id: "khangnghiem__fast-draft" }`.
  - Verify: returns project lessons (empty list acceptable).

## Phase 10 — Documentation

- [ ] **10.1** Add Memory Harness entry to `docs/REQUIREMENTS.md`.
- [ ] **10.2** Add changelog entry to `docs/CHANGELOG.md`.
- [ ] **10.3** Update root `README.md` with one-paragraph pointer to
  `MEMORY_INIT.md` and `.memory/config.yml`.

## Phase 11 — Land + Archive

- [ ] **11.1** Push topic branch.
- [ ] **11.2** Open PR with summary linking proposal + design + tasks.
  - PR title: `feat: agent memory harness`.
- [ ] **11.3** After merge: run `openspec archive agent-memory-harness`.
  - Verify: archived change remains under `openspec/changes/` for history;
    `openspec status` no longer lists it as in-flight.
- [ ] **11.4** Tag release point: `git tag harness-v1`.

## Verification matrix (acceptance criteria from design Section 14)

| Criterion | Phase | Verified by |
|----------|-------|-------------|
| `memory` repo with template structure | 1 | 1.3 |
| CLI implements all tools | 3 | 3.10 |
| MCP wrapper implements all tools | 4 | 4.4 |
| `.memory/config.yml` valid schema v1 | 5 | 5.1 + 9.2 |
| `.gitignore` excludes scratch + caches | 5 | 5.2 |
| `openspec/` initialized; this change archives cleanly | 6, 11 | 11.3 |
| Canonical and override agent surface sections | 7 | 7.1, 7.2 |
| `AGENTS.md` regenerated | 7 | 7.3 |
| `verify:agent-surfaces` passes | 7 | 7.3 |
| Pre-commit secret hook installed | 2 | 2.3 |
| CI rejects `.scratch/` files | 8 | 8.1 |
| Smoke test (read → search → write → promote) | 9 | 9.2–9.7 |
| `docs/REQUIREMENTS.md` entry | 10 | 10.1 |
| `docs/CHANGELOG.md` entry | 10 | 10.2 |
