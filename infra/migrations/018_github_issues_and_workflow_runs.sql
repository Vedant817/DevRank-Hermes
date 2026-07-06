create table if not exists github_issues (
  id bigint primary key,
  repo_id bigint references github_repos(id) on delete cascade,
  number integer not null,
  title text not null,
  state text not null,
  author_login text,
  html_url text,
  opened_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists github_issues_repo_idx
  on github_issues (repo_id);

create table if not exists github_workflow_runs (
  id bigint primary key,
  repo_id bigint references github_repos(id) on delete cascade,
  name text,
  event text,
  status text not null,
  conclusion text,
  head_branch text,
  head_sha text,
  html_url text,
  run_started_at timestamptz,
  updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists github_workflow_runs_repo_idx
  on github_workflow_runs (repo_id);
