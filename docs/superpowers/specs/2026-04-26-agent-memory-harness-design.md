# Agent Memory Harness — Brainstorming Snapshot

> **Status:** FROZEN brainstorming snapshot. Captured 2026-04-26.
>
> **Living canonical version:**
> [`openspec/changes/agent-memory-harness/design.md`](../../../openspec/changes/agent-memory-harness/design.md)
>
> This file captures the design at the moment brainstorming concluded and the
> OpenSpec change was opened. Do not edit. All subsequent revisions land in the
> OpenSpec design.md above.

## Context

Brainstorming session producing a layered, multi-machine, multi-project agent
memory + code-intelligence harness for Fast Draft and future projects.

Three council rounds (memory landscape audit, final-revision audit, defaults
audit) drove the locked architecture below.

## Locked Architecture (at brainstorming time)

### Two-repo model

- **Project repo** (this repo, public): hosts canonical docs, OpenSpec changes,
  `.memory/config.yml`, and a gitignored `.scratch/` directory for local
  ephemeral notes.
- **`memory` repo** (private, cloned to `~/.config/memory/`): hosts
  global content at root and per-project content under `projects/<owner>__<repo>/`.
- **No third `<project>.notes` repo.** Rejected because Fast Draft is public so
  privacy via gitignore beats privacy via separate repo, and project-scoped
  cross-machine content fits cleanly under `memory/projects/<id>/`.

### Layer cake

| Layer | Storage |
|-------|---------|
| L0 ephemeral session | Agent chat |
| L1 project local scratch | `.scratch/` (gitignored, local-only) |
| L2 project canonical | Project repo `docs/`, `openspec/`, `.memory/` |
| L3 code intelligence | `.gitnexus/`, `.lancedb/`, `.memory/cache/` (gitignored) |
| L4 global memory | `memory` repo (global root + `projects/<id>/`) |
| L5 web cache | `memory/web/` or `memory/projects/<id>/web/` |

### Storage and search

- Markdown canonical. Ripgrep canonical search.
- ast-grep for structural code search.
- GitNexus for code graph (PolyForm Noncommercial 1.0.0; license review required
  before monetization).
- LanceDB optional vector backend (Apache 2.0). Qdrant rejected.
- All indexes gitignored and rebuildable.

### Tooling

- `mem` CLI vendored in `memory/cli/` (TypeScript, run via
  `npx tsx`). Source of truth.
- MCP wrapper in `memory/mcp-server/` imports CLI library functions
  directly.
- Distribution: shell alias `mem` in `~/.zshrc`. No npm publish.
- Tool namespaces: `global.*`, `repo.*`, `sync.*`, `promote.*`, `web.*`,
  `lance.*`. No `spec.*` (OpenSpec ops fold under `repo.*`).

### Configuration

- `.memory/config.yml` at project repo root (committed, schema v1, namespaced
  dir, tool-agnostic name).
- Caches as gitignored siblings inside `.memory/`.
- Discoverability: AGENTS.md instructs the agent to read it; MCP exposes
  `repo.read_config`.

### OpenSpec ↔ Superpowers

- **OpenSpec is canonical artifact system.** Superpowers is process layer.
- Both tools use their own default folders. No cross-writing.
  - OpenSpec: `openspec/changes/<change>/`.
  - Superpowers brainstorming: `docs/superpowers/specs/<date>-<topic>-design.md`
    (this file).
- Superpowers snapshots are frozen at brainstorming time and point to the living
  OpenSpec design. OpenSpec design.md back-references the snapshot.
- `docs/specs/` (9 stable feature specs) remains the durable archive.
  No migration.

### Sync

- `git pull --ff-only` at session start; `git push` at session end. No daemons.
- `.scratch/` never synced (local-only by design).

### Secret hygiene

- Secrets in `~/.zshrc.secrets` (gitignored, sourced from `~/.zshrc`).
- Agents reference env var names only.
- Pre-commit secret scanner in `memory/scripts/check-secrets.sh`.

## Priority order

Experimentation > Autonomy > Parity > Reliability.

## Rejected options

- Cloud memory services (Mem0 cloud, Zep cloud, Supermemory, Pinecone).
- Codanna, Serena, sqlite-vec, Qdrant.
- `codebase-memory` npm, `@csuwl/opencode-memory-plugin` as core,
  `opencode-working-memory` as core, `opencode-supermemory`.
- Tracked `scratch/` in project repo (disqualified for public repo).
- Branch-based scratch (branches in public repos are public).
- Background auto-capture / auto-summarization.
- Knowledge graph / temporal memory (Graphiti/Zep) — defer.
- Three-repo model with `<project>.notes` (collapsed to two-repo + `.scratch/`).

## Pointer to living design

For all current details, schema, tool surface, sync protocol, migration path,
risk register, and acceptance criteria, see:

[`openspec/changes/agent-memory-harness/design.md`](../../../openspec/changes/agent-memory-harness/design.md)
