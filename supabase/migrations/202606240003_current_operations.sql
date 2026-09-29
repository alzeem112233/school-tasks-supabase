begin;

create extension if not exists pgcrypto;

insert into public.schools (id, name, status)
values
  ('11111111-1111-4111-8111-111111111111', 'الإدارة العامة', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'المدرسة أ', 'active'),
  ('33333333-3333-4333-8333-333333333333', 'المدرسة ب', 'active')
on conflict (id) do update
set name = excluded.name,
    status = excluded.status,
    updated_at = now();

create index if not exists tasks_school_priority_idx on public.tasks (school_id, priority);
create index if not exists tasks_school_assignee_idx on public.tasks (school_id, assigned_to);

create or replace function public.get_dashboard_data(
  p_school_scope text default null,
  p_status text default null,
  p_priority text default null,
  p_assignee_id uuid default null,
  p_department text default null,
  p_recurrence text default null,
  p_due_from date default null,
  p_due_to date default null,
  p_search text default null
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with eligible_tasks as materialized (
    select
      task.*,
      case
        when task.status not in ('completed', 'archived')
          and task.due_date::date < current_date then 'overdue'
        when task.status = 'pending' then 'new'
        else task.status
      end as effective_status
    from public.tasks task
    where public.is_active_user()
      and case
        when p_school_scope is null or p_school_scope = 'all' then true
        else task.school_id = p_school_scope::uuid
      end
      and (p_priority is null or task.priority = p_priority)
      and (p_assignee_id is null or task.assigned_to = p_assignee_id)
      and (p_department is null or task.department_name = p_department)
      and (p_recurrence is null or coalesce(task.recurrence_type, 'once') = p_recurrence)
      and (p_due_from is null or task.due_date::date >= p_due_from)
      and (p_due_to is null or task.due_date::date <= p_due_to)
      and (
        p_search is null or btrim(p_search) = '' or
        task.title ilike '%' || btrim(p_search) || '%' or
        coalesce(task.description, '') ilike '%' || btrim(p_search) || '%' or
        task.task_number ilike '%' || btrim(p_search) || '%'
      )
  ),
  scoped_tasks as materialized (
    select task.*
    from eligible_tasks task
    where p_status is null or task.effective_status = p_status
  ),
  summary as (
    select
      count(*)::integer as total_tasks,
      count(*) filter (where effective_status = 'completed')::integer as completed_tasks,
      count(*) filter (where effective_status = 'new')::integer as pending_tasks,
      count(*) filter (where effective_status not in ('completed', 'archived'))::integer as active_tasks,
      count(*) filter (where effective_status = 'overdue')::integer as overdue_tasks,
      coalesce(round(avg(progress)), 0)::integer as average_progress
    from scoped_tasks
  ),
  priority_groups as (
    select priority, count(*)::integer as task_count
    from scoped_tasks
    group by priority
  ),
  status_groups as (
    select effective_status as status, count(*)::integer as task_count
    from scoped_tasks
    group by effective_status
  ),
  department_groups as (
    select
      coalesce(nullif(department_name, ''), 'غير محدد') as department,
      count(*)::integer as task_count,
      coalesce(round(avg(progress)), 0)::integer as average_progress
    from scoped_tasks
    group by coalesce(nullif(department_name, ''), 'غير محدد')
  ),
  assignee_groups as (
    select
      task.assigned_to as user_id,
      coalesce(profile.full_name, 'غير مسندة') as full_name,
      count(*)::integer as task_count,
      count(*) filter (where task.effective_status = 'completed')::integer as completed_count,
      count(*) filter (where task.effective_status = 'overdue')::integer as overdue_count
    from scoped_tasks task
    left join public.profiles profile on profile.id = task.assigned_to
    group by task.assigned_to, profile.full_name
  )
  select jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'totalTasks', total_tasks,
        'completedTasks', completed_tasks,
        'pendingTasks', pending_tasks,
        'activeTasks', active_tasks,
        'overdueTasks', overdue_tasks,
        'completionPercentage', case when total_tasks = 0 then 0 else round(completed_tasks * 100.0 / total_tasks)::integer end,
        'averageProgress', average_progress
      ) from summary
    ),
    'byPriority', coalesce((
      select jsonb_agg(jsonb_build_object('priority', priority, 'count', task_count) order by task_count desc, priority)
      from priority_groups
    ), '[]'::jsonb),
    'byStatus', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'count', task_count) order by task_count desc, status)
      from status_groups
    ), '[]'::jsonb),
    'byDepartment', coalesce((
      select jsonb_agg(jsonb_build_object(
        'department', department,
        'count', task_count,
        'averageProgress', average_progress
      ) order by task_count desc, department)
      from department_groups
    ), '[]'::jsonb),
    'byAssignee', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', user_id,
        'name', full_name,
        'count', task_count,
        'completed', completed_count,
        'overdue', overdue_count
      ) order by task_count desc, full_name)
      from assignee_groups
    ), '[]'::jsonb),
    'recentActivity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'schoolId', recent.school_id,
        'userId', recent.user_id,
        'type', recent.action,
        'title', coalesce(recent.details->>'title', recent.action),
        'description', coalesce(recent.details->>'description', ''),
        'createdAt', recent.created_at
      ) order by recent.created_at desc)
      from (
        select activity.*
        from public.activity_logs activity
        where case
          when p_school_scope is null or p_school_scope = 'all' then true
          else activity.school_id = p_school_scope::uuid
        end
        order by activity.created_at desc
        limit 6
      ) recent
    ), '[]'::jsonb),
    'upcomingDeadlines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', upcoming.id,
        'taskNumber', upcoming.task_number,
        'title', upcoming.title,
        'department', upcoming.department_name,
        'assigneeId', upcoming.assigned_to,
        'assigneeName', coalesce(profile.full_name, 'غير مسندة'),
        'dueDate', upcoming.due_date,
        'status', upcoming.effective_status,
        'priority', upcoming.priority
      ) order by upcoming.due_date, upcoming.created_at)
      from (
        select task.*
        from scoped_tasks task
        where task.effective_status not in ('completed', 'archived', 'overdue')
          and task.due_date::date >= current_date
        order by task.due_date, task.created_at
        limit 6
      ) upcoming
      left join public.profiles profile on profile.id = upcoming.assigned_to
    ), '[]'::jsonb),
    'overdueTaskItems', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', overdue.id,
        'taskNumber', overdue.task_number,
        'title', overdue.title,
        'department', overdue.department_name,
        'assigneeId', overdue.assigned_to,
        'assigneeName', coalesce(profile.full_name, 'غير مسندة'),
        'dueDate', overdue.due_date,
        'status', overdue.effective_status,
        'priority', overdue.priority
      ) order by overdue.due_date, overdue.created_at)
      from (
        select task.*
        from scoped_tasks task
        where task.effective_status = 'overdue'
        order by task.due_date, task.created_at
        limit 5
      ) overdue
      left join public.profiles profile on profile.id = overdue.assigned_to
    ), '[]'::jsonb)
  );
$$;

drop trigger if exists task_change_events on public.tasks;

create or replace function public.handle_task_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  item public.tasks := coalesce(new, old);
  event_action text;
  event_title text;
  event_message text;
  notification_type text;
  notification_title text;
begin
  event_action := case
    when tg_op = 'INSERT' then 'task_created'
    when tg_op = 'DELETE' then 'task_deleted'
    when old.status is distinct from new.status then 'task_status'
    else 'task_updated'
  end;
  event_title := case event_action
    when 'task_created' then 'تم إنشاء مهمة'
    when 'task_deleted' then 'تم حذف مهمة'
    when 'task_status' then 'تم تحديث حالة المهمة'
    else 'تم تحديث مهمة'
  end;
  event_message := item.task_number || ' - ' || item.title;

  if tg_op = 'INSERT' and item.assigned_to is not null and item.assigned_to is distinct from auth.uid() then
    insert into public.notifications (
      school_id, user_id, title, message, type, related_task_id, dedupe_key
    ) values (
      item.school_id,
      item.assigned_to,
      'تم إسناد مهمة إليك',
      event_message,
      'task_assigned',
      item.id,
      'task-assigned:' || item.id || ':' || item.assigned_to || ':' || extract(epoch from item.updated_at)::bigint
    ) on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;
  elsif tg_op = 'UPDATE' then
    if new.assigned_to is distinct from old.assigned_to then
      if new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
        insert into public.notifications (
          school_id, user_id, title, message, type, related_task_id, dedupe_key
        ) values (
          new.school_id,
          new.assigned_to,
          'تم إسناد مهمة إليك',
          event_message,
          'task_assigned',
          new.id,
          'task-assigned:' || new.id || ':' || new.assigned_to || ':' || extract(epoch from new.updated_at)::bigint
        ) on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;
      end if;

      if old.assigned_to is not null
        and old.assigned_to is distinct from auth.uid()
        and exists (select 1 from public.profiles profile where profile.id = old.assigned_to) then
        insert into public.notifications (
          school_id, user_id, title, message, type, related_task_id, dedupe_key
        ) values (
          new.school_id,
          old.assigned_to,
          'تم إلغاء إسناد مهمة',
          event_message,
          'task_unassigned',
          new.id,
          'task-unassigned:' || new.id || ':' || old.assigned_to || ':' || extract(epoch from new.updated_at)::bigint
        ) on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;
      end if;
    end if;

    notification_type := case when old.status is distinct from new.status then 'task_status' else 'task_updated' end;
    notification_title := case when notification_type = 'task_status' then 'تم تحديث حالة المهمة' else 'تم تحديث مهمة مرتبطة بك' end;
    insert into public.notifications (
      school_id, user_id, title, message, type, related_task_id, dedupe_key
    )
    select
      new.school_id,
      recipient.id,
      notification_title,
      event_message,
      notification_type,
      new.id,
      notification_type || ':' || new.id || ':' || extract(epoch from new.updated_at)::bigint
    from (
      select new.assigned_to as id
      union
      select new.created_by
    ) recipient
    where recipient.id is not null
      and recipient.id is distinct from auth.uid()
      and not (new.assigned_to is distinct from old.assigned_to and recipient.id = new.assigned_to)
    on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;
  elsif tg_op = 'DELETE' and item.source_task_id is null then
    insert into public.notifications (
      school_id, user_id, title, message, type, related_task_id, dedupe_key
    )
    select
      item.school_id,
      recipient.id,
      'تم حذف مهمة مرتبطة بك',
      event_message,
      'task_deleted',
      null,
      'task-deleted:' || item.id || ':' || extract(epoch from item.updated_at)::bigint
    from (
      select item.assigned_to as id
      union
      select item.created_by
    ) recipient
    where recipient.id is not null
      and recipient.id is distinct from auth.uid()
      and exists (select 1 from public.profiles profile where profile.id = recipient.id)
    on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;

    insert into public.notifications (
      school_id, user_id, title, message, type, related_task_id, dedupe_key
    )
    select
      item.school_id,
      administrator.id,
      'تنبيه إداري: تم حذف مهمة',
      event_message,
      'admin_alert',
      null,
      'admin-task-deleted:' || item.id || ':' || extract(epoch from item.updated_at)::bigint
    from public.profiles administrator
    where administrator.status = 'active'
      and (
        administrator.role = 'general_manager' or
        (administrator.school_id = item.school_id and administrator.role in ('school_principal', 'deputy_principal'))
      )
      and administrator.id is distinct from auth.uid()
      and administrator.id is distinct from item.assigned_to
      and administrator.id is distinct from item.created_by
    on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;
  end if;

  insert into public.activity_logs (school_id, user_id, action, entity_type, entity_id, details)
  values (
    item.school_id,
    coalesce(auth.uid(), item.created_by),
    event_action,
    'task',
    item.id,
    jsonb_build_object('title', event_title, 'description', event_message)
  );

  insert into public.audit_logs (school_id, user_id, action, severity, details)
  values (
    item.school_id,
    coalesce(auth.uid(), item.created_by),
    event_action,
    case when tg_op = 'DELETE' then 'high' else 'medium' end,
    jsonb_build_object('targetType', 'task', 'targetId', item.id, 'message', event_message)
  );

  return coalesce(new, old);
end;
$$;

create trigger task_change_events
after insert or update or delete on public.tasks
for each row execute function public.handle_task_change();

create or replace function public.sync_task_notifications(p_school_scope text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  reminder_count integer := 0;
  overdue_count integer := 0;
  admin_count integer := 0;
  requested_school_id uuid := case
    when p_school_scope is null or p_school_scope = 'all' then null
    else p_school_scope::uuid
  end;
begin
  if not public.is_active_user() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  insert into public.notifications (
    school_id, user_id, title, message, type, related_task_id, dedupe_key
  )
  select
    task.school_id,
    recipient.id,
    'تذكير بموعد الاستحقاق',
    task.task_number || ' يستحق اليوم.',
    'deadline_reminder',
    task.id,
    'deadline-reminder:' || task.id || ':' || task.due_date::date
  from public.tasks task
  cross join lateral (
    select task.assigned_to as id
    union
    select task.created_by
  ) recipient
  where recipient.id is not null
    and task.due_date::date = current_date
    and task.status not in ('completed', 'archived')
    and (
      (public.current_user_role() = 'general_manager' and (
        requested_school_id is null or task.school_id = requested_school_id
      )) or
      (public.current_user_role() in ('general_secretary', 'school_principal', 'deputy_principal', 'school_secretary') and task.school_id = public.current_user_school_id()) or
      task.assigned_to = auth.uid() or
      task.created_by = auth.uid()
    )
  on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;
  get diagnostics reminder_count = row_count;

  insert into public.notifications (
    school_id, user_id, title, message, type, related_task_id, dedupe_key
  )
  select
    task.school_id,
    recipient.id,
    'تنبيه مهمة متأخرة',
    task.task_number || ' متأخرة منذ ' || task.due_date::date || '.',
    'overdue_alert',
    task.id,
    'overdue-alert:' || task.id || ':' || current_date
  from public.tasks task
  cross join lateral (
    select task.assigned_to as id
    union
    select task.created_by
  ) recipient
  where recipient.id is not null
    and task.due_date::date < current_date
    and task.status not in ('completed', 'archived')
    and (
      (public.current_user_role() = 'general_manager' and (
        requested_school_id is null or task.school_id = requested_school_id
      )) or
      (public.current_user_role() in ('general_secretary', 'school_principal', 'deputy_principal', 'school_secretary') and task.school_id = public.current_user_school_id()) or
      task.assigned_to = auth.uid() or
      task.created_by = auth.uid()
    )
  on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;
  get diagnostics overdue_count = row_count;

  insert into public.notifications (
    school_id, user_id, title, message, type, related_task_id, dedupe_key
  )
  select
    task.school_id,
    administrator.id,
    'تنبيه إداري: مهمة متأخرة',
    task.task_number || ' متأخرة منذ ' || task.due_date::date || '.',
    'admin_alert',
    task.id,
    'admin-overdue:' || task.id || ':' || current_date
  from public.tasks task
  join public.profiles administrator on administrator.status = 'active' and (
    administrator.role = 'general_manager' or
    (administrator.school_id = task.school_id and administrator.role in ('school_principal', 'deputy_principal'))
  )
  where task.due_date::date < current_date
    and task.status not in ('completed', 'archived')
    and administrator.id is distinct from task.assigned_to
    and administrator.id is distinct from task.created_by
    and (
      (public.current_user_role() = 'general_manager' and (
        requested_school_id is null or task.school_id = requested_school_id
      )) or
      (public.current_user_role() in ('school_principal', 'deputy_principal') and task.school_id = public.current_user_school_id())
    )
  on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;
  get diagnostics admin_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'processed', reminder_count + overdue_count + admin_count,
    'deadlineReminders', reminder_count,
    'overdueAlerts', overdue_count,
    'adminAlerts', admin_count
  );
end;
$$;

create or replace function public.send_manual_notification(
  p_audience text default 'school',
  p_recipient_id uuid default null,
  p_title text default '',
  p_message text default '',
  p_school_scope uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles;
  target_school_id uuid;
  sent_count integer := 0;
  dedupe_seed text := 'manual:' || gen_random_uuid()::text;
begin
  select *
  into actor
  from public.profiles
  where id = auth.uid()
    and status = 'active';

  if actor.id is null or actor.role not in ('general_manager', 'school_principal') then
    raise exception 'لا توجد صلاحية لإرسال الإشعارات' using errcode = '42501';
  end if;

  if nullif(btrim(p_title), '') is null or nullif(btrim(p_message), '') is null then
    raise exception 'عنوان الرسالة ونصها مطلوبان' using errcode = '22023';
  end if;

  if p_audience not in ('all', 'school', 'user') then
    raise exception 'نطاق الإرسال غير صحيح' using errcode = '22023';
  end if;

  if p_audience = 'all' and actor.role <> 'general_manager' then
    raise exception 'الإرسال لكل النظام خاص بمدير الإدارة العامة' using errcode = '42501';
  end if;

  if p_audience = 'user' then
    if p_recipient_id is null then
      raise exception 'اختر مستخدمًا لإرسال الرسالة' using errcode = '22023';
    end if;

    insert into public.notifications (school_id, user_id, title, message, type, dedupe_key)
    select
      recipient.school_id,
      recipient.id,
      btrim(p_title),
      btrim(p_message),
      'manual',
      dedupe_seed || ':' || recipient.id
    from public.profiles recipient
    where recipient.id = p_recipient_id
      and recipient.status = 'active'
      and (
        actor.role = 'general_manager'
        or recipient.school_id = actor.school_id
      )
    on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;
    get diagnostics sent_count = row_count;
  elsif p_audience = 'school' then
    target_school_id := case
      when actor.role = 'general_manager' then coalesce(p_school_scope, actor.school_id)
      else actor.school_id
    end;

    if target_school_id is null then
      raise exception 'اختر المدرسة المطلوبة' using errcode = '22023';
    end if;

    insert into public.notifications (school_id, user_id, title, message, type, dedupe_key)
    select
      recipient.school_id,
      recipient.id,
      btrim(p_title),
      btrim(p_message),
      'manual',
      dedupe_seed || ':' || recipient.id
    from public.profiles recipient
    where recipient.school_id = target_school_id
      and recipient.status = 'active'
    on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;
    get diagnostics sent_count = row_count;
  else
    insert into public.notifications (school_id, user_id, title, message, type, dedupe_key)
    select
      recipient.school_id,
      recipient.id,
      btrim(p_title),
      btrim(p_message),
      'manual',
      dedupe_seed || ':' || recipient.id
    from public.profiles recipient
    where recipient.status = 'active'
    on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;
    get diagnostics sent_count = row_count;
  end if;

  insert into public.activity_logs (school_id, user_id, action, entity_type, details)
  values (
    coalesce(target_school_id, actor.school_id),
    actor.id,
    'manual_notification_sent',
    'notification',
    jsonb_build_object('title', btrim(p_title), 'description', btrim(p_message), 'audience', p_audience, 'sent', sent_count)
  );

  insert into public.audit_logs (school_id, user_id, action, severity, details)
  values (
    coalesce(target_school_id, actor.school_id),
    actor.id,
    'manual_notification_sent',
    'medium',
    jsonb_build_object('targetType', 'notification', 'message', btrim(p_title), 'audience', p_audience, 'sent', sent_count)
  );

  return jsonb_build_object('ok', true, 'sent', sent_count);
end;
$$;

revoke execute on function public.get_dashboard_data(text, text, text, uuid, text, text, date, date, text) from public, anon;
revoke execute on function public.handle_task_change() from public, anon, authenticated;
revoke execute on function public.sync_task_notifications(text) from public, anon;
revoke execute on function public.send_manual_notification(text, uuid, text, text, uuid) from public, anon;

grant execute on function public.get_dashboard_data(text, text, text, uuid, text, text, date, date, text) to authenticated;
grant execute on function public.sync_task_notifications(text) to authenticated;
grant execute on function public.send_manual_notification(text, uuid, text, text, uuid) to authenticated;

do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array['schools', 'tasks', 'activity_logs', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
exception when undefined_object then
  null;
end;
$$;

commit;
