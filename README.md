<!-- Language navigation -->
<p align="right">
  <a href="#english">English</a> | <a href="#türkçe">Türkçe</a>
</p>

# TaskFlow AI

<a id="english"></a>

## English

TaskFlow AI is a project and task management application in development. It is designed to help small and medium-sized teams organize projects, assign work, follow progress, and keep task information in one shared place.

The project brings together a web application, an Android app, a backend, and an experimental machine-learning service.

### What are we building?

With TaskFlow, a team should be able to:

- Create a shared workspace and manage team members.
- Organize work into projects and tasks.
- Assign tasks and set priorities and due dates.
- Follow the same work information on web and Android.
- Make supported changes offline on Android and sync them when the connection returns.
- Explore task-delay risk insights when enough reliable data is available.

TaskFlow is still under active development. The list above describes the intended product experience; it does not mean every flow is production-ready.

### How is it structured?

| Part | Responsibility |
|---|---|
| Web app | Manage projects and tasks in a browser |
| Android app | Sign up, follow and create tasks, change status, comment and see delay risk on a phone, including supported offline actions |
| Backend | Apply the main application rules and handle requests |
| Database | Store accounts, workspaces, projects, tasks, and related data |
| Background jobs | Handle work such as notifications and email |
| ML service | Experiment with task-delay risk assessment |

**Main technologies:** Next.js and TypeScript for the web app; NestJS and Prisma for the backend; PostgreSQL and Redis for data and background jobs; Kotlin and Jetpack Compose for Android; FastAPI and scikit-learn for the experimental ML service.

### Machine-learning approach

The goal is to explore whether task information—such as time remaining until a due date and the assignee's workload—can help identify tasks that may be delayed.

No predictive model is included. TaskFlow will learn from each workspace's own task history, inside your installation, and show a delay-risk level only after a model trained on that history has passed evaluation. Until then the apps state that a risk prediction is not available yet, and TaskFlow does not claim verified delay probabilities.

### Project documentation

- [Product overview and roadmap](analysis/product_overview_and_roadmap.md) — the product, its main user journey, and development priorities in plain language.
- [Detailed workflows and requirements](analysis/product_workflows_requirements.md) — detailed requirements, acceptance scenarios, technical findings, and testing notes.
- [Go-live audit](analysis/go_live.md) — release readiness, security audit history, verification evidence, and the current go/no-go decision.
- [Sales readiness plan](analysis/sales_readiness_plan.md) — open blockers and progress toward a sellable source-code release.
- [ML model card](ml-service/MODEL_CARD.md) — current status of the risk model and the rules for showing predictions.

### Development status

TaskFlow is being developed step by step. We distinguish between code that exists, behavior that has been tested, and features that are ready for real users. See the detailed requirements document for current findings and open work.

---

<a id="türkçe"></a>

## Türkçe

TaskFlow AI, küçük ve orta ölçekli ekiplerin projelerini düzenlemesine, görevleri ekip üyelerine atamasına ve işlerin ilerleyişini takip etmesine yardımcı olmak amacıyla geliştirdiğimiz bir proje ve görev yönetimi uygulamasıdır.

Proje; web uygulaması, Android uygulaması, sunucu tarafı ve deneysel bir makine öğrenmesi servisinden oluşur.

### Ne geliştiriyoruz?

TaskFlow ile ekiplerin:

- Ortak bir çalışma alanı oluşturmasını ve ekip üyelerini yönetmesini,
- İşlerini proje ve görevlere ayırmasını,
- Görevleri kişilere atamasını, öncelik ve teslim tarihi belirlemesini,
- Aynı iş bilgilerini web ve Android üzerinden takip etmesini,
- Android'de desteklenen bazı değişiklikleri internet bağlantısı yokken yapıp bağlantı geldiğinde eşitlemesini,
- Yeterli ve güvenilir veri oluştuğunda görev gecikme riskine ilişkin değerlendirmelerden yararlanmasını hedefliyoruz.

TaskFlow hâlâ geliştirme aşamasındadır. Bu maddeler hedeflediğimiz ürün deneyimini anlatır; tüm özelliklerin canlı kullanım için hazır olduğu anlamına gelmez.

### Sistem hangi parçalardan oluşuyor?

| Bölüm | Görevi |
|---|---|
| Web uygulaması | Proje ve görevleri tarayıcıdan yönetmek |
| Android uygulaması | Telefondan kayıt olmak, görevleri takip etmek ve oluşturmak, durum değiştirmek, yorum yazmak ve gecikme riskini görmek; desteklenen durumlarda çevrimdışı çalışmak |
| Backend (sunucu) | Uygulamanın temel kurallarını yürütmek ve istekleri işlemek |
| Veritabanı | Hesap, çalışma alanı, proje, görev ve ilgili bilgileri saklamak |
| Arka plan işlemleri | Bildirim ve e-posta gibi işleri yürütmek |
| ML servisi | Görev gecikme riskini değerlendirmeye yönelik denemeler yapmak |

**Kullandığımız başlıca teknolojiler:** Web tarafında Next.js ve TypeScript; sunucu tarafında NestJS ve Prisma; veri ve arka plan işlemlerinde PostgreSQL ve Redis; Android tarafında Kotlin ve Jetpack Compose; deneysel makine öğrenmesi servisinde FastAPI ve scikit-learn.

### Makine öğrenmesi yaklaşımı

Amacımız, teslim tarihine kalan süre ve görevi üstlenen kişinin iş yükü gibi bilgilerden yararlanarak gecikme riski taşıyan görevleri belirlemeyi araştırmak.

Ürünle birlikte bir tahmin modeli gelmez. TaskFlow, her workspace'in kendi görev geçmişinden kurulumunuzun içinde öğrenecek ve gecikme riski seviyesini yalnızca bu geçmişle eğitilmiş bir model değerlendirmeden geçtikten sonra gösterecektir. O zamana kadar uygulamalar risk tahmininin henüz mevcut olmadığını belirtir; TaskFlow doğrulanmış gecikme olasılıkları sunduğunu iddia etmez.

### Proje belgeleri

- [Ürün analizi ve yol haritası](analysis/product_overview_and_roadmap.md) — ürünün amacı, temel kullanıcı akışı ve geliştirme öncelikleri.
- [Ayrıntılı iş akışları ve gereksinimler](analysis/product_workflows_requirements.md) — gereksinimler, kabul senaryoları, teknik bulgular ve test notları.
- [Yayına çıkış denetimi](analysis/go_live.md) — yayına hazırlık, güvenlik denetimi geçmişi, doğrulama kanıtları ve güncel GO/NO-GO kararı.
- [Satışa hazırlık planı](analysis/sales_readiness_plan.md) — satılabilir kaynak kod sürümü için açık engelleyiciler ve ilerleme.
- [ML model kartı](ml-service/MODEL_CARD.md) — risk modelinin güncel durumu ve tahmin gösterme kuralları.

### Geliştirme durumu

TaskFlow'u adım adım geliştiriyoruz. Kodda bulunan bir özellik ile test edilmiş ve gerçek kullanıcıların kullanımına hazır bir özelliği birbirinden ayrı değerlendiriyoruz. Güncel bulgular ve tamamlanması gereken işler için ayrıntılı gereksinim belgesine bakabilirsiniz.

---

<p align="center">
  <a href="#english">Back to English ↑</a> · <a href="#türkçe">Türkçe bölümüne git</a>
</p>


---

## Self-hosted setup and technical reference

## What is included

- **Web application:** Next.js, TypeScript, and Tailwind CSS.
- **Backend API:** NestJS, Prisma, and PostgreSQL.
- **Background jobs:** Redis and BullMQ.
- **ML service:** FastAPI and scikit-learn. No model is shipped: the service starts without one, `GET /health` reports `"model_loaded": false`, and `POST /predict` / `POST /predict/batch` return `503 MODEL_UNAVAILABLE`. The backend computes risk asynchronously through a BullMQ queue (after task and comment changes, and for all open tasks daily at 02:00 UTC), so task requests never wait for the ML service. Inputs follow the versioned feature contract in `ml-service/feature_spec.json`. Each workspace can have its own model, trained on its own history and activated only after it passes an evaluation gate, stored under `MODELS_DIR` with rollback; see `ml-service/MODEL_CARD.md`.
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
   - `TRUST_PROXY_HOPS` must stay `0` while the backend is reached directly (the default Compose setup). See [Reverse proxy and client IP](#reverse-proxy-and-client-ip) before putting a proxy in front of it.
   - `FRONTEND_URL` is the public web-app URL used in invitation emails.
   - `REDIS_PASSWORD` can stay empty locally; set it for any deployed environment.
   - Configure SMTP values only if email delivery is required (see "Email delivery" below). Without them no email is sent and invitation links are shared manually.

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

The Compose file is a convenient self-hosted starting point, not a complete hardened production deployment. The repository does not include a reverse proxy or TLS configuration.

Before exposing an installation to the public internet:

- Put a maintained reverse proxy in front of the web and API services and terminate TLS/HTTPS there.
- Set `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` to the real HTTPS origins, then rebuild the frontend after changing its public API URL.
- Use unique, strong database and JWT secrets; do not commit `.env` or share secrets in support requests. `JWT_SECRET` must be at least 32 bytes, and the backend refuses to start if it is shorter, if it is the sample value from `.env.example` or another known placeholder, if it contains a template marker such as `replace_with`, `change_me` or `your-secret`, or if it is a trivially weak repetition such as `aaaa…`. These checks cannot recognise every guessable value, so always generate the secret with `openssl rand -hex 32`.
- Restrict database and Redis access to the private container network. Do not publish their ports publicly.
- Configure SMTP credentials through the deployment's secret-management mechanism.
- Establish tested database backup, restore, update, and rollback procedures.
- Monitor container health, logs, disk usage, and background-job failures.

The current Compose file publishes the frontend and backend ports for convenient local access. Do not treat direct port publishing as a substitute for a production reverse-proxy and firewall configuration.

### Reverse proxy and client IP

Rate limits are keyed by client IP. The backend takes the client IP from Express `request.ip`, which honours `X-Forwarded-For` only for the number of hops set in `TRUST_PROXY_HOPS` (integer 0–10, validated at startup):

| Topology | `TRUST_PROXY_HOPS` |
|---|---|
| Backend reached directly (default Compose) | `0` |
| One reverse proxy that appends the client IP to `X-Forwarded-For` | `1` |
| CDN in front of a load balancer, each appending to the header | `2` |

- Too low behind a proxy: every user shares the proxy's IP, so the per-IP authentication limits apply to all users together.
- Too high, or the backend port still reachable without the proxy: clients can spoof `X-Forwarded-For` and evade or poison per-IP limits. When a proxy is used, the backend port must only be reachable from the proxy.

### HTTPS and the refresh cookie

The web app keeps the refresh token in an `HttpOnly`, `SameSite=Strict` cookie that is marked `Secure` when `NODE_ENV=production` (the Compose backend runs in production mode).

- Browsers do not store `Secure` cookies received over plain HTTP; most browsers treat `http://localhost` as a secure-context exception. Without HTTPS, web sessions cannot be refreshed and users are signed out when the 15-minute access token expires.
- Because of `SameSite=Strict`, the web app and the API must be served from the same site (for example `app.example.com` and `api.example.com`). Different registrable domains break the silent refresh.

### Frontend API URL and Content Security Policy

`NEXT_PUBLIC_API_URL` is compiled into the frontend at build time. It sets both the API base URL and the `connect-src` origin of the frontend Content Security Policy. Rebuild the frontend image for each environment; changing the variable at runtime has no effect. If the API URL uses `https:`, the CSP also adds `upgrade-insecure-requests`. Pages are rendered per request so that a fresh CSP nonce can be applied.

### Redis

Redis backs the background-job queue and all rate-limit counters, so it is a production dependency:

- Set `REDIS_PASSWORD` (Compose then starts Redis with `requirepass`); with an empty value Redis runs without authentication.
- If Redis is unavailable, authentication endpoints (login, register, refresh, logout) and sensitive operations (password change, invitations) return `503`; other API requests continue. Once access tokens expire, web users cannot refresh their session until Redis is back. Plan Redis availability and monitoring accordingly.

### Health checks

The backend exposes two unauthenticated health endpoints. They are excluded from rate limiting so that probes never depend on the limiter.

| Endpoint | Purpose | Responses |
|---|---|---|
| `GET /api/v1/health/live` | Liveness: the backend process is running and serving HTTP. Does not contact PostgreSQL or Redis. | `200 {"status":"ok"}` |
| `GET /api/v1/health/ready` | Readiness: PostgreSQL (`SELECT 1`) and Redis (`PING`) are reachable. Both checks run in parallel with a 2-second timeout each. | `200 {"status":"ok","checks":{"database":"up","redis":"up"}}` or `503` with code `SERVICE_NOT_READY` and `details.checks` showing which dependency is `down` |

- `GET /api/v1` is kept for existing monitors and returns the same response as liveness.
- Responses only report `up` or `down` per dependency; connection errors are logged on the server without hosts or credentials and are never returned to clients.
- The ML service is not part of readiness: when it is unavailable or has no model, tasks still work and no risk assessment is stored.
- The Compose backend health check uses the readiness endpoint, so `docker compose up --wait` and the frontend's `depends_on` wait until PostgreSQL and Redis are reachable. Docker does not restart unhealthy containers automatically; when using an orchestrator such as Kubernetes, use `/health/live` for liveness probes and `/health/ready` for readiness probes.

### Email delivery

Email is **off** until `SMTP_HOST` is set; TaskFlow never falls back to a third-party mail server. While it is off, the backend logs one warning at startup, no email is sent, and owners/admins copy invitation links from the Members page instead.

To enable it, set `SMTP_HOST`, `SMTP_PORT` (default `587`; `465` uses implicit TLS), `SMTP_USER`/`SMTP_PASSWORD` if your server requires authentication, and `SMTP_FROM`. At startup the backend verifies the connection and logs `SMTP connection verified.` or the reason it failed.

For local testing, an optional [Mailpit](https://mailpit.axllent.org/) container (MIT licence) catches all email without delivering it: run `docker compose --profile dev-mail up -d`, set `SMTP_HOST=mailpit`, `SMTP_PORT=1025` and `SMTP_FROM=noreply@taskflow.local`, and open http://localhost:8025. Do not use this profile in production.

### Invitations

Owners and admins invite people by email address, whether or not the address has an account (Members page or `POST /workspaces/:workspaceId/members/invite`).

- **The link:** each invitation is a single-use link, `<FRONTEND_URL>/invite#<token>`, valid for 7 days. Only the token's SHA-256 hash is stored. The token sits after `#`, so browsers never send it to a server and it stays out of logs and `Referer` headers.
- **Delivery:** the link is emailed when email delivery is enabled, and is always shown to the inviter so it can be shared directly.
- **Accepting:** the recipient opens the link, signs in or creates an account, and joins with the invited role. The link is what authorises joining, because TaskFlow does not verify email addresses: share links only with the intended person.
- **Managing:** owners and admins see pending invitations, can resend (which issues a new link and invalidates the old one) and can revoke. Admins cannot invite or manage admin invitations.
- **No account enumeration:** the invite response and the pending list are the same for addresses with and without an account.
- **Upgrading:** invitations created by earlier versions (pending memberships of registered users) can still be accepted from the Workspaces page.
- **`FRONTEND_URL`:** this is the base of invitation links. It defaults to `http://localhost:3000`, so set it to the public HTTPS web-app URL.

### Upgrading: one-time sign-in after the session-security migration

The migration `20261126120000_session_security` marks all existing refresh tokens as revoked because they cannot be used with the new token format. After deploying it, every web and Android user must sign in once.

## Security controls

A short reference of the implemented controls. Current verification status and open findings are tracked in [analysis/go_live.md](analysis/go_live.md).

**Sessions and tokens**

- Access token: JWT, 15 minutes, with a `tokenType: 'access'` claim. API requests are rejected for other token types, deleted or disabled accounts, and tokens issued before the last password change.
- Refresh token: opaque 32-byte random value, stored only as a SHA-256 hash, valid for 30 days and rotated on every use. Each login starts a token family.
- Reuse detection: presenting an already-rotated token revokes its whole family. Within 30 seconds of a rotation it is treated as a benign parallel request (`REFRESH_TOKEN_ROTATED`) and nothing is revoked.
- Password change revokes all sessions of the user and issues a fresh session to the caller.
- Logout revokes the session family of the presented refresh token; without a usable cookie (or with another user's cookie) all sessions of the user are revoked.
- Refresh, login, logout, password change and reuse revocation run under a per-user PostgreSQL row lock (`SELECT ... FOR UPDATE`) so concurrent requests cannot leave a revoked session active.

**Rate limiting** (Redis, atomic fixed window, shared across backend instances)

| Policy | Limit | Key | If Redis is unavailable |
|---|---|---|---|
| Baseline, every route except the health endpoints (`GET /api/v1`, `/api/v1/health/live`, `/api/v1/health/ready`) | 600 / minute | client IP | allowed, logged |
| Authenticated reads (`GET`, `HEAD`, `OPTIONS`) | 300 / minute | user | allowed, logged |
| Authenticated writes | 120 / minute | user | allowed, logged |
| Auth endpoints and invitation creation | 10 / minute per route | client IP | `503` |
| Web and mobile refresh | 30 / minute | client IP | `503` |
| Web and mobile login | 20 / 15 minutes | account (email) | `503` |
| Password change | 5 / 15 minutes | user | `503` |
| Invitation creation | 30 / hour | user | `503` |

Exceeded limits return `429` with a `Retry-After` header and error code `RATE_LIMITED`.

**Security headers**

- API (Helmet): `Content-Security-Policy: default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-site`, `Cross-Origin-Opener-Policy: same-origin`; `Strict-Transport-Security` in production only; `X-Powered-By` removed.
- Web app: per-request nonce-based CSP from `frontend/src/proxy.ts` (production: no `'unsafe-inline'` for scripts or styles; development adds `'unsafe-eval'` and inline styles for the Next.js dev tools). `frontend/next.config.ts` adds `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Permissions-Policy`, and production-only HSTS.

**Docker build contexts**

Each build context (`backend/`, `frontend/`, `ml-service/`) has its own `.dockerignore` that keeps `.env*` files, keys, local dependencies, build output, tests, and development tooling out of the images. The repository-root `.dockerignore` applies only to builds that use the root as context.

## Authentication API contract

All paths are relative to `/api/v1`. Web clients use the refresh cookie; mobile clients send the refresh token in the request body and store it securely.

| Endpoint | Request | Success response | Notes |
|---|---|---|---|
| `POST /auth/register` | `email`, `password`, `fullName` | `201` `{ message, user }` | No tokens issued |
| `POST /auth/login` | `email`, `password` | `200` `{ accessToken, user }` | Sets the refresh cookie |
| `POST /auth/refresh` | refresh cookie | `200` `{ accessToken }` | Rotates the refresh cookie |
| `POST /auth/logout` | Bearer token + refresh cookie | `201` `{ message }` | Clears the cookie |
| `POST /auth/mobile/login` | `email`, `password` | `200` `{ accessToken, refreshToken, user }` | No cookie |
| `POST /auth/mobile/refresh` | `{ refreshToken }` | `200` `{ accessToken, refreshToken }` | Rotates the refresh token |
| `POST /auth/mobile/logout` | `{ refreshToken }` | `200` `{ message }` | No access token required |
| `PATCH /users/me/password` | Bearer token, `currentPassword`, `newPassword` | `200` `{ message, accessToken }` | Other sessions revoked; sets a new refresh cookie |
| `POST /workspaces/:workspaceId/members/invite` | Bearer token (owner/admin), `email`, `role` | `201` `{ message, invitationId, email, role, invitationExpiresAt, acceptUrl, emailDelivery }` | Same response whether or not the address has an account; `emailDelivery` is `queued` or `disabled` |
| `GET /workspaces/:workspaceId/invitations` | Bearer token (owner/admin) | `200` open invitations | Includes expired ones (`expired: true`) until renewed or revoked |
| `POST /workspaces/:workspaceId/invitations/:id/resend` | Bearer token (owner/admin) | `201` new `acceptUrl` | The previous link stops working |
| `DELETE /workspaces/:workspaceId/invitations/:id` | Bearer token (owner/admin) | `200` | The link stops working |
| `POST /invitations/preview` | `{ token }` (no sign-in) | `200` `{ status, email, role, workspaceName, inviterName, expiresAt }` | `404 INVITATION_NOT_FOUND` for unknown links |
| `POST /invitations/accept` | Bearer token, `{ token }` | `200` `{ workspace, role }` | `410 INVITATION_USED` / `INVITATION_EXPIRED`, `409 ALREADY_MEMBER` |

| Error code | Status | Meaning |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Wrong email/password, or a deleted/disabled account |
| `NO_REFRESH_TOKEN` | 401 | Web refresh without a usable cookie |
| `INVALID_REFRESH_TOKEN` | 401 | Unknown refresh token (including access tokens and pre-migration tokens) |
| `REFRESH_TOKEN_EXPIRED` | 401 | Refresh token past its 30-day lifetime |
| `REFRESH_TOKEN_ROTATED` | 401 | Token was rotated by a parallel request within 30 seconds; retry with the current token |
| `REFRESH_TOKEN_REUSED` | 401 | Rotated token presented again; the session family was revoked |
| `INVALID_CURRENT_PASSWORD` | 401 | Password change with a wrong current password |
| `RATE_LIMITED` | 429 | Rate limit exceeded; see `Retry-After` |
| — | 503 | Rate limiter unavailable on a fail-closed endpoint |

## Input length limits

The API rejects longer values with `400 Bad Request` (code `Bad Request`); the offending field is listed in `details.fields`, for example `title must be shorter than or equal to 200 characters`.

| Field | Maximum length | Applies to |
|---|---|---|
| Task title | 200 characters | Task create and update |
| Task description | 10,000 characters | Task create and update |
| Project name | 100 characters | Project create |
| Comment body | 5,000 characters | Comment create |

Lengths are counted as JavaScript string length, so some characters such as emoji count as two.

## Task due dates, workspace time zone and task history

- `dueDate` on task create/update accepts either a calendar date (`YYYY-MM-DD`) or an ISO 8601 date-time. A calendar date is stored as UTC midnight with `dueDateIsDateOnly: true` and is due at the end of that day in the workspace time zone; a date-time is an exact deadline. Send `null` to clear the due date.
- Each workspace has a `timezone` (IANA name such as `Europe/Istanbul`, default `UTC`). It can be set on `POST /workspaces` and changed by owners and admins with `PATCH /workspaces/:workspaceId` `{ timezone }`; other members receive `403`.
- Task changes (status, due date, assignee, priority) and comment additions/deletions are recorded in an append-only `TaskEvent` history in the same database transaction as the change. Offline Android changes include the device time as `clientOccurredAt`; the server time remains authoritative. The history is the foundation for workspace-local model training and is not exposed through the API yet.
- Upgrading: the migration treats existing due dates as calendar dates and backfills history from audit records plus one snapshot per task.

## Delay-risk model (per workspace)

No model is shipped. Each workspace can learn delay risk from its own task history, on your server, after an owner or admin turns training on.

| Endpoint (relative to `/api/v1`) | Who | Purpose |
|---|---|---|
| `GET /workspaces/:workspaceId/risk-model` | Any member | Training on/off, data readiness, active model summary, last training run |
| `PATCH /workspaces/:workspaceId/risk-model` `{ trainingEnabled }` | Owner, admin | Turn training on or off. Turning it off stops predictions immediately and deactivates the model. |
| `POST /workspaces/:workspaceId/risk-model/train` | Owner, admin | Queue a training run now (`202`); refused with `409` while disabled or while a run is in progress |
| `POST /workspaces/:workspaceId/risk-model/rollback` | Owner, admin | Reactivate the previous model (`409` if there is none) |

- **Readiness** is checked every night at 03:00 UTC for every workspace, and right after training is enabled. A workspace is ready when all of these hold (defaults, configurable through the `RISK_*` variables in `.env.example`):
  - at least 300 tasks with a known outcome, including at least 50 in the smaller outcome group (at least 5% of all);
  - at least 90 days of history;
  - at least 250 such tasks in the last 30 days, of which at least 20 are in the smaller group;
  - at least 3 assignees or projects.

  The 250-task evaluation period follows the measured power of the evaluation gate. With far fewer recent tasks, a real signal is rarely confirmed; see `ml-service/MODEL_CARD.md`.
- **Training** runs automatically when a workspace with training enabled is ready, for the first time and then at most monthly once outcome-known tasks have grown by 20%. A model is activated only if it passes the evaluation gate, otherwise the current state is kept. Every run, including rejected ones, is recorded.
- **Predictions** are recomputed after task and comment changes and daily at 02:00 UTC. The web app and Android app show the same states: collecting data (with progress), no validated model yet, the level from the workspace's model (marked low confidence when it is not calibrated), or why there is no prediction for a task.
- **Storage:** models are stored in the `ml-models` Docker volume. Include it in backups if you want to keep trained models; without it, models are retrained from task history on the next scheduled run. Models of deleted workspaces are removed nightly.

## Design system

The web and Android apps share one design system: the same colour tokens (light and dark, following the device setting), type scale, radii and wording. The tokens live in `frontend/src/app/globals.css` and `android/app/src/main/java/com/taskflowai/taskflowai/presentation/ui/theme/Color.kt`; change both together. Every text/background pair meets WCAG AA contrast. Dates are shown in English (`Nov 28, 2026`) in the viewer's time zone; date-only due dates never shift between time zones. Admin screens (members, invitations, activity log, risk-model training) are web-only.

## Android client

The Android project is under `android/`. Debug builds use the development API configuration; release builds require an HTTPS API base URL. Configure the release URL using the Gradle property documented in `android/app/build.gradle.kts`, then build and sign release artifacts with your own keystore. Never commit signing keys or passwords.

## Development and verification

The GitHub Actions workflow runs backend tests/type-check/build, frontend lint/type-check/build, ML tests and dependency audit, Android unit/instrumented tests and debug build, and a Docker Compose startup/health-check smoke test.

Run the relevant checks from each subproject when changing code. A passing CI run is useful evidence, but it does not replace staging acceptance tests, a real external HTTPS deployment, backup/restore verification, SMTP delivery checks, or review of tenant isolation and authorization.

## Known limitations

- No task-risk model is shipped. A workspace shows risk levels only after an owner or admin enables training and a model trained on that workspace's own history passes evaluation; small or new workspaces see "collecting data" instead. Risk assessments written by the removed demonstration model (`v1`) are hidden by the API.
- The ML service's management endpoints (`/train`, `/models/...`) have no authentication of their own. They are reachable only inside the Compose network (the service is not published), so do not expose port 8000.
- Email addresses are not verified. Invitation links therefore authorise joining by themselves, and anyone holding a valid link can join with its role until it is used, revoked or expires. Delivery through a real SMTP server and the full browser flow must be verified for each deployment.
- The per-account login limit (20 attempts per 15 minutes) also counts failed attempts made by others: an attacker who knows an email address can keep that account's login blocked. Existing sessions are not affected.
- Redis is required for authentication: while it is unavailable, login, refresh, logout, password change, and invitations return `503`, and the first authentication request after Redis recovers can still fail once.
- A rotated refresh token presented again within 30 seconds is not treated as reuse, which narrows theft detection in that window. Session families have no absolute lifetime; regularly used sessions stay valid until logout or a password change.
- Access tokens remain valid for up to 15 minutes after logout or session revocation (password changes revoke them immediately).
- Email delivery, retry behavior, production reverse-proxy setup, backup/restore, and full browser/Android user journeys require deployment-specific verification.
- The backend has an existing general lint backlog; CI currently enforces lint on changed backend TypeScript files while the legacy baseline is being cleaned up.

See [analysis/sales_readiness_plan.md](analysis/sales_readiness_plan.md) and [analysis/go_live.md](analysis/go_live.md) for the current release blockers and audit history.

## License

No license has been selected for this source-code product yet. All rights remain with the copyright holder unless and until a license is added. Do not assume that this repository grants redistribution, resale, sublicensing, or commercial-use rights. A clear commercial license and third-party license/attribution inventory are required before marketplace release.
