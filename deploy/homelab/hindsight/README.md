# Hindsight Self-Hosted Deployment

Complete deployment package for running Hindsight (AI agent memory) on Beelink WSL with PostgreSQL 18, pgvector, and TailScale networking.

## Architecture Decision: Pure Hindsight for AI Agents

This deployment uses **Hindsight as the sole memory system** for AI coding agents. The git-based `~/.config/memory/` repo is retired as the primary agent memory layer.

### Why Pure Hindsight?

After multi-model council consultation (GPT-5.5, Claude Sonnet 4.6, MiniMax M2.7):

| Factor | Git Memory | Hindsight |
|--------|-----------|-----------|
| **Semantic recall** | Weak (keyword grep) | ✅ Strong (embedding search) |
| **Cross-agent sharing** | Manual (git sync) | ✅ Automatic (MCP endpoint) |
| **Session episodic memory** | None | ✅ retain/recall/reflect |
| **Proactive context** | None | ✅ TEMPR retrieval |
| **Exact command recall** | ✅ grep | Weak (semantic approximation) |
| **Offline access** | ✅ Works after clone | ❌ Requires TailScale + Beelink |
| **Version history** | ✅ git log | Weak (no native versioning) |

**Verdict**: For AI-only consumption, Hindsight's semantic retrieval and proactive TEMPR injection exceed git's value. The "AI only" argument is sound — agents need relevance, not human-readable history.

### Critical Gaps Addressed

1. **Exact commands/configs**: Maintain a `Config Reference` bank in Hindsight with plain-text exact values
2. **Silent amnesia**: Add session-start `recall` hook to `AGENTS.md` (mandatory, not optional)
3. **Bootstrap dependency**: Keep repo-local `AGENTS.md` / docs as deterministic fallback layer
4. **Single point of failure**: Bi-weekly pg_dump backups to iMac (see Backup section)

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Tailnet                             │
│                                                             │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐             │
│   │ Laptop   │   │ Desktop  │   │ iPhone   │             │
│   │ (MCP)    │   │ (MCP)    │   │ (TS app) │             │
│   └────┬─────┘   └────┬─────┘   └────┬─────┘             │
│        │              │              │                     │
│        └──────────────┼──────────────┘                     │
│                       │                                     │
│              TailScale Mesh VPN                             │
│                       │                                     │
│        ┌──────────────┴──────────────┐                     │
│        │                             │                     │
│   ┌────┴────┐                 ┌──────┴──────┐            │
│   │ Beelink │                 │  Hindsight  │            │
│   │ WSL     │◄────────────────│  Server     │            │
│   │         │   localhost     │  :8888/:9999│            │
│   └─────────┘                 └─────────────┘            │
│        │                           │                        │
│        │                    ┌─────┴────────┐               │
│        │                    │  PostgreSQL  │               │
│        │                    │  18 + pgvector│              │
│        │                    └──────────────┘              │
│        │                                                   │
│   ┌────┴────┐                                              │
│   │ Bi-weekly│  pg_dump over TailScale                     │
│   │ backup  │  ─────────────────────────► iMac ~/pg_dumps/ │
│   └─────────┘                                              │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Beelink (or similar) running WSL2 with Ubuntu/Debian
- Docker and Docker Compose installed
- TailScale account with auth key
- LLM API key (Groq, OpenAI, Anthropic, or Ollama)

## Quick Start

### 1. Copy to Beelink WSL

```bash
# On your local machine, copy this directory to Beelink
rsync -avz deploy/hindsight/ beelink-wsl:~/homelab/hindsight/

# SSH into Beelink WSL
ssh beelink-wsl
```

### 2. Configure Environment

```bash
cd ~/homelab/hindsight

# Copy example config
cp .env.example .env

# Edit with your values
nano .env
```

Required variables in `.env`:

```bash
# PostgreSQL
POSTGRES_PASSWORD=your-secure-password

# LLM Provider (from your ~/.zshrc.secrets)
HINDSIGHT_API_LLM_PROVIDER=groq
HINDSIGHT_API_LLM_API_KEY=gsk-your-key
HINDSIGHT_API_LLM_MODEL=llama-3.3-70b-versatile

# TailScale
TS_AUTHKEY=tskey-auth-your-key
```

### 3. Deploy

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Run deployment
./scripts/deploy.sh
```

This will:
- Pull Docker images (PostgreSQL 18 + pgvector, Hindsight, TailScale)
- Start all services
- Wait for health checks
- Show connection info

### 4. Verify TailScale

```bash
# On Beelink WSL, check TailScale status
docker exec hindsight-tailscale tailscale status

# Get the TailScale IP
docker exec hindsight-tailscale tailscale ip -4
```

### 5. Test Connectivity from Other Machines

From any machine in your Tailnet (except iPhone):

```bash
# Copy test script
scp beelink-wsl:~/homelab/hindsight/scripts/test-connectivity.sh /tmp/
chmod +x /tmp/test-connectivity.sh

# Run tests
/tmp/test-connectivity.sh
```

Or manually:

```bash
# Get TailScale IP
tailscale ip -4 hindsight-server

# Test API
curl http://<tailscale-ip>:8888/health

# Test MCP endpoint
curl http://<tailscale-ip>:8888/mcp
```

## Importing Existing Memory

### From OMEGA / Memory Repo

```bash
# On Beelink WSL
cd ~/homelab/hindsight
./scripts/import-memory.sh
```

This imports:
- Project memories from `~/.config/memory/projects/`
- Global lessons from `~/.config/memory/lessons/`
- OMEGA database from `~/.omega/fast-draft/omega.db`

### Manual Import via API

```bash
# Retain a memory
curl -X POST http://localhost:8888/api/v1/retain \
  -H "Content-Type: application/json" \
  -d '{
    "bank_id": "fast-draft",
    "content": "Hindsight is deployed on Beelink WSL with PostgreSQL 18",
    "context": "infrastructure"
  }'

# Recall memories
curl -X POST http://localhost:8888/api/v1/recall \
  -H "Content-Type: application/json" \
  -d '{
    "bank_id": "fast-draft",
    "query": "deployment setup"
  }'
```

## Connecting MCP Clients

### Claude Code

```bash
# Add MCP server (from any machine in Tailnet)
claude mcp add --transport http hindsight http://<tailscale-ip>:8888/mcp

# Or with bank pinning (simpler - no bank_id needed per request)
claude mcp add --transport http hindsight http://<tailscale-ip>:8888/mcp/banks/fast-draft
```

### OpenCode / Claude Desktop

Add to `~/.claude/config.json` or `~/.config/opencode/opencode.json`:

```json
{
  "mcpServers": {
    "hindsight": {
      "type": "http",
      "url": "http://<tailscale-ip>:8888/mcp",
      "headers": {}
    }
  }
}
```

### Cursor / Windsurf

Add to MCP configuration:

```json
{
  "mcpServers": {
    "hindsight": {
      "url": "http://<tailscale-ip>:8888/mcp"
    }
  }
}
```

## Service URLs

| Service | URL (Beelink local) | URL (TailScale) |
|---------|-------------------|----------------|
| Hindsight API | http://localhost:8888 | http://hindsight-server:8888 |
| Hindsight UI | http://localhost:9999 | http://hindsight-server:9999 |
| MCP Endpoint | http://localhost:8888/mcp | http://hindsight-server:8888/mcp |
| PostgreSQL | localhost:5432 | (not exposed) |

## Management Commands

```bash
# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f hindsight

# Restart service
docker compose restart hindsight

# Stop all
docker compose down

# Stop and remove volumes (WARNING: deletes data)
docker compose down -v

# Backup database (local)
./scripts/backup.sh

# Backup to iMac over TailScale
./scripts/backup-to-imac.sh

# Setup bi-weekly backup cron
./scripts/setup-cron.sh

# Update images
docker compose pull && docker compose up -d

# Check TailScale
docker exec hindsight-tailscale tailscale status
docker exec hindsight-tailscale tailscale ip -4
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs hindsight

# Verify env file
cat .env | grep -v '^#' | grep -v '^$'

# Check port conflicts
sudo lsof -i :8888
sudo lsof -i :9999
sudo lsof -i :5432
```

### TailScale not connecting

```bash
# Check TailScale auth
docker exec hindsight-tailscale tailscale status

# Re-authenticate if needed
docker exec hindsight-tailscale tailscale up --force-reauth

# Check if auth key is valid (non-expired, correct tags)
```

### Hindsight API errors

```bash
# Check if PostgreSQL is healthy
docker compose ps

# Check PostgreSQL logs
docker compose logs postgres

# Verify pgvector extension
docker exec hindsight-postgres psql -U hindsight -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

### LLM provider errors

```bash
# Check Hindsight logs for LLM errors
docker compose logs hindsight | grep -i "llm\|error\|fail"

# Verify API key is set correctly
docker compose exec hindsight env | grep HINDSIGHT_API_LLM
```

## Security Notes

1. **Never commit `.env` to git** — it contains API keys and passwords
2. **TailScale auth key** — Generate a non-ephemeral, reusable key from TailScale admin console
3. **PostgreSQL** — Only bound to localhost (127.0.0.1), not exposed to Tailnet
4. **Hindsight ports** — Only accessible within Tailnet via TailScale mesh
5. **No public internet exposure** — All services are private to your Tailnet

## Backup Strategy

### Bi-Weekly pg_dump to iMac

Automatic backups run every 14 days via cron, transferring PostgreSQL dumps to your iMac over TailScale.

```bash
# On Beelink WSL
cd ~/homelab/hindsight

# Configure iMac destination in .env:
# IMAC_HOST=imac.tailnetname.ts.net
# IMAC_USER=your-username
# IMAC_BACKUP_DIR=/Users/${IMAC_USER}/pg_dumps

# Install cron job
./scripts/setup-cron.sh

# Or run manually
./scripts/backup-to-imac.sh
```

**Backup retention**: Keeps last 12 backups (~6 months) on iMac.

**Prerequisites**:
- iMac has TailScale IP/hostname reachable from Beelink
- SSH key auth set up (no password): `ssh-copy-id user@imac.tailnetname.ts.net`
- iMac has `~/pg_dumps/` directory (created automatically)

### Manual Backup

```bash
# Quick local backup
./scripts/backup.sh

# Restore from backup (test this!)
gunzip < hindsight_20240115_020000.sql.gz | psql -U hindsight -d hindsight
```

### No Markdown Export

This deployment does NOT export to markdown. The pg_dump backups are the canonical disaster recovery mechanism. If you need markdown later, use Hindsight's built-in export or write a custom script.

## File Structure

```
homelab/hindsight/
├── docker-compose.yml          # Main compose file (PG18 + Hindsight + TailScale)
├── .env.example                # Environment template
├── .env                        # Your secrets (gitignored)
├── config/
│   ├── postgres-init.sql       # PostgreSQL initialization
│   └── nginx.conf              # Optional Nginx reverse proxy
├── scripts/
│   ├── deploy.sh               # One-command deployment
│   ├── import-memory.sh        # Import from OMEGA/memory repo
│   ├── test-connectivity.sh    # Test from other machines
│   ├── backup.sh               # Local backup script
│   ├── backup-to-imac.sh       # Bi-weekly backup to iMac
│   └── setup-cron.sh           # Install backup cron job
├── logs/                       # Backup logs
└── README.md                   # This file
```

## Image Tags

This deployment uses **latest stable tags** (not pinned digests):

| Service | Tag | Rationale |
|---------|-----|-----------|
| PostgreSQL | `pgvector:pg18` | Latest PostgreSQL 18 with pgvector |
| Hindsight | `hindsight:latest` | Latest stable release |
| TailScale | `tailscale:latest` | Latest stable release |

**Trade-off**: You get latest features and security patches automatically, but schema/API changes could break on update. If stability is critical, pin to specific digests in `docker-compose.yml`.

## Updating

```bash
cd ~/homelab/hindsight

# Pull new images (uses latest tags)
docker compose pull

# Restart with new images
docker compose up -d

# Verify
docker compose ps
```

## Uninstall

```bash
cd ~/homelab/hindsight

# Stop and remove containers
docker compose down

# Remove volumes (DELETES ALL DATA)
docker compose down -v

# Remove deployment directory
cd ~ && rm -rf hindsight-deploy
```

## Resources

- [Hindsight Documentation](https://hindsight.vectorize.io)
- [Hindsight GitHub](https://github.com/vectorize-io/hindsight)
- [TailScale Documentation](https://tailscale.com/kb)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [PostgreSQL 18 Release Notes](https://www.postgresql.org/docs/18/release-18.html)
