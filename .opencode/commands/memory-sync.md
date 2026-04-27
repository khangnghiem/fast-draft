---
description: Sync durable agent-memory state only
agent: build
---

Synchronize `~/.config/agent-memory` independently from project `/sync-push`.

Follow this exact policy:

1. Operate only on `~/.config/agent-memory`; do not push the current project repo.
2. Inspect local memory state first with `git -C ~/.config/agent-memory status -sb`.
3. If dirty files are present:
   - If every dirty path is a recognized durable memory output from `agentmem promote` or normal memory edits (`projects/**`, `lessons/**`, `snippets/**`, `web/**`, `inbox/**`, `drafts/**`, `preferences.md`, `README.md`), scan the exact candidate paths with `bash ~/.config/agent-memory/scripts/check-secrets.sh <paths>`.
   - Stage only those candidate paths, then run `bash ~/.config/agent-memory/scripts/check-secrets.sh` again in staged-diff mode.
   - Commit with a concise memory-focused message.
   - If any path is unknown, secret-like, cache/index output, or ambiguous, stop and ask before staging.
4. After the worktree is clean, run `git -C ~/.config/agent-memory pull --ff-only`.
   - If it fails because of non-fast-forward/conflicts, stop and ask; do not merge, rebase, or force-push.
5. Run `git -C ~/.config/agent-memory status -sb` again.
6. If clean and ahead, run `git -C ~/.config/agent-memory push`.

Never stage `.scratch/`, never stage secrets, never force-push, and never include project repo changes.
