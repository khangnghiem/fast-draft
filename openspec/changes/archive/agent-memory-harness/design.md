# Agent Memory Harness — Design

> **Status:** Canonical design. Authoritative copy.
>
> A brainstorming snapshot exists at
> `docs/superpowers/specs/2026-04-26-agent-memory-harness-design.md`.
> That snapshot freezes the design at brainstorming time and points here for
> the living version.

## 1. Goals and Non-Goals

### Goals

- **Persistent memory** across sessions and machines for AI coding agents.
- **Tool-agnostic**: works under OpenCode today, survives migration to Claude Code,
  Cursor, Aider, Copilot CLI, or whatever ships next.
- **Multi-machine**: single dev now using multiple macOS machines, future small team.
- **Layered separation** of ephemeral / project-scratch / project-canonical /
  code-intel / global / web layers, each with explicit ownership and lifecycle.
- **Markdown canonical**: ripgrep is the canonical search. Vector and graph stores
  are disposable caches, never canonical.
- **Explicit promotion**: nothing becomes durable knowledge without human PR review.
- **Secret hygiene**: agents never write secret-shaped strings into memory; only
  reference environment variable names.

### Non-Goals

- **Cloud memory services.** No Mem0 cloud, Zep cloud, Supermemory, Pinecone.
- **Real-time sync daemons.** All sync is `git pull` at session start, `git push` at
  session end.
- **Agent host parity beyond MCP and CLI.** We do not target proprietary memory
  APIs of individual agents (e.g., Cursor `.cursorrules` auto-load, Claude Code
  project files). AGENTS.md instructions and the `agentmem` CLI are the portable
  contract.
- **Knowledge graph / temporal memory.** Defer Graphiti / Zep until markdown +
  ripgrep + LanceDB demonstrably fall short.
- **Auto-capture / auto-summarization.** All writes to durable layers are explicit
  agent or human actions, not background ingestion.

## 2. Priority Order

When trade-offs collide:

1. **Experimentation** — make it cheap to try new patterns and discard them.
2. **Autonomy** — agents can operate end-to-end without humans in the loop except at
   the promotion gate.
3. **Parity** — host-independent behavior; the same agent action works on any
   machine.
4. **Reliability** — durability and consistency are important but yield to the above
   when in conflict.

## 3. Layer Cake

| Layer | Name | Storage | Owner | Promotion target |
|------|------|---------|-------|------------------|
| L0 | Ephemeral session memory | Agent chat, in-memory todos | Agent | L1 (selective) |
| L1 | Project local scratch | `.scratch/` in project repo (gitignored, local-only) | Local machine | L2 or L4 (selective, via PR or `global.write_project_*`) |
| L2 | Project canonical | Project repo (`docs/`, `openspec/`, `.memory/config.yml`) | Project | L4 (cross-project lessons only) |
| L3 | Code intelligence | `.gitnexus/`, `.lancedb/`, `.memory/cache/` (gitignored) | Local only | None — rebuildable |
| L4 | Global memory | `agent-memory` repo, with global content at root and project-scoped content under `projects/<id>/` | Personal | None — terminal layer |
| L5 | Web research cache | `agent-memory/web/` (global) or `agent-memory/projects/<id>/web/` (project) | Personal | None — captures only |

### L0 — Ephemeral Session Memory

In-session scratchpad: agent-internal todos, mid-conversation reasoning, draft
prompts. Not persisted. Lost on session end.

- Storage: agent chat context + the host's TODO mechanism (`todowrite` in OpenCode).
- Promotion: agent must explicitly call `repo.write_scratch` (to L1 local) or
  `global.write_project_session` (to L4 cross-machine) to persist anything from L0.

### L1 — Project Local Scratch (`.scratch/`)

A gitignored directory at the project repo root for ephemeral notes that don't
need cross-machine sync.

```
<project>/
  .scratch/                  (gitignored — local only)
    sessions/                YYYY-MM-DD.md
    experiments/             throwaway code spikes
    drafts/                  WIP designs before promotion
    transcripts/             chat captures
```

- **Why local-only and not synced**: most session notes are ephemeral context for
  the machine you were working on. Cross-machine continuity for project work
  belongs in L4 (`agent-memory/projects/<id>/`) where it's explicit.
- **Why a directory in the project repo and not a separate repo**: avoids the
  privacy leak risk for public repos (Fast Draft is public — anything tracked is
  public; `.scratch/` is gitignored so nothing leaks), removes one repo's worth
  of clone/pull/push overhead, eliminates the "where does this go?" decision
  per file.
- **Lifecycle**: agent or human prunes `.scratch/` periodically. Anything
  worth keeping moves to L4 via `global.write_project_session` or
  `promote.scratch_to_project_global`. Anything worth promoting to canonical
  project docs moves via `promote.scratch_to_canonical` (opens draft PR).
- **No `.scratch/` content is ever committed.** Verifier in CI rejects PRs that
  add `.scratch/` paths.

### L2 — Project Canonical

The project repo itself, including:

- `docs/REQUIREMENTS.md`, `docs/LESSONS.md`, `docs/CHANGELOG.md` — existing
  registries.
- `docs/specs/<feature>.md` — durable feature specs.
- `docs/superpowers/specs/<date>-<topic>-design.md` — brainstorming snapshots
  produced by the Superpowers brainstorming skill (process artifacts).
- `openspec/changes/<change>/{proposal,design,tasks}.md` — in-flight changes.
- `openspec/specs/<capability>/` — capability specifications.
- `.memory/config.yml` — committed memory harness config.
- `.agents/shared/canonical.md` and `.agents/overrides/repo.md` — agent surface
  source files.
- Generated `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` — never hand-edited.

### L3 — Code Intelligence

Local, regenerable indexes. Always gitignored.

- **ripgrep** — canonical exact text search.
- **ast-grep** — structural code search.
- **GitNexus** — code graph (definitions, references, call chains, blast radius).
  Index in `.gitnexus/`. License: PolyForm Noncommercial 1.0.0; flagged in
  `agent-memory/projects/khangnghiem__fast-draft/README.md` as "license review
  required before monetization."
- **LanceDB** (optional) — embedded vector + FTS for semantic retrieval. Index in
  `.memory/cache/lancedb/`. Apache 2.0. Used only when ripgrep + ast-grep + GitNexus
  prove insufficient.

### L4 — Global Memory (`agent-memory`)

Single private GitHub repo, cloned to `~/.config/memory/`. Holds both
truly global content (reusable across projects) and project-scoped content that
must survive across machines.

```
~/.config/memory/
  README.md
  preferences.md                       (durable user preferences)
  lessons/         YYYY-MM-DD-<slug>.md   (cross-project lessons)
  snippets/        <topic>.md             (reusable code snippets)
  web/             <source>/<slug>.md     (global web captures)
  inbox/                                  (unsorted captures awaiting promotion)
  templates/                              (lesson/snippet templates)
  schemas/                                (JSON schemas for tool args)
  projects/                               (project-scoped content, namespaced by id)
    <owner>__<repo>/
      README.md                           (project overview, license flags, deploy quirks)
      lessons/      YYYY-MM-DD-<slug>.md  (project-specific; promote up to ../../lessons/ if generalizable)
      sessions/     YYYY-MM-DD.md         (cross-machine session logs)
      drafts/                             (WIP designs)
      transcripts/                        (chat/meeting captures)
      web/          <source>/<slug>.md    (project-scoped web captures)
      attachments/                        (screenshots, diagrams, binaries)
  cli/             index.ts               (agentmem CLI entry)
  mcp-server/      index.ts               (MCP wrapper entry)
  scripts/         check-secrets.sh       (pre-commit secret scanner)
  package.json
  tsconfig.json
  .gitignore
```

- **Sync**: `git pull` at session start, `git push` at session end. No daemons.
- **Naming**: lessons use `YYYY-MM-DD-<slug>.md`; project subtrees use
  `<owner>__<repo>/` (double-underscore separator avoids collision with
  `repo.subpath`-style names).
- **Generalization promotion**: a lesson in `projects/<id>/lessons/` that proves
  generalizable moves up to `lessons/` (drop the project tag) via
  `promote.lesson_to_global`.
- **No frontmatter.** Optional HTML-comment tag block at top of file:
  `<!-- tags: rust, wgpu, async -->`.

### L5 — Web Research Cache

Web captures from Tavily MCP or manual snapshots. Routing:

- **Global captures** (general references, language idioms, library docs) →
  `~/.config/memory/web/<source>/<slug>.md`.
- **Project captures** (one-off research tied to a specific project) →
  `~/.config/memory/projects/<id>/web/<source>/<slug>.md`.

Routing decided by the `web.capture` tool's `target` argument
(`"global" | "project" | "both"`), defaulted from `.memory/config.yml`'s
`web_capture_target` key. The `project_id` for project routing comes from
`.memory/config.yml`'s `project_id` key.

## 4. Retrieval Order

When an agent answers a question about the project or code, it consults sources
in this order. Stop at the first sufficient answer.

1. **OpenSpec change context** (if `openspec/changes/<active>/` exists):
   skim `proposal.md` and `design.md` to understand current intent and scope.
2. **Project canonical**: `docs/REQUIREMENTS.md`, `docs/LESSONS.md`, `docs/specs/`,
   plus relevant `.agents/` content.
3. **Project scratch (local)**: `.scratch/sessions/`, `.scratch/drafts/`.
4. **Project content in global memory**: `agent-memory/projects/<id>/sessions/`,
   `agent-memory/projects/<id>/lessons/`.
5. **Code search**: `ripgrep` for exact strings; `ast-grep` for structural patterns;
   `GitNexus` for code graph queries (definitions, references, blast radius).
6. **Global memory**: `agent-memory/lessons/`, `agent-memory/snippets/`,
   `agent-memory/projects/<id>/README.md`.
7. **Semantic** (optional): LanceDB query over project + global if exact and
   structural search fail.
8. **Web cache**: `agent-memory/projects/<id>/web/` then `agent-memory/web/`.
9. **External fallback**: web search via Tavily, GitHub Code Search.

## 5. Configuration: `.memory/config.yml`

Committed to project repo root. Schema v1:

```yaml
schema: 1

# Project identity. Used to namespace project content under
# agent-memory/projects/<project_id>/.
project_id: khangnghiem__fast-draft

# Local scratch directory (gitignored, not synced).
scratch_dir: .scratch

# Project-canonical doc paths the agent should read first.
canonical_doc_paths:
  - docs/REQUIREMENTS.md
  - docs/LESSONS.md
  - docs/CHANGELOG.md
  - docs/specs/
  - docs/superpowers/specs/
  - openspec/

# Optional vector/cache paths. All gitignored.
lancedb_path: .memory/cache/lancedb
gitnexus_path: .gitnexus

# OpenSpec config root.
openspec_dir: openspec

# Web capture default routing: project | global | both.
web_capture_target: project

# Path to the global agent-memory clone on this machine. Defaults to
# ~/.config/memory if unset.
agent_memory_path: ~/.config/memory
```

### Discoverability

No agent host (Claude Code, OpenCode, Cursor, Copilot, Aider, Cline, Windsurf)
auto-loads `.memory/config.yml` as of 2026. We make it discoverable two ways:

1. **AGENTS.md (generated) instructs the agent** to read `.memory/config.yml`
   before working.
2. **`repo.read_config` MCP tool** exposes parsed config for agents that prefer
   tool calls over file reads.

## 6. Tool Surface

`agentmem` CLI is the source of truth. The MCP server is a thin wrapper that
imports the CLI's library functions and exposes them as MCP tools. One
implementation, two surfaces.

### Namespaces

| Namespace | Purpose |
|-----------|---------|
| `global.*` | Read/write `agent-memory` repo |
| `repo.*`   | Read/write project repo + scratch + OpenSpec ops |
| `sync.*`   | Git pull/push/status |
| `promote.*` | Open draft PRs to promote scratch → canonical or project → global |
| `web.*`    | Capture web pages via Tavily |
| `lance.*`  | Optional LanceDB index/query/rebuild |

### Tools

#### `global.*`

Operates over `agent-memory/`. The project subtree
(`agent-memory/projects/<id>/`) is addressed via the same tools using a
`project_id` argument; when omitted, operations target the truly global root.

| Tool | Args | Effect |
|------|------|--------|
| `read_lesson` | `{ path, project_id? }` | Returns lesson markdown from global or project subtree |
| `list_lessons` | `{ tag?, project_id?, limit? }` | Lists lesson files; project-scoped when `project_id` set |
| `read_snippet` | `{ path }` | Returns snippet markdown |
| `read_preferences` | `{}` | Returns `preferences.md` content |
| `write_preferences` | `{ content }` | Writes `preferences.md` |
| `write_draft` | `{ path?, title?, content, project_id? }` | Writes to `inbox/` (or `projects/<id>/inbox/`) for later promotion |
| `write_project_session` | `{ project_id, date?, content, mode? }` | Writes a cross-machine project session log to `projects/<id>/sessions/<date>.md` |
| `read_project_readme` | `{ project_id }` | Returns the project subtree's `README.md` |
| `search` | `{ query, regex?, pathGlobs?, project_id?, limit? }` | Ripgrep over `agent-memory/`; scoped to project subtree if `project_id` set |

#### `repo.*`

| Tool | Args | Effect |
|------|------|--------|
| `read_config` | `{}` | Parses and returns `.memory/config.yml` |
| `read_canonical` | `{ scope }` | Reads canonical paths (`docs`, `openspec`, both) |
| `read_scratch` | `{ path? }` | Reads from local `.scratch/` |
| `write_scratch` | `{ path, content, mode }` | Writes to local `.scratch/` (`replace` or `append`); never commits |
| `search` | `{ query, includeGlobal?, includeScratch?, pathGlobs?, limit? }` | Ripgrep over project canon (+ optional `.scratch/` and global) |
| `openspec_status` | `{ change? }` | Shells `openspec status` (or named change) |
| `openspec_propose` | `{ title, description, schema?, mode? }` | Shells `openspec propose` |
| `openspec_apply` | `{ change }` | Shells `openspec apply` |
| `openspec_archive` | `{ change, sync? }` | Shells `openspec archive` |

#### `sync.*`

`scratch` is intentionally absent — `.scratch/` is local-only by design.

| Tool | Args | Effect |
|------|------|--------|
| `status` | `{ scope: "global" \| "project" \| "both" }` | Git status for selected repos |
| `pull` | `{ scope }` | `git pull --ff-only` for selected repos |
| `push` | `{ scope }` | `git push` for selected repos |

#### `promote.*`

| Tool | Args | Effect |
|------|------|--------|
| `scratch_to_canonical` | `{ paths, prDraft? }` | Copies `.scratch/` files to project `docs/` and opens draft PR |
| `scratch_to_project_global` | `{ paths, project_id? }` | Copies `.scratch/` files into `agent-memory/projects/<id>/`; commits in agent-memory but does not push (caller invokes `sync.push`) |
| `lesson_to_global` | `{ path, project_id?, tags?, overwrite? }` | Copies project-scoped lesson up to top-level `agent-memory/lessons/` (drops project tag) and opens draft PR in `agent-memory` |

Promotion always opens a **draft PR**. Never merges. Human review remains the gate.

#### `web.*`

| Tool | Args | Effect |
|------|------|--------|
| `capture` | `{ url, title?, target?, format?, cache? }` | Fetches via Tavily or webfetch, writes markdown to global or project `web/` |

#### `lance.*` (optional)

| Tool | Args | Effect |
|------|------|--------|
| `status` | `{ scope }` | LanceDB index status |
| `index` | `{ scope, paths?, rebuild? }` | (Re)indexes selected paths |
| `query` | `{ scope, text, topK?, filters? }` | Vector + FTS query |
| `rebuild` | `{ scope }` | Drop and rebuild index |

### CLI usage

CLI mirrors the namespaces:

```bash
agentmem global search "wgpu render pipeline"
agentmem repo openspec status
agentmem sync push --scope both
agentmem promote scratch-to-canonical --paths sessions/2026-04-26.md
agentmem web capture --url https://example.com --target project
```

### Distribution

- **Install**: clone `agent-memory` repo to `~/.config/memory/`. Add shell
  alias to `~/.zshrc`:
  ```bash
  alias agentmem='npx tsx ~/.config/memory/cli/index.ts'
  ```
- **Updates**: `git pull` in `agent-memory` repo. No npm publish step.
- **MCP registration**: per-project `.opencode/mcp.json` (or equivalent for other
  hosts) points to `npx tsx ~/.config/memory/mcp-server/index.ts`.

## 7. OpenSpec ↔ Superpowers Integration

Both tools use their **own default folders**. No cross-writing. Coexistence rules:

| Concern | OpenSpec (canonical) | Superpowers (process) |
|---------|---------------------|----------------------|
| Default location | `openspec/changes/<change>/` | `docs/superpowers/specs/<date>-<topic>-design.md` |
| Lifecycle | `propose / apply / archive` | None (markdown files persist as written) |
| Role | Living artifacts (intent, design, tasks) | Brainstorming snapshots, plans |
| Update model | Edited as work progresses | Frozen at brainstorming time |
| Promotion to durable | Archive content → `docs/specs/<feature>.md` if durable | Stays in place as historical record |

### Drift prevention

When a Superpowers brainstorming session produces both a snapshot and an OpenSpec
change:

- The Superpowers snapshot **MUST** include a header pointing to the OpenSpec
  change and its current `design.md`.
- The Superpowers snapshot **MUST NOT** be updated after the OpenSpec change is
  created — it's a frozen artifact.
- The OpenSpec `design.md` **MUST** include a back-reference to the Superpowers
  snapshot in its first section.

### Promotion of OpenSpec content to `docs/specs/`

On `openspec archive`:

1. Review the change's `design.md` for content that represents durable feature
   documentation (vs change-specific reasoning).
2. If durable, copy to `docs/specs/<feature>.md` (or update existing spec) via PR.
3. Archive the OpenSpec change. Archived changes remain in `openspec/changes/`
   for history but are not edited further.

### Plannotator

Plannotator (annotation tool) annotates artifacts but never owns them. It can
annotate OpenSpec design.md, OpenSpec tasks.md, Superpowers snapshots, or
`docs/specs/` files. Annotations live alongside the source artifact (e.g., as
adjacent `.annotations.json` or inline HTML comments — implementation detail).

## 8. Generated Agent Surfaces

### Split between canonical and override

| Location | Content |
|----------|---------|
| `.agents/shared/canonical.md` | Generic Memory Harness section: read `.memory/config.yml` first, retrieval order, prefer scratch over canonical writes, promotion requires PR, secret hygiene rules |
| `.agents/overrides/repo.md` | Fast Draft repo-specific paths and commands: `~/.config/memory/` location, `.scratch/` gitignored scratch dir, MCP launch command, project_id `khangnghiem__fast-draft` |

After editing either source, run `npm run render:agent-surfaces` to regenerate
`AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`. Verifier runs in CI via
`npm run verify:agent-surfaces`.

### What the rendered AGENTS.md tells the agent (excerpt)

> **Memory Harness**
>
> Before working on any task, read `.memory/config.yml` (or call
> `repo.read_config` via the agentmem MCP). Then consult sources in retrieval
> order: OpenSpec active change → project canonical → project scratch → code
> search → global memory → semantic → web cache → external fallback.
>
> Persist durable lessons to global memory via `promote.lesson_to_global`. Never
> write secret-shaped strings; reference environment variable names only. All
> promotions open draft PRs — never merge directly.

## 9. Sync Protocol

### Session start

```
1. cd ~/.config/memory && git pull --ff-only
2. cd <project>              && git pull --ff-only
3. agent reads .memory/config.yml
```

### Session end

```
1. agent or human reviews uncommitted changes in agent-memory (project repo
   commits/pushes happen via normal PR flow, not via sync.push)
2. agent calls sync.push --scope global
3. push fails fast if non-fast-forward; user resolves manually
```

### Conflict resolution

- All repos use **simple linear history**. No rebase from MCP tools.
- If `git pull --ff-only` fails, the MCP returns an error and the agent stops.
  Human runs `git pull --rebase` or `git merge` manually.
- Sync is **best-effort**, not strictly required. Stale memory is acceptable;
  silent merge corruption is not.

## 10. Secret Hygiene

- **Source of secrets**: `~/.zshrc.secrets` (gitignored, sourced from `~/.zshrc`).
- **Agent rule**: never write secret-shaped strings (anything matching common
  token patterns like `sk-*`, `ghp_*`, `xoxb-*`, base64 longer than 32 chars in
  a context that suggests credentials) into any memory layer.
- **Allowed**: reference env var names only. E.g., write
  `Tavily API key in $TAVILY_API_KEY` — never the literal value.
- **Enforcement**: pre-commit hook in the `agent-memory` repo
  scans staged content for secret patterns. Hook source vendored in
  `agent-memory/scripts/check-secrets.sh`.

## 11. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | Tool name collision (multiple memory plugins claiming `memory_*`) | M | M | Strict namespacing (`global.*` etc.); document in AGENTS.md; avoid generic memory plugins in production |
| R2 | Index drift across machines (LanceDB, GitNexus caches diverge) | H | L | All indexes gitignored; canonical is markdown; rebuild from source on demand |
| R3 | Secret leakage into memory files | M | H | Pre-commit hook scans for secret patterns; agents instructed via canonical to use env var names only |
| R4 | GitNexus license trap (PolyForm Noncommercial) | L | M | Noted in `agent-memory/projects/khangnghiem__fast-draft/README.md`; license review required before monetization; swap to permissive code-intel tool if commercial use planned |
| R5 | Plugin abandonment (OpenSpec, GitNexus, LanceDB upstream changes) | M | M | Storage formats are simple and exportable; CLI is the source of truth and survives any plugin loss |
| R6 | Prompt pollution (agents promote noise to global memory) | M | M | Promotion gate is PR review; `promote.*` opens drafts only |
| R7 | YAML/TOML config drift (legacy `.opencode-memory.toml` or `.agentmemory.toml` files appear) | L | L | Spec mandates `.memory/config.yml` as the only valid config; verifier rejects legacy filenames |
| R8 | OpenSpec adoption breaking existing `docs/specs/` | L | M | Coexistence rule: `openspec/` for in-flight, `docs/specs/` for durable; no migration of existing specs |
| R9 | LanceDB file format churn (pre-1.0 in some surfaces) | M | L | Treated as cache; rebuildable from source; data never canonical |
| R10 | Hand-edits to generated `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` | M | L | Files contain a "GENERATED — DO NOT EDIT" header; CI verifier (`verify:agent-surfaces`) catches drift |
| R11 | Sync conflict during multi-machine session overlap | L | M | Use `--ff-only` pulls; fail loudly; human resolves manually |
| R12 | OpenSpec change directory accumulates (no archive discipline) | M | L | Linter checks for changes older than N days; archived changes remain in `changes/` for history but are excluded from active scans |

## 12. Migration Path

### From current state (no harness)

1. Create `agent-memory` private GitHub repo. Initialize with template structure
   (Section 3, L4 subsection).
2. Clone to `~/.config/memory/` on each machine.
3. Add shell alias `agentmem` in `~/.zshrc`.
4. Implement `agentmem` CLI in `agent-memory/cli/` (TS).
5. Implement MCP wrapper in `agent-memory/mcp-server/`.
6. Add `.memory/config.yml` to Fast Draft repo root with `project_id:
   khangnghiem__fast-draft`.
7. Add `.gitignore` entries for `.scratch/`, `.memory/cache/`, `.gitnexus/`,
   `.lancedb/`.
8. Run `openspec init` at Fast Draft repo root. Verify this `agent-memory-harness`
   change directory remains intact.
9. Patch `.agents/shared/canonical.md` with generic Memory Harness section.
10. Patch `.agents/overrides/repo.md` with Fast Draft-specific paths.
11. Run `npm run render:agent-surfaces`. Commit regenerated AGENTS.md / CLAUDE.md
    / GEMINI.md.
12. Register MCP in `.opencode/mcp.json`.
13. Smoke test: agent reads config, runs `repo.search`, writes a `.scratch/`
    note, promotes it via `promote.scratch_to_project_global` to
    `agent-memory/projects/khangnghiem__fast-draft/`.

### Future migrations

- **Adding a new project**: add `.memory/config.yml` to project root with new
  `project_id`. Create `agent-memory/projects/<new_id>/` subtree with template
  structure. No new repo to create.
- **Adding a team member**: invite them to `agent-memory` repo; they clone to
  their own `~/.config/memory/`. Project content under
  `agent-memory/projects/<id>/` is shared automatically. `.scratch/` remains
  local-only per machine and per developer.
- **Swapping LanceDB for another vector DB**: rebuild index from markdown source;
  update `.memory/config.yml` `lancedb_path` key (or rename); update
  `lance.*` MCP tools to wrap new backend.
- **Dropping GitNexus** (e.g., on license concern for commercial use): remove
  `.gitnexus/` ignore entry; install permissive replacement; no canonical data
  is lost since GitNexus produces only an index.

## 13. Open Questions

1. **Plannotator integration shape** — annotation file format (sidecar JSON vs
   inline HTML comments vs separate annotation tool repo). Defer to follow-up
   change.
2. **Team-scale namespace** — when a second contributor joins, do we need
   `team.*` MCP tools, or does shared `agent-memory` access suffice? Defer.
3. **Tavily MCP wiring** — is the existing Tavily MCP package sufficient, or do
   we need a thin `web.*` wrapper that handles routing to project vs global?
   Defer to first web capture session.
4. **OpenSpec capability spec format** — the `openspec/specs/agent-memory-
   harness/` spec deltas need to follow OpenSpec's capability conventions; the
   exact format is decided when running `openspec apply`.

## 14. Acceptance Criteria

This change is complete when:

- [ ] `agent-memory` repo exists with template structure including
      `projects/<id>/` subtree shape.
- [ ] `agentmem` CLI implements all tools in Section 6.
- [ ] MCP wrapper implements all tools in Section 6.
- [ ] `.memory/config.yml` exists at Fast Draft repo root with valid schema v1
      (includes `project_id`).
- [ ] `.gitignore` excludes `.scratch/`, `.memory/cache/`, `.gitnexus/`,
      `.lancedb/`.
- [ ] `openspec/` directory initialized; this change archives cleanly.
- [ ] `.agents/shared/canonical.md` includes Memory Harness section.
- [ ] `.agents/overrides/repo.md` includes Fast Draft-specific paths and
      `project_id`.
- [ ] `AGENTS.md` regenerated and committed.
- [ ] `npm run verify:agent-surfaces` passes.
- [ ] Pre-commit secret-scanning hook installed in `agent-memory`.
- [ ] CI verifier rejects PRs that add files under `.scratch/`.
- [ ] Smoke test passes: read config → search → write `.scratch/` → promote to
      `agent-memory/projects/<id>/` via `promote.scratch_to_project_global`.
- [ ] `docs/REQUIREMENTS.md` includes a Memory Harness entry.
- [ ] `docs/CHANGELOG.md` records the harness introduction.

## 15. References

- Brainstorming snapshot: `docs/superpowers/specs/2026-04-26-agent-memory-harness-design.md`
- Parity precedent: `docs/specs/agent-surface-parity.md` (after move) or
  `docs/superpowers/specs/2026-04-22-opencode-claude-parity-design.md` (current)
- Agent surface renderer: `fd-vscode/src/agent-surfaces.ts`,
  `scripts/agent-surfaces.mjs`
- Existing canonical: `.agents/shared/canonical.md`
- Existing override: `.agents/overrides/repo.md`
- OpenSpec docs: https://github.com/(OpenSpec org)/openspec
- GitNexus: https://github.com/(author)/gitnexus (PolyForm Noncommercial 1.0.0)
- LanceDB: https://github.com/lancedb/lancedb (Apache 2.0)
- Tavily MCP: https://github.com/tavily-ai/tavily-mcp
