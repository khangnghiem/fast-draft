# Jules Overnight Automation

Automated nightly development for FD (Fast Draft) using [Jules CLI](https://jules.google.com).

## How It Works

```
1:00 AM VN ─── launch-nightly.sh ──→ 4-6 Jules sessions created
                                      Each session: 1 focused task → 1 PR
6:50 AM VN ─── morning-report.sh ──→ Squash-merge passing PRs (≤10/day)
                                      Generate consolidated report
7:00 AM VN ─── You wake up ────────→ Read 1 email with everything done
```

## Files

| File                  | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| `nightly-queue.md`    | Prioritized task backlog (edit this to control what gets built) |
| `launch-nightly.sh`   | Reads queue, builds focused prompts, spawns Jules sessions      |
| `morning-report.sh`   | Lists results, squash-merges PRs, generates report              |
| `crontab-example.txt` | Cron entries for 1am–7am VN schedule                            |

## Setup

1. **Install Jules CLI**: Follow [jules.google.com](https://jules.google.com) instructions
2. **Login**: `jules login`
3. **Install cron**: `crontab -e` and paste lines from `crontab-example.txt`
4. **Make scripts executable**:
   ```bash
   chmod +x .agents/jules/launch-nightly.sh .agents/jules/morning-report.sh
   ```

## Adding Tasks

Edit `nightly-queue.md`. Each task follows this format:

```markdown
### [Priority] Task Title

- **Requirement**: R3.5 / NEW / QUALITY
- **Scope**: Which crates/files change
- **Tests**: Test function names (TDD — tests first)
- **Acceptance**: How to know it's done
- **Estimated sessions**: 1-3 (≤2 picked for nightly)
- **Status**: [ ] ← change to [x] when merged, [!] if failed
```

**Rules**:

- Tasks with `estimated sessions > 2` are skipped by the launcher (too complex for overnight)
- Tasks are picked top-to-bottom — put highest priority first
- Each session produces exactly 1 PR with conventional commit title

## Manual Runs

```bash
# Launch manually (outside cron)
.agents/jules/launch-nightly.sh

# Generate report manually
.agents/jules/morning-report.sh

# Check session results
jules remote list --session

# Pull a specific session's changes
jules remote pull --session <ID> --apply
```

## Guard Rails

These are enforced by the session prompts (from GEMINI.md + LESSONS.md):

- Never commit to `main` — feature branches only
- All 4 CI checks must pass (check, test, clippy, fmt)
- TDD — tests written before implementation
- Functions ≤ 30 lines, ≤ 3 args
- No `unwrap()` in library code
- Squash merge only — clean `main` history
- ≤ 10 PRs merged per day
