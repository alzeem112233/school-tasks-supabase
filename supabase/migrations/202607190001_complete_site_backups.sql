begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('site-backups', 'site-backups', false, 10485760)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

create or replace function public.create_complete_backup_internal(
  p_school_id uuid,
  p_actor_id uuid,
  p_include_all boolean default false,
  p_client_settings jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles;
  backup_id uuid := gen_random_uuid();
  backup_payload jsonb;
  counts jsonb;
  backup_label text;
  backup_school_id uuid;
begin
  select * into actor from public.profiles where id = p_actor_id and status = 'active';
  if not found or actor.role not in ('general_manager', 'school_principal') then
    raise exception 'Backup creation is restricted to administrators' using errcode = '42501';
  end if;
  if p_include_all and actor.role <> 'general_manager' then
    raise exception 'A complete site backup is restricted to the general manager' using errcode = '42501';
  end if;
  if not p_include_all and actor.role <> 'general_manager' and actor.school_id is distinct from p_school_id then
    raise exception 'Cross-school backup creation is forbidden' using errcode = '42501';
  end if;
  if not p_include_all and not exists (select 1 from public.schools where id = p_school_id) then
    raise exception 'School not found' using errcode = 'P0002';
  end if;

  backup_school_id := case when p_include_all then actor.school_id else p_school_id end;

  select jsonb_build_object(
    'schemaVersion', 2,
    'scopeType', case when p_include_all then 'site' else 'school' end,
    'schoolId', backup_school_id,
    'generatedAt', now(),
    'schools', coalesce((
      select jsonb_agg(to_jsonb(school) order by school.created_at)
      from public.schools school
      where p_include_all or school.id = p_school_id
    ), '[]'::jsonb),
    'profiles', coalesce((
      select jsonb_agg(to_jsonb(profile) order by profile.created_at)
      from public.profiles profile
      where p_include_all or profile.school_id = p_school_id
    ), '[]'::jsonb),
    'departments', coalesce((
      select jsonb_agg(to_jsonb(department) order by department.created_at)
      from public.departments department
      where p_include_all or department.school_id = p_school_id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(task) order by task.created_at)
      from public.tasks task
      where p_include_all or task.school_id = p_school_id
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(to_jsonb(attachment) order by attachment.created_at)
      from public.attachments attachment
      where p_include_all or attachment.school_id = p_school_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(notification) order by notification.created_at)
      from public.notifications notification
      where p_include_all or notification.school_id = p_school_id
    ), '[]'::jsonb),
    'activityLogs', coalesce((
      select jsonb_agg(to_jsonb(activity) order by activity.created_at)
      from public.activity_logs activity
      where p_include_all or activity.school_id = p_school_id
    ), '[]'::jsonb),
    'auditLogs', coalesce((
      select jsonb_agg(to_jsonb(audit) order by audit.created_at)
      from public.audit_logs audit
      where p_include_all or audit.school_id = p_school_id
    ), '[]'::jsonb),
    'appSettings', coalesce(p_client_settings, '{}'::jsonb),
    'storageFiles', '[]'::jsonb
  ) into backup_payload;

  counts := jsonb_build_object(
    'scopeType', case when p_include_all then 'site' else 'school' end,
    'schools', jsonb_array_length(backup_payload->'schools'),
    'profiles', jsonb_array_length(backup_payload->'profiles'),
    'departments', jsonb_array_length(backup_payload->'departments'),
    'tasks', jsonb_array_length(backup_payload->'tasks'),
    'attachments', jsonb_array_length(backup_payload->'attachments'),
    'notifications', jsonb_array_length(backup_payload->'notifications'),
    'activityLogs', jsonb_array_length(backup_payload->'activityLogs'),
    'auditLogs', jsonb_array_length(backup_payload->'auditLogs'),
    'storageFiles', 0
  );

  backup_label := case
    when p_include_all then 'نسخة كاملة للموقع '
    else 'نسخة كاملة للفرع '
  end || to_char(now() at time zone 'Asia/Aden', 'YYYY-MM-DD HH24:MI');

  insert into public.backups (id, school_id, created_by, backup_name, backup_data, entity_counts)
  values (backup_id, backup_school_id, p_actor_id, backup_label, backup_payload, counts);

  insert into public.activity_logs (school_id, user_id, action, entity_type, entity_id, details)
  values (backup_school_id, p_actor_id, 'backup_created', 'backup', backup_id,
    jsonb_build_object('title', 'تم إنشاء نسخة احتياطية كاملة', 'description', backup_label));
  insert into public.audit_logs (school_id, user_id, action, severity, details)
  values (backup_school_id, p_actor_id, 'backup_created', 'high',
    jsonb_build_object('targetType', 'backup', 'targetId', backup_id, 'message', backup_label, 'entityCounts', counts));

  return jsonb_build_object(
    'ok', true,
    'backupId', backup_id,
    'label', backup_label,
    'scopeType', case when p_include_all then 'site' else 'school' end,
    'entityCounts', counts
  );
end;
$$;

create or replace function public.restore_complete_backup_internal(
  p_backup_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles;
  item public.backups;
  data jsonb;
  schools_data jsonb;
  array_name text;
  is_site_backup boolean;
  schema_version integer;
begin
  select * into actor from public.profiles where id = p_actor_id and status = 'active';
  if not found or actor.role not in ('general_manager', 'school_principal') then
    raise exception 'Backup restore is restricted to administrators' using errcode = '42501';
  end if;

  select * into item from public.backups where id = p_backup_id;
  if not found then raise exception 'Backup not found' using errcode = 'P0002'; end if;

  data := item.backup_data;
  schema_version := coalesce((data->>'schemaVersion')::integer, 0);
  is_site_backup := coalesce(data->>'scopeType', 'school') = 'site';
  if schema_version not in (1, 2) then
    raise exception 'Backup format is not supported' using errcode = '23514';
  end if;
  if is_site_backup and actor.role <> 'general_manager' then
    raise exception 'A complete site restore is restricted to the general manager' using errcode = '42501';
  end if;
  if not is_site_backup and actor.role <> 'general_manager' and actor.school_id is distinct from item.school_id then
    raise exception 'Cross-school backup restore is forbidden' using errcode = '42501';
  end if;
  if not is_site_backup and (data->>'schoolId')::uuid is distinct from item.school_id then
    raise exception 'Backup school scope is invalid' using errcode = '23514';
  end if;

  schools_data := case
    when jsonb_typeof(data->'schools') = 'array' then data->'schools'
    when data ? 'school' and data->'school' is not null then jsonb_build_array(data->'school')
    else '[]'::jsonb
  end;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(data->'profiles', '[]'::jsonb)) value
    where (value->>'id')::uuid = p_actor_id and coalesce(value->>'status', 'active') = 'active'
  ) then
    raise exception 'The current administrator is not active in this backup' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(data->'profiles', '[]'::jsonb)) value
    where not exists (select 1 from auth.users account where account.id = (value->>'id')::uuid)
  ) then
    raise exception 'Backup contains a user account that no longer exists in authentication' using errcode = '23503';
  end if;

  if not is_site_backup then
    foreach array_name in array array['profiles', 'departments', 'tasks', 'attachments', 'notifications', 'activityLogs', 'auditLogs'] loop
      if exists (
        select 1 from jsonb_array_elements(coalesce(data->array_name, '[]'::jsonb)) value
        where nullif(value->>'school_id', '') is not null and (value->>'school_id')::uuid <> item.school_id
      ) then
        raise exception 'Backup contains cross-school records in %', array_name using errcode = '23514';
      end if;
    end loop;
  end if;

  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
  perform set_config('app.secure_restore', 'on', true);

  if is_site_backup then
    delete from public.attachments;
    delete from public.notifications;
    delete from public.tasks;
    delete from public.departments;
    delete from public.activity_logs;
    delete from public.audit_logs;
    update public.profiles
      set status = 'inactive', updated_at = now()
      where id not in (
        select (value->>'id')::uuid from jsonb_array_elements(coalesce(data->'profiles', '[]'::jsonb)) value
      );
    update public.schools
      set status = 'inactive', updated_at = now()
      where id not in (
        select (value->>'id')::uuid from jsonb_array_elements(schools_data) value
      );
  else
    delete from public.attachments where school_id = item.school_id;
    delete from public.notifications where school_id = item.school_id;
    delete from public.tasks where school_id = item.school_id;
    delete from public.departments where school_id = item.school_id;
    delete from public.activity_logs where school_id = item.school_id;
    delete from public.audit_logs where school_id = item.school_id;
    update public.profiles
      set status = 'inactive', updated_at = now()
      where school_id = item.school_id
        and id not in (
          select (value->>'id')::uuid from jsonb_array_elements(coalesce(data->'profiles', '[]'::jsonb)) value
        );
  end if;

  insert into public.schools (id, name, status, created_at, updated_at)
  select id, name, coalesce(status, 'active'), coalesce(created_at, now()), coalesce(updated_at, now())
  from jsonb_to_recordset(schools_data) as restored_school(
    id uuid, name text, status text, created_at timestamptz, updated_at timestamptz
  )
  on conflict (id) do update set
    name = excluded.name,
    status = excluded.status,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  insert into public.profiles (
    id, school_id, full_name, email, role, status, avatar_url, department_name,
    created_at, updated_at, access_flags
  )
  select
    id, school_id, full_name, email, role, coalesce(status, 'active'), avatar_url, department_name,
    coalesce(created_at, now()), coalesce(updated_at, now()), coalesce(access_flags, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(data->'profiles', '[]'::jsonb)) as restored_profile(
    id uuid, school_id uuid, full_name text, email text, role text, status text,
    avatar_url text, department_name text, created_at timestamptz, updated_at timestamptz, access_flags jsonb
  )
  on conflict (id) do update set
    school_id = excluded.school_id,
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role,
    status = excluded.status,
    avatar_url = excluded.avatar_url,
    department_name = excluded.department_name,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    access_flags = excluded.access_flags;

  insert into public.departments
  select * from jsonb_populate_recordset(null::public.departments, coalesce(data->'departments', '[]'::jsonb))
  on conflict (id) do update set
    school_id = excluded.school_id,
    name = excluded.name,
    description = excluded.description,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

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
  insert into public.audit_logs
  select * from jsonb_populate_recordset(null::public.audit_logs, coalesce(data->'auditLogs', '[]'::jsonb))
  on conflict (id) do nothing;

  insert into public.activity_logs (school_id, user_id, action, entity_type, entity_id, details)
  values (item.school_id, p_actor_id, 'backup_restored', 'backup', item.id,
    jsonb_build_object('title', 'تمت استعادة نسخة احتياطية كاملة', 'description', item.backup_name));
  insert into public.audit_logs (school_id, user_id, action, severity, details)
  values (item.school_id, p_actor_id, 'backup_restored', 'critical',
    jsonb_build_object('targetType', 'backup', 'targetId', item.id, 'message', item.backup_name, 'entityCounts', item.entity_counts));

  return jsonb_build_object(
    'ok', true,
    'backupId', item.id,
    'schoolId', item.school_id,
    'scopeType', case when is_site_backup then 'site' else 'school' end,
    'entityCounts', item.entity_counts,
    'appSettings', coalesce(data->'appSettings', '{}'::jsonb)
  );
end;
$$;

grant execute on function public.create_complete_backup_internal(uuid, uuid, boolean, jsonb) to service_role;
grant execute on function public.restore_complete_backup_internal(uuid, uuid) to service_role;
revoke execute on function public.create_complete_backup_internal(uuid, uuid, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.restore_complete_backup_internal(uuid, uuid) from public, anon, authenticated;

commit;
