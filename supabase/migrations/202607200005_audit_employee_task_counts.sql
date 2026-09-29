do $$
declare
  item record;
begin
  for item in
    select
      profile.full_name,
      profile.status,
      count(*) filter (where task.source_task_id is null and task.status <> 'archived') as active_roots,
      count(*) filter (where task.source_task_id is null and task.status <> 'archived' and task.recurrence_type = 'permanent') as permanent_roots,
      count(*) filter (where task.source_task_id is null and task.status <> 'archived' and task.recurrence_type = 'daily') as daily_roots,
      count(*) filter (where task.source_task_id is null and task.status <> 'archived' and coalesce(task.recurrence_type, 'once') = 'once') as once_roots,
      min((task.created_at at time zone 'Asia/Aden')::date) filter (where task.source_task_id is null and task.status <> 'archived') as first_date,
      max((task.created_at at time zone 'Asia/Aden')::date) filter (where task.source_task_id is null and task.status <> 'archived') as last_date
    from public.profiles profile
    join public.tasks task on task.assigned_to = profile.id
    group by profile.id, profile.full_name, profile.status
    having count(*) filter (where task.source_task_id is null and task.status <> 'archived') > 1
    order by active_roots desc, profile.full_name
  loop
    raise notice 'TASK_AUDIT employee="%" status=% active_roots=% permanent=% daily=% once=% first=% last=%',
      item.full_name,
      item.status,
      item.active_roots,
      item.permanent_roots,
      item.daily_roots,
      item.once_roots,
      item.first_date,
      item.last_date;
  end loop;
end;
$$;
