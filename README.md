# DevRank OS

DevRank OS is a personal engineering intelligence system for tracking and
accelerating growth as a Software Engineer. It ingests local AI-agent sessions,
GitHub/Linear signals, and market search results, then produces evidence-backed
scores, learning plans, Slack targets, and mentor summaries.

## Workspace

- `apps/web`: Next.js dashboard and API routes.
- `apps/cli`: `devrank` operator CLI.
- `apps/local-agent`: local macOS ingestion daemon.
- `apps/worker`: background job runners.
- `packages/db`: Supabase/Postgres client, migrations, pgvector check, and
  repositories.
- `packages/ai-chat-ingestors`: Codex session parser, redaction, and evidence
  summary generation.
- `packages/scoring`: deterministic SDE-readiness scoring.
- `packages/planner`: daily plan generation and Slack formatting.
- `packages/embeddings`: OpenRouter-compatible embedding generation for
  redacted evidence summaries.
- `packages/github`, `packages/linear`, `packages/slack`, `packages/search`,
  `packages/context`, `packages/hermes`: external integrations.

## Setup

```bash
pnpm install
pnpm devrank env:check --feature database
pnpm devrank db:migrate
pnpm devrank db:check-vector
```

Required database env:

```text
DATABASE_URL=postgresql://...
```

Feature-specific env can be checked with:

```bash
pnpm devrank env:check --feature all
```

Hermes/OpenRouter defaults to `openrouter/auto` and can be made explicit for
production:

```text
OPENROUTER_API_KEY=...
HERMES_MODEL=openrouter/auto
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
HERMES_HTTP_REFERER=https://your-app.example
HERMES_TITLE=DevRank OS
```

Redacted local AI summaries can be embedded into pgvector using OpenRouter's
embedding endpoint:

```text
DEVRANK_STORE_EMBEDDINGS=true
EMBEDDING_MODEL=openai/text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

`--upload-raw-chats` stores the full redacted transcript in Postgres. The local
collector still refuses to run if secret redaction is disabled.

The authenticated `/api/ingest/local-ai` endpoint also accepts redacted summary
imports with `sourceType` set to `cloud_export`, `manual_export`, or
`workspace_export`.

## Main Commands

```bash
pnpm devrank ingest:local-ai --codex-sessions-dir ~/.codex/sessions
pnpm devrank ingest:local-ai --codex-sessions-dir ~/.codex/sessions --store-embeddings
pnpm devrank ingest:local-ai --codex-sessions-dir ~/.codex/sessions --upload-raw-chats
pnpm devrank scores:recompute
pnpm devrank planner:daily
pnpm devrank github:backfill --user vedantmahajan271
pnpm devrank linear:backfill
pnpm devrank slack:test
pnpm devrank market:benchmark
```

## Verification

```bash
pnpm test
pnpm run lint
pnpm run build
```

## Deployment

Use `apps/web` as the Vercel project root for the cloud dashboard and API
routes. The root `vercel.json` mirrors `apps/web/vercel.json` so cron
configuration is visible in root-linked checks, but the deployable Next.js app
lives under `apps/web`.

Architecture and setup notes live in `docs/` and `infra/`.
