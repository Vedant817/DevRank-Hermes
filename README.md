# DevRank OS

DevRank OS is a personal engineering intelligence system for tracking and
accelerating growth as a Software Engineer. It ingests local AI-agent sessions,
GitHub/GitLab/Linear signals, and market search results, then produces evidence-backed
scores, learning plans, Slack targets, and mentor summaries.

## Workspace

- `apps/web`: Next.js dashboard and API routes.
- `apps/cli`: `devrank` operator CLI.
- `apps/local-agent`: local macOS ingestion daemon.
- `apps/worker`: background job runners.
- `packages/db`: Supabase/Postgres client, migrations, pgvector check.
- `packages/ai-chat-ingestors`: Codex session parser, redaction, evidence summaries.
- `packages/scoring`: deterministic SDE-readiness scoring.
- `packages/planner`: daily plan generation and Slack formatting.
- `packages/embeddings`: OpenRouter-compatible embedding generation.
- `packages/github`, `packages/gitlab`, `packages/linear`, `packages/slack`, `packages/search`,
  `packages/context`, `packages/hermes`: external integrations.

## Quickstart

```bash
nvm use
corepack enable
pnpm install
```

Set `DATABASE_URL` and `DEVRANK_OWNER_ID` in `.env`, then:

```bash
pnpm devrank env:check --feature database
pnpm devrank db:migrate
pnpm devrank db:check-vector
```

For a zero-dB trial:

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_...
pnpm devrank trial:score --user <github-username>
```

See [docs/setup/quickstart.md](docs/setup/quickstart.md) for details.

## Verification

```bash
pnpm test
pnpm run lint
pnpm run build
```

## Architecture

```
┌─────────────────┐    ┌──────────────────────┐    ┌──────────────┐
│  Local Mac       │───▶│  Vercel Cloud App    │───▶│  Supabase    │
│  (daemon, Hermes)│    │  (Next.js, API, cron)│    │  Postgres    │
└─────────────────┘    └──────────────────────┘    │  + pgvector  │
                           │                       └──────────────┘
                           ▼
                  Slack / GitHub / GitLab / Linear / Search
```

See [docs/architecture.md](docs/architecture.md) and
[docs/architecture-decision-diagram.md](docs/architecture-decision-diagram.md).

## Setup docs

- [Quickstart](docs/setup/quickstart.md)
- [Full setup with all integrations](docs/setup/full-setup.md)
- [Slack app setup](docs/setup/slack-app.md)
- [Trial mode (no database)](docs/runbooks/trial-mode.md)
- [Mark a task done](docs/runbooks/mark-task-done.md)

## Deployment

Use `apps/web` as the Vercel project root. Cron schedules are UTC:

| Schedule (UTC) | IST target | Purpose |
|----------------|-----------|---------|
| `30 2 * * *` | 08:00 | Daily plan |
| `30 3 * * 0` | 09:00 | Weekly review |
