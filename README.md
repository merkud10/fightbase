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

## Core entities

- `Article`
- `Event`
- `Fight`
- `Fighter`
- `Promotion`
- `Tag`
- `Source`

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
4. Send drafts to moderation or a lightweight editorial review step.
5. Publish to multiple connected routes from one shared data model.

## Local setup

`node` and `npm` are not installed in the current environment, so I could not run the app here.

When Node is available:

```bash
npm install
npm run dev
```

## Recommended next step

Move demo data out of `lib/data.ts` into a real database and add:

- Prisma or Drizzle
- a CMS or admin dashboard
- a scraper / ingestion worker
- moderation states for drafts and published content
