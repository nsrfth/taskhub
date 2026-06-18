#!/usr/bin/env bash
# Show status of all TaskHub services.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.local.yml --env-file .env.local"

echo "=== Container Status ==="
$COMPOSE ps
echo ""

echo "=== Health Checks ==="
check() {
  local name="$1" url="$2"
  if curl -sf "$url" > /dev/null 2>&1; then
    echo "  [OK]   $name ($url)"
  else
    echo "  [FAIL] $name ($url)"
  fi
}

check "Backend API" "http://localhost:4000/api/health"
check "Frontend"    "http://localhost:5173/"
check "Adminer"     "http://localhost:8080/"
check "MailHog"     "http://localhost:8025/"
echo ""

echo "=== Resource Usage ==="
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" \
  $(docker ps --format '{{.Names}}' --filter 'name=taskhub-local') 2>/dev/null || echo "  No running containers."
echo ""

echo "=== Volume Sizes ==="
docker system df -v 2>/dev/null | grep -E "taskhub|VOLUME" || true
