begin;

create temporary table task_dedupe_map (
  task_id uuid primary key,
  keep_id uuid not null
) on commit drop;

insert into task_dedupe_map (task_id, keep_id)
with ranked as (
  select
    task.id,
    task.created_at,
    first_value(task.id) over (
      partition by
        task.school_id,
        task.assigned_to,
        task.recurrence_type,
        task.source_task_id,
        task.occurrence_date,
        task.due_date,
        lower(regexp_replace(btrim(coalesce(task.title, '')), '[[:space:]]+', ' ', 'g')),
        lower(regexp_replace(btrim(coalesce(task.description, '')), '[[:space:]]+', ' ', 'g')),
        lower(regexp_replace(btrim(coalesce(task.department_name, '')), '[[:space:]]+', ' ', 'g'))
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
        task.progress desc,
        task.created_at asc,
        task.id
    ) as keep_id,
    row_number() over (
      partition by
        task.school_id,
        task.assigned_to,
        task.recurrence_type,
        task.source_task_id,
        task.occurrence_date,
        task.due_date,
        lower(regexp_replace(btrim(coalesce(task.title, '')), '[[:space:]]+', ' ', 'g')),
        lower(regexp_replace(btrim(coalesce(task.description, '')), '[[:space:]]+', ' ', 'g')),
        lower(regexp_replace(btrim(coalesce(task.department_name, '')), '[[:space:]]+', ' ', 'g'))
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
        task.progress desc,
        task.created_at asc,
        task.id
    ) as duplicate_rank
  from public.tasks task
  where task.assigned_to is not null
    and task.status <> 'archived'
)
select ranked.id, ranked.keep_id
from ranked
where ranked.duplicate_rank > 1
  and (ranked.created_at at time zone 'Asia/Aden')::date = (now() at time zone 'Asia/Aden')::date;

do $$
declare
  duplicate_count integer;
begin
  select count(*) into duplicate_count from task_dedupe_map;
  raise notice 'Today duplicate task records selected for removal: %', duplicate_count;
end;
$$;

alter table public.tasks disable trigger user;
alter table public.attachments disable trigger user;

with group_members as (
  select keep_id, keep_id as source_id from task_dedupe_map
  union
  select keep_id, task_id as source_id from task_dedupe_map
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
  select keep_id, keep_id as source_id from task_dedupe_map
  union
  select keep_id, task_id as source_id from task_dedupe_map
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
from task_dedupe_map duplicate
where attachment.task_id = duplicate.task_id;

update public.tasks child
set source_task_id = duplicate.keep_id
from task_dedupe_map duplicate
where child.source_task_id = duplicate.task_id;

update public.notifications notification
set related_task_id = duplicate.keep_id
from task_dedupe_map duplicate
where notification.related_task_id = duplicate.task_id;

update public.activity_logs activity
set entity_id = duplicate.keep_id
from task_dedupe_map duplicate
where activity.entity_type = 'task'
  and activity.entity_id = duplicate.task_id;

update public.audit_logs audit
set details = jsonb_set(audit.details, '{targetId}', to_jsonb(duplicate.keep_id::text), true)
from task_dedupe_map duplicate
where audit.details ->> 'targetId' = duplicate.task_id::text;

delete from public.tasks task
using task_dedupe_map duplicate
where task.id = duplicate.task_id;

alter table public.attachments enable trigger user;
alter table public.tasks enable trigger user;

commit;
