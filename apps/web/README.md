# DevRank OS Web App

This Next.js app is the cloud-facing dashboard and API surface for DevRank OS.
It reads from Supabase Postgres, handles signed GitHub and Linear webhooks,
accepts local-agent ingestion, recomputes score snapshots, runs scheduled plans,
and sends Slack targets.

## Runtime Surfaces

- `/`: database-backed dashboard for scores, evidence sources, daily plans, and
  ingestion runs.
- `/api/ingest/local-ai`: upload path for redacted local session evidence,
  supported export/manual summary evidence, optional redacted transcripts, and
  optional summary embeddings.
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
DEVRANK_API_TOKEN=...
DEVRANK_DASHBOARD_TOKEN=...
DEVRANK_DASHBOARD_USER=devrank
DEVRANK_OWNER_ID=vedant

# Optional production scoped tokens. When a scoped token is configured, that
# route no longer accepts DEVRANK_API_TOKEN.
DEVRANK_CONTEXT_READ_TOKEN=...
DEVRANK_CONTEXT_WRITE_TOKEN=...
DEVRANK_SCORE_RECOMPUTE_TOKEN=...
DEVRANK_INGEST_TOKEN=...
DEVRANK_SLACK_SEND_TOKEN=...
DEVRANK_LINEAR_BACKFILL_TOKEN=...
DEVRANK_PLANNER_TOKEN=...
DEVRANK_HERMES_REVIEW_TOKEN=...

# Required before /api/ingest/local-ai can read server-local sourcePath values.
DEVRANK_LOCAL_INGEST_ROOTS=/Users/you/.codex/sessions,/Users/you/devrank-imports

GITHUB_WEBHOOK_SECRET=...
LINEAR_WEBHOOK_SECRET=...
SLACK_WEBHOOK_URL=...
CRON_SECRET=...
AI_API_KEY=...
AI_MODEL=openrouter/auto
OPENROUTER_API_KEY=...
HERMES_MODEL=openrouter/auto
EMBEDDING_MODEL=openai/text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
TAVILY_API_KEY=...
```

`EMBEDDING_DIMENSIONS` must stay at `1536` for the current pgvector schema.

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
