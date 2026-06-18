#!/usr/bin/env bash
# Rebuild a service after dependency changes (package.json / lockfile).
# Drops the node_modules volume so the next boot reinstalls from scratch.
# Usage: rebuild.sh [backend|frontend|all]
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.local.yml --env-file .env.local"
TARGET="${1:-all}"

rebuild_backend() {
  echo "Rebuilding backend..."
  $COMPOSE stop backend
  $COMPOSE rm -f backend
  docker volume rm -f "$(docker volume ls -q --filter name=backend-node-modules)" 2>/dev/null || true
  $COMPOSE up -d backend
  echo "Backend rebuilt. Reinstalling deps + migrating on boot (watch: docker logs -f taskhub-local-backend)."
}

rebuild_frontend() {
  echo "Rebuilding frontend..."
  $COMPOSE stop frontend
  $COMPOSE rm -f frontend
  docker volume rm -f "$(docker volume ls -q --filter name=frontend-node-modules)" 2>/dev/null || true
  $COMPOSE up -d frontend
  echo "Frontend rebuilt. Reinstalling deps on boot (watch: docker logs -f taskhub-local-frontend)."
}

case "$TARGET" in
  backend)  rebuild_backend ;;
  frontend) rebuild_frontend ;;
  all)      rebuild_backend; rebuild_frontend ;;
  *)        echo "Usage: rebuild.sh [backend|frontend|all]"; exit 1 ;;
esac
