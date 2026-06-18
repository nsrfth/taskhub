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

echo "==> Installing base dependencies..."
export DEBIAN_FRONTEND=noninteractive
retry apt-get update -qq
retry apt-get install -y -qq \
  curl jq net-tools openssl ca-certificates gnupg \
  > /dev/null 2>&1

echo "==> Installing Docker..."
if ! command -v docker &> /dev/null; then
  retry bash -c "curl -fsSL https://get.docker.com -o /tmp/get-docker.sh"
  sh /tmp/get-docker.sh
  usermod -aG docker vagrant
fi

echo "==> Docker version: $(docker --version)"
echo "==> Common provisioning complete."
