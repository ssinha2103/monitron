# Monitron

> Modern uptime, cron, and alerting platform for product and infrastructure teams.

Monitron keeps an eye on your APIs and scheduled jobs, aggregates health data, and notifies the right people before customers notice issues. The project combines a FastAPI backend, a real-time monitoring worker, and a React/Vite front-end that exposes dashboards and configuration tools.

## Features

- Multi-endpoint monitor management with adjustable intervals, methods, and timeouts.
- Real-time health tracking with automatic jittering to smooth load on targets.
- One-click "run now" checks and historical audit trail per monitor.
- Intelligent downtime escalation with rapid retry cadence and sustained outage alerts.
- Initial admin bootstrap via environment variables for quick onboarding.
- Async task pipeline (Celery + Redis) that scales safely under heavy load.

## Architecture

```
+-----------+      +-----------+      +---------------+
|  Web UI   | <--> |  FastAPI  | <--> | PostgreSQL DB |
| (React)   |  REST|    API    |      |   (SQLModel)  |
+-----------+      +-----------+      +---------------+
      ^                  ^
      |                  |
      |        +--------------------+
      +--------| Celery Worker      |
               | + Scheduler        | --> Redis broker/result store
               +--------------------+
```

- **Web (`web/`)**: React + Vite single-page app for landing page, auth, and dashboards.
- **API (`services/api/`)**: FastAPI application using SQLModel/SQLAlchemy for persistence and `app.db.session.init_db` to bootstrap schema.
- **Scheduler (`services/worker/app/scheduler.py`)**: Asynchronously scans due monitors, claims them with row-level locks, and enqueues Celery tasks.
- **Worker (`services/worker/app/tasks.py`)**: Executes HTTP checks concurrently, records results, and refreshes scheduling metadata.
- **PostgreSQL**: Primary data store for users, monitors, and check history.
- **Redis**: Task broker/result backend for Celery and a cache-friendly integration point.

## Prerequisites

- [Docker](https://docs.docker.com/engine/install/)
- [Docker Compose](https://docs.docker.com/compose/)
- `bash` (for the helper script) and `make`-style UNIX tooling

## Quick Start (Docker)

```bash
# 1. Clone the repository
git clone https://github.com/your-org/monitron.git
cd monitron

# 2. Copy the example environment and tweak as needed
cp .env.example .env

# 3. Build and launch the entire stack
./scripts/run.sh up-d
```

This command:

1. Boots the infrastructure services (`db`, `redis`).
2. Runs the schema initializer via the API container.
3. Starts the API, Celery worker, scheduler, and web containers in detached mode.

Visit:

- App UI: http://localhost:3000
- API docs (Swagger UI): http://localhost:8080/docs

To stop containers:

```bash
./scripts/run.sh down
```

To view logs across all services:

```bash
./scripts/run.sh logs
```

## Environment Configuration

Populate `.env` (used by both Docker and local tooling) with:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLAlchemy-compatible Postgres URL. Defaults to the bundled container. |
| `REDIS_URL` | Redis connection string for Celery and caching. |
| `JWT_SECRET_KEY` / `JWT_REFRESH_SECRET_KEY` | Secrets for access/refresh token signing. |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | Seed credentials created during first boot. |
| `VITE_API_BASE_URL` | Base path the web front-end uses when proxying API calls. |
| `ALERT_EMAIL_FROM` | Sender address used for sustained downtime notifications. |
| `SMTP_HOST` / `SMTP_PORT` | SMTP server host and port for alert delivery. |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | Optional credentials for authenticated SMTP. |
| `SMTP_USE_TLS` / `SMTP_USE_SSL` | Toggle STARTTLS vs SSL for SMTP connections. |
| `SMTP_TIMEOUT` | Timeout (seconds) for SMTP connections. |
| `SUSTAINED_DOWN_THRESHOLD` | Number of failed checks within the window before alerting. |
| `SUSTAINED_DOWN_WINDOW_MINUTES` | Sliding window (minutes) used when counting failed checks. |

> **Heads-up:** The Celery worker and scheduler require `REDIS_URL` to be reachable; keep it aligned across `.env`, `docker-compose.yml`, and your runtime environment.

## Local Iteration Tips

- **Hot reload:** The API container runs `uvicorn --reload`; the web container uses Vite dev mode. Changes in `services/api/app` or `web/src` are reflected automatically.
- **Celery inspection:** Use `docker compose exec worker celery -A app.celery_app inspect active` to confirm tasks under load.
- **Database access:** `docker compose exec db psql -U monitron -d monitron` opens a psql shell.
- **Schema updates:** Modify models in `services/api/app/models` or `services/worker/app/models` and let `init_db()` synchronize. For non-trivial changes consider introducing Alembic migrations.

## Testing & Linting

- **Web front-end:** `docker compose run --rm web npm run lint` or run locally with Node 18+.
- **API (placeholder):** Add tests under `services/api/tests/` and run `docker compose run --rm api pytest`.
- **Worker tasks:** Leverage unit tests with `pytest` and `pytest-asyncio` (not yet included).

Feel free to add coverage badges, test suites, or CI workflows; the project currently relies on manual testing.

## Deployment Notes

- Replace secrets in `.env`/`docker-compose.yml` before production.
- Configure external monitoring endpoints (status, privacy pages, etc.) to match your domain.
- Scale Celery workers horizontally by adding more replicas in Compose or your orchestrator of choice.

## Contributing

1. Fork and create a topic branch.
2. Make your changes (see the architecture notes above).
3. Run formatting/linting/tests where applicable.
4. Submit a pull request with a concise summary of the change and any deployment considerations.

Please open an issue for feature requests or bug reports. PRs that include architecture diagrams, GitHub Actions, or additional documentation are welcome!

---

**Need help or have product ideas?** Reach out at `sudarshansinha21@gmail.com` - we respond within one business day.
