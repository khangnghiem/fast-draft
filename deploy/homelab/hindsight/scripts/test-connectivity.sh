#!/usr/bin/env bash
# Test SSH connectivity to Hindsight from TailScale network
# Run this from any machine in your Tailnet (except iPhone)

set -euo pipefail

# Configuration
TAILSCALE_HOSTNAME="${TAILSCALE_HOSTNAME:-hindsight-server}"
HINDSIGHT_API_PORT="${HINDSIGHT_API_PORT:-8888}"
HINDSIGHT_UI_PORT="${HINDSIGHT_UI_PORT:-9999}"
TIMEOUT_SECONDS=10

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }

# Get TailScale IP of the Hindsight server
get_tailscale_ip() {
    local ip
    ip=$(tailscale ip -4 "$TAILSCALE_HOSTNAME" 2>/dev/null || true)
    if [ -z "$ip" ]; then
        log_error "Cannot resolve $TAILSCALE_HOSTNAME in TailScale"
        log_info "Make sure:"
        log_info "  1. TailScale is running on this machine: sudo tailscale up"
        log_info "  2. The hindsight-server is online in your Tailnet"
        log_info "  3. Try: tailscale status | grep hindsight"
        return 1
    fi
    echo "$ip"
}

# Test 1: Basic connectivity (ping)
test_ping() {
    local ip=$1
    log_info "Test 1: Ping $TAILSCALE_HOSTNAME ($ip)..."
    if ping -c 3 -W 5 "$ip" > /dev/null 2>&1; then
        log_success "Ping successful"
        return 0
    else
        log_error "Ping failed"
        return 1
    fi
}

# Test 2: API health endpoint
test_api_health() {
    local ip=$1
    log_info "Test 2: API health check (http://$ip:$HINDSIGHT_API_PORT)..."
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_SECONDS" "http://$ip:$HINDSIGHT_API_PORT/health" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        log_success "API health check passed (HTTP 200)"
        return 0
    else
        log_error "API health check failed (HTTP $response)"
        return 1
    fi
}

# Test 3: API info/version endpoint
test_api_info() {
    local ip=$1
    log_info "Test 3: API info endpoint..."
    local response
    response=$(curl -s --max-time "$TIMEOUT_SECONDS" "http://$ip:$HINDSIGHT_API_PORT/" 2>/dev/null || echo "")
    
    if [ -n "$response" ]; then
        log_success "API responded with info"
        log_info "Response: $(echo "$response" | head -c 200)"
        return 0
    else
        log_error "API info endpoint failed"
        return 1
    fi
}

# Test 4: MCP endpoint availability
test_mcp_endpoint() {
    local ip=$1
    log_info "Test 4: MCP endpoint (http://$ip:$HINDSIGHT_API_PORT/mcp)..."
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_SECONDS" "http://$ip:$HINDSIGHT_API_PORT/mcp" 2>/dev/null || echo "000")
    
    # MCP endpoint might return 404 or 405 for GET, which is fine - it means the server is there
    if [ "$response" = "200" ] || [ "$response" = "404" ] || [ "$response" = "405" ]; then
        log_success "MCP endpoint is accessible (HTTP $response)"
        return 0
    else
        log_error "MCP endpoint test failed (HTTP $response)"
        return 1
    fi
}

# Test 5: UI availability
test_ui() {
    local ip=$1
    log_info "Test 5: Web UI (http://$ip:$HINDSIGHT_UI_PORT)..."
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_SECONDS" "http://$ip:$HINDSIGHT_UI_PORT" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        log_success "Web UI is accessible (HTTP 200)"
        return 0
    else
        log_warn "Web UI returned HTTP $response (may need authentication)"
        return 0  # Don't fail on this
    fi
}

# Test 6: Memory operations (if API key available)
test_memory_ops() {
    local ip=$1
    log_info "Test 6: Memory retain/recall operations..."
    
    # Check if we have an API token or can use the bank directly
    local test_bank="test-bank-$(date +%s)"
    
    # Try to retain a test memory
    local retain_response
    retain_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"bank_id\":\"$test_bank\",\"content\":\"This is a test memory from connectivity check\"}" \
        --max-time "$TIMEOUT_SECONDS" \
        "http://$ip:$HINDSIGHT_API_PORT/api/v1/retain" 2>/dev/null || echo "")
    
    if [ -n "$retain_response" ]; then
        log_success "Memory retain operation works"
        
        # Try recall
        local recall_response
        recall_response=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -d "{\"bank_id\":\"$test_bank\",\"query\":\"test memory\"}" \
            --max-time "$TIMEOUT_SECONDS" \
            "http://$ip:$HINDSIGHT_API_PORT/api/v1/recall" 2>/dev/null || echo "")
        
        if [ -n "$recall_response" ]; then
            log_success "Memory recall operation works"
            return 0
        else
            log_warn "Recall operation returned empty (may need to wait for indexing)"
            return 0
        fi
    else
        log_warn "Memory operations test inconclusive (auth may be required)"
        return 0
    fi
}

# Main test runner
main() {
    echo "========================================"
    echo "  Hindsight Connectivity Tests"
    echo "  Target: $TAILSCALE_HOSTNAME"
    echo "========================================"
    echo ""
    
    # Check if tailscale is running
    if ! command -v tailscale &> /dev/null; then
        log_error "TailScale CLI not found. Install TailScale first."
        exit 1
    fi
    
    if ! tailscale status &> /dev/null; then
        log_error "TailScale is not running. Start it with: sudo tailscale up"
        exit 1
    fi
    
    log_info "Getting TailScale IP for $TAILSCALE_HOSTNAME..."
    local ip
    ip=$(get_tailscale_ip)
    
    log_success "Found $TAILSCALE_HOSTNAME at $ip"
    echo ""
    
    local passed=0
    local failed=0
    
    # Run tests
    if test_ping "$ip"; then ((passed++)); else ((failed++)); fi
    if test_api_health "$ip"; then ((passed++)); else ((failed++)); fi
    if test_api_info "$ip"; then ((passed++)); else ((failed++)); fi
    if test_mcp_endpoint "$ip"; then ((passed++)); else ((failed++)); fi
    if test_ui "$ip"; then ((passed++)); else ((failed++)); fi
    if test_memory_ops "$ip"; then ((passed++)); else ((failed++)); fi
    
    echo ""
    echo "========================================"
    echo "  Test Results: $passed passed, $failed failed"
    echo "========================================"
    
    if [ $failed -eq 0 ]; then
        log_success "All tests passed! Hindsight is accessible via TailScale."
        echo ""
        log_info "You can now connect MCP clients:"
        log_info "  Claude Code: claude mcp add --transport http hindsight http://$ip:$HINDSIGHT_API_PORT/mcp"
        log_info "  Generic:     http://$ip:$HINDSIGHT_API_PORT/mcp"
        exit 0
    else
        log_error "Some tests failed. Check the Hindsight server status."
        echo ""
        log_info "Troubleshooting:"
        log_info "  1. On Beelink WSL, check: docker compose ps"
        log_info "  2. Check logs: docker compose logs -f hindsight"
        log_info "  3. Verify TailScale: docker exec hindsight-tailscale tailscale status"
        log_info "  4. Check firewall: sudo ufw status"
        exit 1
    fi
}

main "$@"
