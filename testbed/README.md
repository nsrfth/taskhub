# TaskHub Local Development (Vagrant + VirtualBox)

Semi-local development environment that runs the full TaskHub stack inside a
VirtualBox VM while you edit code on your Windows host. **No Docker needed on
the host** — the VM provides it. Changes auto-reload via HMR (frontend) and
`tsx watch` (backend).

## Prerequisites

- [Vagrant](https://www.vagrantup.com/downloads) 2.4+
- [VirtualBox](https://www.virtualbox.org/wiki/Downloads) 7.0+
- ~6 GB free RAM

## Quick Start

```bash
cd testbed

# 1. Boot the VM (~5 min first time — downloads box + Docker images)
vagrant up

# 2. SSH in and run first-time setup
#    (installs deps, runs Prisma migrations, seeds the admin user)
vagrant ssh
cd /vagrant/testbed
bash scripts/setup.sh
```

First boot inside the containers runs `npm install` + `prisma migrate deploy`
+ seed, so `setup.sh` can take several minutes the first time. Subsequent boots
are fast (deps are cached in named volumes).

## Daily Usage

```bash
# Start (from host or inside VM)
vagrant up                  # resume VM if halted
vagrant ssh -c "cd /vagrant/testbed && bash scripts/start.sh"

# Stop
vagrant ssh -c "cd /vagrant/testbed && bash scripts/stop.sh"
vagrant halt                # suspend VM (data preserved)

# Check status + health
vagrant ssh -c "cd /vagrant/testbed && bash scripts/status.sh"

# Rebuild after dependency changes (package.json / lockfile)
vagrant ssh -c "cd /vagrant/testbed && bash scripts/rebuild.sh backend"
vagrant ssh -c "cd /vagrant/testbed && bash scripts/rebuild.sh frontend"

# Tail logs
vagrant ssh -c "docker logs -f taskhub-local-backend"
```

## Services

Everything is reached from your host via the VM's private IP **192.168.56.31**
— there are no `localhost` port-forwards, so nothing collides with other apps
already using ports on your machine.

| Service     | URL                              | Notes                       |
|-------------|----------------------------------|-----------------------------|
| Frontend    | http://192.168.56.31:5173        | Vite dev server with HMR    |
| Backend API | http://192.168.56.31:4000/api    | Fastify with `tsx watch`    |
| API Docs    | http://192.168.56.31:4000/api/docs | Swagger UI (Zod-generated) |
| Adminer     | http://192.168.56.31:8080        | Postgres web UI             |
| MailHog     | http://192.168.56.31:8025        | Catches all outgoing email  |

**Admin login:** `admin@taskhub.local` / `admin` (override via `SEED_ADMIN_*`
in `.env.local`). **Change it in production.**

**Adminer login:** System `PostgreSQL`, Server `localhost`, Username/Database
`taskhub`, Password from `.env.local` (`POSTGRES_PASSWORD`).

**Richer demo data:** set `SEED_IT_DEMO=1` in `.env.local` before first boot
(or before a `rebuild.sh backend` after wiping the DB) for 4 teams + ~180 tasks.

## Architecture

```
Windows Host (edit code here, no Docker required)
  │
  └── d:\_projects\nsrfth-taskhub\taskhub\  → mounted at /vagrant
        │  (backend/, frontend/, USER_MANUAL.md, …)
        ▼
VirtualBox VM (192.168.56.31, 4 GB RAM, 2 CPUs)
  └── Docker Compose
      ├── db         (PostgreSQL 16)            :5432
      ├── redis      (Redis 7)                  :6379
      ├── backend    (Node 20 + Fastify + Prisma, tsx watch)  :4000
      ├── frontend   (Node 20 + Vite, HMR)      :5173
      ├── mailhog    (dev SMTP)                 :1025 / :8025
      └── adminer    (DB web UI)                :8080
```

`backend` and `frontend` run with `network_mode: host` so the Vite proxy
(`/api → localhost:4000`, hard-coded in `vite.config.ts`) and the backend's DB
connection work without container DNS. `node_modules` and uploads live in named
volumes so the host's Windows-built modules never leak Linux-incompatible
native binaries (argon2, Prisma engines) into the containers.

## Running the backend test suite

The test suite needs a Postgres that looks like a test DB. Port 5432 is
forwarded to the host, so from inside the VM:

```bash
vagrant ssh
docker exec -it taskhub-local-db psql -U taskhub -c "CREATE DATABASE taskhub_test;"
cd /vagrant/backend
DATABASE_URL='postgresql://taskhub:<POSTGRES_PASSWORD>@localhost:5432/taskhub_test?schema=public' \
  npx prisma migrate deploy
DATABASE_URL='postgresql://taskhub:<POSTGRES_PASSWORD>@localhost:5432/taskhub_test?schema=public' \
  npx vitest run
```

## Cleanup

```bash
# Stop and wipe the database + uploads volumes (keeps the VM)
vagrant ssh -c "cd /vagrant/testbed && bash scripts/stop.sh -v"

# Remove VM completely (keeps downloaded box image)
vagrant destroy -f

# Remove box image too
vagrant box remove bento/ubuntu-24.04
```
