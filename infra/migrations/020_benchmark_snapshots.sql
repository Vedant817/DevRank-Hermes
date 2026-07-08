create table if not exists benchmark_snapshots (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null,
  queries text[] not null,
  skill_frequency jsonb not null,
  missing_skills text[] not null default '{}',
  resume_keyword_gaps text[] not null default '{}',
  weekly_learning_priorities text[] not null default '{}',
  raw_results jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists benchmark_snapshots_generated_at_idx
  on benchmark_snapshots (generated_at desc);
