#!/usr/bin/env bash
# Import existing memory from OMEGA / agent memory repo into Hindsight
# This populates Hindsight with your existing lessons and project memories

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configuration
HINDSIGHT_URL="${HINDSIGHT_URL:-http://localhost:8888}"
BANK_ID="${BANK_ID:-fast-draft}"
MEMORY_REPO="${MEMORY_REPO:-$HOME/.config/memory}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if Hindsight is running
check_hindsight() {
    log_info "Checking Hindsight availability at $HINDSIGHT_URL..."
    if ! curl -s --max-time 5 "$HINDSIGHT_URL/health" > /dev/null 2>&1; then
        log_error "Hindsight is not running at $HINDSIGHT_URL"
        log_info "Start it first: cd ~/homelab/hindsight && docker compose up -d"
        exit 1
    fi
    log_success "Hindsight is running"
}

# Import a single memory
import_memory() {
    local content="$1"
    local context="$2"
    local timestamp="${3:-}"
    
    local payload
    if [ -n "$timestamp" ]; then
        payload=$(cat <<EOF
{
  "bank_id": "$BANK_ID",
  "content": $(echo "$content" | jq -Rs .),
  "context": "$context",
  "timestamp": "$timestamp"
}
EOF
)
    else
        payload=$(cat <<EOF
{
  "bank_id": "$BANK_ID",
  "content": $(echo "$content" | jq -Rs .),
  "context": "$context"
}
EOF
)
    fi
    
    local response
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        --max-time 30 \
        "$HINDSIGHT_URL/api/v1/retain" 2>/dev/null || echo "")
    
    if [ -n "$response" ]; then
        return 0
    else
        return 1
    fi
}

# Import from project memory files
import_project_memories() {
    local project_dir="$1"
    local project_name="$(basename "$project_dir")"
    
    log_info "Importing memories from project: $project_name"
    local count=0
    
    # Find all markdown files in the project
    while IFS= read -r -d '' file; do
        local filename
        filename=$(basename "$file")
        
        # Skip README and index files
        if [[ "$filename" =~ ^(README|INDEX|index) ]]; then
            continue
        fi
        
        local content
        content=$(cat "$file")
        
        # Extract timestamp from file if available
        local timestamp=""
        if git log -1 --format=%aI "$file" 2>/dev/null; then
            timestamp=$(git log -1 --format=%aI "$file" 2>/dev/null || echo "")
        fi
        
        if import_memory "$content" "project:$project_name:file:$filename" "$timestamp"; then
            ((count++))
            if [ $((count % 10)) -eq 0 ]; then
                log_info "  Imported $count memories..."
            fi
        else
            log_warn "  Failed to import: $file"
        fi
    done < <(find "$project_dir" -name "*.md" -type f -print0 2>/dev/null)
    
    log_success "Imported $count memories from $project_name"
}

# Import lessons
import_lessons() {
    log_info "Importing global lessons..."
    local count=0
    
    if [ -d "$MEMORY_REPO/lessons" ]; then
        while IFS= read -r -d '' file; do
            local content
            content=$(cat "$file")
            local filename
            filename=$(basename "$file")
            
            if import_memory "$content" "global:lessons:file:$filename" ""; then
                ((count++))
            fi
        done < <(find "$MEMORY_REPO/lessons" -name "*.md" -type f -print0 2>/dev/null)
    fi
    
    log_success "Imported $count global lessons"
}

# Import from OMEGA sqlite database if it exists
import_omega_db() {
    local omega_db="$HOME/.omega/fast-draft/omega.db"
    
    if [ ! -f "$omega_db" ]; then
        log_info "No OMEGA database found at $omega_db"
        return 0
    fi
    
    log_info "Importing from OMEGA database..."
    
    # Check if sqlite3 is available
    if ! command -v sqlite3 &> /dev/null; then
        log_warn "sqlite3 not found, skipping OMEGA import"
        return 0
    fi
    
    local count=0
    
    # Export memories from OMEGA
    sqlite3 "$omega_db" "SELECT node_id, content, metadata, created_at FROM memories;" | while IFS='|' read -r node_id content metadata created_at; do
        [ -z "$content" ] && continue
        
        if import_memory "$content" "omega:memory:$node_id" "$created_at"; then
            ((count++))
            if [ $((count % 10)) -eq 0 ]; then
                log_info "  Imported $count OMEGA memories..."
            fi
        fi
    done
    
    log_success "Imported $count memories from OMEGA"
}

# Main
main() {
    echo "========================================"
    echo "  Hindsight Memory Import"
    echo "  Bank: $BANK_ID"
    echo "========================================"
    echo ""
    
    check_hindsight
    
    # Check dependencies
    if ! command -v jq &> /dev/null; then
        log_error "jq is required. Install it: sudo apt install jq"
        exit 1
    fi
    
    if ! command -v curl &> /dev/null; then
        log_error "curl is required."
        exit 1
    fi
    
    log_info "Memory repo location: $MEMORY_REPO"
    log_info "Target Hindsight: $HINDSIGHT_URL"
    echo ""
    
    # Import from memory repo projects
    if [ -d "$MEMORY_REPO/projects" ]; then
        while IFS= read -r -d '' project_dir; do
            import_project_memories "$project_dir"
        done < <(find "$MEMORY_REPO/projects" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)
    fi
    
    # Import global lessons
    import_lessons
    
    # Import from OMEGA
    import_omega_db
    
    echo ""
    log_success "Memory import complete!"
    log_info "You can now test recall with:"
    log_info "  curl -X POST $HINDSIGHT_URL/api/v1/recall \\"
    log_info "    -H 'Content-Type: application/json' \\"
    log_info "    -d '{\"bank_id\":\"$BANK_ID\",\"query\":\"your question\"}'"
}

main "$@"
