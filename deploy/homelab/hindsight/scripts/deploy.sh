#!/usr/bin/env bash
# Hindsight Deployment Script for Beelink WSL
# Run this on your Beelink WSL after copying the deployment package

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Install it first:"
        log_error "  curl -fsSL https://get.docker.com | sh"
        exit 1
    fi
    
    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed."
        exit 1
    fi
    
    # Check .env file
    if [ ! -f .env ]; then
        log_error ".env file not found! Copy .env.example to .env and configure it:"
        log_error "  cp .env.example .env"
        log_error "  nano .env  # Edit with your values"
        exit 1
    fi
    
    # Check if critical env vars are set
    local required_vars=("POSTGRES_PASSWORD" "HINDSIGHT_API_LLM_PROVIDER" "HINDSIGHT_API_LLM_API_KEY" "TS_AUTHKEY")
    local missing=0
    
    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" .env || grep -q "^${var}=.*your-" .env || grep -q "^${var}=.*changeme" .env; then
            log_error "Required variable ${var} is not set correctly in .env"
            missing=1
        fi
    done
    
    if [ $missing -eq 1 ]; then
        exit 1
    fi
    
    log_success "All prerequisites met"
}

# Create necessary directories
setup_directories() {
    log_info "Setting up directories..."
    mkdir -p data/postgres data/hindsight data/tailscale logs
    log_success "Directories created"
}

# Pull images
pull_images() {
    log_info "Pulling Docker images..."
    docker compose pull
    log_success "Images pulled"
}

# Deploy the stack
deploy() {
    log_info "Deploying Hindsight stack..."
    docker compose up -d
    log_success "Stack deployed"
}

# Wait for services to be healthy
wait_for_healthy() {
    log_info "Waiting for services to be healthy..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        local postgres_status=$(docker inspect --format='{{.State.Health.Status}}' hindsight-postgres 2>/dev/null || echo "starting")
        local hindsight_status=$(docker inspect --format='{{.State.Health.Status}}' hindsight-api 2>/dev/null || echo "starting")
        
        if [ "$postgres_status" = "healthy" ] && [ "$hindsight_status" = "healthy" ]; then
            log_success "All services are healthy!"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts - Postgres: $postgres_status, Hindsight: $hindsight_status"
        sleep 10
        attempt=$((attempt + 1))
    done
    
    log_error "Services did not become healthy within timeout"
    log_error "Check logs with: docker compose logs"
    return 1
}

# Show status
show_status() {
    log_info "Deployment status:"
    echo ""
    docker compose ps
    echo ""
    
    local tailscale_ip=$(docker exec hindsight-tailscale tailscale ip -4 2>/dev/null || echo "N/A")
    log_info "TailScale IP: $tailscale_ip"
    log_info "Hindsight API:  http://localhost:8888"
    log_info "Hindsight UI:   http://localhost:9999"
    log_info "MCP Endpoint:   http://localhost:8888/mcp"
    echo ""
    log_info "To view logs: docker compose logs -f"
    log_info "To stop:      docker compose down"
    log_info "To restart:   docker compose restart"
}

# Main
main() {
    echo "========================================"
    echo "  Hindsight Deployment for Beelink WSL"
    echo "========================================"
    echo ""
    
    check_prerequisites
    setup_directories
    pull_images
    deploy
    wait_for_healthy
    show_status
    
    echo ""
    log_success "Hindsight is deployed and ready!"
    log_info "Next steps:"
    log_info "  1. Verify TailScale connectivity: docker exec hindsight-tailscale tailscale status"
    log_info "  2. Test API: curl http://localhost:8888/health"
    log_info "  3. Open UI:  http://localhost:9999"
    log_info "  4. Import memory: ./scripts/import-memory.sh"
}

main "$@"
