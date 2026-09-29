-- Repair conflict targets used while creating tasks.
-- Older deployments can miss the unique constraints that PostgREST and
-- notification triggers need for ON CONFLICT inference.

do $$
declare
  target_table text;
begin
  foreach target_table in array array['schools', 'tasks', 'attachments', 'notifications'] loop
    if not exists (
      select 1
      from pg_index idx
      join pg_class tbl on tbl.oid = idx.indrelid
      join pg_namespace ns on ns.oid = tbl.relnamespace
      join pg_attribute attr on attr.attrelid = tbl.oid and attr.attname = 'id'
      where ns.nspname = 'public'
        and tbl.relname = target_table
        and idx.indisunique
        and idx.indpred is null
        and idx.indnkeyatts = 1
        and attr.attnum = any(idx.indkey)
    ) then
      execute format('create unique index %I on public.%I (id)', target_table || '_id_conflict_key', target_table);
    end if;
  end loop;
end $$;

update public.notifications
set dedupe_key = id::text
where coalesce(dedupe_key, '') = '';

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, dedupe_key
      order by created_at desc, id desc
    ) as duplicate_rank
  from public.notifications
  where user_id is not null
    and coalesce(dedupe_key, '') <> ''
)
delete from public.notifications notification
using ranked
where notification.id = ranked.id
  and ranked.duplicate_rank > 1;

drop index if exists public.notifications_dedupe_idx;

alter table public.notifications
  alter column dedupe_key set not null,
  alter column dedupe_key set default '';

alter table public.notifications
  drop constraint if exists notifications_user_dedupe_key;

alter table public.notifications
  add constraint notifications_user_dedupe_key unique (user_id, dedupe_key);
