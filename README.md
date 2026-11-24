# TaskFlow AI

A self-hosted, multi-tenant project and task management starter built with Next.js, NestJS, PostgreSQL, Redis/BullMQ, FastAPI, and an Android client.

> **Release status: pre-release / not yet approved for production resale.** The repository is being prepared as a source-code product. Review the security, deployment, licensing, and acceptance-test status before using it with real customer data.

## What is included

- **Web application:** Next.js, TypeScript, and Tailwind CSS.
- **Backend API:** NestJS, Prisma, and PostgreSQL.
- **Background jobs:** Redis and BullMQ.
- **ML service:** FastAPI and scikit-learn. Task-risk analysis is experimental; the included model was trained on a very small synthetic dataset and is not a validated probability model.
- **Android client:** Kotlin and Jetpack Compose, with Room-backed offline operation.

The Docker Compose stack starts PostgreSQL, Redis, the ML API, the backend API, and the web frontend. Database migrations run through a dedicated one-shot Compose service before the backend starts.

## Prerequisites

- Docker Engine with the Docker Compose v2 plugin
- Git
- OpenSSL (for generating secrets)

For local development outside Docker, install the versions required by the relevant subproject (Node.js 22 for web/backend, Python 3.11 for ML, and JDK/Android SDK for Android).

## Quick start (Docker)

1. Clone the repository and enter its directory:

   ```bash
   git clone https://github.com/busraknya/taskflow-ai-full-project.git
   cd taskflow-ai-full-project
   ```

2. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

3. Generate unique secrets. Do not use the sample values from `.env.example` in a deployed environment:

   ```bash
   openssl rand -hex 32
   openssl rand -hex 32
   ```

   Put the first value in `POSTGRES_PASSWORD` and update the password portion of `DATABASE_URL` to match it. Put the second value in `JWT_SECRET`. Use a unique secret for each installation. Keep `.env` private and out of version control.

4. Review every value in `.env`. In particular:
   - `DATABASE_URL` must point to the Compose PostgreSQL service (`postgres:5432`) and use the same credentials as `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`.
   - `CORS_ORIGINS` must contain the exact browser origin(s) that will access the web app, comma-separated.
   - `NEXT_PUBLIC_API_URL` is compiled into the browser frontend. Set it to the API URL reachable by users' browsers, including `/api/v1`. The default is for local access only.
   - Configure SMTP values only if email delivery is required.

5. Build and start the stack:

   ```bash
   docker compose up --build --detach --wait
   ```

6. Check service status and logs:

   ```bash
   docker compose ps
   docker compose logs --tail=200 backend frontend ml-service migrate
   ```

7. Open the frontend at [http://localhost:3000](http://localhost:3000). The API is exposed locally at [http://localhost:4000/api/v1](http://localhost:4000/api/v1).

The `migrate` service applies committed Prisma migrations before the backend starts. If migration fails, inspect its logs before retrying:

```bash
docker compose logs migrate
```

## Stopping and data persistence

Stop containers without deleting database data:

```bash
docker compose down
```

PostgreSQL and Redis data are stored in named Docker volumes. **This command permanently deletes those volumes and their data; use it only when you intentionally want a clean reset:**

```bash
docker compose down --volumes
```

Back up persistent data before upgrades or destructive maintenance. A production backup/restore procedure must be tested for the target hosting environment; a Docker volume is not a backup.

## Production deployment notes

The Compose file is a convenient self-hosted starting point, not a complete hardened production deployment.

Before exposing an installation to the public internet:

- Put a maintained reverse proxy in front of the web and API services and terminate TLS/HTTPS there.
- Set `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` to the real HTTPS origins, then rebuild the frontend after changing its public API URL.
- Use unique, strong database and JWT secrets; do not commit `.env` or share secrets in support requests.
- Restrict database and Redis access to the private container network. Do not publish their ports publicly.
- Configure SMTP credentials through the deployment's secret-management mechanism.
- Establish tested database backup, restore, update, and rollback procedures.
- Monitor container health, logs, disk usage, and background-job failures.

The current Compose file publishes the frontend and backend ports for convenient local access. Do not treat direct port publishing as a substitute for a production reverse-proxy and firewall configuration.

## Android client

The Android project is under `android/`. Debug builds use the development API configuration; release builds require an HTTPS API base URL. Configure the release URL using the Gradle property documented in `android/app/build.gradle.kts`, then build and sign release artifacts with your own keystore. Never commit signing keys or passwords.

## Development and verification

The GitHub Actions workflow runs backend tests/type-check/build, frontend lint/type-check/build, ML tests and dependency audit, Android unit/instrumented tests and debug build, and a Docker Compose startup/health-check smoke test.

Run the relevant checks from each subproject when changing code. A passing CI run is useful evidence, but it does not replace staging acceptance tests, a real external HTTPS deployment, backup/restore verification, SMTP delivery checks, or review of tenant isolation and authorization.

## Known limitations

- ML task-risk analysis is experimental. The bundled model uses a tiny synthetic training dataset; do not interpret its output as a calibrated probability or claim production prediction accuracy.
- Workspace invitation acceptance/expiry/revocation is not yet a complete token-based invitation workflow.
- Email delivery, retry behavior, production reverse-proxy setup, backup/restore, and full browser/Android user journeys require deployment-specific verification.
- The backend has an existing general lint backlog; CI currently enforces lint on changed backend TypeScript files while the legacy baseline is being cleaned up.

See [analysis/sales_readiness_plan.md](analysis/sales_readiness_plan.md) and [analysis/go_live.md](analysis/go_live.md) for the current release blockers and audit history.

## License

No license has been selected for this source-code product yet. All rights remain with the copyright holder unless and until a license is added. Do not assume that this repository grants redistribution, resale, sublicensing, or commercial-use rights. A clear commercial license and third-party license/attribution inventory are required before marketplace release.
