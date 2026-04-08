# FightBase Media — Project Overview

**Last updated**: 2026-04-08

## What is this

FightBase Media (**https://fightbase.ru**) is a Russian-language MMA/UFC media outlet. It automatically collects news from 7 sources, translates and rewrites them via DeepSeek AI, publishes to the website and social networks (Telegram, VK). The site includes event pages, fighter profiles, rankings, and AI-generated fight predictions.

## Tech Stack

- **Next.js 15.5** (App Router, standalone output) + **React 19** + **TypeScript 5.8**
- **Prisma 6.19** + **PostgreSQL** (two schemas: `schema.prisma` for SQLite/CI, `schema.postgres.prisma` for production)
- **DeepSeek AI** — article translation/rewrite into Russian
- **Nginx** reverse proxy + **Let's Encrypt** SSL

## Repository

- **GitHub**: https://github.com/merkud10/fightbase (public)
- **Branch**: `master` (single working branch)

## Hosting

- **Timeweb Cloud** VPS: Ubuntu 24.04, 2x3.3 GHz CPU, 4 GB RAM, 50 GB NVMe
- **IP**: 176.124.219.75
- **Domain**: fightbase.ru (DNS via Reg.ru, A records -> 176.124.219.75)
- **SSL**: Let's Encrypt via certbot, auto-renewal

## Server Structure

- **Code**: `/opt/fightbase/` (GitHub clone, owned by `fightbase` user)
- **Config**: `/opt/fightbase/.env` (secrets, not in git)
- **Nginx**: `/etc/nginx/sites-available/fightbase`
- **Systemd services**:
  - `fightbase.service` — Next.js standalone app (port 3000)
  - `fightbase-jobs.service` — background job processor (`scripts/process-background-jobs-loop.js`)

## Deployment

Single command on server: `bash /opt/fightbase/scripts/deploy.sh`

The script: stops services -> `git pull` -> `npm run build` -> copies static -> creates symlinks for scripts/node_modules in `.next/standalone/` -> starts services -> health check.

**Important**: after build, symlinks are required because Next.js standalone output doesn't copy `scripts/` and `node_modules/`, but the cron API runs scripts from `process.cwd()` (= `.next/standalone/`).

## Prisma

- Production uses `prisma/schema.postgres.prisma` (provider: postgresql)
- Client generation: `npm run prisma:generate:pg`
- Schema application: `npm run db:push:pg` or `npm run db:migrate:deploy:pg`
- `prisma/schema.prisma` (SQLite) — CI/local tests only

## GitHub Actions

Repository secrets required: `NEXT_PUBLIC_SITE_URL`, `INGEST_CRON_SECRET`
Optional secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERTS_CHAT_ID`

| Workflow | Schedule | Description |
|----------|----------|-------------|
| `sync-news.yml` | Every 6h | POST `/api/cron/ingest` -> queues `ai-discovery` job |
| `sync-odds.yml` | Daily 06:00 UTC | POST `/api/cron/ingest` -> `sync-odds` (events + fights + odds) |
| `sync-roster.yml` | Mon 04:00 UTC | POST `/api/cron/ingest` -> `sync-roster` |
| `drip-social.yml` | Every hour | POST `/api/cron/drip-social` -> publishes 1 article to TG+VK |
| `ci.yml` | On every push | Lint + build + smoke tests |

Workflows call the site API via curl. Jobs go into `BackgroundJob` queue. The `fightbase-jobs` service on the server processes them automatically.

## API Endpoints

- `/api/health` — monitoring (DB, content, ingestion, queue)
- `/api/cron/ingest` — job dispatch (ai-discovery, sync-odds, sync-roster)
- `/api/cron/jobs` — background job queue processing
- `/api/cron/drip-social` — drip-feed social publishing
- `/api/image-proxy` — proxies all external images (bypasses geo-blocks from Russia)
- `/api/ingest/draft`, `/api/ingest/preview` — ingestion API

## AI Content Pipeline

1. **Source parsing** (`scripts/discover-weekly-news.js`): UFC.com, Sherdog, MMA Fighting, MMA Junkie, Metaratings, FightNews.info
2. **AI rewrite** (`lib/ai-localization.ts`): DeepSeek translates and rewrites into original Russian article
3. **Post-processing** (`lib/article-quality.ts`): term replacement, fighter name Russification, promotional paragraph removal
4. **Deduplication** (`lib/ingestion.ts`): exact + cross-source (same story from different outlets)
5. **AI predictions** (`scripts/generate-ai-predictions.js`): fight previews with win percentages

## Social Publishing

- **Telegram**: text with image, split into short paragraphs (1-2 sentences), 4090-char chunks
- **VK**: full text + photo upload via VK API (photos -> wall.post)
- **Drip-feed**: 1 article per hour, oldest unpublished first
- **Known issue**: VK group token lacks `photos` scope — needs to be recreated via OAuth with `scope=photos,wall,offline`

## Image Proxy

All external images are proxied through `/api/image-proxy` to bypass geo-blocks in Russia. Sherdog gets a Referer header, UFC gets Referer + Accept. For image downloads (VK upload), there's a fallback through wsrv.nl/weserv.nl. UFC.com blocks server-side requests at the Fastly CDN level — those images don't load.

## Site Pages

- `/` — homepage (poster of the week, events, news, fighters)
- `/news`, `/news/[slug]` — news feed
- `/events`, `/events/[slug]` — events with fight cards
- `/fighters`, `/fighters/[slug]` — 2500+ fighter profiles
- `/rankings` — UFC rankings by division
- `/predictions`, `/predictions/[eventSlug]/[fightSlug]` — AI predictions (SSG with `generateStaticParams`)
- `/quotes`, `/analysis` — quotes and analysis
- `/admin` — admin panel (CRUD for articles, fighters, events; manual TG/VK send; quick actions)
- Static: `/about`, `/privacy-policy`, `/terms`, `/disclaimer`, `/editorial-policy`, `/sources-policy`

## Localization

Language switching is disabled. The site operates in Russian only. Localization infrastructure exists in code (dictionaries, translation functions in `lib/display.ts`) but the language toggle is turned off.

Translation dictionaries include:
- Weight classes (e.g., "Light Heavyweight" -> "Полутяжелый вес")
- Fight methods (e.g., "KO/TKO" -> "Нокаут/Технический нокаут", "Decision - Unanimous" -> "Единогласное решение")
- Title bout suffixes (e.g., "Light Heavyweight Title" -> "Полутяжелый вес — Титульный бой")

## Current DB State

~32 articles, ~2500 fighters, 8 events, 24 predictions. Content is populated automatically via scheduled workflows.

## Known Issues

1. **VK images** — group token lacks `photos` permission. Need to recreate via OAuth with `scope=photos,wall,offline`
2. **UFC.com images** — Fastly CDN blocks server-side requests (403). UFC images don't load for VK uploads or through image-proxy
3. **CI smoke test** — `/api/health` fails in GitHub Actions (no PostgreSQL in CI environment)

## Key Files

- `next.config.ts` — Next.js config (standalone, remotePatterns, CSP, security headers)
- `lib/social-publish.ts` — TG/VK publishing, drip-feed
- `lib/ai-localization.ts` — DeepSeek prompt, AI rewrite
- `lib/ingestion.ts` — article creation pipeline, deduplication
- `lib/article-quality.ts` — text post-processing, promo removal
- `lib/image-proxy.ts` — proxying all external images
- `lib/display.ts` — localization (weight classes, fight methods)
- `lib/db/` — all Prisma queries (admin.ts, events.ts, fighters.ts, etc.)
- `scripts/server-setup.sh` — initial VPS setup
- `scripts/deploy.sh` — one-command deploy
- `scripts/local-scheduler.js` — local task scheduler
- `DEPLOY_CHECKLIST.md` — deployment docs and env variables reference
