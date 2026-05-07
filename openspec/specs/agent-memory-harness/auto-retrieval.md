# Design: Auto-Retrieval Architecture

> **Status:** draft (Council #2 approved, awaiting implementation)
> **Related**: [`spec.md`](./spec.md), [`MEMORY_INIT.md`](../../../MEMORY_INIT.md)

## Problem

Agents currently must **manually** invoke `mem repo search <keywords>` or read
specific memory files. There is no automatic retrieval at session start, which
means:

- New sessions start with zero memory context.
- Agents rediscover known pitfalls (bounds ownership, pointer hijack, WASM sync)
  on every new task.
- Cross-machine continuity is broken: an agent on machine B doesn't know what
  machine A learned yesterday unless the user manually runs lookups.

## Goal

When an agent starts a session in a project repo, it should **automatically**
receive relevant memory context without manual triggers. This must be:

- **Selective**: Don't dump the entire memory tree into context.
- **Fast**: <2 seconds end-to-end.
- **Relevant**: Distinguish project-specific from global memory.
- **Non-blocking**: Failures degrade gracefully.

## Trigger Model

| Tier | Trigger | Behavior | Phase |
|------|---------|----------|-------|
| **T1: Session Start** | Agent session initialization | One-time retrieval of canonical docs + high-confidence project/global memory | **v1** |
| **T2: Task-Scoped** | User prompt contains task keywords | Optional re-retrieval with task-specific query | **v1.5** |
| **T3: Context Pressure** | Token usage >75% of limit | Evict/summarize old injections | **v2** |

**T1 is mandatory baseline.** T2 is opt-in via config. T3 is aspirational.

> **Note on MCP limitations**: MCP servers are stateless stdio — there is no
> `onSessionStart` lifecycle. Host adapters (AGENTS.md instructions) must call
> `context.bootstrap` as the first action. Hosts with real startup hooks may
> inject automatically.

## Retrieval Pipeline

```
TRIGGER: Session start
    │
    ▼
[1] Sync check & fast-forward pull (timeout: 1500ms)
    ├── success → continue with fresh index
    ├── timeout/offline → continue with stale cache, flag stale=true
    └── non-fast-forward → error (user must resolve), do NOT silently skip
    │
    ▼
[2] Read .memory/config.yml → project_id, canonical_doc_paths, memory_path
    │
    ▼
[3] Build query signals (parallel, cheap heuristics — NO LLM call)
    ├── Detect project language from manifests (Cargo.toml, package.json)
    ├── Detect task type from prompt keywords (feat/bug/refactor/docs)
    └── Extract explicit tags if present in prompt
    │
    ▼
[4] Collect candidates (parallel queries)
    ├── Canonical docs (from config, max 3)
    ├── Project lessons (scope: project, max 5)
    ├── Project sessions ≤90 days (max 2)
    └── Global lessons (scope: global, language-filtered, max 3)
    │
    ▼
[5] Rank & deduplicate
    ├── Score = 0.40*keyword_match + 0.25*tag_overlap + 0.15*profile_match
    │           + 0.10*authority + 0.10*recency
    ├── Authority order: canonical > project lessons > sessions > global lessons
    └── Remove duplicates by content hash
    │
    ▼
[6] Token-budget assembly
    ├── Hard cap: 2000 tokens startup / 1000 tokens task-scoped
    ├── Truncate lowest-ranked items first
    └── Summarize items >300 tokens to first sentence + read_more handle
    │
    ▼
[7] Return Memory Context Pack
```

**Performance target:** <2 seconds end-to-end (parallel I/O + cached index).

## Selection / Ranking Strategy

### Score formula (v1)

```
score =
  0.40 * BM25(keywords, title + summary + headings)
+ 0.25 * tag_overlap(task_tags, item_tags)
+ 0.15 * profile_match(project_language, item_language_tag)
+ 0.10 * authority_bucket(canonical > project > global)
+ 0.10 * recency_decay(days_since_edit)
- penalty_for_archive_path
- penalty_for_language_mismatch
```

### Hard filters

- **Language mismatch** → exclude entirely (Rust project shouldn't get JS lessons).
- **Archive paths excluded** by default (`openspec/changes/archive/**`, `docs/superpowers/**`).
- **Sessions >90 days** excluded unless tagged `permanent: true`.
- **Transcripts, attachments, inbox, scratch** NEVER auto-inject.

### Frontmatter (v1.5)

Lessons and canonical docs may include YAML frontmatter:

```yaml
---
id: fd-bounds-ownership
scope: project          # project | global
projects: [khangnghiem__fast-draft]
tags: [rust, wasm, canvas, layout]
language: rust          # primary language
visibility: auto        # auto | manual-only | global-agent
created: 2026-03-04
confidence: high        # high | medium | low
priority: normal        # high | normal | low
summary: "Never let lower-authority layout overwrite measured bounds."
---
```

## Context Injection Strategy

**Primary contract: Memory Context Pack** (structured JSON). Hosts decide how to
consume it:

```json
{
  "pack_id": "ctx_20260506_abc123",
  "project_id": "khangnghiem__fast-draft",
  "freshness": {
    "synced": true,
    "last_pull": "2026-05-06T10:00:00Z",
    "stale": false,
    "warnings": []
  },
  "must_apply": [
    {
      "id": "fd-bounds-ownership",
      "scope": "project",
      "title": "Bounds ownership chain",
      "summary": "JS measureText → SyncEngine → resolve_subtree → resolve_layout...",
      "path": "projects/khangnghiem__fast-draft/lessons/bounds-ownership.md",
      "relevance": 0.91,
      "tokens": 120
    }
  ],
  "maybe_relevant": [],
  "read_more": [
    {"tool": "global.read_lesson", "args": {"id": "fd-bounds-ownership"}}
  ],
  "total_tokens": 1800,
  "items_found": 8
}
```

**Delivery modes:**

1. **Tool result** (portable, preferred): Agent calls `context.bootstrap` and
   receives the pack as a tool result. Works with any MCP host.
2. **System prompt prefix** (ergonomic): Hosts like OpenCode/Claude Code prepend
   a markdown rendering of the pack to the system prompt. Requires host
   cooperation.

All retrieved memory is **advisory** — subordinate to user/system/developer
instructions. Never let memory override explicit instructions.

## Project vs Global Balancing

| Scope | Budget (startup) | Budget (task-scoped) | Priority |
|-------|-----------------|---------------------|----------|
| Canonical/pinned docs | 30% (~600 tokens) | 20% (~200 tokens) | 1st |
| Project lessons | 50% (~1000 tokens) | 50% (~500 tokens) | 2nd |
| Project sessions (≤90d) | 10% (~200 tokens) | 20% (~200 tokens) | 3rd |
| Global lessons (lang-matched) | 10% (~200 tokens) | 10% (~100 tokens) | 4th |
| Global snippets | — | — | On-demand only |

**Rules:**

1. Project items always win ties over global items.
2. Global lessons require language tag match + keyword match.
3. Global items marked `applies_to: any` bypass language filter.
4. Sessions require recency + relevance; never inject raw transcripts.

## Freshness / Sync Guarantees

```typescript
interface SyncResult {
  pulled: boolean;
  commits_behind: number;
  last_synced_at: string | null;
  stale: boolean;
  offline: boolean;
  warnings: string[];
}
```

**Protocol:**

1. On session start: `git -C ~/.config/memory pull --ff-only` (timeout: 1500ms).
2. If timeout/offline: use local cache, set `stale=true`, log warning.
3. If non-fast-forward: surface as user-action-required error; do NOT silently skip.
4. If dirty working tree: skip pull, use local cache, warn.
5. Cache index by `memory_repo_HEAD + project_id + config_hash`.
6. Never auto-commit, auto-stash, or auto-push during retrieval.

**Push model:** Explicit only (`mem sync push` or `/memory-sync`). No automatic push.

## Implementation Sketch

### New MCP Tools

```typescript
// T1: Session startup retrieval
"context.bootstrap": {
  input: {
    repo_root?: string,
    task_hint?: string,           // optional keywords from first prompt
    host?: { name: string; session_id?: string },
    budget_tokens?: number,       // default: 2000
    sync?: "pull_ff_only" | "if_stale" | "skip"
  },
  returns: MemoryContextPack
}

// T2: Task-scoped retrieval (optional, Phase 1.5)
"context.retrieve": {
  input: {
    repo_root?: string,
    query: string,
    task_type?: "feature" | "bug" | "refactor" | "investigation" | "docs",
    files?: string[],             // files mentioned in prompt
    scopes?: ("canonical" | "project" | "global")[],
    budget_tokens?: number,       // default: 1000
    since_pack_id?: string        // diff from previous pack
  },
  returns: MemoryContextPack
}

// Status check (lightweight, no retrieval)
"context.status": {
  input: { repo_root?: string },
  returns: {
    configured: boolean,
    project_id?: string,
    memory_head?: string,
    index_status: "fresh" | "stale" | "missing",
    last_pull_at?: string,
    warnings: string[]
  }
}
```

### Config Schema Additions (`.memory/config.yml`)

```yaml
schema: 2  # bump version

auto_retrieval:
  enabled: true

  sync:
    on_session_start: pull_ff_only  # pull_ff_only | if_stale | skip
    timeout_ms: 1500
    stale_after_minutes: 60
    allow_stale: true

  budgets:
    startup_tokens: 2000
    task_tokens: 1000
    max_items: 12
    snippet_chars: 700

  project_profile:
    languages: [rust, typescript]  # auto-detected + override
    tags: [wasm, canvas, vscode]

  scopes:
    canonical_exclude:
      - openspec/changes/archive/**
      - docs/superpowers/specs/**
    project_buckets: [README.md, lessons, sessions]
    global_buckets: [lessons, snippets]
    exclude_buckets: [transcripts, attachments, inbox, scratch, web]
    require_global_tag_match: true

  privacy:
    auto_expose_global: tagged_only  # tagged_only | any | none
    redact_secrets: true
    include_sessions: false          # MUST be false by default
    include_web: false
```

### New CLI Commands

```bash
# Session startup retrieval
mem context bootstrap [--task-hint "rust wasm bug"] [--dry-run]

# Task-scoped retrieval
mem context retrieve --query "canvas bounds layout" --type bug

# Status check
mem context status
```

### Files to Create / Modify

| File | Change |
|------|--------|
| `~/.config/memory/cli/src/context/bootstrap.ts` | New — core retrieval logic |
| `~/.config/memory/cli/src/context/retrieve.ts` | New — task-scoped retrieval |
| `~/.config/memory/cli/src/context/status.ts` | New — status check |
| `~/.config/memory/cli/src/context/ranker.ts` | New — scoring + ranking |
| `~/.config/memory/cli/src/context/packer.ts` | New — token budgeting + formatting |
| `~/.config/memory/cli/src/sync/manager.ts` | Modify — add ff-only pull with timeout |
| `~/.config/memory/mcp-server/index.ts` | Modify — register new tools |
| `~/.config/memory/mcp-server/tools/context.ts` | New — MCP wrappers |
| `.memory/config.yml` | Modify — add `auto_retrieval` section |
| `AGENTS.md` | Modify — add session-start protocol |
| `openspec/specs/agent-memory-harness/spec.md` | Modify — document auto-retrieval |

## Failure Modes

| Failure | Severity | Behavior | Agent-visible |
|---------|----------|----------|---------------|
| No `.memory/config.yml` | Low | Return empty pack, `configured: false` | Silent |
| Memory repo not cloned | Medium | Return empty pack + bootstrap guidance | Warning with install link |
| Git pull timeout (>1500ms) | Medium | Use stale cache, `stale: true` | Warning once per session |
| Git pull non-fast-forward | High | Error — do NOT proceed with stale | Error: "Memory repo diverged. Run `mem sync resolve`" |
| Dirty memory repo | Medium | Skip pull, use local cache | Warning |
| No relevant memory found | Low | Return empty pack | Silent success |
| Pack exceeds budget | Medium | Truncate lowest-ranked items | Silent — shorter item list |
| MCP tool unavailable | Medium | Fall back to CLI: `mem context bootstrap` | Error with fallback command |
| Schema version mismatch | Low | Parse v1 fields, ignore unknown | Warning |

**All failures are non-blocking.** Auto-retrieval is advisory, never gating.

## Privacy / Security

| Risk | Severity | Mitigation |
|------|----------|------------|
| Session transcripts auto-injected with secrets | 🔴 Critical | `include_sessions: false` hard default. Scan content before injection. |
| Cross-project contamination via global lessons | 🟠 High | Validate `project_id`. Require language tag match. |
| Secrets in memory retrieved without scanning | 🟠 High | Run lightweight regex scan on retrieved content. Redact patterns with `[REDACTED]`. |
| Stale sensitive data in wrong context | 🟡 Medium | 90-day session TTL. Archive paths excluded. |
| MCP input logging leaks prompt content | 🟡 Medium | `mem-mcp` must NOT log tool inputs by default. |
| Wrong project_id retrieves wrong memory | 🟡 Medium | Validate `project_id` at bootstrap. Error on mismatch. |

## Rollout Plan

### Phase 1 (Immediate)
- Implement `context.bootstrap` with keyword-only BM25 ranking.
- Hardcode 4-layer priority (canonical → project lessons → sessions → global lessons).
- 1500-token default cap, 12-item max.
- Add `auto_retrieval` config section with `enabled` flag.
- Update AGENTS.md with session-start protocol.

### Phase 2 (Next)
- Add `context.retrieve` for task-scoped queries.
- Implement tag taxonomy and frontmatter parsing.
- Add recency decay and priority tags.
- Add secret redaction during retrieval.

### Phase 3 (Future)
- Optional LanceDB vector search (only if lexical proves insufficient).
- Context-pressure summarization (T3).
- Cross-session memory continuity.
