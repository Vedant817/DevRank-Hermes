# DevRank OS Web App

This Next.js app is the cloud-facing dashboard and API surface for DevRank OS.
It reads from Supabase Postgres, handles signed GitHub and Linear webhooks,
accepts local-agent ingestion, recomputes score snapshots, runs scheduled plans,
and sends Slack targets.

## Runtime Surfaces

- `/`: database-backed dashboard for scores, evidence sources, daily plans, and
  ingestion runs.
- `/api/ingest/local-ai`: local-agent upload path for redacted session evidence.
- `/api/github/webhook`: GitHub webhook endpoint with signature verification.
- `/api/linear/webhook`: Linear webhook endpoint with signature verification.
- `/api/scores/recompute`: recompute and persist score snapshots.
- `/api/cron/daily-plan`: scheduled daily planning endpoint.
- `/api/cron/weekly-review`: scheduled weekly review endpoint.
- `/api/slack/send`: Slack incoming webhook delivery.
- `/api/context/search` and `/api/context/write`: context provider routes.

## Required Environment

Use one of the supported database variables:

```text
DATABASE_URL=postgresql://...
DEVRANK_DATABASE_URL=postgresql://...
SUPABASE_DATABASE_URL=postgresql://...
```

Feature routes require their own secrets when enabled:

```text
GITHUB_WEBHOOK_SECRET=...
LINEAR_WEBHOOK_SECRET=...
SLACK_WEBHOOK_URL=...
CRON_SECRET=...
OPENROUTER_API_KEY=...
HERMES_MODEL=openrouter/auto
```

## Local Development

```bash
pnpm --filter web dev
```

The app runs on port `3000` by default.

## Validation

```bash
pnpm --filter web check-types
pnpm --filter web lint
pnpm --filter web build
```

Run the root gates before committing a completed feature:

```bash
pnpm test
pnpm run lint
pnpm run build
```
