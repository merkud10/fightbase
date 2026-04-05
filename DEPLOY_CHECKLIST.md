# FightBase Deployment Checklist

## Before GitHub

- make sure `.env` contains no real secrets
- rotate any exposed API keys
- confirm `npm run build` passes locally
- confirm `/api/health` returns `ok: true`

## Database (Postgres in production)

The repo has two Prisma entry points:

| Schema | Use case |
|--------|----------|
| `prisma/schema.prisma` | SQLite — local quick runs, CI (`npm run prisma:generate` + `db:push`) |
| `prisma/schema.postgres.prisma` | **Production** — Postgres |

**Recommended production flow**

1. Provision Postgres and set `DATABASE_URL` to a `postgresql://` or `postgres://` URL.
2. `npm run prisma:generate:pg`
3. Apply schema:
   - **Preferred for ongoing releases:** `npm run db:migrate:deploy:pg` (applies existing migrations in `prisma/migrations/` to the target DB).
   - **Acceptable for a brand-new empty DB / bootstrap:** `npm run db:push:pg` (no migration history). Prefer `migrate deploy` once you rely on versioned migrations.
4. `npm run db:seed` if you need starter content.
5. Regenerate client after schema changes: `npm run prisma:generate:pg`.

**Backups:** configure automated backups and restore tests on your host (RDS, managed Postgres, or `pg_dump` cron). Not automated in this repo.

## Environment variables (reference)

Set these in the host environment, Docker `--env-file`, or your platform’s secret store. Do not commit real values.

### Core

| Variable | Required for public prod | Notes |
|----------|-------------------------|--------|
| `DATABASE_URL` | Yes | Postgres URL in production |
| `DEPLOYMENT_ENV` | Yes | Use `production` |
| `NEXT_PUBLIC_SITE_URL` | Yes | Public HTTPS origin, no trailing slash issues handled by app — use canonical site URL |
| `NODE_ENV` | Usually set by host | `production` for `npm start` / Docker |

### Cron and internal API

| Variable | Required for public prod | Notes |
|----------|-------------------------|--------|
| `INGEST_CRON_SECRET` | Yes | Bearer token for `/api/cron/*` (GitHub Actions, external cron). Do not use placeholder `change-me` |
| `INTERNAL_API_SECRET` | Optional | If set, used for internal API auth; scripts may fall back to `INGEST_CRON_SECRET` |

### Admin session

| Variable | Required | Notes |
|----------|----------|--------|
| `AUTH_SESSION_SECRET` | Yes (admin login) | Strong random string |
| `ADMIN_EMAIL` | Yes | Admin login email |
| `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH` | Yes | Plain password or bcrypt hash |

### Social publishing (optional)

| Variable | Notes |
|----------|--------|
| `TELEGRAM_BOT_TOKEN` | Bot token |
| `TELEGRAM_CHANNEL_ID` | Target channel; also used for alerts if `TELEGRAM_ALERTS_CHAT_ID` unset |
| `TELEGRAM_ALERTS_CHAT_ID` | Optional separate chat for operational alerts |
| `VK_GROUP_TOKEN` | VK API token with wall/photos scope |
| `VK_GROUP_ID` | Numeric group id |
| `VK_API_VERSION` | Default `5.199` if unset |

### Public links (optional UI)

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_TELEGRAM_URL` | Footer / floating links |
| `NEXT_PUBLIC_VK_URL` | Same |

### Ingestion / workers (scripts & cron clients)

| Variable | Notes |
|----------|--------|
| `INGEST_BASE_URL` | Base URL for scripts calling the site (default `http://localhost:3000`) |
| `OPENAI_API_KEY` | Cloud localization / AI discovery |
| `OLLAMA_URL`, `OLLAMA_MODEL` | Local model alternative |
| `AI_DISCOVERY_*`, `INGEST_CRON_JOB` | See `scripts/trigger-ingest-cron.js` |

### Web Push (optional)

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PUBLIC_KEY` | Public key |
| `VAPID_PRIVATE_KEY` | Server-side |
| `VAPID_SUBJECT` | e.g. `mailto:...` |

### Ads and verification

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_ADS_ENABLED` | `1` to show ad slots |
| `GOOGLE_SITE_VERIFICATION`, `YANDEX_VERIFICATION` | Meta tags in `app/layout.tsx` |

### Background jobs (if you process the queue in production)

Cron enqueues jobs; something must run `npm run jobs:process` or `npm run jobs:loop` (or platform equivalent) against the same `DATABASE_URL`, or use `npm run jobs:trigger` from a scheduler.

| Variable | Notes |
|----------|--------|
| `BACKGROUND_JOB_BATCH_SIZE` | Default `5` |
| `BACKGROUND_JOB_POLL_INTERVAL_MS` | For `jobs:loop`, default `30000` |

## Before Production

- provision Postgres
- set variables from the tables above for your scenario
- ensure `INGEST_CRON_SECRET` is strong and stored in GitHub **Secrets** if you use `.github/workflows/sync-*.yml`
- GitHub Actions expect repository secrets such as `NEXT_PUBLIC_SITE_URL` (production URL) and `INGEST_CRON_SECRET` — must match the deployed app

## First Deploy

- `npm run prisma:generate:pg`
- `npm run db:migrate:deploy:pg` (or `db:push:pg` only for empty DB bootstrap — see above)
- `npm run db:seed` if the new database needs starter content
- deploy app (Docker: build image, pass env file or secrets)
- open `/api/health` and confirm `checks.environment.readyForPublicDeploy` expectations
- verify homepage, fighters, rankings, and admin routes

## After Deploy

- connect domain and TLS
- configure cron to call `/api/cron/ingest` (and other `/api/cron/*` routes you use) with `Authorization: Bearer <INGEST_CRON_SECRET>`
- if using background jobs: run `jobs:process` / `jobs:loop` or scheduled `jobs:trigger`
- monitor `/api/health`
- verify ingestion runs appear in `/admin`

## Dependency security

Run `npm audit` periodically; apply `npm audit fix` where safe. For breaking upgrades (e.g. major Prisma/Next), test `npm run build` and `npm run test:smoke` before production.
