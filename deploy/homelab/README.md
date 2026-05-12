# Homelab

Self-hosted services running on Beelink WSL via Docker Compose and TailScale.

## Services

| Service | Description | Status |
|---------|-------------|--------|
| [hindsight](hindsight/) | AI agent memory (Hindsight + PostgreSQL 18 + pgvector) | ✅ Ready |

## Quick Start

```bash
# SSH to Beelink
ssh khangnghiem@beelink

# Deploy a service
cd ~/homelab/hindsight
./scripts/deploy.sh
```

## Structure

```
homelab/
├── README.md              # This file
├── .gitignore             # Global gitignore
└── hindsight/             # Service directory
    ├── docker-compose.yml
    ├── .env               # Secrets (gitignored)
    ├── config/            # Service configs
    └── scripts/           # Deploy/backup/import scripts
```

## Principles

- **One directory per service** — each service is self-contained
- **Docker Compose** — all services run in Docker
- **TailScale networking** — private mesh VPN, no public exposure
- **Bi-weekly backups** — PostgreSQL dumps to iMac over TailScale
- **Latest stable tags** — automatic updates (accept breakage risk)

## Adding a New Service

```bash
mkdir homelab/new-service
cd homelab/new-service
# Create docker-compose.yml, .env.example, config/, scripts/
# Update this README
```
