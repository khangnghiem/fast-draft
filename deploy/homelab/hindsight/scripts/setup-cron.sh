#!/bin/bash
# setup-cron.sh — Install bi-weekly backup cron job
# Run this on Beelink WSL after deploying Hindsight

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_SCRIPT="$DEPLOY_DIR/scripts/backup-to-imac.sh"
LOG_FILE="$DEPLOY_DIR/logs/backup.log"

# Create logs directory
mkdir -p "$DEPLOY_DIR/logs"

echo "🔧 Setting up bi-weekly Hindsight backup cron job..."
echo "   Backup script: $BACKUP_SCRIPT"
echo "   Log file: $LOG_FILE"
echo ""

# Check backup script exists
if [[ ! -x "$BACKUP_SCRIPT" ]]; then
    echo "❌ ERROR: Backup script not found or not executable:"
    echo "   $BACKUP_SCRIPT"
    exit 1
fi

# Cron schedule: 2:00 AM every 14 days
# Format: min hour day month day-of-week
CRON_SCHEDULE="0 2 */14 * *"
CRON_JOB="$CRON_SCHEDULE $BACKUP_SCRIPT >> $LOG_FILE 2>&1"

# Check if job already exists
if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
    echo "⚠️  Cron job already exists. Updating..."
    # Remove existing entry
    crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT" | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null || true; echo "$CRON_JOB") | crontab -

echo "✅ Cron job installed:"
echo "   Schedule: Every 14 days at 2:00 AM"
echo "   Command:  $BACKUP_SCRIPT"
echo "   Log:      $LOG_FILE"
echo ""

# Show current crontab
echo "📋 Current crontab:"
crontab -l | grep hindsight || true
echo ""

# Test the backup script once manually
echo "🧪 Would you like to run a test backup now? (y/N)"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    echo ""
    echo "Running test backup..."
    "$BACKUP_SCRIPT"
else
    echo "Skipping test. Run manually with:"
    echo "   $BACKUP_SCRIPT"
fi

echo ""
echo "📖 To remove the cron job later:"
echo "   crontab -e"
echo "   # Delete the line containing hindsight"
