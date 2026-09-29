begin;

create temporary table today_notebook_excess_tasks (
  task_id uuid primary key,
  keep_id uuid not null
) on commit drop;

insert into today_notebook_excess_tasks (task_id, keep_id)
with ranked as (
  select
    task.id,
    first_value(task.id) over (
      partition by task.school_id, task.assigned_to
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
      partition by task.school_id, task.assigned_to
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
    ) as task_rank
  from public.tasks task
  where task.assigned_to is not null
    and task.recurrence_type = 'permanent'
    and task.source_task_id is null
    and task.status <> 'archived'
    and (task.created_at at time zone 'Asia/Aden')::date = (now() at time zone 'Asia/Aden')::date
)
select ranked.id, ranked.keep_id
from ranked
where ranked.task_rank > 1;

do $$
declare
  excess_count integer;
begin
  select count(*) into excess_count from today_notebook_excess_tasks;
  raise notice 'Today excess notebook tasks selected for removal: %', excess_count;
end;
$$;

alter table public.tasks disable trigger user;

delete from public.notifications notification
using today_notebook_excess_tasks excess
where notification.related_task_id = excess.task_id;

delete from public.activity_logs activity
using today_notebook_excess_tasks excess
where activity.entity_type = 'task'
  and activity.entity_id = excess.task_id;

delete from public.audit_logs audit
using today_notebook_excess_tasks excess
where audit.details ->> 'targetId' = excess.task_id::text;

delete from public.tasks task
using today_notebook_excess_tasks excess
where task.id = excess.task_id;

alter table public.tasks enable trigger user;

commit;
