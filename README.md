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

## Main Commands

```bash
pnpm devrank ingest:local-ai --codex-sessions-dir ~/.codex/sessions
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

Architecture and setup notes live in `docs/` and `infra/`.
