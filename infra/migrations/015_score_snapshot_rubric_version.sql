alter table score_snapshots
  add column if not exists rubric_version text;

update score_snapshots
set rubric_version = 'legacy-v0'
where rubric_version is null;

alter table score_snapshots
  alter column rubric_version set not null;
