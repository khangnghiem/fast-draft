# Agent Observability

## Enable and inspect

1. OpenCode loads `.opencode/plugins/agent-observer.js` automatically.
2. Logs are written to `.opencode/telemetry/events-YYYY-MM-DD.jsonl`.
3. Run `node scripts/observer-dump.mjs --stuck-only --format table` to find unresolved sessions.

Quick checks:

- `npm run observer:dump -- --help` prints supported flags.
- `node scripts/observer-dump.mjs --format json` outputs machine-readable stuck/resolved summaries.

## What this slice can diagnose

- waiting on a permission response
- busy session with no meaningful progress
- compaction completed without follow-up progress
- idle session that still has pending todos
- repeated tool loops

Reason keys in telemetry currently include:

- `waiting_permission`
- `busy_no_progress`
- `post_compaction_no_progress`
- `idle_with_pending_todos`
- `repeat_tool_loop`

## Current limits

The installed plugin runtime exposes the v1 event stream. It does not expose workspace restore or question events, so this slice cannot yet distinguish Desktop restore failures directly.

## Privacy notes

- Tool payload text is not stored verbatim.
- Telemetry keeps shape metadata and short hashes (`argShape`, `argHash`) for correlation.
- Tool outputs are summarized (status, metadata keys, output length), not persisted as full raw content.
