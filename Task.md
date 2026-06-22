# DevRank OS Project Checklist

Use this file as the step-by-step checkpoint list from project start to project end. Tick each box only after the item is actually implemented, verified, and documented where needed.

## 0. Product Definition

- [x] Confirm final system name: **DevRank OS**.
- [x] Confirm tagline: "A personal engineering intelligence system that learns from my AI-agent work, GitHub history, PRs, projects, DSA progress, and market trends to guide my growth as a Software Engineer."
- [x] Define the main career positioning: **Software Engineer with AI-native engineering workflow**.
- [x] Confirm the system is not only "Hermes running on Mac", but a hybrid personal engineering intelligence system.
- [x] Confirm core system responsibilities:
  - [x] Local Mac agent reads local AI-agent chats and repos.
  - [x] Cloud/Vercel app keeps dashboards alive when the Mac is off.
  - [x] Supabase Postgres is the single source of truth.
  - [x] Hermes acts as the agent/orchestrator layer.
  - [x] GitHub App and webhooks support future repo/PR tracking.
  - [x] Linear integration tracks project-wise execution, issue health, and planning evidence.
  - [x] Slack bot/webhook sends daily targets.
  - [x] Search provider supports market/job-skill benchmarking.
  - [x] Optional external memory provider can supply cross-agent context without replacing Supabase.

## 1. Architecture Decisions

- [ ] Implement the high-level architecture with these major parts:
  - [x] Vercel App.
  - [x] Next.js Dashboard.
  - [x] API Routes.
  - [x] Vercel Cron.
  - [x] Supabase Postgres DB.
  - [x] pgvector.
  - [x] Analytics tables.
  - [x] Local Mac Hermes/Daemon.
  - [ ] GitHub App.
  - [x] GitHub Webhooks/API.
  - [x] Linear API/Webhooks.
  - [x] Slack Notifier.
  - [ ] Local AI Chat Sources.
  - [x] Optional Supermemory context provider.
- [ ] Support local AI chat sources:
  - [ ] Claude Code.
  - [x] Codex CLI / Codex Desktop.
  - [ ] OpenCode.
  - [ ] Antigravity.
  - [x] Local transcripts.
  - [x] Sessions.
  - [x] Logs.
  - [ ] Artifacts.
- [ ] Support Codex Cloud/Web history only through approved and exportable sources:
  - [x] Prefer local Codex CLI/Desktop sessions under `~/.codex/sessions/` for reliable ingestion.
  - [ ] Use Codex workspace analytics, compliance export, or manual export only if available to the account.
  - [x] Do not depend on private UI scraping, browser session cookies, or unsupported cloud-history endpoints.
- [ ] Make GitHub tracking, dashboard, score snapshots, and Slack daily target cloud-capable so they work when the Mac is off.
- [x] Schedule daily planning carefully for India time because Vercel cron runs in UTC.
- [ ] Account for Vercel Hobby cron limits if using the Hobby plan.

## 2. Database Choice

- [x] Use **Postgres + pgvector**, not Mongo.
- [x] Use **Supabase Postgres + pgvector** as the database provider.
- [x] Use Supabase for both development and hosted environments unless a later requirement forces a separate local database.
- [ ] Ensure the database supports relational joins between:
  - [ ] Users.
  - [ ] Repos.
  - [ ] Commits.
  - [ ] PRs.
  - [ ] Reviews.
  - [ ] Linear workspaces.
  - [ ] Linear teams.
  - [ ] Linear projects.
  - [ ] Linear issues.
  - [ ] Linear cycles.
  - [ ] Linear project updates.
  - [ ] Skills.
  - [ ] Plans.
  - [ ] Rankings.
  - [ ] Daily targets.
  - [ ] Dashboard metrics.
- [ ] Ensure pgvector supports semantic memory search over:
  - [ ] AI chats.
  - [ ] Repo summaries.
  - [ ] Skill evidence.
  - [ ] Redacted external context summaries.

## 3. Monorepo Setup

- [x] Install base tools on macOS:
  - [x] `brew install node pnpm git`
- [x] Create the project folder if starting from scratch:
  - [x] `mkdir devrank-os`
  - [x] `cd devrank-os`
- [x] Initialize Turborepo:
  - [x] `pnpm dlx create-turbo@latest .`
- [x] Add root dependencies:
  - [x] `pnpm add -w zod dotenv tsx pino`
  - [x] `pnpm add -w drizzle-orm postgres`
  - [x] `pnpm add -w @octokit/app @octokit/webhooks @octokit/rest`
  - [x] `pnpm add -w openai`
  - [x] `pnpm add -w chokidar`
  - [x] `pnpm add -w @slack/webhook`
- [ ] Add future integration dependencies when implementation starts:
  - [ ] `pnpm add -w @linear/sdk`
  - [ ] Add Supermemory SDK/tooling only if the optional external context provider is enabled.
- [x] Create app folders:
  - [x] `apps/web` for the Next.js dashboard.
  - [x] `apps/local-agent` for the Mac daemon.
  - [x] `apps/worker` for background processors.
  - [x] `apps/cli` for the `devrank` CLI.
- [x] Create package folders:
  - [x] `packages/db`.
  - [x] `packages/github`.
  - [x] `packages/ai-chat-ingestors`.
  - [x] `packages/scoring`.
  - [x] `packages/planner`.
  - [x] `packages/slack`.
  - [x] `packages/search`.
  - [x] `packages/hermes`.
  - [x] `packages/shared`.
  - [x] `packages/linear`.
  - [x] `packages/context`.
- [x] Create infrastructure folders/files:
  - [x] `infra/vercel.json`.
  - [x] `infra/github-app.md`.
  - [x] `infra/migrations/`.
  - [x] `infra/supabase.md`.
- [x] Create documentation files:
  - [x] `docs/architecture.md`.
  - [x] `docs/scoring-rubric.md`.
  - [x] `docs/resume-bullets.md`.

## 4. Supabase Database Setup

- [x] Create a Supabase project for DevRank OS.
- [x] Create or confirm the Supabase Postgres database.
- [x] Enable the `vector` extension for pgvector in Supabase.
- [ ] Store the Supabase database connection string securely.
- [ ] Store the Supabase project URL securely.
- [ ] Store the Supabase anon key securely if the web app needs browser-safe Supabase access.
- [ ] Store the Supabase service role key securely for server-only jobs if needed.
- [ ] Add Supabase environment variables to local development.
- [ ] Add Supabase environment variables to Vercel.
- [ ] Confirm local code can connect to Supabase Postgres.
- [ ] Confirm Vercel can connect to Supabase Postgres.
- [ ] Confirm pgvector queries work through Supabase.
- [x] Document Supabase setup in `infra/supabase.md`.

## 5. Database Schema

- [ ] Choose schema tooling:
  - [ ] Prefer Drizzle for type-safe SQL and less ORM magic.
  - [ ] Use Prisma only if a specific need appears.
- [ ] Create core tables:
  - [x] `users`
  - [x] `ai_agents`
  - [x] `ai_sessions`
  - [x] `ai_messages`
  - [ ] `ai_tool_calls`
  - [x] `ai_session_summaries`
  - [x] `memory_items`
  - [ ] `skills`
  - [ ] `skill_evidence`
  - [x] `github_repos`
  - [ ] `github_commits`
  - [x] `github_pull_requests`
  - [ ] `github_pr_files`
  - [ ] `github_pr_reviews`
  - [ ] `github_issues`
  - [ ] `github_workflow_runs`
  - [ ] `github_code_scanning_alerts`
  - [x] `linear_workspaces`
  - [x] `linear_teams`
  - [x] `linear_projects`
  - [x] `linear_issues`
  - [ ] `linear_cycles`
  - [ ] `linear_project_updates`
  - [ ] `linear_webhook_events`
  - [ ] `codex_cloud_imports`
  - [ ] `external_memory_providers`
  - [ ] `external_memory_links`
  - [x] `daily_plans`
  - [ ] `daily_tasks`
  - [ ] `dsa_questions`
  - [ ] `weekly_plans`
  - [ ] `learning_goals`
  - [x] `scores`
  - [x] `score_snapshots`
  - [ ] `portfolio_items`
  - [ ] `content_drafts`
  - [x] `slack_notifications`
  - [x] `ingestion_runs`
- [ ] Create vector tables:
  - [x] `memory_embeddings`
  - [ ] `repo_summary_embeddings`
  - [ ] `chat_summary_embeddings`
  - [ ] `skill_evidence_embeddings`
- [ ] Implement the rule: summarize first, redact second, embed third.
- [ ] Do not embed everything raw.
- [x] Add migrations.
- [ ] Run migrations locally.
- [ ] Verify all indexes and foreign keys.

## 6. Local AI Chat Collector

- [x] Build the local collector as adapter-based, not hardcoded.
- [x] Add command:
  - [x] `devrank ingest:local-ai`
- [ ] Implement adapters for:
  - [x] Claude Code.
  - [x] Codex CLI / Codex Desktop.
  - [ ] Codex Cloud/Web history import when a supported export or API source exists.
  - [x] OpenCode.
  - [x] Antigravity.
- [x] Support known Codex sessions under `~/.codex/sessions/`.
- [ ] Treat Codex Cloud/Web history as optional imported evidence:
  - [ ] Accept only supported exports, workspace analytics/compliance exports, or manually provided task summaries.
  - [ ] Record source type as `local_session`, `cloud_export`, `manual_export`, or `workspace_export`.
  - [ ] Store cloud-history raw content only if explicit raw storage is enabled.
  - [ ] Store redacted cloud-history summaries in Supabase before embedding.
  - [ ] Preserve task URL, task ID, repository, branch, PR link, and timestamp when available.
- [x] Support known OpenCode session data under `~/.local/share/opencode/`.
- [x] Support Claude project/config/memory/settings/skills data under project directories and `~/.claude`.
- [x] Verify exact Claude conversation files on the local machine instead of assuming the community-reported `~/.claude/projects/` layout forever.
- [x] Implement Antigravity discovery instead of assuming one permanent path.
- [x] Check possible Antigravity folders:
  - [x] `~/.gemini/antigravity`
  - [x] `~/Library/Application Support/Antigravity`
- [ ] Extract from each session:
  - [x] Prompt.
  - [x] Agent response.
  - [x] Tool calls.
  - [x] Files edited.
  - [x] Commands run.
  - [ ] Errors faced.
  - [ ] How the issue was solved.
  - [x] Project/repo context.
  - [x] Skill tags.
  - [x] Timestamp.
  - [x] Agent name.
  - [ ] Confidence score.
- [ ] Generate derived learning output:
  - [ ] Learning signals.
  - [ ] Skill evidence.
  - [ ] Weaknesses.
  - [ ] Repeated mistakes.
  - [ ] Strong patterns.
  - [x] Summaries.
  - [ ] Embeddings.
- [x] Redact secrets before sending anything to OpenRouter, Hermes, search, or cloud APIs.
- [ ] Redact:
  - [x] API keys.
  - [x] `.env` values.
  - [x] Company tokens.
  - [x] Database URLs.
  - [x] Personal emails.
  - [ ] Client-sensitive code.
  - [ ] Private Jira/customer data.
- [x] Store raw transcript locally only unless explicit cloud raw storage is enabled.
- [x] Add ingestion run tracking.
- [x] Add ingestion error handling.
- [x] Add tests for each parser.
- [x] Add tests for redaction.

## 7. Local Mac Daemon

- [x] Build the local daemon in `apps/local-agent`.
- [x] Add command:
  - [x] `pnpm devrank local-daemon`
- [x] Run the daemon using macOS `launchd`.
- [x] Watch known AI-agent folders.
- [x] Detect new transcript files.
- [x] Detect changed transcript files.
- [x] Parse messages.
- [x] Redact secrets.
- [x] Summarize sessions.
- [x] Push summary and metadata to Supabase Postgres.
- [x] Keep raw transcripts local by default.
- [ ] Trigger Hermes skill extraction weekly.
- [x] Create local config with watchers:
  - [x] Claude watcher for `~/.claude`.
  - [x] Codex watcher for `~/.codex/sessions`.
  - [x] OpenCode watcher for `~/.local/share/opencode`.
  - [x] Antigravity watcher for `~/.gemini/antigravity`.
  - [x] Antigravity watcher for `~/Library/Application Support/Antigravity`.
- [x] Create local config with privacy settings:
  - [x] `uploadRawChats=false`.
  - [x] `redactSecrets=true`.
  - [x] `storeEmbeddings=true`.
- [ ] Verify daemon starts after login.
- [x] Verify daemon handles missing folders without crashing.
- [ ] Verify daemon resumes after restart.

## 8. Hermes Orchestrator

- [ ] Install Hermes:
  - [ ] `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash`
  - [ ] `source ~/.zshrc`
  - [ ] `hermes setup`
  - [ ] `hermes model`
  - [ ] `hermes doctor`
- [ ] Configure model provider:
  - [ ] Use `hermes model` for interactive setup.
  - [x] Or set `OPENROUTER_API_KEY`.
  - [ ] Or run `hermes chat --provider openrouter --model openrouter/auto`.
- [x] Use free OpenRouter models only for early testing, not heavy production ranking.
- [x] Use Hermes as the reasoning/orchestration layer, not the database.
- [ ] Implement Hermes workflows for:
  - [ ] Summarizing local AI-agent chats.
  - [ ] Creating reusable skills.
  - [ ] Calling repo-analysis tools.
  - [x] Creating weekly improvement plans.
  - [ ] Reviewing PR quality.
  - [ ] Generating resume updates.
  - [ ] Generating LinkedIn updates.
  - [ ] Generating X/Twitter updates.
  - [ ] Asking web/search tools for current market skill demand.
  - [ ] Sending Slack messages through the app.
  - [ ] Retrieving optional external context before mentor, scoring, and planning workflows.
  - [ ] Writing approved redacted memories to the external memory provider when enabled.
- [ ] Create Hermes skills:
  - [ ] `skill-github-pr-reviewer`
  - [ ] `skill-ai-chat-summarizer`
  - [ ] `skill-sde-readiness-scorer`
  - [ ] `skill-daily-plan-generator`
  - [ ] `skill-dsa-coach`
  - [ ] `skill-resume-bullet-generator`
  - [ ] `skill-linkedin-x-content-generator`
  - [ ] `skill-market-skill-benchmark`
  - [ ] `skill-repo-portfolio-auditor`
  - [ ] `skill-sde-growth-mentor`
- [ ] Create the DevRank OS mentor prompt.
- [ ] Ensure the mentor prompt extracts:
  - [ ] New skills demonstrated.
  - [ ] Weaknesses repeated.
  - [ ] Evidence from repos/PRs.
  - [ ] SDE-readiness score changes.
  - [ ] Daily learning plan.
  - [ ] Resume/LinkedIn-worthy proof.
- [x] Ensure the mentor prompt requires measurable evidence over generic advice.
- [x] Ensure the mentor prompt never stores secrets, tokens, client data, or private company details.

## 9. GitHub Portfolio Intelligence

- [ ] Create a GitHub App instead of relying only on a personal token.
- [ ] Configure clean GitHub App permissions.
- [ ] Enable webhooks.
- [ ] Track new repo installation events.
- [ ] Receive PR events.
- [ ] Configure minimal permissions for private repos:
  - [ ] Repository metadata: read.
  - [ ] Contents: read.
  - [ ] Pull requests: read.
  - [ ] Issues: read.
  - [ ] Checks/actions: read.
  - [ ] Code scanning alerts: read later if needed.
  - [ ] Webhooks: enabled.
- [ ] Track GitHub events:
  - [ ] `repository.created`
  - [ ] `push`
  - [ ] `pull_request.opened`
  - [ ] `pull_request.synchronize`
  - [ ] `pull_request.closed`
  - [ ] `pull_request_review.submitted`
  - [ ] `pull_request_review_comment.created`
  - [ ] `issues.opened`
  - [ ] `release.published`
  - [ ] `workflow_run.completed`
- [x] Add GitHub backfill command:
  - [x] `devrank github:backfill --user vedantmahajan271`
- [ ] Backfill:
  - [x] Repositories.
  - [x] Languages.
  - [ ] Commits.
  - [x] PRs.
  - [ ] Changed files.
  - [ ] Review comments.
  - [ ] Merge time.
  - [ ] Issue activity.
  - [ ] README quality.
  - [ ] Test coverage signals.
  - [ ] CI status.
  - [ ] Security/code scanning alerts.
  - [ ] Project complexity.
- [ ] Use GitHub REST APIs for:
  - [x] Listing pull requests.
  - [ ] Viewing pull requests.
  - [ ] Editing pull requests.
  - [ ] Creating pull requests if needed.
  - [ ] Merging pull requests if needed.
  - [ ] Listing PR reviews chronologically.
- [ ] Add GitHub CodeQL/code scanning integration later.
- [ ] Support retrieving code scanning alerts.
- [ ] Support updating code scanning alerts.
- [ ] Support automated reports from code scanning alerts.

## 10. GitHub PR Analysis Pipeline

- [x] Add endpoint `/api/github/webhook`.
- [x] Verify webhook signatures.
- [ ] Store PR metadata.
- [ ] Fetch changed files.
- [ ] Fetch commits.
- [ ] Fetch reviews.
- [ ] Fetch comments.
- [ ] Run static analysis summary.
- [ ] Classify PR type:
  - [ ] Feature.
  - [ ] Bug.
  - [ ] Refactor.
  - [ ] Test.
  - [ ] Docs.
- [ ] Classify PR complexity.
- [ ] Classify PR risk.
- [ ] Classify PR test quality.
- [ ] Classify PR design quality.
- [ ] Update PR dashboard.
- [ ] Update skill evidence.
- [ ] Recompute SDE readiness score.
- [ ] Handle `pull_request.opened`.
- [ ] Handle `pull_request.synchronize`.
- [ ] Handle `pull_request.closed`.
- [ ] Handle `pull_request_review.submitted`.
- [ ] Handle `pull_request_review_comment.created`.
- [ ] Handle `push`.

## 11. Linear Project Intelligence

- [ ] Add Linear as a project-wise planning and execution source.
- [x] Choose Linear integration path:
  - [x] Use Linear GraphQL API or TypeScript SDK for production sync.
  - [x] Use Linear webhooks for near-realtime project and issue changes.
  - [x] Use Linear MCP only for local Codex context, not as the production sync layer.
- [ ] Store Linear credentials securely:
  - [x] `LINEAR_API_KEY` for personal/local development if using a personal script.
  - [ ] OAuth credentials if building a reusable Linear app.
  - [x] Webhook secret or verification settings according to Linear webhook setup.
- [x] Add endpoint `/api/linear/webhook`.
- [x] Add Linear backfill command:
  - [x] `devrank linear:backfill`.
- [ ] Sync Linear data:
  - [ ] Workspaces.
  - [ ] Teams.
  - [x] Projects.
  - [x] Issues.
  - [ ] Cycles.
  - [ ] Project updates.
  - [ ] Comments if needed for planning evidence.
  - [ ] Labels and priorities.
  - [ ] Assignees.
  - [ ] Status/workflow states.
- [ ] Build project-wise Linear dashboard data:
  - [ ] Open issues per project.
  - [ ] Done issues per project.
  - [ ] Blocked issues.
  - [ ] Stale issues.
  - [ ] High-priority issues.
  - [ ] Issues without owners.
  - [ ] Issues without GitHub PR links.
  - [ ] Project progress by status.
  - [ ] Cycle progress.
  - [ ] Recent project updates.
- [ ] Link Linear work to engineering evidence:
  - [ ] Connect Linear issues to GitHub branches, commits, and PRs where possible.
  - [ ] Connect Linear project work to daily and weekly plans.
  - [ ] Connect completed issues to skill evidence and resume-worthy proof.
  - [ ] Keep GitHub PR evidence as the stronger engineering proof when both exist.
- [ ] Use Linear data in planning:
  - [ ] Pull highest-priority open project tasks into daily plans.
  - [ ] Detect stalled project work.
  - [ ] Recommend one small project task for non-zero progress days.
  - [ ] Avoid creating daily plans that ignore urgent Linear project work.
- [ ] Verify Linear sync:
  - [ ] Backfill imports projects and issues.
  - [ ] Webhook updates project dashboard after issue changes.
  - [ ] Project-wise dashboard can filter by workspace, team, project, status, and priority.
  - [ ] Linear failures are visible and do not silently break planning.

## 12. Vercel and Cloud Behavior

- [x] Build Vercel app routes:
  - [x] `/api/github/webhook`
  - [x] `/api/linear/webhook`
  - [x] `/api/linear/backfill`
  - [x] `/api/cron/daily-plan`
  - [x] `/api/cron/weekly-review`
  - [x] `/api/slack/send`
  - [x] `/api/ingest/local-ai`
  - [x] `/api/scores/recompute`
  - [x] `/api/context/search`
  - [x] `/api/context/write`
- [x] Create `vercel.json`.
- [x] Add daily plan cron:
  - [x] Path: `/api/cron/daily-plan`.
  - [x] Schedule: `30 2 * * *`.
  - [x] Confirm `02:30 UTC = 08:00 IST`.
- [x] Add weekly review cron:
  - [x] Path: `/api/cron/weekly-review`.
  - [x] Schedule: `30 3 * * 0`.
- [x] Keep cron schedules in UTC.
- [x] Use GitHub webhooks for event-driven PR updates.
- [x] Use Linear webhooks for event-driven project and issue updates.
- [ ] Use GitHub Actions for heavy repo scans if needed.
- [ ] Consider a cheap VPS for long-running Hermes work if Vercel is not enough.
- [ ] Consider Supabase scheduled jobs if needed.
- [ ] Consider Trigger.dev, Inngest, or QStash-style queue if needed.
- [ ] Deploy the Next.js app to Vercel.
- [ ] Connect Supabase Postgres environment variables.
- [ ] Connect Linear environment variables if Linear sync is enabled.
- [ ] Connect Supermemory environment variables only if the optional external context provider is enabled.
- [ ] Confirm cloud app can recompute scores without the Mac running.
- [ ] Confirm cloud app can send Slack daily target without the Mac running.

## 13. Slack Daily Target

- [ ] Create Slack incoming webhook.
- [ ] Store Slack webhook URL securely.
- [x] Add Slack package integration.
- [x] Build `/api/slack/send`.
- [ ] Generate daily Slack message with:
  - [ ] Greeting.
  - [ ] Today's SDE Switch Plan.
  - [ ] DSA tasks.
  - [ ] Backend task.
  - [ ] System design topic.
  - [ ] GitHub/portfolio task.
  - [ ] AI-agent skill task.
  - [ ] Target time.
  - [ ] Minimum non-zero day.
- [ ] Include sample DSA targets:
  - [ ] Arrays/Hashing - Medium.
  - [ ] Binary Search - Medium.
- [ ] Include backend target:
  - [ ] Build one endpoint with validation, pagination, and tests.
- [ ] Include system design target:
  - [ ] Revise rate limiter + Redis token bucket.
- [ ] Include GitHub target:
  - [ ] Improve README of one repo with architecture diagram and setup steps.
- [ ] Include Linear target when Linear is enabled:
  - [ ] Finish or unblock one high-priority Linear issue.
- [ ] Include AI-agent skill target:
  - [ ] Use Hermes/Codex/Claude to generate tests.
  - [ ] Manually verify and document what changed.
- [ ] Test Slack delivery manually.
- [ ] Test Slack delivery through cron.

## 14. Dashboards

- [x] Build dashboard shell in `apps/web`.
- [ ] Create Dashboard A: Skill Rank Dashboard.
- [ ] Skill Rank Dashboard shows:
  - [ ] Overall SDE readiness score.
  - [ ] Backend score.
  - [ ] Frontend score.
  - [ ] System design score.
  - [ ] DSA score.
  - [ ] Testing/QA automation score.
  - [ ] DevOps score.
  - [ ] AI-agent/orchestration score.
  - [ ] GitHub portfolio score.
  - [ ] Communication/content score.
- [ ] Create Dashboard B: AI Agent Learning Dashboard.
- [ ] AI Agent Learning Dashboard shows:
  - [ ] Which agents were used most.
  - [ ] What kind of tasks agents are asked to do.
  - [ ] Which sessions came from local history, cloud exports, or manual imports.
  - [ ] Where there is too much AI dependency.
  - [ ] Where improvement happened.
  - [ ] Repeated bugs/errors.
  - [ ] Best prompts.
  - [ ] Reusable skills created.
- [ ] Create Dashboard C: GitHub Portfolio Dashboard.
- [ ] GitHub Portfolio Dashboard shows:
  - [ ] Best repos.
  - [ ] Weak repos.
  - [ ] Repos needing README.
  - [ ] Repos needing tests.
  - [ ] Repos needing deployment.
  - [ ] Repos needing architecture diagram.
  - [ ] Tech stack distribution.
  - [ ] Commit consistency.
  - [ ] PR quality.
  - [ ] Project complexity.
- [ ] Create Dashboard D: PR Review Dashboard.
- [ ] PR Review Dashboard shows:
  - [ ] Summary.
  - [ ] Files changed.
  - [ ] Risk level.
  - [ ] Test quality.
  - [ ] Review comments.
  - [ ] Merge status.
  - [ ] Architecture impact.
  - [ ] Code smell score.
  - [ ] Security issues.
  - [ ] Learning extracted.
  - [ ] Resume-worthy impact.
- [ ] Create Dashboard E: Daily/Weekly Learning Plan Dashboard.
- [ ] Daily/Weekly Learning Plan Dashboard shows:
  - [ ] Today's DSA questions.
  - [ ] Today's backend task.
  - [ ] Today's system design topic.
  - [ ] Today's GitHub/portfolio task.
  - [ ] Today's AI-agent/orchestration task.
  - [ ] Weekly goal.
  - [ ] Completion status.
  - [ ] Streak.
- [ ] Create Dashboard F: Career/Content Dashboard.
- [ ] Career/Content Dashboard generates:
  - [ ] Resume bullets.
  - [ ] LinkedIn post ideas.
  - [ ] X/Twitter build-in-public posts.
  - [ ] Portfolio project descriptions.
  - [ ] Interview talking points.
  - [ ] Weekly progress summary.
- [ ] Create Dashboard G: Linear Project Dashboard.
- [ ] Linear Project Dashboard shows:
  - [ ] Projects by workspace/team.
  - [ ] Open, done, blocked, and stale issues per project.
  - [ ] Priority distribution.
  - [ ] Cycle progress.
  - [ ] Issues linked to GitHub PRs.
  - [ ] Issues missing GitHub proof.
  - [ ] Project work that should become today's plan.
  - [ ] Resume-worthy completed project evidence.

## 15. Scoring System

- [x] Make scoring transparent and rubric-based.
- [x] Avoid random AI-vibe scoring.
- [x] Implement Overall SDE readiness formula:
  - [x] 20% DSA.
  - [x] 20% Backend/API/System Design.
  - [x] 15% GitHub Portfolio Quality.
  - [x] 15% Code Quality + Testing.
  - [x] 10% DevOps/Cloud.
  - [x] 10% AI Agent/Automation Skills.
  - [x] 10% Communication + Public Proof.
- [ ] Implement PR quality score formula:
  - [ ] 25% clarity of change.
  - [ ] 20% test coverage.
  - [ ] 15% code structure.
  - [ ] 15% review response quality.
  - [ ] 10% CI health.
  - [ ] 10% security/static analysis.
  - [ ] 5% documentation.
- [ ] Implement AI-agent maturity score formula:
  - [ ] 25% ability to break tasks into plans.
  - [ ] 20% prompt quality.
  - [ ] 20% validation/testing after AI output.
  - [ ] 15% tool/orchestrator setup.
  - [ ] 10% reusable skills created.
  - [ ] 10% reduced repeated mistakes.
- [ ] Implement Repo Portfolio Score formula:
  - [ ] 20% real-world problem clarity.
  - [ ] 15% architecture quality.
  - [ ] 15% code quality.
  - [ ] 15% tests/CI.
  - [ ] 10% deployment/demo.
  - [ ] 10% README/docs.
  - [ ] 10% technical depth.
  - [ ] 5% uniqueness.
- [x] Store score snapshots over time.
- [x] Explain every score with evidence.
- [ ] Show score changes in dashboards.

## 16. Portfolio Generation Logic

- [ ] Score every repo with Repo Portfolio Score.
- [ ] Generate repo status labels:
  - [ ] This repo is resume-ready.
  - [ ] This repo needs README.
  - [ ] This repo needs tests.
  - [ ] This repo needs deployed demo.
  - [ ] This repo is too tutorial-like.
  - [ ] This repo has strong backend depth.
  - [ ] This repo does not prove SDE skill yet.
- [ ] Link repo scores to dashboard recommendations.
- [ ] Link repo improvements to daily/weekly learning plans.
- [ ] Link Linear completed issues to portfolio evidence only when they map to real code, PRs, docs, or deployed work.
- [ ] Link strong repos to resume and LinkedIn content generation.

## 17. Daily and Weekly Learning Planner

- [ ] Track strengths into SDE advantage:
  - [ ] Testing skill -> quality-focused SDE.
  - [ ] Bug reporting -> debugging + edge-case thinking.
  - [ ] QA automation -> CI/CD + test infrastructure.
  - [ ] Agent workflow -> AI-native developer productivity.
- [x] Generate daily plan with:
  - [x] DSA: 2 questions.
  - [x] Backend/SDE: 60-90 min.
  - [ ] System Design: 30 min.
  - [x] GitHub project: 45-60 min.
  - [x] Linear project task if Linear has urgent or blocked work.
  - [x] AI-agent workflow: 20 min.
  - [ ] Public proof: 1 small note/post every 2-3 days.
- [ ] Generate weekly plan:
  - [ ] Monday: Arrays/Hashing + backend API.
  - [ ] Tuesday: Binary Search/Two Pointers + database design.
  - [ ] Wednesday: Stack/Queue/Linked List + testing/CI.
  - [ ] Thursday: Trees/Graphs + system design.
  - [ ] Friday: DP basics + project feature.
  - [ ] Saturday: Build day, one solid PR.
  - [ ] Sunday: Review dashboard, update resume/LinkedIn/X, plan next week.
- [ ] Track completion status.
- [ ] Track streak.
- [ ] Recompute future plans based on weak areas, Linear project priority, and market benchmark.

## 18. Search Access and Market Benchmarking

- [x] Add a Market Skill Benchmark Agent.
- [x] Do not let Hermes guess market demand from memory.
- [x] Configure Hermes Tool Gateway/Nous Portal or bring a search provider.
- [x] Run weekly searches for:
  - [x] SDE fresher/backend roles India.
  - [x] Java Spring Boot backend roles.
  - [x] Node.js backend roles.
  - [x] AWS/Kubernetes/Kafka jobs.
  - [x] AI agent engineer roles.
  - [ ] QA to SDE transition keywords.
  - [ ] DSA interview trends.
  - [ ] System design expectations for 0-2 YOE.
- [ ] Generate market benchmark output:
  - [x] Skills appearing repeatedly.
  - [ ] Missing skills in the profile.
  - [ ] Projects that can prove those skills.
  - [ ] Resume keyword gap.
  - [ ] Weekly learning priority.
- [ ] Store benchmark snapshots.
- [ ] Show benchmark changes over time.

## 19. External Context and Supermemory

- [x] Treat Supermemory as an optional external context provider, not the source of truth.
- [x] Keep Supabase Postgres + pgvector as the canonical store for:
  - [x] Scores.
  - [x] Skill evidence.
  - [ ] Dashboard metrics.
  - [x] GitHub and Linear sync state.
  - [x] Audit trail.
  - [x] Redaction status.
- [x] Use Supermemory only for:
  - [x] Cross-agent context retrieval.
  - [x] User/project preference memory.
  - [x] Redacted chat and project summaries.
  - [ ] Optional MCP-based local assistant context.
- [x] Add context provider abstraction:
  - [x] Supabase vector provider.
  - [x] Supermemory provider.
  - [x] Combined retrieval provider.
  - [ ] Provider health check.
  - [ ] Provider fallback behavior.
- [ ] Configure Supermemory only when enabled:
  - [x] `SUPERMEMORY_API_KEY`.
  - [x] `SUPERMEMORY_PROJECT_ID` if project scoping is used.
  - [x] `CONTEXT_PROVIDER=supabase`.
  - [x] `CONTEXT_PROVIDER=supermemory`.
  - [x] `CONTEXT_PROVIDER=combined`.
- [ ] Use deterministic Supermemory `containerTag` values:
  - [ ] `user:{userId}` for user-level memory.
  - [ ] `project:{projectId}` for project-level memory.
  - [ ] `agent:{agentId}` for agent-specific memory.
  - [ ] `repo:{repoId}` for repository-level memory if needed.
- [x] Store only redacted and summarized content in Supermemory:
  - [x] No raw transcripts by default.
  - [x] No secrets.
  - [ ] No private customer data.
  - [ ] No company-sensitive code.
  - [ ] No database URLs or API keys.
- [ ] Add external memory write rules:
  - [x] Summarize first.
  - [x] Redact second.
  - [ ] Classify sensitivity third.
  - [ ] Store externally only after passing policy checks.
- [ ] Add external memory read rules:
  - [x] Retrieve only by explicit user/project/repo scope.
  - [x] Attach source metadata to every retrieved context item.
  - [ ] Deduplicate with Supabase memories.
  - [x] Never let retrieved context override fresh repo/API/database evidence.
- [ ] Use Supermemory MCP for local assistant context only:
  - [ ] Document local MCP setup separately from production app setup.
  - [ ] Do not require Supermemory MCP for Vercel production flows.
  - [ ] Do not store Supermemory API keys in repo files.
- [ ] Verify external context behavior:
  - [ ] App works with `CONTEXT_PROVIDER=supabase`.
  - [ ] App works with `CONTEXT_PROVIDER=supermemory` only when credentials are present.
  - [ ] App works with `CONTEXT_PROVIDER=combined`.
  - [ ] Missing Supermemory config fails clearly or falls back to Supabase by design.
  - [ ] Secret redaction test passes before any external memory write.

## 20. Resume, LinkedIn, and X Output

- [ ] Generate resume bullets after 4-6 weeks of real usage.
- [ ] Generate LinkedIn post ideas.
- [ ] Generate X/Twitter build-in-public posts.
- [ ] Generate portfolio project descriptions.
- [ ] Generate interview talking points.
- [ ] Generate weekly progress summary.
- [ ] Include this resume-level positioning when evidence exists:
  - [ ] Built DevRank OS, a personal engineering intelligence platform that ingests AI-agent sessions, GitHub repositories, PRs, reviews, and learning activity to generate SDE-readiness scores, skill-gap analysis, portfolio insights, and daily Slack learning plans.
  - [ ] Implemented event-driven GitHub App and Linear webhooks, Postgres + pgvector memory storage, Next.js dashboards, Hermes-based AI orchestration, local macOS transcript ingestion, and automated career planning workflows.
- [ ] Avoid weak positioning like "Used AI tools for coding."
- [ ] Ensure generated content is backed by actual repo, PR, dashboard, or usage evidence.

## 21. MVP Build Order

### Week 1: Foundation

- [x] Set up monorepo.
- [x] Set up Supabase Postgres + pgvector.
- [x] Create Next.js dashboard shell.
- [x] Create basic DB schema.
- [ ] Set up Hermes + OpenRouter.
- [x] Create local ingestion CLI.
- [ ] Decide whether Linear is in MVP or Phase 2.
- [ ] Decide whether Supermemory is disabled, optional, or combined with Supabase for MVP.

### Week 2: AI Chat Ingestion

- [x] Build Claude adapter.
- [x] Build Codex adapter.
- [ ] Add optional Codex Cloud/Web import path only if a supported export source is available.
- [x] Build OpenCode adapter.
- [x] Build Antigravity discovery adapter.
- [x] Build secret redaction.
- [x] Build session summarization.
- [ ] Build AI Chat Dashboard.

### Week 3: GitHub Backfill

- [ ] Set up GitHub OAuth/App.
- [ ] Import all repos.
- [ ] Import PRs.
- [ ] Import commits.
- [ ] Implement repo scoring.
- [ ] Build Portfolio Dashboard.

### Week 4: GitHub and Linear Webhooks

- [ ] Handle PR opened/updated webhook.
- [ ] Handle PR review webhook.
- [ ] Handle push webhook.
- [ ] Implement score recomputation.
- [ ] Build PR Review Dashboard.
- [ ] Set up Linear API access if Linear is in MVP.
- [ ] Backfill Linear projects and issues if Linear is in MVP.
- [ ] Handle Linear issue/project webhook if Linear is in MVP.
- [ ] Build Linear Project Dashboard if Linear is in MVP.

### Week 5: Planning and Slack

- [x] Build daily planner.
- [ ] Build weekly planner.
- [ ] Build DSA target generator.
- [x] Integrate Slack incoming webhook.
- [x] Configure Vercel cron.

### Week 6: Market Benchmark and Content Engine

- [x] Add search access.
- [x] Build skill-gap benchmark.
- [x] Add optional Supermemory context provider after redaction is stable.
- [ ] Generate resume bullets.
- [ ] Generate LinkedIn/X content.
- [ ] Generate weekly public-proof report.

## 22. First MVP Scope

- [ ] Build Supabase Postgres + pgvector first.
- [ ] Build Next.js dashboard on Vercel.
- [ ] Build GitHub backfill for all repos.
- [ ] Build PR/repo scoring dashboard.
- [ ] Build Linear project-wise dashboard only after GitHub PR/repo flow is stable, unless Linear becomes the primary planning source.
- [ ] Build Slack daily target.
- [ ] Build local Codex/Claude/OpenCode chat ingestion.
- [ ] Build Hermes weekly mentor summary.
- [ ] Make GitHub + dashboard + Slack work before expanding everything else.
- [ ] Add local AI-agent memory after the core cloud workflow works.
- [ ] Add Codex Cloud/Web history after local Codex ingestion works and only through supported exports/imports.
- [ ] Add Supermemory after Supabase memory, redaction, and evidence tracking are stable.
- [ ] Add Hermes continuous learning after ingestion and scoring are stable.

## 23. Final Implementation Stack

- [x] Use Turborepo.
- [x] Use Next.js.
- [x] Use Vercel.
- [x] Use Supabase Postgres.
- [x] Use pgvector.
- [ ] Use Drizzle.
- [ ] Use GitHub App.
- [x] Use Linear GraphQL API/SDK and webhooks if Linear project intelligence is enabled.
- [x] Use Hermes.
- [x] Use OpenRouter.
- [x] Use Slack Webhook.
- [x] Use Local macOS Daemon.
- [x] Use Supermemory only as an optional external context provider.

## 24. End-to-End Verification

- [ ] Local development can connect to Supabase successfully.
- [ ] Hosted database is reachable from Vercel.
- [ ] Migrations run from local development against Supabase.
- [ ] Migrations run against Supabase Postgres.
- [x] Dashboard loads without the local Mac daemon.
- [x] GitHub App webhook signature verification passes.
- [ ] GitHub backfill imports repos, commits, and PRs.
- [ ] PR webhook updates PR dashboard.
- [ ] Push webhook updates repo activity.
- [ ] Linear backfill imports teams, projects, issues, cycles, and project updates if Linear is enabled.
- [ ] Linear webhook updates project dashboard if Linear is enabled.
- [ ] Linear project dashboard filters by workspace, team, project, status, and priority if Linear is enabled.
- [ ] Score recomputation updates snapshots.
- [ ] Slack daily message sends manually.
- [ ] Slack daily message sends through cron at the intended IST time.
- [ ] Local collector ingests Codex sessions.
- [ ] Local collector imports Codex Cloud/Web history only from supported exports or manually provided summaries.
- [ ] Local collector ingests Claude sessions after path verification.
- [ ] Local collector ingests OpenCode sessions.
- [ ] Local collector discovers Antigravity data.
- [x] Secret redaction blocks sensitive values before upload.
- [x] Raw transcripts stay local by default.
- [x] Session summaries are stored in Supabase Postgres.
- [ ] Embeddings are generated only from summarized and redacted content.
- [x] External context writes are blocked until summarization and redaction pass.
- [ ] Supermemory retrieval works only in the configured scope if Supermemory is enabled.
- [x] Missing Supermemory credentials do not break Supabase-only mode.
- [ ] Hermes weekly mentor summary runs.
- [ ] Hermes skill extraction runs.
- [ ] Market benchmark runs weekly using live search/tooling.
- [ ] Daily planner uses scores, weak areas, and market gaps.
- [ ] Career/content dashboard generates evidence-backed output.
- [ ] Portfolio dashboard identifies resume-ready and weak repos.
- [ ] Linear dashboard identifies blocked, stale, and high-priority project work if Linear is enabled.
- [x] README and docs explain setup and architecture.
- [ ] The project can be described clearly as a resume-worthy system.

## 25. Project Completion Criteria

- [ ] DevRank OS has a working cloud dashboard.
- [ ] DevRank OS has a working Supabase Postgres + pgvector database.
- [ ] DevRank OS can run when the Mac is off for GitHub, scoring snapshots, dashboard, and Slack daily targets.
- [ ] DevRank OS can ingest local AI-agent chats when the Mac daemon is running.
- [ ] DevRank OS can optionally import Codex Cloud/Web history from supported exports without relying on unsupported scraping.
- [ ] DevRank OS can analyze GitHub repos and PRs.
- [ ] DevRank OS can show project-wise Linear dashboards when Linear integration is enabled.
- [ ] DevRank OS can produce transparent SDE readiness, PR quality, AI-agent maturity, and portfolio scores.
- [ ] DevRank OS can create daily and weekly learning plans.
- [ ] DevRank OS can send Slack targets.
- [ ] DevRank OS can benchmark current market skill demand.
- [ ] DevRank OS can use optional external context without replacing Supabase as the source of truth.
- [ ] DevRank OS can generate resume, LinkedIn, X, and portfolio content from real evidence.
- [ ] DevRank OS supports the final story: a real, resume-worthy system that works locally, works on Vercel when the Mac is off, learns from AI-agent usage, tracks GitHub/PR/Linear project growth, and gives a measurable path for Software Engineering growth.
