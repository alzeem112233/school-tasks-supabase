begin;

revoke execute on function public.create_backup(uuid) from public, anon, authenticated;
revoke execute on function public.restore_backup(text) from public, anon, authenticated;

revoke select on table public.backups from authenticated;
grant select (id, school_id, created_by, backup_name, created_at, entity_counts) on table public.backups to authenticated;

create or replace function public.create_backup_internal(p_school_id uuid, p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles;
  backup_id uuid := gen_random_uuid();
  backup_payload jsonb;
  counts jsonb;
  backup_label text;
begin
  select * into actor from public.profiles where id = p_actor_id and status = 'active';
  if not found or actor.role not in ('super_admin', 'school_admin') then
    raise exception 'Backup creation is restricted to administrators' using errcode = '42501';
  end if;
  if actor.role <> 'super_admin' and actor.school_id is distinct from p_school_id then
    raise exception 'Cross-school backup creation is forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.schools where id = p_school_id) then
    raise exception 'School not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'schemaVersion', 1,
    'schoolId', p_school_id,
    'generatedAt', now(),
    'school', (select to_jsonb(school) from public.schools school where school.id = p_school_id),
    'profiles', coalesce((select jsonb_agg(to_jsonb(profile) order by profile.created_at) from public.profiles profile where profile.school_id = p_school_id), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(to_jsonb(department) order by department.created_at) from public.departments department where department.school_id = p_school_id), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(task) order by task.created_at) from public.tasks task where task.school_id = p_school_id), '[]'::jsonb),
    'attachments', coalesce((select jsonb_agg(to_jsonb(attachment) order by attachment.created_at) from public.attachments attachment where attachment.school_id = p_school_id), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(notification) order by notification.created_at) from public.notifications notification where notification.school_id = p_school_id), '[]'::jsonb),
    'activityLogs', coalesce((select jsonb_agg(to_jsonb(activity) order by activity.created_at) from public.activity_logs activity where activity.school_id = p_school_id), '[]'::jsonb),
    'auditLogs', coalesce((select jsonb_agg(to_jsonb(audit) order by audit.created_at) from public.audit_logs audit where audit.school_id = p_school_id), '[]'::jsonb)
  ) into backup_payload;

  counts := jsonb_build_object(
    'profiles', jsonb_array_length(backup_payload->'profiles'),
    'departments', jsonb_array_length(backup_payload->'departments'),
    'tasks', jsonb_array_length(backup_payload->'tasks'),
    'attachments', jsonb_array_length(backup_payload->'attachments'),
    'notifications', jsonb_array_length(backup_payload->'notifications'),
    'activityLogs', jsonb_array_length(backup_payload->'activityLogs'),
    'auditLogs', jsonb_array_length(backup_payload->'auditLogs')
  );
  backup_label := 'نسخة احتياطية ' || to_char(now() at time zone 'Asia/Aden', 'YYYY-MM-DD HH24:MI');

  insert into public.backups (id, school_id, created_by, backup_name, backup_data, entity_counts)
  values (backup_id, p_school_id, p_actor_id, backup_label, backup_payload, counts);
  insert into public.activity_logs (school_id, user_id, action, entity_type, entity_id, details)
  values (p_school_id, p_actor_id, 'backup_created', 'backup', backup_id, jsonb_build_object('title', 'تم إنشاء نسخة احتياطية', 'description', backup_label));
  insert into public.audit_logs (school_id, user_id, action, severity, details)
  values (p_school_id, p_actor_id, 'backup_created', 'high', jsonb_build_object('targetType', 'backup', 'targetId', backup_id, 'message', backup_label, 'entityCounts', counts));

  return jsonb_build_object('ok', true, 'backupId', backup_id, 'label', backup_label, 'entityCounts', counts);
end;
$$;

create or replace function public.restore_backup_internal(p_backup_id uuid, p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles;
  item public.backups;
  data jsonb;
  array_name text;
begin
  select * into actor from public.profiles where id = p_actor_id and status = 'active';
  if not found or actor.role not in ('super_admin', 'school_admin') then
    raise exception 'Backup restore is restricted to administrators' using errcode = '42501';
  end if;
  select * into item from public.backups where id = p_backup_id;
  if not found then raise exception 'Backup not found' using errcode = 'P0002'; end if;
  if actor.role <> 'super_admin' and actor.school_id is distinct from item.school_id then
    raise exception 'Cross-school backup restore is forbidden' using errcode = '42501';
  end if;
  data := item.backup_data;
  if coalesce((data->>'schemaVersion')::integer, 0) <> 1 or (data->>'schoolId')::uuid is distinct from item.school_id then
    raise exception 'Backup format or school scope is invalid' using errcode = '23514';
  end if;

  foreach array_name in array array['profiles', 'departments', 'tasks', 'attachments', 'notifications', 'activityLogs', 'auditLogs'] loop
    if exists (
      select 1 from jsonb_array_elements(coalesce(data->array_name, '[]'::jsonb)) value
      where nullif(value->>'school_id', '') is not null and (value->>'school_id')::uuid <> item.school_id
    ) then
      raise exception 'Backup contains cross-school records in %', array_name using errcode = '23514';
    end if;
  end loop;

  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
  perform set_config('app.secure_restore', 'on', true);

  delete from public.attachments where school_id = item.school_id;
  delete from public.tasks where school_id = item.school_id;
  delete from public.notifications where school_id = item.school_id;
  delete from public.departments where school_id = item.school_id;

  insert into public.departments
  select * from jsonb_populate_recordset(null::public.departments, coalesce(data->'departments', '[]'::jsonb))
  on conflict (id) do update set name = excluded.name, description = excluded.description, updated_at = excluded.updated_at;
  insert into public.tasks
  select * from jsonb_populate_recordset(null::public.tasks, coalesce(data->'tasks', '[]'::jsonb))
  on conflict (id) do nothing;
  insert into public.attachments
  select * from jsonb_populate_recordset(null::public.attachments, coalesce(data->'attachments', '[]'::jsonb))
  on conflict (id) do nothing;
  insert into public.notifications
  select * from jsonb_populate_recordset(null::public.notifications, coalesce(data->'notifications', '[]'::jsonb))
  on conflict do nothing;
  insert into public.activity_logs
  select * from jsonb_populate_recordset(null::public.activity_logs, coalesce(data->'activityLogs', '[]'::jsonb))
  on conflict (id) do nothing;

  insert into public.activity_logs (school_id, user_id, action, entity_type, entity_id, details)
  values (item.school_id, p_actor_id, 'backup_restored', 'backup', item.id, jsonb_build_object('title', 'تمت استعادة نسخة احتياطية', 'description', item.backup_name));
  insert into public.audit_logs (school_id, user_id, action, severity, details)
  values (item.school_id, p_actor_id, 'backup_restored', 'critical', jsonb_build_object('targetType', 'backup', 'targetId', item.id, 'message', item.backup_name, 'entityCounts', item.entity_counts));

  return jsonb_build_object('ok', true, 'backupId', item.id, 'schoolId', item.school_id, 'entityCounts', item.entity_counts);
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
  if not found or actor.role not in ('super_admin', 'school_admin', 'deputy_principal') then
    raise exception 'Deadline checks are restricted to school management' using errcode = '42501';
  end if;
  if actor.role <> 'super_admin' and actor.school_id is distinct from p_school_id then
    raise exception 'Cross-school deadline check is forbidden' using errcode = '42501';
  end if;
  if p_mode not in ('deadline', 'overdue') then raise exception 'Invalid notification mode' using errcode = '22023'; end if;

  insert into public.notifications (school_id, user_id, title, message, type, related_task_id, dedupe_key)
  select
    task.school_id,
    recipient.id,
    case when p_mode = 'deadline' then 'تذكير بموعد الاستحقاق' else 'تنبيه مهمة متأخرة' end,
    case when p_mode = 'deadline' then task.task_number || ' يستحق اليوم.' else task.task_number || ' متأخرة منذ ' || (task.due_date at time zone 'Asia/Aden')::date || '.' end,
    case when p_mode = 'deadline' then 'deadline_reminder' else 'overdue_alert' end,
    task.id,
    case when p_mode = 'deadline' then 'deadline-reminder:' else 'overdue-alert:' end || task.id || ':' || current_date
  from public.tasks task
  cross join lateral (select task.assigned_to as id union select task.created_by) recipient
  where task.school_id = p_school_id
    and recipient.id is not null
    and task.status not in ('completed', 'archived')
    and case when p_mode = 'deadline'
      then (task.due_date at time zone 'Asia/Aden')::date = current_date
      else (task.due_date at time zone 'Asia/Aden')::date < current_date
    end
  on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;
  get diagnostics inserted_count = row_count;
  if p_mode = 'overdue' then
    insert into public.notifications (school_id, user_id, title, message, type, related_task_id, dedupe_key)
    select task.school_id, administrator.id, 'تنبيه إداري: مهمة متأخرة', task.task_number || ' متأخرة منذ ' || (task.due_date at time zone 'Asia/Aden')::date || '.', 'admin_alert', task.id, 'admin-overdue:' || task.id || ':' || current_date
    from public.tasks task
    join public.profiles administrator on administrator.status = 'active' and (
      administrator.role = 'super_admin' or
      (administrator.school_id = task.school_id and administrator.role in ('school_admin', 'deputy_principal'))
    )
    where task.school_id = p_school_id
      and task.status not in ('completed', 'archived')
      and (task.due_date at time zone 'Asia/Aden')::date < current_date
      and administrator.id is distinct from task.assigned_to
      and administrator.id is distinct from task.created_by
    on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;
    get diagnostics admin_count = row_count;
  end if;
  return jsonb_build_object('ok', true, 'mode', p_mode, 'processed', inserted_count + admin_count, 'adminAlerts', admin_count);
end;
$$;

create or replace function public.change_user_role_internal(p_user_id uuid, p_role text, p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles;
  target public.profiles;
  previous_role text;
begin
  select * into actor from public.profiles where id = p_actor_id and status = 'active';
  if not found or actor.role <> 'super_admin' then raise exception 'Only super administrators can change roles' using errcode = '42501'; end if;
  if p_role not in ('super_admin', 'school_admin', 'deputy_principal', 'supervisor', 'teacher', 'employee', 'viewer') then raise exception 'Invalid role' using errcode = '22023'; end if;
  select * into target from public.profiles where id = p_user_id;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;
  if p_role = 'supervisor' and nullif(target.department_name, '') is null then raise exception 'Supervisor department is required' using errcode = '23514'; end if;
  previous_role := target.role;
  if previous_role = p_role then return jsonb_build_object('ok', true, 'id', p_user_id, 'unchanged', true); end if;
  update public.profiles set role = p_role, updated_at = now() where id = p_user_id;
  insert into public.activity_logs (school_id, user_id, action, entity_type, entity_id, details)
  values (target.school_id, p_actor_id, 'user_role_changed', 'profile', p_user_id, jsonb_build_object('title', 'تم تغيير دور مستخدم', 'description', target.email || ': ' || previous_role || ' ← ' || p_role));
  insert into public.audit_logs (school_id, user_id, action, severity, details)
  values (target.school_id, p_actor_id, 'user_role_changed', 'critical', jsonb_build_object('targetType', 'profile', 'targetId', p_user_id, 'message', target.email || ': ' || previous_role || ' ← ' || p_role));
  insert into public.notifications (school_id, user_id, title, message, type, dedupe_key)
  values (target.school_id, p_user_id, 'تم تحديث دورك', 'تم تغيير دور حسابك إلى ' || p_role || '.', 'role_changed', 'role-change:' || p_user_id || ':' || p_role || ':' || extract(epoch from now())::bigint);
  return jsonb_build_object('ok', true, 'id', p_user_id, 'previousRole', previous_role, 'role', p_role);
end;
$$;

grant execute on function public.create_backup_internal(uuid, uuid) to service_role;
grant execute on function public.restore_backup_internal(uuid, uuid) to service_role;
grant execute on function public.generate_due_notifications_internal(text, uuid, uuid) to service_role;
grant execute on function public.change_user_role_internal(uuid, text, uuid) to service_role;
revoke execute on function public.create_backup_internal(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.restore_backup_internal(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.generate_due_notifications_internal(text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.change_user_role_internal(uuid, text, uuid) from public, anon, authenticated;

alter function public.sync_task_notifications(text) set timezone = 'Asia/Aden';
alter function public.get_dashboard_data(text, text, text, uuid, text, text, date, date, text) set timezone = 'Asia/Aden';

create or replace function public.enforce_attachment_metadata() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  secure_restore boolean := coalesce(current_setting('app.secure_restore', true), '') = 'on';
  file_extension text := lower(regexp_replace(new.file_path, '^.*\.', ''));
begin
  if not secure_restore and (not public.is_active_user() or new.uploaded_by is distinct from auth.uid()) then
    raise exception 'Attachment uploader must match the authenticated user' using errcode = '42501';
  end if;
  if new.bucket_name <> 'task-attachments' then raise exception 'Invalid attachment bucket' using errcode = '23514'; end if;
  if new.file_size is null or new.file_size <= 0 or new.file_size > 10485760 then raise exception 'Attachment size is invalid' using errcode = '23514'; end if;
  if new.file_type is null or not (
    (new.file_type = 'image/png' and file_extension = 'png') or
    (new.file_type = 'image/jpeg' and file_extension in ('jpg', 'jpeg')) or
    (new.file_type = 'image/webp' and file_extension = 'webp') or
    (new.file_type = 'image/gif' and file_extension = 'gif') or
    (new.file_type = 'application/pdf' and file_extension = 'pdf') or
    (new.file_type = 'application/msword' and file_extension = 'doc') or
    (new.file_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' and file_extension = 'docx') or
    (new.file_type = 'application/vnd.ms-excel' and file_extension = 'xls') or
    (new.file_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and file_extension = 'xlsx') or
    (new.file_type = 'application/vnd.ms-powerpoint' and file_extension = 'ppt') or
    (new.file_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' and file_extension = 'pptx')
  ) then raise exception 'Attachment type or extension is not allowed' using errcode = '23514'; end if;
  if split_part(new.file_path, '/', 1) <> new.school_id::text
    or split_part(new.file_path, '/', 2) <> new.task_id::text
    or nullif(split_part(new.file_path, '/', 3), '') is null
    or split_part(new.file_path, '/', 4) <> '' then
    raise exception 'Attachment path must use schoolId/taskId/fileName' using errcode = '23514';
  end if;
  if not exists (select 1 from public.tasks task where task.id = new.task_id and task.school_id = new.school_id) then
    raise exception 'Attachment task must belong to the same school' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_attachment_metadata() from public, anon, authenticated;

create or replace function public.audit_sensitive_task_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  item public.tasks := coalesce(new, old);
begin
  if coalesce(current_setting('app.secure_restore', true), '') = 'on' then return coalesce(new, old); end if;
  if (tg_op = 'INSERT' and new.assigned_to is not null)
    or (tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to) then
    insert into public.activity_logs (school_id, user_id, action, entity_type, entity_id, details)
    values (item.school_id, coalesce(auth.uid(), item.created_by), 'task_assigned', 'task', item.id, jsonb_build_object('title', case when tg_op = 'INSERT' then 'تم إسناد مهمة' else 'تم تغيير إسناد مهمة' end, 'description', item.task_number || ' - ' || item.title));
    insert into public.audit_logs (school_id, user_id, action, severity, details)
    values (item.school_id, coalesce(auth.uid(), item.created_by), 'task_assigned', 'high', jsonb_build_object('targetType', 'task', 'targetId', item.id, 'message', item.task_number || ' - ' || item.title, 'assignedTo', item.assigned_to));
  end if;
  if (tg_op = 'INSERT' and new.status = 'completed')
    or (tg_op = 'UPDATE' and new.status = 'completed' and old.status <> 'completed') then
    insert into public.activity_logs (school_id, user_id, action, entity_type, entity_id, details)
    values (item.school_id, coalesce(auth.uid(), item.created_by), 'task_completed', 'task', item.id, jsonb_build_object('title', 'تم إكمال مهمة', 'description', item.task_number || ' - ' || item.title));
    insert into public.audit_logs (school_id, user_id, action, severity, details)
    values (item.school_id, coalesce(auth.uid(), item.created_by), 'task_completed', 'high', jsonb_build_object('targetType', 'task', 'targetId', item.id, 'message', item.task_number || ' - ' || item.title, 'completedAt', item.completed_at));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists task_sensitive_audit on public.tasks;
create trigger task_sensitive_audit after insert or update on public.tasks
for each row execute function public.audit_sensitive_task_change();

create or replace function public.audit_attachment_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  item public.attachments := coalesce(new, old);
  action_name text := case when tg_op = 'INSERT' then 'attachment_uploaded' else 'attachment_deleted' end;
  action_title text := case when tg_op = 'INSERT' then 'تم رفع مرفق' else 'تم حذف مرفق' end;
begin
  if coalesce(current_setting('app.secure_restore', true), '') = 'on' then return coalesce(new, old); end if;
  insert into public.activity_logs (school_id, user_id, action, entity_type, entity_id, details)
  values (item.school_id, coalesce(auth.uid(), item.uploaded_by), action_name, 'attachment', item.id, jsonb_build_object('title', action_title, 'description', item.file_name, 'taskId', item.task_id));
  insert into public.audit_logs (school_id, user_id, action, severity, details)
  values (item.school_id, coalesce(auth.uid(), item.uploaded_by), action_name, 'high', jsonb_build_object('targetType', 'attachment', 'targetId', item.id, 'message', item.file_name, 'taskId', item.task_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists attachment_sensitive_audit on public.attachments;
create trigger attachment_sensitive_audit after insert or delete on public.attachments
for each row execute function public.audit_attachment_change();

revoke execute on function public.audit_sensitive_task_change() from public, anon, authenticated;
revoke execute on function public.audit_attachment_change() from public, anon, authenticated;

commit;
