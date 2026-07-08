create table if not exists github_releases (
  id bigint primary key,
  repo_id bigint references github_repos(id) on delete cascade,
  tag_name text,
  name text,
  published_at timestamptz,
  html_url text,
  synced_at timestamptz not null default now()
);

create index if not exists github_releases_repo_idx on github_releases (repo_id);
