#!/bin/bash
# Pre-build script: create a clean dist from site/ excluding build artifacts
# Runs from fd-desktop/ directory (Tauri's npm project root)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# scripts/ → src-tauri/ → fd-desktop/ → repo root
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SITE_DIR="$REPO_ROOT/site"
DIST_DIR="$SCRIPT_DIR/../dist"

echo "[FD Build] Syncing $SITE_DIR → $DIST_DIR (excluding node_modules)..."
rsync -a --delete \
  --exclude='node_modules' \
  --exclude='package.json' \
  --exclude='package-lock.json' \
  --exclude='.DS_Store' \
  --exclude='.taurignore' \
  "$SITE_DIR/" "$DIST_DIR/"

echo "[FD Build] ✓ dist/ ready ($(du -sh "$DIST_DIR" | cut -f1) total)"
