# FightBase Media

Next.js App Router foundation for an MMA media platform with entity-based content, internal linking, and an AI-assisted publishing pipeline.

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

Prisma is connected with SQLite for local development.

Important files:

- `prisma/schema.prisma`
- `.env`
- `lib/prisma.ts`

Useful commands:

```bash
npm run prisma:generate
npm run db:push
npm run db:seed
npm run db:studio
npm run ingest:feed -- --dry-run
npm run ingest:fetch -- --dry-run
npm run ingest:cron -- --dry-run --secret YOUR_SECRET
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
- article workflow with `draft`, `review`, and `published` states
- `npm run ingest:feed` worker for batch JSON ingestion into draft articles
- `npm run ingest:fetch` worker with parser registry for source pages and fixtures
- `npm run ingest:cron` client for hitting the protected cron endpoint

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

Windows Task Scheduler helper:

```powershell
.\ops\register-ingestion-task.ps1
```

## Recommended next step

Build on the ingestion workflow by adding:

- more source-specific fetchers/parsers before JSON normalization
- confidence scoring and moderation queues in `/admin`
- feed health reporting and ingestion logs
