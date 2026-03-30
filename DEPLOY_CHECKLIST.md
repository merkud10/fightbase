# FightBase Deployment Checklist

## Before GitHub

- make sure `.env` contains no real secrets
- rotate any exposed API keys
- confirm `npm run build` passes locally
- confirm `/api/health` returns `ok: true`

## Before Production

- provision Postgres
- set `DATABASE_URL` to Postgres
- set `DEPLOYMENT_ENV=production`
- set `NEXT_PUBLIC_SITE_URL`
- set a secure `INGEST_CRON_SECRET`
- keep `OPENAI_API_KEY` optional unless cloud localization is required

## First Deploy

- run `npm run prisma:generate:pg`
- run `npm run db:push:pg`
- run `npm run db:seed` if the new database needs starter content
- deploy app
- open `/api/health`
- verify homepage, fighters, rankings, and admin routes

## After Deploy

- connect domain
- configure cron to call `/api/cron/ingest`
- monitor `/api/health`
- verify ingestion runs appear in `/admin`
