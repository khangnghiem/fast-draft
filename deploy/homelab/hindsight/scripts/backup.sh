#!/usr/bin/env bash
# Backup Hindsight memory data
# Run this periodically to backup your memories

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/hindsight-backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/hindsight_backup_$TIMESTAMP.sql"

mkdir -p "$BACKUP_DIR"

# Backup PostgreSQL
docker exec hindsight-postgres pg_dump -U hindsight hindsight > "$BACKUP_FILE"

echo "Backup saved to: $BACKUP_FILE"
echo "Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/hindsight_backup_*.sql | tail -n +11 | xargs -r rm

echo "Backup complete. Last 10 backups kept."
