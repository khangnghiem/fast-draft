Report memory readiness without committing, pushing, or modifying project files.

Steps:

1. Run `agentmem repo read-config` from the project root and report:
   - `project_id`,
   - `scratch_dir`,
   - resolved `projectSubtree`,
   - canonical docs summary.
2. Run `git -C ~/.config/agent-memory status -sb` and report clean/ahead/behind/dirty state.
3. Count scratch files under `.scratch/` if present.
4. Run `agentmem global list-lessons --project-id <project_id>` and `agentmem global list-lessons`; summarize counts or names.
5. Recommend next action:
   - clean: memory ready,
   - ahead and clean: run `/memory-sync`,
   - dirty, including ahead+dirty: inspect dirty paths before syncing,
   - scratch files: promote durable notes before switching machines.

Do not run `git pull`, `git push`, `git add`, or `git commit` from this command unless the user explicitly asks to switch to `/memory-sync`.
