# scripts/

Shell and Node scripts grouped by role. Files live flat in this directory; the
groups below are how to reason about them, not how they are on disk. When in
doubt, check the file header before running — scripts in the "migrations" and
"one-shot" groups are not safe to re-run without thought.

## Runtime (invoked by systemd / cron / the app)

These run in production continuously or on a schedule. Touch carefully.

- `cron-tasks.sh` — cron orchestrator. Entry point for `drip-social`, `sync-news`,
  `sync-odds`, `sync-roster`, `silence-check`. Uses flock + watchdog.
- `deploy.sh` — pulls, installs, builds, chowns, restarts systemd. Called by the
  Deploy GitHub Actions workflow.
- `start-standalone.js` — systemd `ExecStart` target. Boots `.next/standalone/server.js`.
- `verify-ownership.sh` — systemd `ExecStartPre` candidate. Fails fast if `.next/`
  ends up root-owned after a manual build.
- `process-background-jobs.js` / `process-background-jobs-loop.js` — BackgroundJob
  worker. The loop variant is the long-lived systemd unit; the non-loop version
  is invoked per batch.
- `local-scheduler.js` — in-process fallback scheduler. Used for dev when there
  is no cron.
- `drip-social-publish.js` — publishes the next queued article to TG/VK.
- `discover-weekly-news.js`, `discover-weekly-editorial.js` — AI news/editorial
  discovery pipeline.
- `generate-ai-predictions.js`, `generate-prediction-snapshots.js` — prediction
  pipeline.
- `sync-*.js` (`sync-event-fights`, `sync-fight-odds`, `sync-ufc-roster`,
  `sync-upcoming-events`, `sync-upcoming-pipeline`, `sync-ufc-champion-status`,
  `sync-ufc-russian-names`) — data sync tasks invoked by `cron-tasks.sh`.
- `send-pending-push-notifications.js`, `send-telegram-operational-alerts.js` —
  outbound messaging workers.
- `trigger-background-jobs.js`, `trigger-ingest-cron.js` — manual kickers that
  hit the internal API. Useful for operators.

## Setup (run once per environment)

- `server-setup.sh` — initial server provisioning (packages, users, directories).
- `setup-media-nginx.sh` — configures nginx for `/media` static serving.

## Migrations / backfills / one-shot repairs

Destructive or expensive. Read the file before running. Most assume a fresh DB
snapshot is available.

- `migrate-sqlite-content-to-postgres.js` — one-time content migration.
- `backfill-*.js` — fill missing rows: article images, fighter bio (EN), fighter
  images, fight slugs, UFC fighter data.
- `normalize-*.js` — canonicalize slugs, imported fighters, fighter profiles.
- `cleanup-*.js` — remove UFC catalog/article/fighter cruft.
- `repair-*.js` — fix analysis/editorial quality, missing images, UFC local
  slugs, UFC recent fight results.
- `dedupe-*.js`, `delete-url-duplicates.js` — deduplication.
- `refresh-fighter-bio-*.js`, `refetch-ufc-fighter-profiles.js`,
  `reconcile-ufc-fighters.js`, `enrich-fighter-profiles.js`,
  `fill-missing-fighter-*.js`, `ensure-ufc-fighters.js` — profile maintenance.
- `audit-*.js` — read-only auditors (name these to discover problems, not fix
  them).
- `improve-article-quality.js`, `override-article-bodies.js`,
  `normalize-article-slugs.js`, `localize-existing-content.js`,
  `ai-article-taxonomy.js` — one-shot article maintenance.
- `clear-predictions.js`, `reset-upcoming-fights.js`, `seed-fighter-cards.js`,
  `repair-ufc-local-slugs.js`, `repair-ufc-recent-fight-results.js` — targeted
  fixes.
- `clean-next.js` — wipes `.next` build artifacts locally.

## Dev / debug

Safe to run ad-hoc. Prefixed with `_` or named `debug-*` / `benchmark-*`.

- `_check-article.js`, `_check-events.js`, `_clean-events.js`,
  `_inspect-html.js` — local inspectors.
- `debug-telegram-image.js` — reproduces Telegram image send locally.
- `benchmark-local-models.js` — local LLM perf comparison.

## Shared helpers (imported, not run directly)

- `background-job-store.js`, `ingestion-run-store.js` — queue/run state helpers.
- `fighter-import-utils.js`, `local-image-store.js`, `script-utils.js`,
  `internal-api.js` — shared utilities used by the scripts above.
