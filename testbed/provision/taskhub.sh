#!/usr/bin/env bash
set -euo pipefail

# Retry a command up to 5 times — VirtualBox NAT DNS can flake on the first try.
retry() {
  local n=1
  until "$@"; do
    if [ "$n" -ge 5 ]; then
      echo "    command failed after $n attempts: $*" >&2
      return 1
    fi
    echo "    attempt $n failed, retrying in 5s..." >&2
    n=$((n + 1))
    sleep 5
  done
}

echo "==> Installing Node.js 20 LTS (for host-side commands inside the VM)..."
if ! command -v node &> /dev/null; then
  retry bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource.sh"
  bash /tmp/nodesource.sh
  retry apt-get install -y -qq nodejs > /dev/null 2>&1
fi
echo "    Node $(node --version), npm $(npm --version)"

echo "==> Pre-pulling Docker images..."
images=(
  "postgres:16-alpine"
  "redis:7-alpine"
  "node:20"
  "mailhog/mailhog:latest"
  "adminer:latest"
)
for img in "${images[@]}"; do
  echo "    Pulling $img..."
  retry docker pull -q "$img"
done

echo "==> Generating .env.local if missing..."
ENV_FILE="/vagrant/testbed/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  POSTGRES_PASSWORD=$(openssl rand -hex 16)
  JWT_ACCESS_SECRET=$(openssl rand -base64 48 | tr -d '\n')
  JWT_REFRESH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
  MASTER_KEY=$(openssl rand -hex 32)
  cp /vagrant/testbed/.env.local.example "$ENV_FILE"
  sed -i "s|POSTGRES_PASSWORD=changeme|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" "$ENV_FILE"
  sed -i "s|JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET|" "$ENV_FILE"
  sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET|" "$ENV_FILE"
  sed -i "s|MASTER_KEY=changeme|MASTER_KEY=$MASTER_KEY|" "$ENV_FILE"
  echo "    Generated .env.local with random secrets"
else
  echo "    .env.local already exists, skipping"
fi

echo "==> TaskHub provisioning complete."
