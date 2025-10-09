# Deploying Monitron to Cloud Run

This guide walks through packaging the API, background worker, and web UI for Google Cloud Run.  
It assumes you already created the required managed services (PostgreSQL via Cloud SQL and Redis via Memorystore or another managed cache) and that you have appropriate IAM permissions.

---

## 1. Prerequisites

- Google Cloud project (`gcloud config set project <PROJECT_ID>`)
- Artifact Registry repository for container images (example: `monitron`)
- Cloud SQL (PostgreSQL) instance and database created
- Redis endpoint (Memorystore for Redis or a compatible managed service)
- gcloud CLI ≥ 430, Docker, and (optional) Cloud Build API enabled

Create environment variables that will be reused:

```bash
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export REPO="monitron"

export ARTIFACT_REGISTRY="us-central1-docker.pkg.dev/${PROJECT_ID}/${REPO}"
export API_IMAGE="${ARTIFACT_REGISTRY}/api:$(git rev-parse --short HEAD)"
export WORKER_IMAGE="${ARTIFACT_REGISTRY}/worker:$(git rev-parse --short HEAD)"
export WEB_IMAGE="${ARTIFACT_REGISTRY}/web:$(git rev-parse --short HEAD)"

export CLOUD_SQL_INSTANCE="${PROJECT_ID}:us-central1:monitron-sql"   # update to your instance
export DATABASE_URL="postgresql+psycopg2://monitron:<db-password>@/monitron?host=/cloudsql/${CLOUD_SQL_INSTANCE}"
export REDIS_URL="redis://<redis-hostname>:6379/0"
export JWT_SECRET_KEY="<generate-long-random-secret>"
export JWT_REFRESH_SECRET_KEY="<generate-long-random-secret>"
```

> **Tip:** Store real secrets in Secret Manager and reference them in the deploy commands instead of exporting them locally.

---

## 2. Build container images

You can either build locally and push or use Cloud Build. The repository includes a `cloudrun/cloudbuild.yaml` that produces all three images.

```bash
gcloud builds submit \
  --config cloudrun/cloudbuild.yaml \
  --substitutions=_REGION=${REGION},_REPO=${REPO},_API_IMAGE=${API_IMAGE},_WORKER_IMAGE=${WORKER_IMAGE},_WEB_IMAGE=${WEB_IMAGE}
```

If you prefer local Docker builds, run the commands manually (remember to push):

```bash
docker build -t "${API_IMAGE}" services/api
docker push "${API_IMAGE}"

docker build -t "${WORKER_IMAGE}" services/worker
docker push "${WORKER_IMAGE}"

docker build -t "${WEB_IMAGE}" -f web/Dockerfile.cloudrun web
docker push "${WEB_IMAGE}"
```

---

## 3. Deploy the API service

Use the service manifest to keep configuration in source control. Update `env` values or reference Secret Manager keys before deploying.

```bash
gcloud run services replace cloudrun/api.service.yaml \
  --image "${API_IMAGE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --set-env-vars DATABASE_URL="${DATABASE_URL}",REDIS_URL="${REDIS_URL}",JWT_SECRET_KEY="${JWT_SECRET_KEY}",JWT_REFRESH_SECRET_KEY="${JWT_REFRESH_SECRET_KEY}" \
  --set-env-vars INITIAL_ADMIN_EMAIL="s.sinha2103@gmail.com",INITIAL_ADMIN_PASSWORD="change-this" \
  --add-cloudsql-instances "${CLOUD_SQL_INSTANCE}"
```

Alternatively, deploy inline:

```bash
gcloud run deploy monitron-api \
  --image "${API_IMAGE}" \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars DATABASE_URL="${DATABASE_URL}",REDIS_URL="${REDIS_URL}",JWT_SECRET_KEY="${JWT_SECRET_KEY}",JWT_REFRESH_SECRET_KEY="${JWT_REFRESH_SECRET_KEY}" \
  --set-env-vars INITIAL_ADMIN_EMAIL="s.sinha2103@gmail.com",INITIAL_ADMIN_PASSWORD="change-this" \
  --add-cloudsql-instances "${CLOUD_SQL_INSTANCE}"
```

If you are using Secret Manager, replace `--set-env-vars` with `--set-secrets`.

> **NOTE:** The API needs network access to both Cloud SQL and Redis. When using Memorystore, add a VPC connector and specify `--vpc-connector` and `--egress-settings`.

---

## 4. Deploy the worker service

The worker uses the same environment variables as the API but does not expose HTTP traffic. The manifest configures it as a Cloud Run job that runs continuously.

```bash
gcloud run jobs deploy monitron-worker \
  --image "${WORKER_IMAGE}" \
  --region "${REGION}" \
  --max-retries 3 \
  --set-env-vars DATABASE_URL="${DATABASE_URL}",REDIS_URL="${REDIS_URL}",JWT_SECRET_KEY="${JWT_SECRET_KEY}",JWT_REFRESH_SECRET_KEY="${JWT_REFRESH_SECRET_KEY}" \
  --add-cloudsql-instances "${CLOUD_SQL_INSTANCE}" \
  --execute-now
```

If you prefer a long-running service (instead of a job), deploy with `gcloud run deploy` similar to the API but without `--allow-unauthenticated`.

---

## 5. Deploy the web SPA

The web client is built to static assets and served via `node` inside Cloud Run. Use the dedicated Dockerfile.

```bash
gcloud run deploy monitron-web \
  --image "${WEB_IMAGE}" \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars VITE_API_BASE_URL="/api/v1" \
  --add-cloudsql-instances "${CLOUD_SQL_INSTANCE}"  # only required if you proxy through API within same service
```

Point the web app at the public URL of the API (`https://monitron-api-<hash>-uc.a.run.app`) by setting `VITE_API_PROXY_TARGET` during build or as an environment variable before the Vite build step.

---

## 6. Continuous Deployment (optional)

Add the Cloud Build trigger to run on pushes to `master`. The included `cloudrun/cloudbuild.yaml`:

1. Configures Docker to authenticate with Artifact Registry.
2. Builds API, worker, and web images.
3. (Optional) Can be extended to deploy automatically via `gcloud run deploy`.

Create a trigger:

```bash
gcloud beta builds triggers create cloud-source-repositories \
  --repo="monitron" \
  --branch-pattern="master" \
  --build-config="cloudrun/cloudbuild.yaml" \
  --substitutions=_REGION=${REGION},_REPO=${REPO}
```

---

## 7. Environment Variables & Secrets

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | SQLAlchemy connection string (use Cloud SQL socket path for private connections) |
| `REDIS_URL` | Redis connection string (e.g., `redis://10.0.0.3:6379/0`) |
| `JWT_SECRET_KEY` | Primary signing secret for access tokens |
| `JWT_REFRESH_SECRET_KEY` | Signing secret for refresh tokens |
| `INITIAL_ADMIN_EMAIL` | Auto-provisioned admin account | 
| `INITIAL_ADMIN_PASSWORD` | Initial password (override after first login) |
| `VITE_API_BASE_URL` | Front-end API base (set to `/api/v1` when front end is proxied) |
| `PORT` | Provided by Cloud Run; no need to set manually |

Store secrets in Secret Manager and map them at deploy time:

```bash
gcloud secrets create monitron-jwt --data-file=- <<< "${JWT_SECRET_KEY}"
gcloud run deploy monitron-api \
  --image "${API_IMAGE}" \
  --set-secrets JWT_SECRET_KEY=monitron-jwt:latest
```

Refer to `.env.example` for a consolidated list of environment variables and GitHub secrets placeholders.

### Managing Secrets with Secret Manager

Create a secret (only once):

```bash
printf '%s' "${JWT_SECRET_KEY}" | gcloud secrets create monitron-jwt \
  --data-file=- \
  --replication-policy=automatic
```

Update a secret value:

```bash
printf '%s' "${JWT_SECRET_KEY}" | gcloud secrets versions add monitron-jwt --data-file=-
```

Fetch the latest secret locally (for testing or to copy into GitHub Secrets):

```bash
gcloud secrets versions access latest --secret=monitron-jwt
```

Attach secrets to Cloud Run at deploy time:

```bash
gcloud run deploy monitron-api \
  --image "${API_IMAGE}" \
  --set-secrets JWT_SECRET_KEY=monitron-jwt:latest,JWT_REFRESH_SECRET_KEY=monitron-jwt-refresh:latest
```

---

## 8. Local Simulation

To mimic Cloud Run locally, use the provided Dockerfiles:

```bash
docker build -t monitron-api-local services/api
docker run --rm -p 8080:8080 \
  -e DATABASE_URL="${DATABASE_URL}" \
  -e REDIS_URL="${REDIS_URL}" \
  -e JWT_SECRET_KEY="${JWT_SECRET_KEY}" \
  -e JWT_REFRESH_SECRET_KEY="${JWT_REFRESH_SECRET_KEY}" \
  monitron-api-local
```


```bash
docker build -t monitron-web-local -f web/Dockerfile.cloudrun web
docker run --rm -p 3000:8080 \
  -e VITE_API_BASE_URL="https://monitron-api-<hash>-uc.a.run.app/api/v1" \
  monitron-web-local
```

---

## 9. Next Steps

- Configure custom domains for the API & web services.
- Wire up HTTPS load balancing if you want to serve API and web under one domain.
- Monitor services with Cloud Logging and Cloud Monitoring dashboards.

> Feel free to adapt these manifests to Terraform or Deployment Manager if you prefer declarative provisioning.

---

## 9. GitHub Actions Automation

The repository contains a reusable workflow at `.github/workflows/deploy-cloudrun.yaml` that builds and deploys on pushes to `master`. Configure the following GitHub Secrets before enabling it:

| Secret | Description |
|--------|-------------|
| `GCP_SA_KEY` | JSON key for a service account with Cloud Build, Artifact Registry, and Cloud Run permissions |
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `GCP_REGION` | Cloud Run region (e.g. `us-central1`) |
| `GCP_AR_REPOSITORY` | Artifact Registry repo name (e.g. `monitron`) |
| `GCP_RUN_SERVICE_ACCOUNT` | Email of the runtime service account used by the API/web/worker |
| `GCP_CLOUD_SQL_INSTANCE` | Fully-qualified Cloud SQL instance name (`project:region:instance`) |
| `API_DATABASE_URL` | Production `DATABASE_URL` for the API |
| `API_REDIS_URL` | Production `REDIS_URL` |
| `API_JWT_SECRET` | JWT signing secret |
| `API_JWT_REFRESH_SECRET` | JWT refresh signing secret |
| `INITIAL_ADMIN_EMAIL` | Initial admin email |
| `INITIAL_ADMIN_PASSWORD` | Initial admin password |
| `WEB_API_BASE_URL` | Fully-qualified API base for the web SPA |

Pushes to `master` will now:

1. Authenticate to Google Cloud with the service account key.
2. Build and publish the API, worker, and web images via Cloud Build.
3. Deploy the Cloud Run services using the freshly built images and injected secrets.

Adjust the workflow to fit your branching strategy or to skip automatic deployment (comment out the deploy steps if you only want image builds).
