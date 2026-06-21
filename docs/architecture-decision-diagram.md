# DevRank OS Architecture Decision Diagram

Source: `Task.md` section 1, "Architecture Decisions".

```mermaid
flowchart TB
  subgraph local["Local Mac"]
    chat_sources["Local AI chat sources<br/>Claude Code, Codex, OpenCode, Antigravity<br/>transcripts, sessions, logs, artifacts"]
    local_daemon["Local Mac daemon<br/>watches files, parses sessions, redacts secrets"]
    hermes["Hermes orchestrator<br/>summaries, skills, plans, PR review, mentor logic"]
    raw_local[("Raw transcripts<br/>local by default")]

    chat_sources --> local_daemon
    local_daemon --> raw_local
    local_daemon --> hermes
  end

  subgraph cloud["Vercel cloud app"]
    dashboard["Next.js dashboard<br/>skill rank, AI learning, GitHub portfolio, PR review, plans"]
    api_routes["API routes<br/>github webhook, cron jobs, slack send,<br/>local AI ingest, score recompute"]
    cron["Vercel Cron<br/>daily plan and weekly review<br/>scheduled in UTC for IST targets"]

    dashboard --> api_routes
    cron --> api_routes
  end

  subgraph data["Supabase"]
    postgres[("Postgres<br/>single source of truth")]
    pgvector[("pgvector embeddings<br/>AI chats, repo summaries, skill evidence")]
    analytics[("Analytics tables<br/>scores, snapshots, daily targets, dashboard metrics")]

    postgres --- pgvector
    postgres --- analytics
  end

  subgraph github["GitHub"]
    github_app["GitHub App<br/>minimal repo, PR, issue, checks permissions"]
    github_events["GitHub webhooks and REST API<br/>push, PR, review, issue, release, workflow events"]

    github_app --> github_events
  end

  subgraph notify["Notifications and market context"]
    slack["Slack webhook<br/>daily SDE switch targets"]
    search["Search provider<br/>current market and job-skill benchmarking"]
  end

  local_daemon -->|redacted summaries and metadata| api_routes
  hermes -->|weekly mentor output and skill extraction| api_routes
  github_events -->|signed webhook events and backfill data| api_routes
  api_routes -->|store and query relational data| postgres
  api_routes -->|store and search embeddings| pgvector
  api_routes -->|write score snapshots and targets| analytics
  api_routes -->|send daily target| slack
  api_routes -->|request current skill demand| search
  api_routes -->|invoke orchestration when needed| hermes
  dashboard -->|read dashboards and evidence| postgres
  dashboard -->|read scores and trends| analytics
```

## Operating Decision

- Supabase Postgres with pgvector is the database for local development and hosted environments.
- Vercel keeps GitHub tracking, dashboards, score snapshots, and Slack daily targets running when the Mac is off.
- The Local Mac daemon owns local transcript discovery and raw transcript custody.
- Hermes is the reasoning and orchestration layer, not the database.
- GitHub App webhooks handle event-driven repo and PR updates; REST backfill fills historical data.
- Vercel cron schedules stay in UTC and must be mapped carefully to India time.
