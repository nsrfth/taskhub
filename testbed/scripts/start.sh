#!/usr/bin/env bash
# Start all TaskHub services (assumes setup.sh has been run once).
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.local.yml --env-file .env.local"

echo "Starting TaskHub..."
$COMPOSE up -d

echo ""
echo "  Frontend:    http://192.168.56.31:5173"
echo "  Backend API: http://192.168.56.31:4000/api"
echo "  API Docs:    http://192.168.56.31:4000/api/docs"
echo "  Adminer:     http://192.168.56.31:8080"
echo "  MailHog:     http://192.168.56.31:8025"
echo ""
