-- Keep task notifications stable: one notification per user, task, and notification type.

with normalized as (
  select
    id,
    user_id,
    is_read,
    created_at,
    case
      when type = 'admin_alert' then 'admin_alert:overdue:' || related_task_id::text
      else type || ':' || related_task_id::text
    end as next_key
  from public.notifications
  where user_id is not null
    and related_task_id is not null
    and type in (
      'task_created',
      'task_updated',
      'task_status',
      'task_assigned',
      'task_unassigned',
      'task_reopened',
      'task_archived',
      'task_approved',
      'task_comment',
      'deadline_reminder',
      'overdue_alert',
      'admin_alert'
    )
),
ranked as (
  select
    id,
    row_number() over (
      partition by user_id, next_key
      order by is_read asc, created_at desc, id desc
    ) as duplicate_rank
  from normalized
)
delete from public.notifications notification
using ranked
where notification.id = ranked.id
  and ranked.duplicate_rank > 1;

with normalized as (
  select
    id,
    case
      when type = 'admin_alert' then 'admin_alert:overdue:' || related_task_id::text
      else type || ':' || related_task_id::text
    end as next_key
  from public.notifications
  where user_id is not null
    and related_task_id is not null
    and type in (
      'task_created',
      'task_updated',
      'task_status',
      'task_assigned',
      'task_unassigned',
      'task_reopened',
      'task_archived',
      'task_approved',
      'task_comment',
      'deadline_reminder',
      'overdue_alert',
      'admin_alert'
    )
)
update public.notifications notification
set dedupe_key = normalized.next_key
from normalized
where notification.id = normalized.id
  and notification.dedupe_key is distinct from normalized.next_key;

create or replace function public.handle_task_change() returns trigger
language plpgsql security definer set search_path = '' set timezone = 'Asia/Aden' as $$
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
      'task_assigned:' || item.id
    ) on conflict on constraint notifications_user_dedupe_key do nothing;
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
          'task_assigned:' || new.id
        ) on conflict on constraint notifications_user_dedupe_key do nothing;
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
          'task_unassigned:' || new.id
        ) on conflict on constraint notifications_user_dedupe_key do nothing;
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
      notification_type || ':' || new.id
    from (
      select new.assigned_to as id
      union
      select new.created_by
    ) recipient
    where recipient.id is not null
      and recipient.id is distinct from auth.uid()
      and not (new.assigned_to is distinct from old.assigned_to and recipient.id = new.assigned_to)
    on conflict on constraint notifications_user_dedupe_key do nothing;
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
      'task_deleted:' || item.id
    from (
      select item.assigned_to as id
      union
      select item.created_by
    ) recipient
    where recipient.id is not null
      and recipient.id is distinct from auth.uid()
      and exists (select 1 from public.profiles profile where profile.id = recipient.id)
    on conflict on constraint notifications_user_dedupe_key do nothing;

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
      'admin_alert:task_deleted:' || item.id
    from public.profiles administrator
    where administrator.status = 'active'
      and (
        administrator.role = 'general_manager' or
        (administrator.school_id = item.school_id and administrator.role in ('school_principal', 'deputy_principal'))
      )
      and administrator.id is distinct from auth.uid()
      and administrator.id is distinct from item.assigned_to
      and administrator.id is distinct from item.created_by
    on conflict on constraint notifications_user_dedupe_key do nothing;
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

create or replace function public.sync_task_notifications(p_school_scope text default null) returns jsonb
language plpgsql security definer set search_path = '' set timezone = 'Asia/Aden' as $$
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
    'deadline_reminder:' || task.id
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
  on conflict on constraint notifications_user_dedupe_key do nothing;
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
    'overdue_alert:' || task.id
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
  on conflict on constraint notifications_user_dedupe_key do nothing;
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
    'admin_alert:overdue:' || task.id
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
  on conflict on constraint notifications_user_dedupe_key do nothing;
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

create or replace function public.generate_due_notifications_internal(p_mode text, p_school_id uuid, p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path = '' set timezone = 'Asia/Aden' as $$
declare
  actor public.profiles;
  inserted_count integer := 0;
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
    and task.status not in ('completed', 'archived')
    and case when p_mode = 'deadline'
      then (task.due_date at time zone 'Asia/Aden')::date = current_date
      else (task.due_date at time zone 'Asia/Aden')::date < current_date
    end
  on conflict on constraint notifications_user_dedupe_key do nothing;
  get diagnostics inserted_count = row_count;

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
      and task.status not in ('completed', 'archived')
      and (task.due_date at time zone 'Asia/Aden')::date < current_date
      and administrator.id is distinct from task.assigned_to
      and administrator.id is distinct from task.created_by
    on conflict on constraint notifications_user_dedupe_key do nothing;
    get diagnostics admin_count = row_count;
  end if;

  return jsonb_build_object('ok', true, 'mode', p_mode, 'processed', inserted_count + admin_count, 'adminAlerts', admin_count);
end;
$$;

revoke execute on function public.handle_task_change() from public, anon, authenticated;
revoke execute on function public.sync_task_notifications(text) from public, anon;
revoke execute on function public.generate_due_notifications_internal(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.sync_task_notifications(text) to authenticated;
grant execute on function public.generate_due_notifications_internal(text, uuid, uuid) to service_role;
