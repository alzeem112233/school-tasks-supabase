begin;

create temporary table inactive_user_cleanup (
  user_id uuid primary key
) on commit drop;

insert into inactive_user_cleanup (user_id)
select profile.id
from public.profiles profile
where profile.status <> 'active';

do $$
declare
  inactive_count integer;
begin
  select count(*) into inactive_count from inactive_user_cleanup;
  raise notice 'Inactive user accounts selected for permanent deletion: %', inactive_count;
end;
$$;

delete from auth.users account
using inactive_user_cleanup inactive
where account.id = inactive.user_id;

delete from public.profiles profile
using inactive_user_cleanup inactive
where profile.id = inactive.user_id;

create or replace function public.notebook_item_title_key(p_title text, p_comments jsonb) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(
    btrim(coalesce(
      (
        select item.value ->> 'text'
        from jsonb_array_elements(coalesce(p_comments, '[]'::jsonb)) with ordinality item(value, item_index)
        where item.value ->> 'type' = 'notebook_item_title'
        order by item.item_index desc
        limit 1
      ),
      p_title,
      ''
    )),
    '[[:space:]]+',
    ' ',
    'g'
  ));
$$;

create temporary table notebook_task_dedupe_map (
  task_id uuid primary key,
  keep_id uuid not null
) on commit drop;

insert into notebook_task_dedupe_map (task_id, keep_id)
with ranked as (
  select
    task.id,
    first_value(task.id) over (
      partition by
        task.school_id,
        task.assigned_to,
        public.notebook_item_title_key(task.title, task.comments)
      order by
        case task.status
          when 'completed' then 6
          when 'approved' then 5
          when 'under_review' then 4
          when 'in_progress' then 3
          when 'pending' then 2
          when 'overdue' then 1
          else 0
        end desc,
        jsonb_array_length(coalesce(task.comments, '[]'::jsonb)) desc,
        jsonb_array_length(coalesce(task.approvals, '[]'::jsonb)) desc,
        task.progress desc,
        task.created_at asc,
        task.id
    ) as keep_id,
    row_number() over (
      partition by
        task.school_id,
        task.assigned_to,
        public.notebook_item_title_key(task.title, task.comments)
      order by
        case task.status
          when 'completed' then 6
          when 'approved' then 5
          when 'under_review' then 4
          when 'in_progress' then 3
          when 'pending' then 2
          when 'overdue' then 1
          else 0
        end desc,
        jsonb_array_length(coalesce(task.comments, '[]'::jsonb)) desc,
        jsonb_array_length(coalesce(task.approvals, '[]'::jsonb)) desc,
        task.progress desc,
        task.created_at asc,
        task.id
    ) as duplicate_rank
  from public.tasks task
  where task.assigned_to is not null
    and task.recurrence_type = 'permanent'
    and task.source_task_id is null
    and task.status <> 'archived'
)
select ranked.id, ranked.keep_id
from ranked
where ranked.duplicate_rank > 1;

do $$
declare
  duplicate_count integer;
begin
  select count(*) into duplicate_count from notebook_task_dedupe_map;
  raise notice 'Duplicate active notebook tasks selected for removal: %', duplicate_count;
end;
$$;

alter table public.tasks disable trigger user;
alter table public.attachments disable trigger user;

with group_members as (
  select keep_id, keep_id as source_id from notebook_task_dedupe_map
  union
  select keep_id, task_id as source_id from notebook_task_dedupe_map
), merged as (
  select
    member.keep_id,
    coalesce(
      jsonb_agg(distinct comment.value) filter (where comment.value is not null),
      '[]'::jsonb
    ) as comments
  from group_members member
  join public.tasks source on source.id = member.source_id
  left join lateral jsonb_array_elements(coalesce(source.comments, '[]'::jsonb)) comment(value)
    on source.id = member.keep_id
    or coalesce(comment.value ->> 'type', '') not in ('notebook_number', 'notebook_title', 'notebook_item_title')
  group by member.keep_id
)
update public.tasks keeper
set comments = merged.comments
from merged
where keeper.id = merged.keep_id;

with group_members as (
  select keep_id, keep_id as source_id from notebook_task_dedupe_map
  union
  select keep_id, task_id as source_id from notebook_task_dedupe_map
), merged as (
  select
    member.keep_id,
    coalesce(jsonb_agg(distinct feedback.value) filter (where feedback.value is not null), '[]'::jsonb) as feedback,
    coalesce(jsonb_agg(distinct approval.value) filter (where approval.value is not null), '[]'::jsonb) as approvals
  from group_members member
  join public.tasks source on source.id = member.source_id
  left join lateral jsonb_array_elements(coalesce(source.feedback, '[]'::jsonb)) feedback(value) on true
  left join lateral jsonb_array_elements(coalesce(source.approvals, '[]'::jsonb)) approval(value) on true
  group by member.keep_id
)
update public.tasks keeper
set feedback = merged.feedback,
    approvals = merged.approvals
from merged
where keeper.id = merged.keep_id;

update public.attachments attachment
set task_id = duplicate.keep_id
from notebook_task_dedupe_map duplicate
where attachment.task_id = duplicate.task_id;

update public.tasks child
set source_task_id = duplicate.keep_id
from notebook_task_dedupe_map duplicate
where child.source_task_id = duplicate.task_id;

update public.notifications notification
set related_task_id = duplicate.keep_id
from notebook_task_dedupe_map duplicate
where notification.related_task_id = duplicate.task_id;

update public.activity_logs activity
set entity_id = duplicate.keep_id
from notebook_task_dedupe_map duplicate
where activity.entity_type = 'task'
  and activity.entity_id = duplicate.task_id;

update public.audit_logs audit
set details = jsonb_set(audit.details, '{targetId}', to_jsonb(duplicate.keep_id::text), true)
from notebook_task_dedupe_map duplicate
where audit.details ->> 'targetId' = duplicate.task_id::text;

delete from public.tasks task
using notebook_task_dedupe_map duplicate
where task.id = duplicate.task_id;

alter table public.attachments enable trigger user;
alter table public.tasks enable trigger user;

create or replace function public.prevent_duplicate_notebook_task() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  identity_key text;
begin
  if new.recurrence_type is distinct from 'permanent'
    or new.source_task_id is not null
    or new.assigned_to is null
    or new.status = 'archived' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.school_id is not distinct from old.school_id
    and new.assigned_to is not distinct from old.assigned_to
    and new.title is not distinct from old.title
    and old.status <> 'archived' then
    return new;
  end if;

  identity_key := concat_ws(
    '|',
    new.school_id::text,
    new.assigned_to::text,
    public.notebook_item_title_key(new.title, new.comments)
  );

  perform pg_advisory_xact_lock(hashtextextended(identity_key, 0));

  if exists (
    select 1
    from public.tasks existing
    where existing.id <> new.id
      and existing.school_id = new.school_id
      and existing.assigned_to = new.assigned_to
      and existing.recurrence_type = 'permanent'
      and existing.source_task_id is null
      and existing.status <> 'archived'
      and public.notebook_item_title_key(existing.title, existing.comments)
        = public.notebook_item_title_key(new.title, new.comments)
  ) then
    raise exception 'Duplicate notebook task for this employee' using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_notebook_task on public.tasks;
create trigger prevent_duplicate_notebook_task
before insert or update of school_id, assigned_to, title, recurrence_type, source_task_id, status
on public.tasks
for each row execute function public.prevent_duplicate_notebook_task();

grant execute on function public.prevent_duplicate_notebook_task() to authenticated;
grant execute on function public.notebook_item_title_key(text, jsonb) to authenticated;

commit;
