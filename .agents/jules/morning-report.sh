#!/usr/bin/env bash
set -euo pipefail

# Jules Morning Report — consolidates overnight results, squash-merges passing PRs
# Designed for cron: 50 23 * * * (= 6:50am VN time)

REPO="khangnghiem/fast-draft"
REPORT_FILE="/tmp/jules-morning-report-$(date +%Y%m%d).md"
SESSION_FILE="/tmp/jules-sessions-$(date +%Y%m%d).txt"
MAX_MERGES=10

# ─── Helpers ───

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ─── Main ───

echo "# FD Overnight Report — $(date '+%Y-%m-%d')" > "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 1. List completed sessions from tonight
log "Fetching overnight session results..."

completed_count=0
failed_count=0
merged_count=0

echo "## Session Results" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Get all sessions and filter for recent ones (last 8 hours)
jules_output=$(jules remote list --session 2>/dev/null || echo "")

if [[ -z "$jules_output" ]]; then
  echo "No Jules sessions found." >> "$REPORT_FILE"
else
  echo "| Status | Session ID | Description |" >> "$REPORT_FILE"
  echo "|--------|------------|-------------|" >> "$REPORT_FILE"

  # Parse sessions launched tonight (from session file if it exists)
  if [[ -f "$SESSION_FILE" ]]; then
    while IFS= read -r session_id; do
      [[ -z "$session_id" ]] && continue

      # Check session status
      status=$(jules remote list --session 2>/dev/null | grep "$session_id" | awk '{print $NF}' || echo "Unknown")

      case "$status" in
        Completed)
          echo "| ✅ | $session_id | Completed |" >> "$REPORT_FILE"
          completed_count=$((completed_count + 1))
          ;;
        Failed)
          echo "| ❌ | $session_id | Failed |" >> "$REPORT_FILE"
          failed_count=$((failed_count + 1))
          ;;
        *)
          echo "| ⏳ | $session_id | $status |" >> "$REPORT_FILE"
          ;;
      esac
    done < "$SESSION_FILE"
  fi
fi

echo "" >> "$REPORT_FILE"

# 2. Find and merge open PRs from overnight
log "Checking for open PRs..."

echo "## Merged PRs" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# List open PRs by the repo owner (Jules creates PRs as authenticated user)
open_prs=$(gh pr list --repo "$REPO" --state open --json number,title,headRefName,statusCheckRollup --limit 20 2>/dev/null || echo "[]")

if [[ "$open_prs" == "[]" ]] || [[ -z "$open_prs" ]]; then
  echo "No open PRs to merge." >> "$REPORT_FILE"
else
  # Process each PR
  echo "$open_prs" | jq -c '.[]' | while IFS= read -r pr_json; do
    pr_number=$(echo "$pr_json" | jq -r '.number')
    pr_title=$(echo "$pr_json" | jq -r '.title')
    pr_branch=$(echo "$pr_json" | jq -r '.headRefName')

    # Skip PRs not from feature branches
    if [[ ! "$pr_branch" =~ ^(feat|fix|refactor|test|docs)/ ]]; then
      log "  Skipping PR #${pr_number} (branch: ${pr_branch}) — not a feature branch"
      continue
    fi

    # Check if CI passes (look at check status)
    check_status=$(gh pr checks "$pr_number" --repo "$REPO" 2>/dev/null | grep -c "fail" || echo "0")

    if [[ "$check_status" -gt 0 ]]; then
      echo "- ⚠️ PR #${pr_number}: ${pr_title} — CI failing, skipped" >> "$REPORT_FILE"
      log "  PR #${pr_number} has failing checks, skipping merge"
      continue
    fi

    # Enforce max merges
    if [[ $merged_count -ge $MAX_MERGES ]]; then
      echo "- ⏸ PR #${pr_number}: ${pr_title} — deferred (max ${MAX_MERGES} merges/day)" >> "$REPORT_FILE"
      continue
    fi

    # Squash merge
    log "  Squash-merging PR #${pr_number}: ${pr_title}"
    if gh pr merge "$pr_number" --repo "$REPO" --squash --delete-branch 2>/dev/null; then
      echo "- ✅ PR #${pr_number}: ${pr_title}" >> "$REPORT_FILE"
      merged_count=$((merged_count + 1))
    else
      echo "- ❌ PR #${pr_number}: ${pr_title} — merge failed" >> "$REPORT_FILE"
    fi
  done
fi

echo "" >> "$REPORT_FILE"

# 3. Remaining queue
log "Checking remaining queue..."

echo "## Remaining Queue (Next Up)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [[ -f "$(dirname "$0")/nightly-queue.md" ]]; then
  grep -A1 'Status\*\*: \[ \]' "$(dirname "$0")/nightly-queue.md" | grep '^### ' | head -3 | while IFS= read -r line; do
    echo "- ${line}" >> "$REPORT_FILE"
  done
else
  echo "- Queue file not found" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"

# 4. Test count snapshot
log "Getting test counts..."

echo "## Stats" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

rust_tests=$(cd "$(git rev-parse --show-toplevel 2>/dev/null || echo '.')" && cargo test --workspace -- --list 2>/dev/null | grep -c "test$" || echo "?")
echo "- Rust tests: ${rust_tests}" >> "$REPORT_FILE"
echo "- Sessions completed: ${completed_count}" >> "$REPORT_FILE"
echo "- Sessions failed: ${failed_count}" >> "$REPORT_FILE"
echo "- PRs merged tonight: ${merged_count}" >> "$REPORT_FILE"

echo "" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
echo "*Generated at $(date '+%Y-%m-%d %H:%M:%S %Z')*" >> "$REPORT_FILE"

# 5. Output report (cron can pipe to mail)
log "=== Report generated: ${REPORT_FILE} ==="
cat "$REPORT_FILE"
