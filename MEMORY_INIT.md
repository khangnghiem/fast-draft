# Memory Harness — Init Guide

> **Purpose:** project-agnostic checklist to bring a new repo onto the agent
> memory harness defined in
> `openspec/specs/agent-memory-harness/spec.md`.
>
> Use this when adding the harness to any future project. Replace
> `<owner>`, `<repo>`, and `<owner>__<repo>` with your values.

---

## Prereqs (one-time per machine)

You only do this once per workstation. Skip if already done.

1. **Global `memory` repo** cloned to `~/.config/memory/`.
   ```bash
   gh repo clone <owner>/memory ~/.config/memory
   ```
2. **Shell alias** in `~/.zshrc`:
   ```bash
   export MEM_HOME="$HOME/.config/memory"
   alias mem="$MEM_HOME/bin/mem"
   ```
   Then run `bash $MEM_HOME/scripts/install.sh` once to install npm deps and
   wire the secret-scanning pre-commit hook (`core.hooksPath=.githooks`).
3. **Secrets file** `~/.zshrc.secrets` exists and is sourced from `~/.zshrc`.
4. **`gh`, `git`, `npx`** available on PATH.

If any of these are missing, follow Phases 0–4 of
`openspec/changes/archive/agent-memory-harness/tasks.md` in any project that already
has the harness — those phases set up the global pieces, not the project.

---

## Per-project init (run inside the new project repo)

### Step 1 — Topic branch

```bash
git checkout -b feat/memory-harness-init
```

Never wire the harness directly on `main`.

### Step 2 — Add `.memory/config.yml`

Create `.memory/config.yml` at repo root with schema v1:

```yaml
schema: 1

# Project identity. Used to namespace project content under
# memory/projects/<project_id>/.
project_id: <owner>__<repo>

# Local scratch directory (gitignored, not synced).
scratch_dir: .scratch

# Project-canonical doc paths the agent should read first.
# Customize this list to match your project's actual canonical docs.
canonical_doc_paths:
  - docs/REQUIREMENTS.md
  - docs/LESSONS.md
  - docs/CHANGELOG.md
  - docs/specs/
  - openspec/

# Optional vector/cache paths. Gitignored.
lancedb_path: .memory/cache/lancedb

# OpenSpec config root.
openspec_dir: openspec

# Web capture default routing: project | global | both.
web_capture_target: project

# Path to the global memory clone on this machine.
memory_path: ~/.config/memory
```

### Step 3 — `.gitignore` entries

Append to `.gitignore`:

```
# Agent memory harness — only .memory/config.yml is tracked.
.scratch/
.memory/*
!.memory/config.yml
.lancedb/
```

Verify:

```bash
git check-ignore .scratch/foo .memory/cache/foo .memory/lessons/foo.md
# all three should print
git check-ignore .memory/config.yml
# should print nothing (file is tracked)
```

### Step 4 — Create the project subtree in global memory

```bash
mkdir -p ~/.config/memory/projects/<owner>__<repo>/{lessons,sessions,drafts,transcripts,web,attachments}
```

Add a `README.md` for the project subtree:

```bash
cat > ~/.config/memory/projects/<owner>__<repo>/README.md <<'EOF'
# <owner>/<repo> — project memory

## License flags
- (note any non-permissive deps used here)

## Deploy quirks
- (record one-off prod gotchas here)

## Cross-machine session log convention
- `sessions/YYYY-MM-DD.md`
EOF
```

Commit and push in `memory`:

```bash
cd ~/.config/memory
git add projects/<owner>__<repo>/
git commit -m "chore: add <owner>__<repo> project subtree"
git push
cd -
```

### Step 5 — Initialize OpenSpec (if not already)

```bash
npx -y openspec init
```

Verify `openspec/config.yaml` exists. If you already have feature specs under
`docs/specs/`, leave them in place — OpenSpec is for in-flight changes only.

### Step 6 — Agent surfaces

If the project uses the same surface renderer as Fast Draft
(`.agents/shared/canonical.md` + `.agents/overrides/repo.md` →
`AGENTS.md` / `CLAUDE.md` / `GEMINI.md`):

1. Confirm `.agents/shared/canonical.md` already contains the generic
   "Memory Harness" section (it should, since it's shared).
2. Add a project-specific section to `.agents/overrides/repo.md`:
   ```markdown
   ## Memory Harness — project specifics

    - Global memory repo: `~/.config/memory/`
    - Project subtree: `memory/projects/<owner>__<repo>/`
    - Project config: `.memory/config.yml`
    - MCP launch: `node $MEM_HOME/mcp-server/index.ts` (or `npx tsx $MEM_HOME/mcp-server/index.ts`)
   - `project_id`: `<owner>__<repo>`
   ```
3. Regenerate:
   ```bash
   npm run render:agent-surfaces
   npm run verify:agent-surfaces
   ```

If the project does **not** use a renderer, hand-edit `AGENTS.md` to add an
equivalent "Memory Harness" section. Less ideal but acceptable for small repos.

### Step 7 — Register MCP for your agent host

Create `.opencode/mcp.json` (or the equivalent for Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "mem": {
      "command": "npx",
      "args": ["tsx", "/Users/<you>/.config/memory/mcp-server/index.ts"]
    }
  }
}
```

Restart the agent host to pick up the new MCP.

### Step 8 — CI guard for `.scratch/` and `.memory/`

Add a CI job that rejects PRs adding files under `.scratch/` or `.memory/`
(other than the tracked `.memory/config.yml`). Minimal GitHub Actions snippet:

```yaml
- name: Reject .scratch/ and .memory/ additions
  run: |
    set -euo pipefail
    base="${{ github.event.pull_request.base.sha }}"
    head="${{ github.event.pull_request.head.sha }}"
    added=$(git diff --name-only --diff-filter=A "$base...$head")
    bad_scratch=$(printf '%s\n' "$added" | grep -E '^\.scratch/' || true)
    bad_memory=$(printf '%s\n' "$added" | grep -E '^\.memory/' | grep -v '^\.memory/config\.yml$' || true)
    offenders=$(printf '%s\n%s\n' "$bad_scratch" "$bad_memory" | grep -v '^$' || true)
    if [ -n "$offenders" ]; then
      echo "::error::PR adds files under .scratch/ or .memory/ (other than .memory/config.yml):"
      echo "$offenders" | sed 's/^/  /'
      exit 1
    fi
```

### Step 9 — Smoke test

Open an agent session in the project repo and verify:

```
agent calls repo.read_config        → returns parsed config
agent calls repo.search             → returns project hits
agent calls repo.write_scratch      → file appears in .scratch/, not staged
agent calls promote.scratch_to_project_global
                                     → file copied to memory/projects/<id>/
                                     → commit present in memory
agent calls sync.push --scope global → push succeeds
```

If any step fails, see troubleshooting below.

### Step 10 — Document and land

1. Add a "Memory Harness" entry to `docs/REQUIREMENTS.md`.
2. Add a changelog entry to `docs/CHANGELOG.md`.
3. Open PR `feat: memory harness init`.
4. Merge.

---

## Daily workflow once initialized

| When | What | How |
|------|------|-----|
| Session start | Pull latest memory | `mem sync pull --scope both` |
| New feature/bug prompt | Retrieve relevant memory before planning | `mem repo search <keywords>` plus project/global lessons |
| During work | Capture session notes | `mem repo write-scratch ...` |
| During work | Look up past lessons | `mem global list-lessons` or via MCP |
| Worth keeping | Promote to project memory | `mem promote scratch-to-project-global ...` |
| Worth sharing | Promote to global lessons | `mem promote lesson-to-global ...` |
| Install commands | Ensure global memory commands are present | `mem commands install` |
| Inspect memory | Read-only status | `/memory-status` |
| Session end | Push durable memory updates only | `/memory-sync` or `mem sync push --scope global` |
| Sync all configs | Push memory + other configs | `sync-all` (or `bash ~/.config/sync-all.sh`) |

`.scratch/` is local-only by design. If you change machines, anything you want
to carry with you must already be promoted to `memory/projects/<id>/`.

Keep memory sync separate from project `/sync-push`: project pushes should not
implicitly commit or push `~/.config/memory`. `/memory-sync` and
`/memory-status` are global commands installed from `~/.config/memory`;
run `mem commands install` if your coding agent does not show them.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `repo.read_config` fails | `.memory/config.yml` missing or schema invalid | Recreate from Step 2 template |
| `sync.pull` fails with non-fast-forward | Concurrent edits on another machine | Manual `git pull --rebase` in `~/.config/memory/`, resolve, retry |
| MCP tools not visible | Agent host not restarted | Restart agent host after editing `.opencode/mcp.json` |
| `.scratch/` files showing in `git status` | Missing `.gitignore` entry | Re-do Step 3 |
| Pre-commit secret scanner false positive | Pattern matched legit content | Whitelist via env var name reference instead of literal value |
| `memory` push rejected | Branch protection or unconfigured remote | `cd ~/.config/memory && git remote -v && git push -u origin main` |

---

## What you do **NOT** do per project

- Do **not** create a separate `<project>.notes` repo. Project content lives
  under `memory/projects/<owner>__<repo>/`.
- Do **not** commit anything under `.scratch/`. It is local-only.
- Do **not** hand-edit generated `AGENTS.md` if a renderer exists.
- Do **not** put secrets in any memory layer. Reference env var names only.
- Do **not** publish `mem` to npm. Distribution is via `git pull` in
  `~/.config/memory/`.

---

## References

- Canonical design: `openspec/specs/agent-memory-harness/spec.md`
  (lives in the Fast Draft repo; mirror or copy into your new project's
  OpenSpec changes if you want a local copy).
- First-time bootstrap tasks (global pieces — only needed if no project on this
  machine has set up the harness yet):
  `openspec/changes/archive/agent-memory-harness/tasks.md` (Phases 0–4).
