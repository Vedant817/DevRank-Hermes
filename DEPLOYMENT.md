# Deployment

Deploy DevRank OS on the **Vercel Hobby** (free) + **Neon or Supabase** (free) stack.
The app needs any Postgres with the `pgvector` extension — Neon and Supabase both provide it.

## What deploys where

| Component | Platform | Cost |
|-----------|----------|------|
| Next.js web app + API routes | Vercel (Hobby) | Free |
| PostgreSQL database + pgvector | Neon (Free tier — 0.5 GB) or Supabase (free tier) | Free |
| Cron: daily plan, weekly review | Vercel Cron (2 jobs included) | Free |
| Slack bot + interactivity | Vercel API routes | Free |
| GitHub webhook ingestion | Vercel API route | Free |

Services you configure separately (each has a free tier):
- **Slack** — create an app at api.slack.com/apps
- **GitHub** — create a GitHub App or use a PAT
- **Market search** — sign up at tavily.com (free API key)
- **Hermes AI mentor** — sign up at openrouter.ai (free credits)

---

## Step 1: Database — Neon or Supabase

1. **Neon:** go to [neon.tech](https://neon.tech) → Sign up (GitHub OAuth) → Create project. Enable the `pgvector` extension (Neon supports it; the migration runs `CREATE EXTENSION IF NOT EXISTS vector`).
   **Or Supabase:** create a project at [supabase.com](https://supabase.com) → enable the `vector` extension → use the pooled connection string. See `infra/supabase.md`.
2. Copy the **connection string** from the dashboard:
   ```
   postgresql://user:pass@ep-xxxx.us-east-2.aws.neon.tech/devrank?sslmode=require
   ```
3. Save this — you'll add it to Vercel as `DATABASE_URL`.

---

## Step 2: Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → Import Repository → select your fork.
3. **Do not set a Root Directory.** Leave it at the default (repo root).
4. Vercel auto-detects the Next.js app in `apps/web/` and uses `pnpm`.
5. In **Environment Variables**, add:

   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | Neon connection string from Step 1 |
   | `DEVRANK_OWNER_ID` | Any short string, e.g. `alice` |
   | `DEVRANK_API_TOKEN` | `openssl rand -hex 32` |
   | `DEVRANK_DASHBOARD_TOKEN` | `openssl rand -base64 24` |
   | `DEVRANK_DASHBOARD_USER` | `devrank` |
   | `CRON_SECRET` | `openssl rand -hex 32` |
   | `DEVRANK_SCORE_RECOMPUTE_TOKEN` | `openssl rand -hex 32` |

6. Click **Deploy**.

Vercel reads `vercel.json` at the repo root, which sets `pnpm build --filter web...` as the build command and configures two cron jobs.

After the first deploy succeeds, the dashboard is live at `https://your-project.vercel.app/`.

---

## Step 3: Run database migrations

After deploying, run the initial schema migration. You can do this either:

**Option A — via Vercel CLI (recommended):**
```bash
npm i -g vercel
vercel link
vercel env pull .env.production
pnpm exec tsx packages/db/src/migrate.ts
```

**Option B — via the database SQL editor:**
1. Open Neon Console (or Supabase dashboard) → SQL Editor
2. Paste and run `packages/db/src/schema.ts` (or each migration sequentially)

There is no `/api/migrate` route — run migrations from your machine with the production `DATABASE_URL` (Option A) or the SQL editor (Option B).

---

## Step 4: Verify

Visit `https://your-project.vercel.app/`. You should see the DevRank OS dashboard.
If you get a 401 popup, enter `devrank` / `$DEVRANK_DASHBOARD_TOKEN`.

---

## Step 5: Configure crons (automatic)

The `vercel.json` includes:

```json
"crons": [
  { "path": "/api/cron/daily-plan",  "schedule": "30 2 * * *" },
  { "path": "/api/cron/weekly-review", "schedule": "30 3 * * 0" }
]
```

On Vercel Hobby, these run automatically. Each cron sends `CRON_SECRET` as a bearer token, and the cron routes accept **only** `CRON_SECRET` (there is no fallback to `DEVRANK_API_TOKEN`). Ensure `CRON_SECRET` is set in Vercel env vars.

---

## Step 6: Set up integrations (optional)

Each integration is independent. You can do them in any order.

### Slack — daily plan delivery + task buttons

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From Manifest
2. Set these Bot Token Scopes: `chat:write`, `chat:write.public`, `commands`
3. Install the app to your workspace, copy the **Bot User OAuth Token** (`xoxb-...`)
4. Copy your workspace's **Channel ID** (right-click channel name → Copy link → extract `C...`)
5. Under Event Subscriptions → Enable Events → Subscribe to `interactive`
6. Set the Request URL to: `https://your-project.vercel.app/api/slack/interactivity`
7. Copy the **Signing Secret** from Basic Information
8. (Optional) Create an Incoming Webhook for the webhook-only fallback path
9. Add to Vercel env vars:

   | Variable | Value |
   |----------|-------|
   | `SLACK_BOT_TOKEN` | `xoxb-...` |
   | `SLACK_CHANNEL_ID` | `C...` |
   | `SLACK_SIGNING_SECRET` | from Basic Information |
   | `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/services/...` (optional fallback) |

Redeploy after adding env vars. The next cron run will deliver interactive blocks.

### GitHub — backfill + webhooks

1. Create a GitHub App or fine-grained PAT (repo scope).
2. Add to Vercel env vars: `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`.
3. Set the GitHub App's Webhook URL to `https://your-project.vercel.app/api/github/webhook`.

### Market search — skill benchmark

1. Sign up at [tavily.com](https://tavily.com) → get API key
2. Add to Vercel env vars: `TAVILY_API_KEY`.
3. Run: `devrank market:benchmark --query "senior SDE backend roles" --history`

### Hermes AI mentor — weekly summaries

1. Sign up at [openrouter.ai](https://openrouter.ai) → get API key
2. Add to Vercel env vars: `OPENROUTER_API_KEY`, `AI_MODEL=openrouter/auto`.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| 401 pop-up on dashboard | `DEVRANK_DASHBOARD_TOKEN` mismatch or not set in Vercel env |
| 503 "Single-user owner" | `DEVRANK_OWNER_ID` not set in Vercel env |
| 503 "Dashboard auth not configured" | Neither `DEVRANK_DASHBOARD_TOKEN` nor `DEVRANK_API_TOKEN` set |
| Cron runs return 503 | `CRON_SECRET` not set in Vercel env (cron routes accept only `CRON_SECRET`) |
| Slack buttons don't work | `SLACK_SIGNING_SECRET` mismatched, or interactivity URL wrong |
| Scoring fails | Missing evidence; run `devrank trial:score` locally or `POST /api/ingest/...` |
| Build fails on Vercel | Check Build Logs; `pnpm build --filter web...` requires turbo at root |

---

## Local CLI usage

The CLI (`devrank`) works independently of the deployed server:

```bash
pnpm devrank trial:score --user <github-username>
pnpm devrank market:benchmark --query "backend roles" --history
pnpm devrank log:dsa two-sum --minutes 45 --notes "Solved with hash map"
pnpm devrank log:outcome interview_scheduled
pnpm devrank score:daily --send-slack
```

The CLI falls back to direct DB access when `DATABASE_URL` is set locally. For commands that need the API (`log:dsa`), set `DEVRANK_API_BASE_URL` to your Vercel deployment URL.
