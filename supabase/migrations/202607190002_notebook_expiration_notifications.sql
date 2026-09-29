create or replace function public.generate_due_notifications_internal(p_mode text, p_school_id uuid, p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path = '' set timezone = 'Asia/Aden' as $$
declare
  actor public.profiles;
  inserted_count integer := 0;
  notebook_count integer := 0;
  admin_count integer := 0;
begin
  select * into actor from public.profiles where id = p_actor_id and status = 'active';
  if not found or actor.role not in ('general_manager', 'school_principal', 'deputy_principal') then
    raise exception 'Deadline checks are restricted to school management' using errcode = '42501';
  end if;
  if actor.role <> 'general_manager' and actor.school_id is distinct from p_school_id then
    raise exception 'Cross-school deadline check is forbidden' using errcode = '42501';
  end if;
  if p_mode not in ('deadline', 'overdue') then
    raise exception 'Invalid notification mode' using errcode = '22023';
  end if;

  insert into public.notifications (school_id, user_id, title, message, type, related_task_id, dedupe_key)
  select
    task.school_id,
    recipient.id,
    case when p_mode = 'deadline' then 'تذكير بموعد الاستحقاق' else 'تنبيه مهمة متأخرة' end,
    case when p_mode = 'deadline' then task.task_number || ' يستحق اليوم.' else task.task_number || ' متأخرة منذ ' || (task.due_date at time zone 'Asia/Aden')::date || '.' end,
    case when p_mode = 'deadline' then 'deadline_reminder' else 'overdue_alert' end,
    task.id,
    case when p_mode = 'deadline' then 'deadline_reminder:' else 'overdue_alert:' end || task.id
  from public.tasks task
  cross join lateral (
    select task.assigned_to as id
    union
    select task.created_by
  ) recipient
  where task.school_id = p_school_id
    and recipient.id is not null
    and coalesce(task.recurrence_type, 'once') <> 'permanent'
    and task.status not in ('completed', 'archived')
    and case when p_mode = 'deadline'
      then (task.due_date at time zone 'Asia/Aden')::date = current_date
      else (task.due_date at time zone 'Asia/Aden')::date < current_date
    end
  on conflict on constraint notifications_user_dedupe_key do nothing;
  get diagnostics inserted_count = row_count;

  with notebook_groups as (
    select
      task.school_id,
      task.assigned_to,
      task.created_by,
      (task.due_date at time zone 'Asia/Aden')::date as due_day,
      (array_agg(task.id order by task.created_at, task.id))[1] as task_id
    from public.tasks task
    where task.school_id = p_school_id
      and task.recurrence_type = 'permanent'
      and task.source_task_id is null
      and task.status <> 'archived'
      and case when p_mode = 'deadline'
        then (task.due_date at time zone 'Asia/Aden')::date = current_date
        else (task.due_date at time zone 'Asia/Aden')::date < current_date
      end
    group by task.school_id, task.assigned_to, task.created_by, (task.due_date at time zone 'Asia/Aden')::date
  ), notebook_recipients as (
    select distinct
      notebook.school_id,
      notebook.assigned_to,
      notebook.due_day,
      notebook.task_id,
      recipient.id as recipient_id
    from notebook_groups notebook
    cross join lateral (
      select notebook.assigned_to as id
      union
      select notebook.created_by
      union
      select administrator.id
      from public.profiles administrator
      where administrator.status = 'active'
        and (administrator.role = 'general_manager' or (administrator.school_id = notebook.school_id and administrator.role in ('school_principal', 'deputy_principal')))
    ) recipient
    where recipient.id is not null
  )
  insert into public.notifications (school_id, user_id, title, message, type, related_task_id, dedupe_key)
  select
    notebook.school_id,
    notebook.recipient_id,
    case when p_mode = 'deadline' then 'تنبيه نهاية فترة دفتر المهام' else 'انتهت فترة دفتر المهام' end,
    case when p_mode = 'deadline' then 'تنتهي فترة دفتر المهام اليوم. يمكن تجديد الفترة أو أرشفة الدفتر.' else 'انتهت فترة دفتر المهام بتاريخ ' || notebook.due_day || '. يمكن تجديد الفترة أو أرشفة الدفتر.' end,
    'notebook_expired',
    notebook.task_id,
    'notebook_expired:' || notebook.school_id || ':' || coalesce(notebook.assigned_to::text, 'unassigned') || ':' || notebook.due_day
  from notebook_recipients notebook
  on conflict on constraint notifications_user_dedupe_key do nothing;
  get diagnostics notebook_count = row_count;

  if p_mode = 'overdue' then
    insert into public.notifications (school_id, user_id, title, message, type, related_task_id, dedupe_key)
    select
      task.school_id,
      administrator.id,
      'تنبيه إداري: مهمة متأخرة',
      task.task_number || ' متأخرة منذ ' || (task.due_date at time zone 'Asia/Aden')::date || '.',
      'admin_alert',
      task.id,
      'admin_alert:overdue:' || task.id
    from public.tasks task
    join public.profiles administrator on administrator.status = 'active' and (
      administrator.role = 'general_manager' or
      (administrator.school_id = task.school_id and administrator.role in ('school_principal', 'deputy_principal'))
    )
    where task.school_id = p_school_id
      and coalesce(task.recurrence_type, 'once') <> 'permanent'
      and task.status not in ('completed', 'archived')
      and (task.due_date at time zone 'Asia/Aden')::date < current_date
      and administrator.id is distinct from task.assigned_to
      and administrator.id is distinct from task.created_by
    on conflict on constraint notifications_user_dedupe_key do nothing;
    get diagnostics admin_count = row_count;
  end if;

  return jsonb_build_object('ok', true, 'mode', p_mode, 'processed', inserted_count + notebook_count + admin_count, 'notebookAlerts', notebook_count, 'adminAlerts', admin_count);
end;
$$;

revoke execute on function public.generate_due_notifications_internal(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.generate_due_notifications_internal(text, uuid, uuid) to service_role;
