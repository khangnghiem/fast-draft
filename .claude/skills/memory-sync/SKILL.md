---
name: memory-sync
description: Sync durable agent-memory state independently from project /sync-push
---

# Skill: memory-sync

Use when the user says `/memory-sync`, "sync memory", or asks to push agent-memory.

Procedure:

1. Operate only in `~/.config/agent-memory`.
2. Inspect `git status -sb` before pulling.
3. If dirty paths are all recognized durable memory outputs, scan exact paths with `bash scripts/check-secrets.sh <paths>`, stage only those paths, run `bash scripts/check-secrets.sh` again in staged-diff mode, then commit.
4. Stop and ask for unknown dirty files, cache/index files, secret-like files, or any ambiguity.
5. From a clean worktree, run `git pull --ff-only`; stop on non-fast-forward/conflicts.
6. Push clean committed-ahead memory changes automatically.

Never stage `.scratch/`, never force-push, and never include current project repo changes.
