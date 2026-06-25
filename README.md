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

Hermes can use provider-neutral AI settings, with the existing OpenRouter
settings still supported for compatibility:

```text
AI_API_KEY=...
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openrouter/auto
AI_HTTP_REFERER=https://your-app.example
AI_TITLE=DevRank OS

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

The current Postgres schema stores embeddings as `memory_embeddings.embedding
vector(1536)`. Keep `EMBEDDING_DIMENSIONS=1536` unless a matching schema
migration is applied first.

Market benchmarking currently uses Tavily:

```text
TAVILY_API_KEY=...
```

`EXA_API_KEY` and `FIRECRAWL_API_KEY` are parsed for future adapters, but the
benchmark fails clearly if they are configured without `TAVILY_API_KEY`.

`--upload-raw-chats` stores the full redacted transcript in Postgres. The local
collector still refuses to run if secret redaction is disabled.

The authenticated `/api/ingest/local-ai` endpoint also accepts redacted summary
imports with `sourceType` set to `cloud_export`, `manual_export`, or
`workspace_export`.

## Main Commands

DevRank OS is a single-user deployment. Set `DEVRANK_OWNER_ID` to a stable
identifier such as `vedant`; API, cron, dashboard, and context access fail
closed when that owner boundary is missing.

```bash
pnpm devrank ingest:local-ai --codex-sessions-dir ~/.codex/sessions
pnpm devrank ingest:local-ai --codex-sessions-dir ~/.codex/sessions --store-embeddings
pnpm devrank ingest:local-ai --codex-sessions-dir ~/.codex/sessions --upload-raw-chats
pnpm devrank scores:recompute
pnpm devrank planner:daily
pnpm devrank github:backfill --user vedantmahajan271 --repo-limit 10 --commit-limit 100
pnpm devrank linear:backfill
pnpm devrank slack:test
pnpm devrank market:benchmark
```

GitHub backfill processes 10 repositories per run, returns a `nextRepoPage`
checkpoint, checks the GitHub core rate limit before fan-out, and imports up to
100 pull requests and 100 recent default-branch commits per repository. Resume
with `--repo-page <nextRepoPage>`. Use `--commit-limit 0` to reduce API usage.

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

Vercel cron schedules are UTC. `30 2 * * *` targets 08:00 IST for the daily
plan on plans with per-minute precision, and `30 3 * * 0` targets 09:00 IST
for the weekly review. On the Hobby plan, Vercel may invoke a daily cron at any
point within the configured UTC hour, so treat the daily plan as a
07:30-08:29 IST delivery window and the weekly review as an 08:30-09:29 IST
Sunday window.

Architecture and setup notes live in `docs/` and `infra/`.
