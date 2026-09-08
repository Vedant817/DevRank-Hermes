create table if not exists gitlab_projects (
  id bigint primary key,
  owner_id text not null,
  name text not null,
  path_with_namespace text not null unique,
  visibility text not null,
  default_branch text,
  web_url text,
  archived boolean not null default false,
  empty_repo boolean not null default false,
  last_activity_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists gitlab_projects_owner_activity_idx
  on gitlab_projects (owner_id, last_activity_at desc);

create table if not exists gitlab_commits (
  project_id bigint not null references gitlab_projects(id) on delete cascade,
  sha text not null,
  title text not null,
  message text not null,
  author_name text,
  authored_at timestamptz,
  committed_at timestamptz,
  web_url text,
  synced_at timestamptz not null default now(),
  primary key (project_id, sha)
);

create index if not exists gitlab_commits_project_committed_at_idx
  on gitlab_commits (project_id, committed_at desc);

create table if not exists gitlab_merge_requests (
  id bigint primary key,
  project_id bigint not null references gitlab_projects(id) on delete cascade,
  iid integer not null,
  title text not null,
  state text not null,
  source_branch text not null,
  target_branch text not null,
  author_username text,
  web_url text,
  created_at timestamptz,
  updated_at timestamptz,
  merged_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (project_id, iid)
);

create index if not exists gitlab_merge_requests_project_updated_at_idx
  on gitlab_merge_requests (project_id, updated_at desc);
