# Supabase Setup

DevRank OS uses Supabase Postgres as the canonical database and pgvector as the
semantic memory extension.

## Required Environment

Set one database URL locally and in Vercel:

```text
DATABASE_URL=postgresql://...
```

The CLI also accepts these aliases:

```text
DEVRANK_DATABASE_URL=postgresql://...
SUPABASE_DATABASE_URL=postgresql://...
```

Optional Supabase app credentials:

```text
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Commands

```bash
pnpm devrank env:check --feature database
pnpm devrank db:migrate
pnpm devrank db:check-vector
```

`db:migrate` creates the DevRank OS core tables. `db:check-vector` verifies the
`vector` extension and a basic vector distance query.
