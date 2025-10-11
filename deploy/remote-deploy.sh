#!/usr/bin/env bash
set -euo pipefail

BRANCH_NAME=${1:-unknown}
ENV_FILE=${ENV_FILE:-deploy/.env.vm}
COMPOSE_FILE=${COMPOSE_FILE:-deploy/docker-compose.vm.yml}

have() {
  command -v "$1" >/dev/null 2>&1
}

generate_env_file() {
  local output=$1
  local postgres_db=${MONITRON_POSTGRES_DB:-monitron}
  local postgres_user=${MONITRON_POSTGRES_USER:-monitron}
  local postgres_password=${MONITRON_POSTGRES_PASSWORD:-}
  local jwt_secret=${MONITRON_JWT_SECRET_KEY:-}
  local jwt_refresh_secret=${MONITRON_JWT_REFRESH_SECRET_KEY:-}
  local admin_email=${MONITRON_INITIAL_ADMIN_EMAIL:-admin@example.com}
  local admin_password=${MONITRON_INITIAL_ADMIN_PASSWORD:-}
  local web_api_base_url=${MONITRON_WEB_API_BASE_URL:-http://localhost:8000/api/v1}

  if [[ -z "$postgres_password" || -z "$jwt_secret" || -z "$jwt_refresh_secret" || -z "$admin_password" ]]; then
    echo "Missing required environment values. Ensure database password, JWT secrets, and admin password are provided." >&2
    exit 1
  fi

  cat >"$output" <<EOF
POSTGRES_DB=${postgres_db}
POSTGRES_USER=${postgres_user}
POSTGRES_PASSWORD=${postgres_password}

JWT_SECRET_KEY=${jwt_secret}
JWT_REFRESH_SECRET_KEY=${jwt_refresh_secret}
INITIAL_ADMIN_EMAIL=${admin_email}
INITIAL_ADMIN_PASSWORD=${admin_password}

WEB_API_BASE_URL=${web_api_base_url}
EOF
  chmod 600 "$output"
}

if have docker compose; then
  COMPOSE=(docker compose)
elif have docker-compose; then
  COMPOSE=(docker-compose)
else
  echo "Docker Compose v1 or v2 is required on the VM." >&2
  exit 1
fi

if [[ "${MONITRON_AUTOGEN_ENV:-0}" == "1" ]]; then
  mkdir -p "$(dirname "$ENV_FILE")"
  generate_env_file "$ENV_FILE"
elif [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file '$ENV_FILE' was not found. Either set MONITRON_AUTOGEN_ENV=1 with required secrets or copy deploy/.env.vm.example and fill in values." >&2
  exit 1
fi

echo "Deploying branch '${BRANCH_NAME}' with ${COMPOSE[*]}..."
"${COMPOSE[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build
