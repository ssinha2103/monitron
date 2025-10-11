# VM Deployment

This guide covers running Monitron on a single Compute Engine VM and the continuous deployment workflow that now replaces the old Cloud Run setup.

## 1. Provision the VM

The sample instance below matches the metadata you shared. Any modern Ubuntu or Debian VM with Docker and Docker Compose installed will work. Recommended minimum specs:

- 2 vCPUs / 4 GB RAM
- 40 GB SSD
- Static IP or DNS pointing at the VM

Install Docker, the Compose plugin, and common tooling:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin git curl ufw
sudo systemctl enable --now docker
sudo usermod -aG docker "${USER}"
```

Log out and back in to pick up the docker group membership. Optional but recommended: enable UFW and open ports 22, 80, and 8000 only to trusted CIDRs.

## 2. Configure secrets in GitHub

The CI workflow generates `deploy/.env.vm` on the VM using repository secrets. Add the following entries under **Settings → Secrets and variables → Actions**:

| Secret | Description |
| ------ | ----------- |
| `VM_HOST` | Public IP or hostname of the VM (`34.123.215.117`). |
| `VM_USER` | SSH username on the VM (e.g. `s_sinha2103`). |
| `VM_SSH_KEY` | Private SSH key (PEM) allowed on the VM. |
| `VM_REPO_DIR` | Absolute path to deploy the repo (e.g. `/opt/monitron`). |
| `REPO_TOKEN` | GitHub token with `repo` scope for cloning via HTTPS (optional if the VM has SSH access to GitHub). |
| `VM_POSTGRES_DB` | PostgreSQL database name (defaults to `monitron` if omitted). |
| `VM_POSTGRES_USER` | PostgreSQL user (defaults to `monitron`). |
| `VM_POSTGRES_PASSWORD` | PostgreSQL password (required). |
| `VM_JWT_SECRET_KEY` | JWT signing secret (required). |
| `VM_JWT_REFRESH_SECRET_KEY` | JWT refresh secret (required). |
| `VM_INITIAL_ADMIN_EMAIL` | Address for the bootstrapped admin user (defaults to `admin@example.com`). |
| `VM_INITIAL_ADMIN_PASSWORD` | Initial admin password (required). |
| `VM_WEB_API_BASE_URL` | Public API URL baked into the SPA (e.g. `http://<vm-ip>:8000/api/v1`). |

Generate strong random strings with `openssl rand -hex 64` and store them securely.

## 3. Manual deployment (optional sanity check)

From the repository root on the VM:

```bash
docker compose --env-file deploy/.env.vm \
  -f deploy/docker-compose.vm.yml \
  up -d --build
```

The stack exposes:

- Web UI: `http://<vm-ip>/`
- API health check: `http://<vm-ip>:8000/api/v1/healthz`

Database and Redis data live in Docker volumes (`monitron_db_data`, `monitron_redis_data`). Include `/var/lib/docker/volumes/` in your backup plan.

## 4. Continuous deployment from GitHub

Pushes to the `master` or `gcp_deploy` branches invoke `.github/workflows/deploy-vm.yaml`. The workflow:

1. Checks out the repository (for access to helper scripts).
2. Configures SSH with the VM key and validates connectivity.
3. SSHes into the VM, installs Docker/Docker Compose if necessary, clones/upgrades the repo to the pushed commit, and exports the required secrets as environment variables.
4. Runs `deploy/remote-deploy.sh`, which writes `deploy/.env.vm` from those variables and executes `docker compose --env-file deploy/.env.vm -f deploy/docker-compose.vm.yml up -d --build`.

Run the workflow manually from **Actions → Deploy to VM (GCE) → Run workflow** if you need an on-demand redeploy.
