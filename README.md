# FightBase Media

Next.js App Router foundation for a UFC-focused MMA media platform with entity-based content, internal linking, and an AI-assisted publishing pipeline.

## Stack

- Next.js 15
- React 19
- TypeScript
- App Router

## Current structure

- `app/`: routes and pages
- `components/`: shared UI building blocks
- `lib/types.ts`: domain entities
- `lib/data.ts`: demo content wired into routes
- `lib/pipeline.ts`: ingestion and normalization stub for the future AI agent
- `prisma/schema.prisma`: database schema
- `prisma/seed.js`: starter seed data
- `lib/prisma.ts`: Prisma Client singleton

## Core entities

- `Article`
- `Event`
- `Fight`
- `Fighter`
- `Promotion`
- `Tag`
- `Source`

## Database

The active local setup uses Postgres. Prisma also includes a SQLite schema for isolated local or CI runs when a disposable database is more convenient.

Important files:

- `prisma/schema.prisma`
- `.env`
- `lib/prisma.ts`

Useful commands:

```bash
npm run prisma:generate
npm run prisma:generate:pg
npm run db:push
npm run db:push:pg
npm run db:seed
npm run db:studio
npm run content:seed-fighters
npm run content:enrich-fighters
npm run content:refresh-fighters
npm run content:sync-ufc-roster
npm run content:refresh-fighters-full
npm run content:discover-weekly-news -- --dry-run
npm run ingest:cron -- --dry-run --secret YOUR_SECRET
```

Optional AI localization env vars:

```bash
OPENAI_API_KEY="your-key"
OPENAI_INGEST_MODEL="gpt-4o-mini"
OLLAMA_URL="http://127.0.0.1:11434/api/generate"
OLLAMA_MODEL="qwen35-aggressive:latest"
INGEST_CRON_JOB="ai-discovery"
AI_DISCOVERY_LOOKBACK_HOURS="8"
AI_DISCOVERY_ITEM_LIMIT="8"
AI_DISCOVERY_STATUS="published"
```

Current local database is seeded with:

- 3 articles
- 3 events
- 4 fighters

Current Prisma-backed additions:

- `/admin` draft dashboard with live database content
- `/api/ingest/preview` POST endpoint for AI ingestion preview
- `/api/ingest/draft` POST endpoint that stores AI drafts in the database
- `/api/cron/ingest` protected cron endpoint for scheduled ingestion runs
- `/api/health` health endpoint for deployment checks
- ingestion run tracking with status, counts, duration, and last-run visibility
- article workflow with `draft`, `review`, and `published` states
- `npm run content:discover-weekly-news` main content discovery from configured sources
- `npm run ingest:cron` client for hitting the protected cron endpoint
- RU-first ingestion localization via OpenAI Responses API when `OPENAI_API_KEY` is configured
- local-first ingestion localization via Ollama when `OLLAMA_MODEL` is configured
- centralized ad-slot architecture for homepage, news, and article monetization zones
- expanded fighter roster seeding with Russian names and live photo resolution
- fighter profile enrichment and normalization pipeline for biographies and recent fights
- official UFC roster sync via sitemap-driven athlete import

## Routes included

- `/`
- `/news`
- `/news/[slug]`
- `/events`
- `/events/[slug]`
- `/fighters`
- `/fighters/[slug]`
- `/rankings`
- `/analysis`
- `/admin`
- `/api/health`
- `/quotes`
- `/videos`
- `/about`
- `/sources-policy`
- `/editorial-policy`
- `/privacy-policy`
- `/terms`
- `/disclaimer`

## AI-agent direction

The intended flow is:

1. Collect source items from official sites, interviews, and social posts.
2. Normalize entities and attach fighters, events, tags, and sources.
3. Generate a short `meaning` block and structured sections.
4. Save drafts into the database with `draft` status and route them into moderation.
5. Publish to multiple connected routes from one shared data model.

## Local setup

Local runtime is already configured with Node and npm.

```bash
npm install
npm run dev
```

To initialize the local database:

```bash
npm run db:push
npm run db:seed
```

To prepare the local Postgres database:

```bash
npm run db:start:pg
```

Then ensure `DATABASE_URL` points to Postgres and run:

```bash
npm run prisma:generate:pg
npm run db:push:pg
npm run db:seed
```

Example ingestion preview request:

```bash
curl -X POST http://localhost:3000/api/ingest/preview ^
  -H "Content-Type: application/json" ^
  -d "{\"headline\":\"Fight announced\",\"body\":\"Official announcement body\",\"sourceLabel\":\"UFC\",\"sourceUrl\":\"https://ufc.com\"}"
```

Example draft creation request:

```bash
curl -X POST http://localhost:3000/api/ingest/draft ^
  -H "Content-Type: application/json" ^
  -d "{\"headline\":\"Fight announced\",\"body\":\"Official announcement body\",\"sourceLabel\":\"UFC\",\"sourceUrl\":\"https://ufc.com/news/story\",\"fighterSlugs\":[\"alex-pereira\"],\"tagSlugs\":[\"ufc\"]}"
```

Example batch ingestion worker:

```bash
npm run ingest:feed -- --file ingestion/sample-feed.json --base-url http://localhost:3000
```

Dry run:

```bash
npm run ingest:feed -- --file ingestion/sample-feed.json --dry-run
```

Example source fetch worker:

```bash
npm run ingest:fetch -- --file ingestion/sample-watchlist.json --base-url http://localhost:3000
```

Source fetch dry run:

```bash
npm run ingest:fetch -- --file ingestion/sample-watchlist.json --dry-run
```

Cron trigger dry run:

```bash
npm run ingest:cron -- --base-url http://localhost:3000 --secret YOUR_SECRET --dry-run
```

AI discovery dry run:

```bash
npm run content:discover-weekly-news -- --base-url http://localhost:3000 --dry-run
```

Windows Task Scheduler helper:

```powershell
.\ops\register-ingestion-task.ps1
```

Health check:

```bash
curl http://localhost:3000/api/health
```

Weekly fighter refresh helper:

```powershell
.\ops\update-fighters-weekly.ps1
```

The weekly helper now runs the full curated UFC roster refresh.

Full fighter refresh with official UFC roster sync:

```bash
npm run content:refresh-fighters-full
```

## Monetization architecture

The project now includes a centralized ad-layer:

- `lib/ads.ts`: placement registry and enable/disable switches
- `components/ad-slot.tsx`: reusable sponsored slot component
- homepage, news feed, and article templates already expose controlled ad placements

Current placement keys:

- `homeHero`
- `homeFeed`
- `newsSidebar`
- `newsInline`
- `articleInline`
- `articleSidebar`

Ads can be toggled globally through:

```bash
NEXT_PUBLIC_ADS_ENABLED="1"
```

This layer is intentionally provider-agnostic, so it can later connect to:

- Google AdSense
- direct advertisers
- affiliate widgets
- sponsored editorial placements

## Deployment readiness

For public deployment, configure:

- production database URL (Postgres)
- `INGEST_CRON_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- `DEPLOYMENT_ENV="production"`
- admin auth: `AUTH_SESSION_SECRET`, `ADMIN_EMAIL`, password (`ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`)
- optional `OPENAI_API_KEY`
- optional `OLLAMA_URL` and `OLLAMA_MODEL` if self-hosted translation is used
- optional social: `TELEGRAM_*`, `VK_*` (see [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md))
- health probe at `/api/health`
- ingestion run visibility in `/admin` and `/api/health`

Full variable list and production DB steps: **[DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md)**.

Health now also reports:

- deployment mode
- database kind
- whether site URL and cron secret are configured
- whether the current env is safe for public deployment

## Docker deployment

The project now supports standalone Next.js output for container deployment.

Build image:

```bash
docker build -t fightbase-media .
```

Run container:

```bash
docker run --rm -p 3000:3000 ^
  --env-file .env ^
  fightbase-media
```

For public hosting, use Postgres as the primary runtime database.

## Database options

The project includes both Prisma schemas:

- `prisma/schema.postgres.prisma`
- `docker-compose.postgres.yml`
- `ops/start-postgres-local.ps1`
- `ops/stop-postgres-local.ps1`

Recommended Postgres workflow:

1. Start local Postgres with `npm run db:start:pg`
2. Set `DATABASE_URL` to a Postgres URL
3. Run `npm run prisma:generate:pg`
4. Apply schema: **`npm run db:migrate:deploy:pg`** (versioned migrations), or **`npm run db:push:pg`** only for a fresh empty DB / prototyping
5. Run `npm run db:seed`
6. Smoke-test the app and `/api/health`

SQLite remains available for disposable local or CI databases, but the primary project setup is Postgres.

Legacy SQLite imports are supported only through an explicit source path:

```bash
SQLITE_IMPORT_PATH="C:/path/to/legacy.db" npm run content:migrate-sqlite-content
```

## Recommended next step

Build on the UFC-focused ingestion workflow by adding:

- more source-specific fetchers/parsers before JSON normalization
- GitHub remote and production hosting setup
- production hardening around the Postgres pipeline

## GitHub CI

The repository now includes a basic GitHub Actions workflow:

- `.github/workflows/ci.yml`

It runs:

- `npm ci`
- `npm run prisma:generate`
- `npm run db:push`
- `npm run build`

Deployment checklist:

- `DEPLOY_CHECKLIST.md`
