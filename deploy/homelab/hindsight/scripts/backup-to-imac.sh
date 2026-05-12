#!/bin/bash
# backup-to-imac.sh — Bi-weekly pg_dump to iMac via TailScale
# Run via cron: 0 2 */14 * * /opt/hindsight/scripts/backup-to-imac.sh
#
# Prerequisites:
#   - iMac has TailScale IP and SSH access configured
#   - iMac has ~/pg_dumps/ directory created
#   - Beelink can reach iMac via TailScale
#   - SSH key auth set up (no password prompt)

set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────
# iMac TailScale IP or MagicDNS name
IMAC_HOST="${IMAC_HOST:-imac.tailnetname.ts.net}"
IMAC_USER="${IMAC_USER:-$(whoami)}"
IMAC_BACKUP_DIR="${IMAC_BACKUP_DIR:-/Users/${IMAC_USER}/pg_dumps}"

# PostgreSQL settings (match your docker-compose.yml)
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-hindsight}"
PG_DB="${PG_DB:-hindsight}"
PG_PASSWORD="${PG_PASSWORD:-}"  # Read from .env if available

# Backup retention on iMac (keep last N backups)
KEEP_LAST="${KEEP_LAST:-12}"

# Timestamp format
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="hindsight_${TIMESTAMP}.sql.gz"

# Local temp directory
TMP_DIR="${TMP_DIR:-/tmp/hindsight-backup}"
mkdir -p "$TMP_DIR"

# ─── Load .env if present ──────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/../.env" ]]; then
    # shellcheck source=/dev/null
    source "$SCRIPT_DIR/../.env"
fi

# ─── Preflight Checks ───────────────────────────────────────────────────────
echo "🔍 Running preflight checks..."

# Check TailScale connectivity
echo "  → Checking TailScale connectivity to iMac..."
if ! ping -c 1 -W 5 "$IMAC_HOST" >/dev/null 2>&1; then
    echo "❌ ERROR: Cannot reach iMac via TailScale ($IMAC_HOST)"
    echo "   Check: tailscale status | grep $IMAC_HOST"
    exit 1
fi
echo "  ✅ iMac reachable via TailScale"

# Check iMac SSH access
echo "  → Checking SSH access to iMac..."
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "${IMAC_USER}@${IMAC_HOST}" "echo ok" >/dev/null 2>&1; then
    echo "❌ ERROR: Cannot SSH to iMac as ${IMAC_USER}@${IMAC_HOST}"
    echo "   Fix: ssh-copy-id ${IMAC_USER}@${IMAC_HOST}"
    exit 1
fi
echo "  ✅ SSH access verified"

# Check iMac backup directory exists (create if not)
echo "  → Checking backup directory on iMac..."
if ! ssh "${IMAC_USER}@${IMAC_HOST}" "test -d ${IMAC_BACKUP_DIR}" 2>/dev/null; then
    echo "  ⚠️  Backup dir not found, creating..."
    ssh "${IMAC_USER}@${IMAC_HOST}" "mkdir -p ${IMAC_BACKUP_DIR}"
fi
echo "  ✅ Backup directory ready"

# Check PostgreSQL is accessible
echo "  → Checking PostgreSQL connectivity..."
if ! PGPASSWORD="${PG_PASSWORD}" pg_isready -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" >/dev/null 2>&1; then
    echo "❌ ERROR: PostgreSQL not reachable at ${PG_HOST}:${PG_PORT}"
    echo "   Check: docker ps | grep postgres"
    exit 1
fi
echo "  ✅ PostgreSQL is up"

# ─── Perform Backup ─────────────────────────────────────────────────────────
echo ""
echo "📦 Starting pg_dump of hindsight database..."
echo "   Source: ${PG_USER}@${PG_HOST}:${PG_PORT}/${PG_DB}"
echo "   Destination: ${IMAC_USER}@${IMAC_HOST}:${IMAC_BACKUP_DIR}/${BACKUP_NAME}"

LOCAL_BACKUP="${TMP_DIR}/${BACKUP_NAME}"

# Dump and compress locally first (avoids streaming over network on failure)
echo "  → Running pg_dump..."
if ! PGPASSWORD="${PG_PASSWORD}" pg_dump \
    -h "$PG_HOST" \
    -p "$PG_PORT" \
    -U "$PG_USER" \
    -d "$PG_DB" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    | gzip > "$LOCAL_BACKUP"; then
    echo "❌ ERROR: pg_dump failed"
    rm -f "$LOCAL_BACKUP"
    exit 1
fi

BACKUP_SIZE=$(du -h "$LOCAL_BACKUP" | cut -f1)
echo "  ✅ Dump complete: ${BACKUP_SIZE}"

# ─── Transfer to iMac ───────────────────────────────────────────────────────
echo "  → Transferring to iMac..."
if ! scp "$LOCAL_BACKUP" "${IMAC_USER}@${IMAC_HOST}:${IMAC_BACKUP_DIR}/${BACKUP_NAME}"; then
    echo "❌ ERROR: SCP transfer failed"
    echo "   Check: tailscale status, iMac disk space"
    rm -f "$LOCAL_BACKUP"
    exit 1
fi

# Verify remote file exists and has size
REMOTE_SIZE=$(ssh "${IMAC_USER}@${IMAC_HOST}" "du -h ${IMAC_BACKUP_DIR}/${BACKUP_NAME} | cut -f1")
echo "  ✅ Transfer complete: ${REMOTE_SIZE}"

# ─── Cleanup ────────────────────────────────────────────────────────────────
# Remove local temp
rm -f "$LOCAL_BACKUP"

# Cleanup old backups on iMac (keep last N)
echo "  → Cleaning up old backups on iMac (keeping last ${KEEP_LAST})..."
ssh "${IMAC_USER}@${IMAC_HOST}" "
    cd ${IMAC_BACKUP_DIR} && \
    ls -t hindsight_*.sql.gz 2>/dev/null | \
    tail -n +$((KEEP_LAST + 1)) | \
    xargs -r rm -f
"
echo "  ✅ Cleanup complete"

# ─── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "✅ Backup completed successfully!"
echo "   File: ${IMAC_BACKUP_DIR}/${BACKUP_NAME}"
echo "   Size: ${REMOTE_SIZE}"
echo "   Time: $(date)"

# List remaining backups on iMac
echo ""
echo "📋 Backups on iMac:"
ssh "${IMAC_USER}@${IMAC_HOST}" "ls -lh ${IMAC_BACKUP_DIR}/hindsight_*.sql.gz 2>/dev/null | tail -5"
