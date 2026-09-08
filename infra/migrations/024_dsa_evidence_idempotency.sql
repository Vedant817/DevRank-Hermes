-- Canonicalize historical DSA evidence to one manual row per question/day.
-- Block writers across the dedupe/update pair so the unique index cannot race.
lock table memory_items in share row exclusive mode;

with raw_dsa_candidates as (
  select
    memory_items.id,
    memory_items.source,
    memory_items.source_id,
    memory_items.created_at,
    memory_items.metadata->>'dsaSlug' as slug,
    case
      when memory_items.source_id = 'dsa:' || dsa_questions.slug || ':' || right(memory_items.source_id, 10)
        then right(memory_items.source_id, 10)
      when memory_items.metadata ? 'date'
        then memory_items.metadata->>'date'
      when not (memory_items.metadata ? 'date')
        and memory_items.metadata ? 'occurredAt'
        and memory_items.metadata->>'occurredAt' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])(?:T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,3})?(?:Z|[+-](?:0[0-9]|1[0-4]):[0-5][0-9]))?$'
        then left(memory_items.metadata->>'occurredAt', 10)
      when not (memory_items.metadata ? 'date') and not (memory_items.metadata ? 'occurredAt')
        then to_char(memory_items.created_at at time zone 'UTC', 'YYYY-MM-DD')
    end as raw_solve_date
  from memory_items
  join dsa_questions on dsa_questions.slug = memory_items.metadata->>'dsaSlug'
  where memory_items.source = 'manual'
), dsa_candidates as (
  select *, case
    when raw_solve_date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
      and left(raw_solve_date, 4) <> '0000'
      then case
        when right(raw_solve_date, 2)::integer <= case substring(raw_solve_date, 6, 2)::integer
          when 2 then case
            when left(raw_solve_date, 4)::integer % 400 = 0
              or (left(raw_solve_date, 4)::integer % 4 = 0 and left(raw_solve_date, 4)::integer % 100 <> 0)
              then 29 else 28
          end
          when 4 then 30
          when 6 then 30
          when 9 then 30
          when 11 then 30
          else 31
        end
          then raw_solve_date
      end
  end as solve_date
  from raw_dsa_candidates
), canonical as (
  select *, 'dsa:' || slug || ':' || solve_date as canonical_source_id
  from dsa_candidates
  where solve_date is not null
), ranked as (
  select *, row_number() over (
    partition by source, canonical_source_id
    order by (source_id = canonical_source_id) desc nulls last, created_at asc, id asc
  ) as evidence_rank
  from canonical
)
delete from memory_items
using ranked
where memory_items.id = ranked.id and ranked.evidence_rank > 1;

with raw_dsa_candidates as (
  select
    memory_items.id,
    memory_items.metadata->>'dsaSlug' as slug,
    case
      when memory_items.source_id = 'dsa:' || dsa_questions.slug || ':' || right(memory_items.source_id, 10)
        then right(memory_items.source_id, 10)
      when memory_items.metadata ? 'date'
        then memory_items.metadata->>'date'
      when not (memory_items.metadata ? 'date')
        and memory_items.metadata ? 'occurredAt'
        and memory_items.metadata->>'occurredAt' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])(?:T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,3})?(?:Z|[+-](?:0[0-9]|1[0-4]):[0-5][0-9]))?$'
        then left(memory_items.metadata->>'occurredAt', 10)
      when not (memory_items.metadata ? 'date') and not (memory_items.metadata ? 'occurredAt')
        then to_char(memory_items.created_at at time zone 'UTC', 'YYYY-MM-DD')
    end as raw_solve_date
  from memory_items
  join dsa_questions on dsa_questions.slug = memory_items.metadata->>'dsaSlug'
  where memory_items.source = 'manual'
), dsa_candidates as (
  select *, case
    when raw_solve_date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
      and left(raw_solve_date, 4) <> '0000'
      then case
        when right(raw_solve_date, 2)::integer <= case substring(raw_solve_date, 6, 2)::integer
          when 2 then case
            when left(raw_solve_date, 4)::integer % 400 = 0
              or (left(raw_solve_date, 4)::integer % 4 = 0 and left(raw_solve_date, 4)::integer % 100 <> 0)
              then 29 else 28
          end
          when 4 then 30
          when 6 then 30
          when 9 then 30
          when 11 then 30
          else 31
        end
          then raw_solve_date
      end
  end as solve_date
  from raw_dsa_candidates
)
update memory_items
set
  source_id = 'dsa:' || dsa_candidates.slug || ':' || dsa_candidates.solve_date,
  metadata = jsonb_set(memory_items.metadata, '{date}', to_jsonb(dsa_candidates.solve_date), true)
from dsa_candidates
where memory_items.id = dsa_candidates.id and dsa_candidates.solve_date is not null;
