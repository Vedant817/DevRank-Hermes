# Full Setup

All optional integrations. Skip any section you don't need.

## Core database

```text
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@HOST:5432/postgres
```

Optional Supabase API credentials (needed for dashboard auth and certain API routes):

```text
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=replace_me
SUPABASE_SERVICE_ROLE_KEY=replace_me
```

## Owner & tokens

```text
DEVRANK_OWNER_ID=yourname
DEVRANK_API_TOKEN=<openssl rand -hex 32>
DEVRANK_DASHBOARD_TOKEN=<openssl rand -hex 32>
DEVRANK_DASHBOARD_USER=devrank
CRON_SECRET=<openssl rand -hex 32>
```

Route-specific tokens are optional; when set they override `DEVRANK_API_TOKEN` for individual routes:

```text
DEVRANK_CONTEXT_READ_TOKEN=...
DEVRANK_CONTEXT_WRITE_TOKEN=...
DEVRANK_SCORE_RECOMPUTE_TOKEN=...
DEVRANK_INGEST_TOKEN=...
DEVRANK_SLACK_SEND_TOKEN=...
DEVRANK_LINEAR_BACKFILL_TOKEN=...
DEVRANK_PLANNER_TOKEN=...
DEVRANK_HERMES_REVIEW_TOKEN=...
```

## GitHub

Local backfill with a fine-grained personal access token:

```text
GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_replace_me
```

Production webhook setup (GitHub App):

```text
GITHUB_APP_ID=replace_me
GITHUB_INSTALLATION_ID=replace_me
GITHUB_PRIVATE_KEY_PATH=/absolute/path/to/github-app-private-key.pem
GITHUB_WEBHOOK_SECRET=replace_me
```

## Linear

```text
LINEAR_API_KEY=lin_api_replace_me
LINEAR_WEBHOOK_SECRET=replace_me
```

## Slack

Both a webhook (simple notifications) and bot token (interactive messages with buttons) are supported.

```text
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

For interactive daily plans with Done/Skip buttons, also set:

```text
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C123...
SLACK_SIGNING_SECRET=...
```

See [Slack app setup](slack-app.md) for step-by-step instructions.

## AI providers

Groq (preferred; auto-falls back to OpenRouter on 429):

```text
GROQ_API_KEY=gsk_replace_me
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=openai/gpt-oss-120b
```

OpenRouter (fallback or sole provider):

```text
OPENROUTER_API_KEY=sk-or-v1-replace_me
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

Provider-neutral aliases (override OpenRouter variables when set):

```text
AI_API_KEY=...
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openrouter/auto
AI_HTTP_REFERER=https://your-app.example
AI_TITLE=DevRank OS
```

Legacy Hermes overrides:

```text
HERMES_MODEL=openrouter/auto
HERMES_HTTP_REFERER=https://your-app.example
HERMES_TITLE=DevRank OS
```

## Embeddings

Requires an OpenRouter-compatible endpoint for pgvector storage:

```text
DEVRANK_STORE_EMBEDDINGS=true
EMBEDDING_API_KEY=...                     # falls back to OPENROUTER_API_KEY
EMBEDDING_BASE_URL=https://openrouter.ai/api/v1
EMBEDDING_MODEL=openai/text-embedding-3-small
EMBEDDING_DIMENSIONS=1536                 # must match schema
```

## Supabase (API)

Already needed for the database URL. These extras enable Supabase-specific features:

```text
CONTEXT_PROVIDER=supabase                  # or supermemory, combined
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Exa / Firecrawl (reserved)

Parsed but not yet active. The market benchmark requires `TAVILY_API_KEY`:

```text
TAVILY_API_KEY=tvly-replace_me
EXA_API_KEY=replace_me                      # reserved
FIRECRAWL_API_KEY=fc-replace_me              # reserved
```

## Supermemory (optional external context)

```text
SUPERMEMORY_API_KEY=...
SUPERMEMORY_PROJECT_ID=...
```

## Verify all

```bash
pnpm devrank env:check --feature all
```

## Deploy

Push `apps/web` to Vercel as the project root. Cron schedules:

| Schedule (UTC) | IST target | Purpose |
|----------------|-----------|---------|
| `30 2 * * *` | 08:00 | Daily plan |
| `30 3 * * 0` | 09:00 | Weekly review |

Hobby-plan crons may fire anywhere within the UTC hour, so treat the daily plan as a 07:30–08:29 IST window.
