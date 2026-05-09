# Capability: Agent Memory Harness

> **Status:** stable (introduced by `openspec/changes/agent-memory-harness/`,
> incrementally rolled out across PRs #1143, #1145, and the Phases 6–10 PR).
> **Owner:** khangnghiem
> **Related**: [`MEMORY_INIT.md`](../../../MEMORY_INIT.md), [`.memory/config.yml`](../../../.memory/config.yml)

## Purpose

Give AI coding agents in this repo durable, multi-machine memory and a clean
contract for routing reads and writes between:

- the project repo (canonical docs, ephemeral `.scratch/`),
- the global harness at `~/.config/memory/` (cross-project lessons,
  per-project subtree at `projects/khangnghiem__fast-draft/`).

## Components

### 1. Project-side contract

| Path | Tracked? | Role |
| --- | --- | --- |
| `.memory/config.yml` | yes | Schema-v1 declaration: `project_id`, canonical doc paths, scratch dir, optional `lancedb_path` / `gitnexus_path`, `web_capture_target`, `agent_memory_path`. |
| `.scratch/` | no (gitignored) | Ephemeral agent working memory. Promoted to the agent-memory subtree when worth keeping. |
| `.memory/cache/`, `.gitnexus/`, `.lancedb/` | no (gitignored) | Per-machine indices; never committed. |

### 2. Global harness contract

Lives at `~/.config/memory/` (repo: `khangnghiem/agent-memory`).

| Subtree | Role |
| --- | --- |
| `lessons/`, `snippets/`, `web/`, `inbox/` | Cross-project durable knowledge. |
| `projects/khangnghiem__fast-draft/` | This repo's per-project subtree: `README.md`, `lessons/`, `sessions/`, `drafts/`, `transcripts/`, `web/`, `attachments/`, `inbox/`. |
| `cli/` | `agentmem` CLI (TypeScript, run via tsx). |
| `mcp-server/` | Stdio MCP wrapper exposing the CLI library as `<namespace>__<tool>` MCP tools. |
| `scripts/check-secrets.sh` | Pre-commit secret scanner. |

### 3. Tool surface

Namespaced. Both the CLI and the MCP wrapper expose the same operations:

- `global.*` — `read_lesson`, `list_lessons`, `read_snippet`, `read_preferences`, `write_preferences`, `write_draft`, `write_project_session`, `read_project_readme`, `search`.
- `repo.*` — `read_config`, `read_canonical`, `read_scratch`, `write_scratch`, `search`, `openspec_status`, `openspec_propose`, `openspec_apply`, `openspec_archive`.
- `sync.*` — `status`, `pull` (`--ff-only`), `push`, scoped `global` | `project` | `both`.
- `promote.*` — `scratch_to_canonical` (opens draft PR), `scratch_to_project_global` (commits in agent-memory only), `lesson_to_global` (opens draft PR).
- `web.*` — `capture` via webfetch fallback (Tavily MCP deferred).
- `lance.*` — stubs returning `{status: "NOT_ENABLED"}` until `lancedb_path` is set.

## Retrieval order (agent contract)

When an agent needs context, it MUST consult sources in this order and stop as
soon as the question is answered:

1. **Open files in the current task** — local working set.
2. **`.memory/config.yml` canonical_doc_paths** — `AGENTS.md`, `docs/{ARCHITECTURE,REQUIREMENTS,LESSONS,SHORTCUTS,CHANGELOG}.md`, `docs/specs`, `openspec/`. Use `repo.search` (ripgrep, restricted to canonical scope by default).
3. **Per-project subtree** (`projects/khangnghiem__fast-draft/{lessons,sessions,drafts,...}`) via `global.*` tools.
4. **Global lessons / snippets / web** via `global.search` or `global.list_lessons`.
5. **External web** via `web.capture` (fallback only; cache to project or global per `web_capture_target`).

### Automatic retrieval triggers

- **Session start**: if `.memory/config.yml` exists, agents SHOULD run
  `git -C ~/.config/memory pull --ff-only` followed by
  `agentmem repo read-config` before planning work.
- **New feature / bug / refactor prompt**: agents SHOULD extract task keywords
  and run canonical `repo.search` plus relevant project/global lesson lookups
  before proposing a plan.
- These retrievals may be silent; surface only findings that change the plan,
  reveal a known pitfall, or require user action.

## Promotion contract

Writes flow strictly upward, never sideways:

```
.scratch/  ->  agent-memory/projects/<id>/<bucket>/   (promote.scratch_to_project_global)
agent-memory/projects/<id>/lessons/<file>  ->  agent-memory/lessons/<file>   (promote.lesson_to_global, draft PR)
.scratch/<file>  ->  docs/<canonical>/<file>   (promote.scratch_to_canonical, draft PR)
```

All cross-repo promotions go through draft PRs in the **destination** repo,
never direct pushes to `main`.

## Secret hygiene

- Pre-commit hook in `agent-memory` runs `scripts/check-secrets.sh` on staged
  blobs and rejects on `sk-*`, `ghp_*`, `xoxb-*`, `AKIA*`, and 32+ char
  base64-in-credential-context.
- Fast-draft adopts the same scanner via the `.githooks/pre-commit` chain.
- `.env`, tokens, API keys are never staged in either repo.

## Sync model

- No daemons. `git pull --ff-only` at session start; memory pushes happen via
  explicit memory sync, not project `/sync-push`.
- The agent-memory repo lives on `main`; project-subtree commits land directly.
- Fast-draft uses topic branches and PRs (no direct pushes to `main`).

### Memory commands

Global `/memory-status` and `/memory-sync` command templates live in
`~/.config/memory` and are installed into agent-specific global command
directories with `agentmem commands install`. Adopted project repos document the
policy, but do not need project-local command copies.

- `/memory-status` is read-only: parse `.memory/config.yml`, inspect
  `~/.config/memory` git status, summarize scratch/project/global memory,
  and recommend next action.
- `/memory-sync` operates only on `~/.config/memory`: inspect dirty state
  before pulling, commit known durable promotion outputs only after scanning exact
  candidate paths and staged content with `scripts/check-secrets.sh`, pull
  `--ff-only` from a clean worktree, push committed-ahead memory automatically,
  and stop for unknown dirty files or non-fast-forward state.
- Project `/sync-push` MUST remain project-scoped and MUST NOT implicitly push
  memory.

## Verification

| Aspect | Verifier |
| --- | --- |
| Config parses | `agentmem repo read-config` exits 0 and prints resolved paths. |
| Scratch round-trip | `agentmem repo write-scratch <p>` then `agentmem repo read-scratch <p>` returns body. |
| Canonical search scope | `agentmem repo search <q>` only hits paths in `canonical_doc_paths`. |
| MCP discovery | `agentmem-mcp` over stdio responds to `tools/list` with all `<ns>__<tool>` IDs. |
| `.scratch/` not staged | CI workflow `memory-scratch-guard` rejects PRs adding `.scratch/**`. |
