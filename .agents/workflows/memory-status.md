---
description: Read-only summary of project and agent-memory state
---

# /memory-status - Memory State Summary

$ARGUMENTS

> **Purpose**: Report memory readiness and pending work without committing, pushing, or modifying project files.

// turbo-all

1. **Read project config**
   - Run `agentmem repo read-config` from the current project root.
   - Report `project_id`, `scratch_dir`, `canonical_doc_paths`, and resolved `projectSubtree`.

2. **Check memory repository state**
   - Run `git -C ~/.config/agent-memory status -sb`.
   - Report whether memory is clean, ahead/behind, or dirty.
   - Do not pull, commit, or push from this command unless the user explicitly upgrades to `/memory-sync`.

3. **Summarize useful counts**
   - Count project scratch files under `.scratch/` if present.
   - List or count project lessons with `agentmem global list-lessons --project-id <project_id>`.
   - List or count global lessons with `agentmem global list-lessons`.

4. **Report next action**
   - If clean: say memory is ready.
   - If ahead and clean: suggest `/memory-sync`.
   - If dirty, including ahead+dirty: summarize paths and ask whether to inspect/promote/sync before pushing.
   - If scratch has files: remind that scratch is ephemeral and must be promoted before changing machines.
