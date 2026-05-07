---
description: Sync durable memory state without touching project branches
---

# /memory-sync - Durable Memory Sync

$ARGUMENTS

> **Purpose**: Synchronize `~/.config/memory` independently from project `/sync-push`. Never commit or push `.scratch/` directly.

// turbo-all

1. **Scope guard**
   - This command operates only on `~/.config/memory`.
   - Do not push the current project repo unless the user separately asks for `/sync-push`.

2. **Inspect before pulling**
   - Run `git -C ~/.config/memory status -sb` before any pull.
   - If unknown dirty files, generated cache/index files, credentials, or ambiguous files are present, stop and ask before staging anything.

3. **Commit known durable memory outputs only**
    - If every dirty path is a recognized durable memory output from `mem promote` or normal memory edits (`projects/**`, `lessons/**`, `snippets/**`, `web/**`, `inbox/**`, `drafts/**`, `preferences.md`, `README.md`), scan the exact candidate paths with `bash ~/.config/memory/scripts/check-secrets.sh <paths>`.
   - Stage only those candidate paths.
    - Run `bash ~/.config/memory/scripts/check-secrets.sh` again in staged-diff mode.
   - Commit with a concise memory-focused message.

4. **Pull latest memory only from a clean worktree**
   - Run `git -C ~/.config/memory pull --ff-only`.
   - If this fails due to non-fast-forward or conflicts, stop and ask the user to resolve; do not rebase or merge automatically.

5. **Push committed memory**
   - Run `git -C ~/.config/memory status -sb`.
   - Clean and not ahead: report no memory sync needed.
   - Clean and ahead: push with `git -C ~/.config/memory push`.
   - Ahead plus dirty: inspect dirty state first; do not push until the working tree is clean or the user decides what to do.

6. **Forbidden**
   - Never stage `.scratch/`.
   - Never stage `.env`, tokens, API keys, or secrets.
   - Never force-push.
   - Never include project repo changes in this command.
