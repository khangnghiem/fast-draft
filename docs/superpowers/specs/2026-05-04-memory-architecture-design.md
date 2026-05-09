# Agent Memory Architecture Design

**Date:** 2026-05-04
**Status:** Draft (pending review)
**Scope:** Replace custom `agentmem` CLI with OMEGA + GitNexus while preserving two-tier memory (repo-local + global)

## Executive Summary

This design replaces the custom `agentmem` TypeScript CLI with standard tools: OMEGA Core (free tier) for semantic memory indexing and GitNexus for code intelligence. Markdown remains the durable source of truth for all agent memory layers. OMEGA SQLite serves as a rebuildable runtime index only — never the sole source of truth.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│ L0 Session        Ephemeral agent context (in-memory only)   │
├─────────────────────────────────────────────────────────────┤
│ L1 Scratch        .scratch/ — local-only, gitignored         │
├─────────────────────────────────────────────────────────────┤
│ L2 Project        Markdown: ~/.config/memory/          │
│                   projects/<id>/                             │
│                   Index: OMEGA SQLite (rebuildable)          │
├─────────────────────────────────────────────────────────────┤
│ L3 Code Intel     GitNexus .gitnexus/ — AST, call chains     │
│                   (gitignored, rebuilt via git hooks)        │
├─────────────────────────────────────────────────────────────┤
│ L4 Global         Markdown: ~/.config/memory/global/   │
│                   Index: OMEGA SQLite (imported)             │
├─────────────────────────────────────────────────────────────┤
│ L5 Web Cache      Markdown: ~/.config/memory/web/      │
│                   Index: OMEGA SQLite (imported)             │
└─────────────────────────────────────────────────────────────┘
```

### Layer Definitions

| Layer | Name | Storage | Source of Truth | Synced |
|-------|------|---------|----------------|--------|
| L0 | Session | Agent chat context | N/A (ephemeral) | No |
| L1 | Scratch | `.scratch/` (gitignored) | Local filesystem | No |
| L2 | Project | `~/.config/memory/projects/<id>/` Markdown | Git repo | Yes (via agent-memory git) |
| L2 Index | Project Index | `~/.omega/<id>/omega.db` | Rebuildable from L2 Markdown | No (local cache) |
| L3 | Code Intel | `.gitnexus/` (gitignored) | Rebuildable from source | No (local cache) |
| L4 | Global | `~/.config/memory/global/` Markdown | Git repo | Yes (via agent-memory git) |
| L5 | Web Cache | `~/.config/memory/web/` Markdown | Git repo | Yes (via agent-memory git) |

## Core Design Decisions

### 1. Markdown as Source of Truth

All durable memory (L2, L4, L5) is stored as Markdown files in git. OMEGA SQLite indexes these files for fast semantic search but never serves as the canonical store.

**Rationale:**
- Markdown is human-readable, diffable, and survives tool churn
- Git provides audit trail, branching, and conflict resolution
- OMEGA schema changes or tool abandonment doesn't lose data
- Multiple machines can rebuild identical indexes from shared Markdown

### 2. OMEGA as Runtime Index Only

OMEGA Core (free tier, Apache 2.0, self-hosted) rebuilds its SQLite index from Markdown at session start. Agent queries run against OMEGA for semantic similarity; exact keyword search falls back to `rg`/`fd`.

**Rationale:**
- OMEGA provides ONNX-based semantic search without API keys
- Local SQLite is fast (<50ms query latency for typical project sizes)
- Rebuilding from Markdown is idempotent and safe
- No vendor lock-in — Markdown files remain portable

### 3. GitNexus for Code Intelligence

GitNexus (PolyForm Noncommercial, free for non-commercial use) indexes the codebase into a knowledge graph stored in `.gitnexus/`. It provides AST-aware code navigation and is rebuilt via git hooks on commit.

**Rationale:**
- Code structure (imports, call chains, inheritance) is fundamentally different from agent memory
- GitNexus provides 16 MCP tools for code queries
- License is acceptable for personal use
- Rebuildable from source — `.gitnexus/` is gitignored cache

### 4. Session-Boundary Sync

All git sync (pull at start, commit/push at end) happens at explicit session boundaries. No background daemons or automatic sync.

**Rationale:**
- Matches current `agentmem` workflow (familiar to user)
- Avoids race conditions during active work
- Git conflicts resolved by human at session boundaries
- Predictable, auditable, no magic

## Read Order

When answering a query, the agent reads memory layers in this priority order:

```
L0 (Session context)
  ↓
L1 (.scratch/ — if present and relevant)
  ↓
L2 (Project Markdown / OMEGA project index)
  ↓
  ├─ Code question? → L3 (GitNexus)
  └─ Learning question? → Continue to L4
  ↓
L4 (Global Markdown / OMEGA global index)
  ↓
L5 (Web cache / OMEGA web index)
  ↓
External web search (if enabled)
```

**Note:** L1 is read before L2 because `.scratch/` may contain fresh context from the current session that hasn't been promoted to durable memory yet.

## Write Paths

### L1 → L2 Promotion

```
Agent writes to .scratch/ (ephemeral)
  ↓
Agent or user runs: agentmem promote scratch-to-project
  ↓
Content appended to ~/.config/memory/projects/<id>/YYYY-MM-DD.md
  ↓
Git commit in agent-memory repo
```

### L2 Direct Write

```
Agent learns lesson during session
  ↓
Agent writes directly to ~/.config/memory/projects/<id>/lessons.md
  ↓
Git commit in agent-memory repo (at session end)
```

### L4/L5 Write

```
Agent captures web research or cross-project lesson
  ↓
Agent writes to ~/.config/memory/global/ or web/
  ↓
Git commit in agent-memory repo (at session end)
```

### L3 Rebuild

```
Git commit hook triggers: gitnexus analyze
  ↓
Reparses codebase AST into .gitnexus/
  ↓
Agent queries via MCP tools
```

## Sync Strategy with Guardrails

### Session Start

```bash
# 1. Check for dirty state
if git -C ~/.config/memory status --short | grep -q .; then
  echo "WARNING: agent-memory repo has uncommitted changes"
  echo "Resolve before continuing or risk merge conflicts"
  exit 1
fi

# 2. Pull latest (fast-forward only)
git -C ~/.config/memory pull --ff-only origin main

# 3. Rebuild OMEGA indexes from Markdown
omega import ~/.config/memory/projects/<id>/ --layer project --project <id>
omega import ~/.config/memory/global/ --layer global
omega import ~/.config/memory/web/ --layer web
```

### Session End

```bash
# 1. Secret-scan changed files
~/bin/secret-scan ~/.config/memory/

# 2. Stage only known durable paths
git -C ~/.config/memory add \
  global/ \
  web/ \
  projects/

# 3. Commit only if meaningful diff
if ! git -C ~/.config/memory diff --cached --quiet; then
  git -C ~/.config/memory commit -m "agent memory: $(date -u +%Y-%m-%d)"
fi

# 4. Pull --rebase to resolve any concurrent changes
git -C ~/.config/memory pull --rebase origin main

# 5. Push
git -C ~/.config/memory push origin main
```

### Conflict Resolution

If git pull produces conflicts:
1. Stop — do not auto-resolve
2. Present conflict files to user
3. User resolves manually
4. Resume session-end sync

## Storage Layout

### Agent-Memory Repo (`~/.config/memory/`)

```
~/.config/memory/
├── global/
│   ├── lessons/
│   │   ├── 2026-01-15-rust-ownership.md
│   │   └── 2026-03-20-testing-patterns.md
│   ├── snippets/
│   │   └── docker-compose-template.md
│   └── playbooks/
│       └── onboarding-new-repo.md
├── web/
│   ├── 2026-04-01-omega-docs.md
│   └── 2026-04-15-gitnexus-license.md
├── projects/
│   └── khangnghiem__fast-draft/
│       ├── lessons.md
│       ├── decisions.md
│       ├── patterns.md
│       ├── gotchas.md
│       └── sessions/
│           ├── 2026-05-01.md
│           └── 2026-05-02.md
├── inbox/          # Temporary holding, manually sorted
└── .git/           # Git sync
```

### OMEGA Index (`~/.omega/`)

```
~/.omega/
├── khangnghiem__fast-draft/
│   ├── omega.db          # SQLite with embeddings
│   └── omega.db-journal  # WAL mode
├── global/
│   └── omega.db
└── web/
    └── omega.db
```

**Note:** `~/.omega/` is NOT git-tracked. It is a per-machine rebuildable cache.

### GitNexus Cache (`.gitnexus/`)

```
.gitnexus/
├── graph/
│   └── knowledge_graph.json
├── embeddings/
│   └── symbol_vectors.bin
└── index/
    └── search_index/
```

**Note:** `.gitnexus/` is gitignored. Rebuilt via git hooks or manual `gitnexus analyze`.

## Migration from `agentmem`

### Phase 1: Parallel Run (Week 1-2)

1. Install OMEGA Core locally
2. Export all `agentmem` memories to Markdown:
   ```bash
   agentmem export --format markdown --output /tmp/agentmem-backup/
   ```
3. Import into OMEGA:
   ```bash
   omega import /tmp/agentmem-backup/ --layer global
   ```
4. Continue using `agentmem` for writes; use OMEGA for reads only
5. Validate: compare search results between `agentmem search` and `omega query`

### Phase 2: Cutover (Week 3)

1. Switch write path to Markdown + OMEGA
2. Update agent workflows (`/memory-sync` command)
3. Retire `agentmem` CLI (keep repo for historical reference)

### Phase 3: GitNexus Integration (Week 4+)

1. Install GitNexus: `npm install -g gitnexus`
2. Add git hook: `.githooks/post-commit` → `gitnexus analyze`
3. Test MCP tools in agent workflow
4. Document code-intel query patterns

## Multi-Machine Considerations

| Scenario | Behavior |
|----------|----------|
| Machine A and B both push | Last write wins (or manual merge) |
| Machine B starts with empty OMEGA | Rebuilds from Markdown in <1 min |
| Large global/ directory (1000+ files) | Import may take 2-5 min; consider incremental import |
| Machine A has uncommitted L2 | Stays local until session-end sync |

## Security & Secret Hygiene

1. **Never store secrets in memory:** API keys, tokens, passwords are referenced by env var name only
2. **Pre-commit scanning:** Secret-scan changed Markdown files before commit
3. **No cloud dependencies:** All tools run locally; no data leaves the machine
4. **Git ignore:** `.scratch/`, `.gitnexus/`, `~/.omega/` are never committed to project repos
5. **Agent-memory repo is private:** Never make `~/.config/memory/` public

## Failure Modes

| Failure | Impact | Recovery |
|---------|--------|----------|
| OMEGA SQLite corrupted | Search broken | Delete `~/.omega/`; rebuild from Markdown |
| Git merge conflict | Sync blocked | Manual resolution; re-run sync |
| GitNexus rebuild fails | Code intel stale | Re-run `gitnexus analyze`; check disk space |
| Markdown file deleted | Data loss | Restore from git history |
| Session crash before export | L2 writes lost | Acceptable — L2 is low-value session scratch |

## Open Questions

1. **OMEGA Core feature verification:** Does Core support `omega import --layer` and `omega export`? Validate before migration.
2. **Incremental import:** Can OMEGA import only changed Markdown files, or is full rebuild required?
3. **Embedding model:** What ONNX model does OMEGA Core use? Disk and RAM requirements?
4. **GitNexus rebuild time:** How long for a 500K-line codebase? Acceptable for post-commit hook?

## Related Documents

- `openspec/specs/agent-memory-harness/spec.md` — Previous agent memory harness spec
- `MEMORY_INIT.md` — Project-agnostic setup checklist
- `docs/LESSONS.md` — Current keyword-indexed lessons (will migrate to L2 Markdown)

---

**Next Step:** Review this spec. If approved, invoke `writing-plans` skill to create implementation plan.
