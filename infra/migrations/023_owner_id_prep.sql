do $$
begin
  alter table scores add column owner_id text;
exception
  when duplicate_column then null;
end
$$;

do $$
begin
  alter table score_snapshots add column owner_id text;
exception
  when duplicate_column then null;
end
$$;

do $$
begin
  alter table daily_plans add column owner_id text;
exception
  when duplicate_column then null;
end
$$;

do $$
begin
  alter table memory_items add column owner_id text;
exception
  when duplicate_column then null;
end
$$;

do $$
begin
  alter table github_repos add column owner_id text;
exception
  when duplicate_column then null;
end
$$;
