#!/bin/bash
# Migration script from agentmem to OMEGA
# Copies agentmem project files to OMEGA-compatible locations

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

AGENTMEM_BASE="${AGENT_MEMORY_PATH:-$HOME/.config/agent-memory}"
PROJECT_PATH="$AGENTMEM_BASE/projects/fast-draft"
GLOBAL_LESSONS="$AGENTMEM_BASE/lessons"
OMEGA_MEMORY="$PROJECT_ROOT/memory"

echo "=== agentmem → OMEGA Migration ==="
echo ""

# Check if source directories exist
if [ ! -d "$AGENTMEM_BASE" ]; then
    echo "[SKIP] agentmem base directory not found: $AGENTMEM_BASE"
    exit 0
fi

# Track if we did anything
COPIED=0

# --- Project Markdown files ---
if [ -d "$PROJECT_PATH" ]; then
    echo "[1/4] Processing project files from agentmem..."
    echo "      Source: $PROJECT_PATH"

    # Copy README if exists
    if [ -f "$PROJECT_PATH/README.md" ]; then
        cp -n "$PROJECT_PATH/README.md" "$OMEGA_MEMORY/" 2>/dev/null || true
        echo "      Copied: README.md"
        COPIED=1
    fi

    # Copy subdirectories: drafts, inbox, lessons, sessions, transcripts, attachments, web
    for SUBDIR in drafts inbox lessons sessions transcripts attachments web; do
        if [ -d "$PROJECT_PATH/$SUBDIR" ]; then
            DEST="$OMEGA_MEMORY/$SUBDIR"
            mkdir -p "$DEST"
            # Copy all markdown files, skip existing (idempotent)
            find "$PROJECT_PATH/$SUBDIR" -name "*.md" -type f -exec cp -n {} "$DEST/" \; 2>/dev/null || true
            COUNT=$(find "$PROJECT_PATH/$SUBDIR" -name "*.md" -type f | wc -l | tr -d ' ')
            if [ "$COUNT" -gt 0 ]; then
                echo "      Copied $COUNT .md files to $SUBDIR/"
                COPIED=1
            fi
        fi
    done
else
    echo "[1/4] Project path not found: $PROJECT_PATH (skipping)"
fi

echo ""

# --- Global lessons ---
if [ -d "$GLOBAL_LESSONS" ]; then
    echo "[2/4] Processing global lessons from agentmem..."
    echo "      Source: $GLOBAL_LESSONS"

    if [ -f "$GLOBAL_LESSONS/README.md" ]; then
        cp -n "$GLOBAL_LESSONS/README.md" "$OMEGA_MEMORY/" 2>/dev/null || true
        echo "      Copied: README.md"
        COPIED=1
    fi

    # Global lessons go to memory/lessons.md (append if exists)
    if [ -f "$GLOBAL_LESSONS/lessons.md" ]; then
        if [ -f "$OMEGA_MEMORY/lessons.md" ]; then
            # Check if content differs before appending
            if ! cmp -s "$GLOBAL_LESSONS/lessons.md" "$OMEGA_MEMORY/lessons.md"; then
                echo "      Appending global lessons to memory/lessons.md"
                echo "" >> "$OMEGA_MEMORY/lessons.md"
                echo "--- Appended from agentmem global lessons $(date) ---" >> "$OMEGA_MEMORY/lessons.md"
                cat "$GLOBAL_LESSONS/lessons.md" >> "$OMEGA_MEMORY/lessons.md"
                COPIED=1
            else
                echo "      Global lessons.md already matches (skipping)"
            fi
        else
            cp -n "$GLOBAL_LESSONS/lessons.md" "$OMEGA_MEMORY/" 2>/dev/null || true
            echo "      Copied: lessons.md"
            COPIED=1
        fi
    fi
else
    echo "[2/4] Global lessons not found: $GLOBAL_LESSONS (skipping)"
fi

echo ""

# --- Verify OMEGA config ---
echo "[3/4] Verifying OMEGA configuration..."
if [ -f "$OMEGA_MEMORY/config.yml" ]; then
    echo "      OMEGA config found at: $OMEGA_MEMORY/config.yml"
    echo "      Project ID: fast-draft"
else
    echo "      [WARN] OMEGA config not found at: $OMEGA_MEMORY/config.yml"
fi

echo ""

# --- Summary ---
echo "[4/4] Migration complete!"
echo ""
echo "=== Summary ==="
echo "OMEGA memory location: $OMEGA_MEMORY"
echo "Agentmem source:      $AGENTMEM_BASE"
echo ""
echo "Next steps:"
echo "  1. Review copied files in $OMEGA_MEMORY/"
echo "  2. Run 'omega reindex' to update the search index"
echo "  3. Test with 'omega search <query>'"
echo ""
echo "Note: Original agentmem files are preserved (copy only)."
