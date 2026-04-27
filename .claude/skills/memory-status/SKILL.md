---
name: memory-status
description: Show read-only project and agent-memory readiness
---

# Skill: memory-status

Use when the user says `/memory-status`, "memory status", or asks whether memory is ready.

Procedure:

1. Run `agentmem repo read-config` in the project root.
2. Report project id, scratch dir, canonical docs, and project subtree.
3. Run `git -C ~/.config/agent-memory status -sb`.
4. Count `.scratch/` files if present.
5. Summarize project/global lesson availability.
6. If status is clean: memory is ready.
7. If status is ahead and clean: recommend `/memory-sync`.
8. If status is dirty (including ahead+dirty): recommend inspecting dirty paths before syncing.

Do not pull, push, stage, or commit from this skill.
