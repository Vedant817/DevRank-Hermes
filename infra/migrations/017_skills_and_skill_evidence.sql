create table if not exists skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists skill_evidence (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references skills(id) on delete cascade,
  source text not null,
  source_id text not null,
  title text not null,
  summary text not null,
  occurred_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists skill_evidence_skill_source_unique
  on skill_evidence (skill_id, source, source_id);

create index if not exists skill_evidence_source_idx
  on skill_evidence (source, source_id);
