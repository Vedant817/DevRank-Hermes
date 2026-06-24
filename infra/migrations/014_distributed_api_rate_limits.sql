create table if not exists api_rate_limit_buckets (
  bucket_key text primary key,
  request_count integer not null,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists api_rate_limit_buckets_reset_at_idx
  on api_rate_limit_buckets (reset_at);
