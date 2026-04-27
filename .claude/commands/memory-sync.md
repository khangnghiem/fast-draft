Synchronize durable `agent-memory` state only. Do not touch the current project branch.

Steps:

1. Run `git -C ~/.config/agent-memory status -sb` before pulling.
2. If dirty files are present:
   - If every dirty path is a recognized durable memory output from `agentmem promote` or normal memory edits (`projects/**`, `lessons/**`, `snippets/**`, `web/**`, `inbox/**`, `drafts/**`, `preferences.md`, `README.md`), scan the exact candidate paths with `bash ~/.config/agent-memory/scripts/check-secrets.sh <paths>`.
   - Stage only those candidate paths, then run `bash ~/.config/agent-memory/scripts/check-secrets.sh` again in staged-diff mode.
   - Commit with a concise memory-focused message.
   - If any path is unknown, secret-like, cache/index output, or ambiguous, stop and ask before staging.
3. Once the worktree is clean, run `git -C ~/.config/agent-memory pull --ff-only`.
   - If this fails, stop and ask; do not merge, rebase, or force-push.
4. Run `git -C ~/.config/agent-memory status -sb` again.
5. If clean and ahead of origin, run `git -C ~/.config/agent-memory push`.
6. If ahead plus dirty, inspect/resolve dirty state first; do not push until clean.

Forbidden:
- never stage `.scratch/`,
- never stage secrets,
- never force-push,
- never push the current project repo from this command.
