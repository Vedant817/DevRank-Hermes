# DevRank OS Architecture

DevRank OS is a hybrid personal engineering intelligence system. The cloud app
keeps dashboards, webhooks, scoring, planning, and Slack delivery available when
the local Mac is off. The local agent owns transcript discovery and keeps raw
chat history local by default.

## Runtime Parts

- `apps/web`: Next.js dashboard and API routes for ingestion, webhooks, scoring,
  cron jobs, context search/write, and Slack send.
- `apps/cli`: operator CLI for environment checks, migrations, vector checks,
  local ingestion, backfills, scoring, planning, Slack tests, and market search.
- `apps/local-agent`: macOS-friendly daemon for Codex session ingestion and
  Supabase persistence.
- `apps/worker`: background job runners for daily planning, weekly review, and
  market benchmarks.

## Package Responsibilities

- `packages/db`: Postgres client, migrations, pgvector verification, and
  repositories for evidence, score snapshots, plans, and ingestion runs.
- `packages/ai-chat-ingestors`: local transcript parsers, redaction, and
  evidence summaries.
- `packages/scoring`: deterministic rubric-based SDE readiness scoring.
- `packages/planner`: daily plan generation, DSA target selection from the
  `dsa_questions` bank (weekday topic ladder + evidence-based difficulty), and
  Slack message formatting.
- `packages/github`: GitHub REST client, backfill helpers, and webhook summaries.
- `packages/gitlab`: dependency-free GitLab REST client and bounded, read-only
  project, commit, and merge-request backfill.
- `packages/linear`: Linear GraphQL backfill and webhook verification helpers.
- `packages/context`: Supabase/Supermemory context provider abstraction.
- `packages/hermes`: mentor summary workflow. Groq is the default reasoning
  provider (when `GROQ_API_KEY` is set) with automatic fallback to an
  OpenRouter-compatible provider on a 429 rate-limit response.
- `packages/search`: live market benchmark search through Tavily.
- `packages/slack`: Slack incoming webhook sender.

## Source of Truth

Supabase Postgres is the canonical store for evidence, scores, plans, sync state,
and audit records. pgvector is enabled for semantic memory tables. Supermemory is
optional external context only and does not replace Supabase.

GitLab backfill persists normalized rows in `gitlab_projects`, `gitlab_commits`,
and `gitlab_merge_requests`. Those rows are mapped to neutral repository evidence
for all/repository scoring; commit messages are not treated as proof of testing,
deployment, backend, or communication quality without stronger evidence.
