create extension if not exists vector;

create table if not exists schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists ai_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source text not null,
  created_at timestamptz not null default now()
);

create table if not exists ai_sessions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references ai_agents(id),
  source_type text not null,
  source_path text,
  title text not null,
  started_at timestamptz,
  ended_at timestamptz,
  raw_stored boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references ai_sessions(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists ai_session_summaries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references ai_sessions(id) on delete cascade,
  summary text not null,
  redaction_status text not null,
  skill_tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists memory_items (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text,
  title text not null,
  summary text not null,
  sensitivity text not null default 'redacted',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create unique index if not exists memory_items_source_source_id_unique
  on memory_items (source, source_id)
  where source_id is not null;

create table if not exists github_repos (
  id bigint primary key,
  owner text not null,
  name text not null,
  full_name text not null unique,
  private boolean not null default false,
  default_branch text,
  html_url text,
  language text,
  pushed_at timestamptz,
  updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create table if not exists github_pull_requests (
  id bigint primary key,
  repo_id bigint references github_repos(id),
  number integer not null,
  title text not null,
  state text not null,
  html_url text,
  merged_at timestamptz,
  updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create table if not exists linear_workspaces (
  id text primary key,
  name text not null,
  url_key text,
  synced_at timestamptz not null default now()
);

create table if not exists linear_teams (
  id text primary key,
  workspace_id text references linear_workspaces(id),
  name text not null,
  key text,
  synced_at timestamptz not null default now()
);

create table if not exists linear_projects (
  id text primary key,
  team_id text references linear_teams(id),
  name text not null,
  state text,
  progress numeric,
  url text,
  synced_at timestamptz not null default now()
);

create table if not exists linear_issues (
  id text primary key,
  project_id text references linear_projects(id),
  team_id text references linear_teams(id),
  identifier text not null,
  title text not null,
  state text,
  priority integer,
  assignee text,
  url text,
  updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  value numeric not null,
  explanation text not null,
  created_at timestamptz not null default now()
);

create table if not exists score_snapshots (
  id uuid primary key default gen_random_uuid(),
  overall numeric not null,
  breakdown jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists daily_plans (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null unique,
  tasks jsonb not null,
  target_minutes integer not null,
  created_at timestamptz not null default now()
);

create table if not exists slack_notifications (
  id uuid primary key default gen_random_uuid(),
  channel text,
  text text not null,
  delivered_at timestamptz,
  response jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null,
  summary text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists memory_embeddings (
  id uuid primary key default gen_random_uuid(),
  memory_item_id uuid not null references memory_items(id) on delete cascade,
  embedding vector(1536),
  model text not null,
  created_at timestamptz not null default now()
);
