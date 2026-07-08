# Quickstart

Get DevRank OS running in 5 minutes with only a database.

## Prerequisites

- Node.js 24 LTS
- pnpm 11 (enable with `corepack enable`)
- A Supabase Postgres project (free tier is fine)

## 1. Install

```bash
nvm use
corepack enable
pnpm install
```

## 2. Configure database URL

Create a `.env` file (use `.env` as a template):

```text
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@HOST:5432/postgres
DEVRANK_OWNER_ID=yourname
```

Get the URL from Supabase: **Project Settings → Database → Connection string (URI)**.

## 3. Run migrations

```bash
pnpm devrank env:check --feature database
pnpm devrank db:migrate
pnpm devrank db:check-vector
```

## 4. Run trial score

No database needed — uses public GitHub data only.

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_...
pnpm devrank trial:score --user <github-username>
```

## 5. View results

The CLI prints:

- `evidenceCount` — number of PRs/commits scanned
- `snapshot` — SDE readiness rubric scores across dimensions
- Each dimension shows a level, score, and supporting evidence

For the full dashboard, deploy `apps/web` to Vercel or run it locally:

```bash
pnpm --filter @repo/web dev
```

## Next steps

- [Full setup with optional integrations](full-setup.md)
- [Trial mode (no database required)](../runbooks/trial-mode.md)
- [Architecture overview](../architecture.md)
