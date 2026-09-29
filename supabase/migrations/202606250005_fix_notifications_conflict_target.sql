-- Fix notification inserts that use ON CONFLICT (user_id, dedupe_key).
-- PostgreSQL cannot use the existing partial unique index as a conflict target
-- unless every insert matches the same predicate. All generated notifications
-- already carry a non-empty dedupe_key, so normalize old blanks and add a
-- regular unique constraint for the conflict handler.

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
