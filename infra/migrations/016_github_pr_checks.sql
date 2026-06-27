alter table github_pull_requests
  add column if not exists head_sha text;

create table if not exists github_pr_checks (
  id bigint primary key,
  pull_request_id bigint not null references github_pull_requests(id) on delete cascade,
  head_sha text not null,
  name text not null,
  status text not null,
  conclusion text,
  details_url text,
  app_slug text,
  started_at timestamptz,
  completed_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists github_pr_checks_pull_request_idx
  on github_pr_checks (pull_request_id);

create index if not exists github_pr_checks_pull_request_head_idx
  on github_pr_checks (pull_request_id, head_sha);
