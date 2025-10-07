#!/usr/bin/env bash
set -euo pipefail

have() { command -v "$1" &>/dev/null; }

if docker compose version &>/dev/null; then
  COMPOSE=(docker compose)
elif have docker-compose; then
  COMPOSE=(docker-compose)
else
  echo "Docker Compose v1 or v2 is required." >&2
  exit 1
fi

bring_up_infra() {
  "${COMPOSE[@]}" up -d db redis
}

init_db() {
  echo "Initializing database schema..."
  local tries=20
  until "${COMPOSE[@]}" run --rm api python -c "from app.db.session import init_db; init_db()"; do
    tries=$((tries-1))
    if [[ $tries -le 0 ]]; then
      echo "Database initialization failed." >&2
      exit 1
    fi
    echo "Database not ready yet. Retrying..."
    sleep 2
  done
}

usage() {
  cat <<USAGE
Usage: scripts/run.sh <command>

Commands:
  up           Build and start all services
  up-d         Build and start all services (detached)
  down         Stop services
  reup         Rebuild images and start detached
  build        Rebuild images without starting
  logs         Tail logs
  ps           Show container status
  init-db      Run database initialization
USAGE
}

cmd=${1:-}
shift || true

case "$cmd" in
  up)
    bring_up_infra
    init_db
    "${COMPOSE[@]}" up --build api worker web
    ;;
  up-d)
    bring_up_infra
    init_db
    "${COMPOSE[@]}" up --build -d api worker web
    ;;
  reup)
    "${COMPOSE[@]}" down --remove-orphans
    "${COMPOSE[@]}" build --no-cache
    bring_up_infra
    init_db
    "${COMPOSE[@]}" up -d api worker web
    ;;
  down)
    "${COMPOSE[@]}" down
    ;;
  build)
    "${COMPOSE[@]}" build
    ;;
  logs)
    "${COMPOSE[@]}" logs -f
    ;;
  ps)
    "${COMPOSE[@]}" ps
    ;;
  init-db)
    init_db
    ;;
  *)
    usage
    exit 1
    ;;
esac
