begin;

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
        administrator.role = 'super_admin' or
        (administrator.school_id = item.school_id and administrator.role in ('school_admin', 'deputy_principal'))
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
      (public.current_user_role() = 'super_admin' and (
        requested_school_id is null or task.school_id = requested_school_id
      )) or
      (public.current_user_role() in ('school_admin', 'deputy_principal') and task.school_id = public.current_user_school_id()) or
      (public.current_user_role() = 'supervisor'
        and task.school_id = public.current_user_school_id()
        and task.department_name = public.current_user_department_name()) or
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
      (public.current_user_role() = 'super_admin' and (
        requested_school_id is null or task.school_id = requested_school_id
      )) or
      (public.current_user_role() in ('school_admin', 'deputy_principal') and task.school_id = public.current_user_school_id()) or
      (public.current_user_role() = 'supervisor'
        and task.school_id = public.current_user_school_id()
        and task.department_name = public.current_user_department_name()) or
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
    administrator.role = 'super_admin' or
    (administrator.school_id = task.school_id and administrator.role in ('school_admin', 'deputy_principal'))
  )
  where task.due_date::date < current_date
    and task.status not in ('completed', 'archived')
    and administrator.id is distinct from task.assigned_to
    and administrator.id is distinct from task.created_by
    and (
      (public.current_user_role() = 'super_admin' and (
        requested_school_id is null or task.school_id = requested_school_id
      )) or
      (public.current_user_role() in ('school_admin', 'deputy_principal') and task.school_id = public.current_user_school_id())
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

revoke execute on function public.handle_task_change() from public, anon, authenticated;
revoke execute on function public.sync_task_notifications(text) from public, anon;
grant execute on function public.sync_task_notifications(text) to authenticated;

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
using (public.is_active_user() and user_id = auth.uid())
with check (public.is_active_user() and user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when undefined_object then
  null;
end;
$$;

commit;
