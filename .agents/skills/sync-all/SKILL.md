---
name: sync-all
description: Run the global config sync script at ~/.config/sync-all.sh to sync dotfiles, memory, opencode, and skills.
---

# Sync All

Run the global configuration sync orchestrator.

## When to Use

Use when the user says "sync all", "run sync", "sync everything", or explicitly asks to run `~/.config/sync-all.sh`.

## How to Run

Execute the script directly:

```bash
bash ~/.config/sync-all.sh
```

## What It Does

The script syncs these domains:
- **dotfiles** — git pull/push
- **memory** — git pull/push via `~/.config/memory/sync.sh`
- **opencode** — skipped if not a git repo
- **skills** — skipped if not a git repo

## Output

Print the full script output. If there are issues, report which domains failed.
