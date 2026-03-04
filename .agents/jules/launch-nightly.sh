#!/usr/bin/env bash
set -euo pipefail

# Jules Nightly Launcher — spawns focused sessions from nightly-queue.md
# Designed for cron: 0 18 * * * (= 1am VN time)

REPO="khangnghiem/fast-draft"
QUEUE_FILE="$(dirname "$0")/nightly-queue.md"
LOG_FILE="/tmp/jules-nightly-$(date +%Y%m%d).log"
MAX_SESSIONS=5
DELAY_BETWEEN=30  # seconds between session launches

# ─── Helpers ───

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# Extract unchecked tasks from queue: lines matching "- **Status**: [ ]"
# Walk backwards from each status line to find the task heading
get_pending_tasks() {
  awk '
    /^### \[/ { task_title = $0; task_body = "" }
    /^- \*\*/ { task_body = task_body "\n" $0 }
    /- \*\*Status\*\*: \[ \]/ {
      # Extract priority number
      match(task_title, /\[([0-9]+)\]/, arr)
      # Extract requirement line
      match(task_body, /Requirement\*\*: (.+)/, req)
      # Extract scope line
      match(task_body, /Scope\*\*: (.+)/, scope)
      # Extract tests line
      match(task_body, /Tests\*\*: (.+)/, tests)
      # Extract acceptance line
      match(task_body, /Acceptance\*\*: (.+)/, accept)
      # Extract estimated sessions
      match(task_body, /Estimated sessions\*\*: ([0-9]+)/, est)

      # Only pick tasks with estimated sessions <= 2 for nightly
      if (est[1] <= 2) {
        print task_title "|||" req[1] "|||" scope[1] "|||" tests[1] "|||" accept[1]
      }
    }
  ' "$QUEUE_FILE"
}

# Build a focused prompt for Jules
build_prompt() {
  local title="$1"
  local requirement="$2"
  local scope="$3"
  local tests="$4"
  local acceptance="$5"

  # Strip markdown formatting from title
  local clean_title
  clean_title=$(echo "$title" | sed 's/^### \[[0-9]*\] //')

  # Derive branch name from title
  local branch_name
  branch_name=$(echo "$clean_title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//' | cut -c1-40)

  cat <<PROMPT
## Task: ${clean_title}

Implement ${clean_title} for the FD (Fast Draft) project.
Requirement: ${requirement}

### Scope
Files to modify: ${scope}

### Test Requirements (TDD — write tests FIRST)
${tests}

### Acceptance Criteria
${acceptance}

### Rules (MANDATORY — read these carefully)
1. Read GEMINI.md at the repo root — follow ALL rules without exception
2. Read .agents/workflows/nonstop.md — follow Phases 1-3 exactly
3. Read docs/LESSONS.md — scan for keywords related to your task area
4. Create feature branch: git checkout -b feat/${branch_name}
5. Write tests FIRST, then implement to make them pass
6. All 4 CI checks must pass before committing:
   cargo check --workspace
   cargo test --workspace
   cargo clippy --workspace -- -D warnings
   cargo fmt --all -- --check
7. Create exactly 1 PR with conventional commit title (e.g. feat(core): ${clean_title})
8. Reference requirement ID (${requirement}) in PR body
9. Never commit to main — feature branch only
10. Never use unwrap() in library code
11. Keep functions ≤ 30 lines, ≤ 3 args
12. If you encounter an issue that needs human judgment, document it in the PR description and move on
PROMPT
}

# ─── Main ───

log "=== Jules Nightly Launcher — $(date '+%Y-%m-%d') ==="
log "Repository: ${REPO}"
log "Max sessions: ${MAX_SESSIONS}"

# Read pending tasks
mapfile -t TASKS < <(get_pending_tasks)

if [[ ${#TASKS[@]} -eq 0 ]]; then
  log "No pending tasks in queue. Nothing to launch."
  exit 0
fi

log "Found ${#TASKS[@]} pending tasks (≤2 session estimate)"

# Launch sessions (up to MAX_SESSIONS)
launched=0
for task_line in "${TASKS[@]}"; do
  if [[ $launched -ge $MAX_SESSIONS ]]; then
    log "Reached max sessions (${MAX_SESSIONS}). Remaining tasks deferred to next night."
    break
  fi

  # Parse pipe-delimited fields
  IFS='|||' read -ra FIELDS <<< "$task_line"
  title="${FIELDS[0]}"
  requirement="${FIELDS[1]:-unknown}"
  scope="${FIELDS[2]:-see queue}"
  tests="${FIELDS[3]:-write appropriate tests}"
  acceptance="${FIELDS[4]:-feature works as described}"

  # Build and send prompt
  prompt=$(build_prompt "$title" "$requirement" "$scope" "$tests" "$acceptance")

  log "Launching session $((launched + 1)): ${title}"

  # Create Jules session
  session_id=$(jules new --repo "$REPO" "$prompt" 2>&1 | grep -oP 'Session ID: \K[0-9]+' || echo "unknown")

  log "  → Session ID: ${session_id}"
  echo "$session_id" >> "/tmp/jules-sessions-$(date +%Y%m%d).txt"

  launched=$((launched + 1))

  # Delay between launches to avoid rate limiting
  if [[ $launched -lt $MAX_SESSIONS ]] && [[ $launched -lt ${#TASKS[@]} ]]; then
    log "  Waiting ${DELAY_BETWEEN}s before next launch..."
    sleep "$DELAY_BETWEEN"
  fi
done

log "=== Launched ${launched} sessions. Check morning-report.sh at 7am. ==="
