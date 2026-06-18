#!/usr/bin/env bash
# First-time setup: starts infrastructure, then the app stack (which installs
# deps, runs Prisma migrations, and seeds the admin user on first boot).
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
COMPOSE="docker compose -f docker-compose.local.yml --env-file $ENV_FILE"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Run 'vagrant provision' first or copy .env.local.example."
  exit 1
fi

source "$ENV_FILE"

echo "=== TaskHub Local Setup ==="
echo ""

# Step 1: Start infrastructure (DB, Redis, MailHog, Adminer).
echo "[1/4] Starting infrastructure (db, redis, mailhog, adminer)..."
$COMPOSE up -d db redis mailhog adminer

# Step 2: Wait for Postgres.
echo "[2/4] Waiting for Postgres to be healthy..."
for i in $(seq 1 30); do
  if docker exec taskhub-local-db pg_isready -U "${POSTGRES_USER:-taskhub}" > /dev/null 2>&1; then
    echo "       Postgres is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Postgres did not become ready in time."
    $COMPOSE logs db --tail=20
    exit 1
  fi
  printf "       Waiting... (%d/30)\r" "$i"
  sleep 2
done

# Step 3: Start the app stack. First boot runs npm install + prisma
# migrate/seed inside the containers, so this can take a few minutes.
echo "[3/4] Starting backend + frontend (first boot installs deps + migrates)..."
$COMPOSE up -d backend frontend

# Step 4: Wait for services. Generous timeout for the first-run npm install.
echo "[4/4] Waiting for services (first run can take several minutes)..."
for i in $(seq 1 90); do
  if curl -sf "http://localhost:4000/api/health" > /dev/null 2>&1; then
    echo "       Backend is ready.                         "
    break
  fi
  printf "       Waiting for backend... (%d/90)\r" "$i"
  sleep 5
done

for i in $(seq 1 40); do
  if curl -sf "http://localhost:5173/" > /dev/null 2>&1; then
    echo "       Frontend is ready.                        "
    break
  fi
  printf "       Waiting for frontend... (%d/40)\r" "$i"
  sleep 3
done

echo ""
echo "=== TaskHub Local Dev Environment Ready ==="
echo ""
echo "  Reach everything from your host via the VM IP (no localhost collision):"
echo ""
echo "  Frontend:    http://192.168.56.31:5173"
echo "  Backend API: http://192.168.56.31:4000/api"
echo "  API Docs:    http://192.168.56.31:4000/api/docs"
echo "  Adminer:     http://192.168.56.31:8080  (server: db, db/user: ${POSTGRES_USER:-taskhub})"
echo "  MailHog:     http://192.168.56.31:8025"
echo ""
echo "  Admin login: ${SEED_ADMIN_EMAIL:-admin@taskhub.local} / ${SEED_ADMIN_PASSWORD:-admin}"
echo ""
echo "  Edit code on your host machine — HMR (frontend) + tsx watch (backend) auto-reload."
echo ""
