#!/usr/bin/env bash
# Stop all TaskHub containers (data preserved in volumes).
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.local.yml --env-file .env.local"

if [ "${1:-}" = "-v" ]; then
  echo "Stopping and removing volumes (DB + uploads will be wiped)..."
  $COMPOSE down -v
  echo "All containers and volumes removed."
else
  echo "Stopping containers (data preserved)..."
  $COMPOSE down
  echo "Stopped. Use 'stop.sh -v' to also remove volumes."
fi
