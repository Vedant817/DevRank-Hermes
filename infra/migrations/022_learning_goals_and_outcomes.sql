create table if not exists learning_goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  target_date date,
  status text not null default 'active'
    check (status in ('active', 'done', 'abandoned')),
  created_at timestamptz not null default now()
);

create table if not exists outcome_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (event_type in ('application', 'interview', 'offer', 'rejection')),
  company text,
  role text,
  notes text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists outcome_events_occurred_at_idx on outcome_events (occurred_at desc);
