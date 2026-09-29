do $$
declare
  remaining_groups integer;
begin
  select count(*) into remaining_groups
  from (
    select task.school_id, task.assigned_to
    from public.tasks task
    where task.assigned_to is not null
      and coalesce(task.recurrence_type, 'once') = 'once'
      and task.source_task_id is null
      and task.status <> 'archived'
      and (task.created_at at time zone 'Asia/Aden')::date = date '2026-07-19'
    group by task.school_id, task.assigned_to
    having count(*) > 1
  ) remaining;

  raise notice 'July 19 employees still having excess standard tasks: %', remaining_groups;
end;
$$;
