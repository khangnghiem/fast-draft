# Proposal: Agent Memory Harness

## Why

AI coding agents in this monorepo (OpenCode now, future Claude Code / Cursor / Aider /
Copilot CLI) currently have no persistent memory across sessions or machines. Every
session starts cold: lessons learned in one debugging run vanish, project conventions
must be rediscovered from `docs/`, web research is recaptured per session, and there
is no shared substrate for cross-project knowledge (Rust idioms, wgpu patterns,
deployment recipes) that recurs across personal repos.

The repo also lacks an explicit spec lifecycle. `docs/specs/` holds 9 stable feature
specs but offers no proposal/design/tasks separation, no archive history, and no CLI
to scaffold consistent change shapes. Multiple parallel changes would muddle a single
specs directory.

This change introduces a tool-agnostic, multi-machine, two-repo memory architecture
plus an OpenSpec-driven change lifecycle, so agents have durable memory and humans
have explicit change tracking.

## What Changes

1. **Two-repo memory model**
   - `memory` (new private repo, cloned to `~/.config/memory/`) for all
      durable knowledge — both global (reusable across projects) and project-scoped
      (per-project sessions, drafts, web captures, lessons) under
      `memory/projects/<owner>__<repo>/`.
   - The project repo gains a gitignored `.scratch/` directory for local ephemeral
     notes that don't need cross-machine sync, plus a committed `.memory/config.yml`
     declaring canonical doc paths and optional cache settings. **No separate
     `<project>.notes` repo.** Project content that must survive across machines
      gets promoted from `.scratch/` to `memory/projects/<id>/`. This avoids
     a privacy leak risk (Fast Draft is a public repo; nothing tracked = nothing
     leaked) and removes one repo's worth of sync overhead.

2. **OpenSpec adoption** at `openspec/` (repo root). All future architectural and
   feature changes flow through `openspec propose / apply / archive`. Existing
   `docs/specs/` remains the durable archive for feature documentation; durable
   content from archived OpenSpec changes can be promoted to `docs/specs/<feature>.md`.

3. **Custom `mem` CLI** vendored in `memory/cli/` (TypeScript, run via
   `npx tsx`). Tool surface namespaced as `global.* / repo.* / sync.* / promote.* /
   web.* / lance.*`. Distributed via shell alias, no npm publishing.

4. **Thin MCP wrapper** in `memory/mcp-server/` calling into the CLI's library
   functions. Gives OpenCode-native tool discovery without duplicating logic.

5. **Code intelligence layer**: GitNexus (PolyForm Noncommercial, accepted for
   personal/dev use) for code graph + tree-sitter; ripgrep canonical for exact
   search; ast-grep for structural search; LanceDB optional for semantic vector
   search if/when needed.

6. **Generated agent surfaces**: memory-harness rules added to
   `.agents/shared/canonical.md` (generic policy) and `.agents/overrides/repo.md`
   (Fast Draft repo-specific paths). Regenerated AGENTS.md / CLAUDE.md / GEMINI.md
   tells agents to read `.memory/config.yml` first and call `repo.read_config` via
   the MCP.

7. **Sync model**: `git pull` at session start, `git push` at session end. No
   daemons. All caches (`.gitnexus/`, `.memory/cache/`) gitignored.

8. **Promotion gate**: PR review remains the only real promotion gate. OpenSpec
   `apply / archive` and `promote.*` MCP tools open draft PRs but never merge.

## Impact

- **Affected specs**: introduces `agent-memory-harness` capability; adds
  `openspec/specs/agent-memory-harness/` with the canonical specification deltas
  for memory layer, MCP tool surface, and config schema.
- **Affected code**:
  - `.agents/shared/canonical.md` — add Memory Harness section.
  - `.agents/overrides/repo.md` — add Fast Draft memory paths and MCP launch
    command.
  - `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` — regenerated via `npm run
    render:agent-surfaces`.
  - New `.memory/config.yml` at repo root (tracked).
  - New `.gitignore` entries for `.scratch/`, `.memory/cache/`, `.gitnexus/`,
    `.lancedb/`.
  - New `openspec/` tree at repo root with `config.yaml`, `changes/`, `specs/`.
  - `docs/REQUIREMENTS.md`, `docs/CHANGELOG.md` — note the new harness.
- **Affected external repos** (not part of this change, listed for completeness):
   - `memory` repo created on user's GitHub with `lessons/`, `snippets/`,
    `preferences.md`, `projects/<id>/{README.md,sessions/,drafts/,transcripts/,
    web/,attachments/,lessons/}`, `web/`, `inbox/`, `templates/`, `schemas/`,
    `cli/`, `mcp-server/`.
- **Risk**: GitNexus is PolyForm Noncommercial — license review required before any
  monetization. LanceDB is pre-1.0 in some surfaces — file format may churn. Cache
  drift across machines if `git pull` discipline slips. Tool collision if other
  memory plugins are installed alongside. All mitigated in design.md risk register.
- **Backout**: Memory harness is additive. Removing `.memory/config.yml`, deleting
  `openspec/`, deleting `.scratch/` (already gitignored), and reverting
   `.agents/overrides/repo.md` patches restores the prior state. The `memory`
   repo remains usable as a plain markdown vault even if the CLI/MCP is uninstalled.
