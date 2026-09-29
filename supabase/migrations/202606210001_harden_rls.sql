begin;

alter table public.profiles add column if not exists department_name text;
create index if not exists profiles_school_department_idx on public.profiles (school_id, department_name);
create index if not exists tasks_school_department_idx on public.tasks (school_id, department_name);

insert into public.departments (school_id, name)
select distinct t.school_id, t.department_name
from public.tasks t
where t.school_id is not null and nullif(t.department_name, '') is not null
on conflict (school_id, name) do nothing;

update public.tasks t
set department_id = d.id
from public.departments d
where d.school_id = t.school_id and d.name = t.department_name
  and t.department_id is distinct from d.id;

create or replace function public.current_profile() returns public.profiles
language sql stable security definer set search_path = '' as $$
  select p from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.current_user_role() returns text
language sql stable security definer set search_path = '' as $$
  select (public.current_profile()).role;
$$;

create or replace function public.current_user_school_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select (public.current_profile()).school_id;
$$;

create or replace function public.current_user_department_name() returns text
language sql stable security definer set search_path = '' as $$
  select (public.current_profile()).department_name;
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((public.current_profile()).status = 'active', false);
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.current_user_role() = 'super_admin';
$$;

create or replace function public.can_access_school(p_school_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.current_user_role() = 'super_admin' or
    p_school_id = public.current_user_school_id()
  );
$$;

create or replace function public.can_manage_users() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.current_user_role() in ('super_admin', 'school_admin');
$$;

create or replace function public.can_manage_tasks() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.current_user_role() in ('super_admin', 'school_admin', 'deputy_principal');
$$;

create or replace function public.can_read_school_tasks() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.current_user_role() in ('super_admin', 'school_admin', 'deputy_principal', 'viewer');
$$;

create or replace function public.can_view_task_values(
  p_school_id uuid,
  p_assigned_to uuid,
  p_department_name text
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.current_user_role() = 'super_admin' or
    (
      p_school_id = public.current_user_school_id() and (
        public.current_user_role() in ('school_admin', 'deputy_principal', 'viewer') or
        (public.current_user_role() = 'supervisor' and (
          p_assigned_to = auth.uid() or
          (public.current_user_department_name() is not null and p_department_name = public.current_user_department_name())
        )) or
        (public.current_user_role() in ('teacher', 'employee') and p_assigned_to = auth.uid())
      )
    )
  );
$$;

create or replace function public.can_update_task_values(
  p_school_id uuid,
  p_assigned_to uuid,
  p_department_name text
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.current_user_role() = 'super_admin' or
    (
      p_school_id = public.current_user_school_id() and (
        public.current_user_role() in ('school_admin', 'deputy_principal') or
        (public.current_user_role() = 'supervisor' and (
          p_assigned_to = auth.uid() or
          (public.current_user_department_name() is not null and p_department_name = public.current_user_department_name())
        )) or
        (public.current_user_role() in ('teacher', 'employee') and p_assigned_to = auth.uid())
      )
    )
  );
$$;

create or replace function public.can_view_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.can_view_task_values(t.school_id, t.assigned_to, t.department_name)
    from public.tasks t where t.id = p_task_id
  ), false);
$$;

create or replace function public.can_update_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.can_update_task_values(t.school_id, t.assigned_to, t.department_name)
    from public.tasks t where t.id = p_task_id
  ), false);
$$;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.tasks enable row level security;
alter table public.attachments enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.backups enable row level security;

alter table public.schools force row level security;
alter table public.profiles force row level security;
alter table public.departments force row level security;
alter table public.tasks force row level security;
alter table public.attachments force row level security;
alter table public.notifications force row level security;
alter table public.activity_logs force row level security;
alter table public.audit_logs force row level security;
alter table public.backups force row level security;

drop policy if exists schools_read on public.schools;
drop policy if exists schools_manage on public.schools;
drop policy if exists profiles_read on public.profiles;
drop policy if exists departments_read on public.departments;
drop policy if exists departments_manage on public.departments;
drop policy if exists tasks_read on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
drop policy if exists attachments_read on public.attachments;
drop policy if exists attachments_insert on public.attachments;
drop policy if exists attachments_delete on public.attachments;
drop policy if exists notifications_read on public.notifications;
drop policy if exists notifications_update on public.notifications;
drop policy if exists activity_read on public.activity_logs;
drop policy if exists audit_read on public.audit_logs;
drop policy if exists backups_read on public.backups;

create policy schools_read on public.schools for select to authenticated
using (public.is_active_user() and (public.current_user_role() = 'super_admin' or id = public.current_user_school_id()));

create policy schools_manage on public.schools for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy profiles_read on public.profiles for select to authenticated
using (
  auth.uid() = id or
  (public.is_active_user() and (
    public.current_user_role() = 'super_admin' or school_id = public.current_user_school_id()
  ))
);

create policy departments_read on public.departments for select to authenticated
using (public.can_access_school(school_id));

create policy departments_manage on public.departments for all to authenticated
using (
  public.is_super_admin() or
  (public.current_user_role() = 'school_admin' and public.can_access_school(school_id))
)
with check (
  public.is_super_admin() or
  (public.current_user_role() = 'school_admin' and public.can_access_school(school_id))
);

create policy tasks_read on public.tasks for select to authenticated
using (public.can_view_task_values(school_id, assigned_to, department_name));

create policy tasks_insert on public.tasks for insert to authenticated
with check (
  public.can_manage_tasks() and
  public.can_access_school(school_id)
);

create policy tasks_update on public.tasks for update to authenticated
using (public.can_update_task_values(school_id, assigned_to, department_name))
with check (public.can_update_task_values(school_id, assigned_to, department_name));

create policy tasks_delete on public.tasks for delete to authenticated
using (
  public.can_manage_tasks() and
  public.can_access_school(school_id)
);

create policy attachments_read on public.attachments for select to authenticated
using (public.can_view_task(task_id));

create policy attachments_insert on public.attachments for insert to authenticated
with check (
  uploaded_by = auth.uid() and
  public.can_update_task(task_id) and
  exists (
    select 1 from public.tasks t
    where t.id = task_id and t.school_id = school_id
  )
);

create policy attachments_delete on public.attachments for delete to authenticated
using (public.can_update_task(task_id));

create policy notifications_read on public.notifications for select to authenticated
using (public.is_active_user() and (user_id = auth.uid() or public.current_user_role() = 'super_admin'));

create policy notifications_update on public.notifications for update to authenticated
using (public.is_active_user() and (user_id = auth.uid() or public.current_user_role() = 'super_admin'))
with check (public.is_active_user() and (user_id = auth.uid() or public.current_user_role() = 'super_admin'));

create policy activity_read on public.activity_logs for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'super_admin' or
    (school_id = public.current_user_school_id() and (
      public.current_user_role() in ('school_admin', 'deputy_principal', 'supervisor', 'viewer') or
      user_id = auth.uid()
    ))
  )
);

create policy audit_read on public.audit_logs for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'super_admin' or
    (school_id = public.current_user_school_id() and public.current_user_role() in ('school_admin', 'deputy_principal'))
  )
);

create policy backups_read on public.backups for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'super_admin' or
    (school_id = public.current_user_school_id() and public.current_user_role() in ('school_admin', 'deputy_principal'))
  )
);

revoke all on table public.schools, public.profiles, public.departments, public.tasks,
  public.attachments, public.notifications, public.activity_logs, public.audit_logs, public.backups from anon;

revoke insert, update, delete on table public.profiles, public.activity_logs, public.audit_logs, public.backups from authenticated;
revoke insert, update, delete on table public.notifications from authenticated;
revoke update on table public.attachments from authenticated;

grant select on table public.schools, public.profiles, public.departments, public.tasks,
  public.attachments, public.notifications, public.activity_logs, public.audit_logs, public.backups to authenticated;
grant insert, update, delete on table public.schools, public.departments, public.tasks to authenticated;
grant insert, delete on table public.attachments to authenticated;
grant update (is_read) on table public.notifications to authenticated;

drop trigger if exists task_assignment_guard on public.tasks;
drop function if exists public.enforce_task_assignment_permission();
drop trigger if exists task_security_guard on public.tasks;

create or replace function public.enforce_task_security() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  actor_role text := public.current_user_role();
  matching_department_id uuid;
begin
  if not public.is_active_user() then
    raise exception 'Inactive users cannot modify tasks' using errcode = '42501';
  end if;

  select d.id into matching_department_id
  from public.departments d
  where d.school_id = new.school_id and d.name = new.department_name;
  if matching_department_id is null then
    raise exception 'Task department must belong to the same school' using errcode = '23514';
  end if;
  new.department_id := matching_department_id;

  if new.assigned_to is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.assigned_to and p.school_id = new.school_id and p.status = 'active'
  ) then
    raise exception 'Task assignee must be active and belong to the same school' using errcode = '23514';
  end if;

  if new.created_by is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.created_by and (p.role = 'super_admin' or p.school_id = new.school_id)
  ) then
    raise exception 'Task creator must belong to the same school' using errcode = '23514';
  end if;

  if new.source_task_id is not null and not exists (
    select 1 from public.tasks source
    where source.id = new.source_task_id and source.school_id = new.school_id
  ) then
    raise exception 'Recurring task source must belong to the same school' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if actor_role in ('super_admin', 'school_admin', 'deputy_principal') then
      return new;
    end if;

    if actor_role = 'supervisor' then
      if (to_jsonb(new) - array['status','progress','comments','feedback','approvals','completed_at','updated_at'])
        is distinct from
        (to_jsonb(old) - array['status','progress','comments','feedback','approvals','completed_at','updated_at']) then
        raise exception 'Supervisors can only update workflow fields for their department tasks' using errcode = '42501';
      end if;
      if new.status = 'archived' then
        raise exception 'Supervisors cannot archive tasks' using errcode = '42501';
      end if;
      return new;
    end if;

    if actor_role in ('teacher', 'employee') then
      if (to_jsonb(new) - array['status','progress','comments','feedback','completed_at','updated_at'])
        is distinct from
        (to_jsonb(old) - array['status','progress','comments','feedback','completed_at','updated_at']) then
        raise exception 'Assigned users can only update task progress, status, and comments' using errcode = '42501';
      end if;
      if new.status not in ('pending', 'in_progress', 'under_review', 'completed') then
        raise exception 'Assigned users cannot set this task status' using errcode = '42501';
      end if;
      if new.status = 'completed' and new.approval_required and old.status <> 'approved' then
        raise exception 'Approval is required before completing this task' using errcode = '42501';
      end if;
      return new;
    end if;

    raise exception 'This role cannot update tasks' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger task_security_guard
before insert or update on public.tasks
for each row execute function public.enforce_task_security();

create or replace function public.write_log_entry(p_entry jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  requested_school text := nullif(p_entry->>'schoolId', '');
  sid uuid := public.current_user_school_id();
begin
  if not public.is_active_user() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if requested_school is not null then
    sid := requested_school::uuid;
  end if;
  if not public.can_access_school(sid) then
    raise exception 'Cross-school log writes are forbidden' using errcode = '42501';
  end if;
  if coalesce(p_entry->>'kind', 'activity') <> 'activity' then
    raise exception 'Audit logs are append-only and may only be written by trusted database operations' using errcode = '42501';
  end if;
  insert into public.activity_logs(school_id, user_id, action, entity_type, entity_id, details)
  values (
    sid, auth.uid(), coalesce(p_entry->>'type', 'activity'), p_entry->>'entityType',
    nullif(p_entry->>'entityId', '')::uuid,
    jsonb_build_object('title', p_entry->>'title', 'description', p_entry->>'description')
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.restore_backup(p_backup_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  item public.backups;
  data jsonb;
begin
  if not public.is_active_user() or public.current_user_role() not in ('super_admin', 'school_admin') then
    raise exception 'Only super administrators and school administrators can restore backups' using errcode = '42501';
  end if;
  select * into item from public.backups where id = p_backup_id::uuid;
  if not found then raise exception 'Backup not found'; end if;
  if not public.can_access_school(item.school_id) then
    raise exception 'Cross-school backup restore is forbidden' using errcode = '42501';
  end if;
  data := item.backup_data;
  if exists (
    select 1 from jsonb_array_elements(coalesce(data->'tasks', '[]'::jsonb)) value
    where (value->>'school_id')::uuid <> item.school_id
  ) or exists (
    select 1 from jsonb_array_elements(coalesce(data->'notifications', '[]'::jsonb)) value
    where (value->>'school_id')::uuid <> item.school_id
  ) then
    raise exception 'Backup contains cross-school records' using errcode = '23514';
  end if;
  delete from public.notifications where school_id = item.school_id;
  delete from public.tasks where school_id = item.school_id;
  insert into public.tasks select * from jsonb_populate_recordset(null::public.tasks, data->'tasks') on conflict(id) do nothing;
  insert into public.notifications select * from jsonb_populate_recordset(null::public.notifications, data->'notifications') on conflict(id) do nothing;
  insert into public.audit_logs(school_id, user_id, action, severity, details)
  values (item.school_id, auth.uid(), 'backup_restored', 'critical', jsonb_build_object('targetType', 'backup', 'targetId', item.id, 'message', 'Backup restored'));
  return jsonb_build_object('ok', true);
end;
$$;

drop policy if exists task_files_read on storage.objects;
drop policy if exists task_files_insert on storage.objects;
drop policy if exists task_files_delete on storage.objects;

create policy task_files_read on storage.objects for select to authenticated
using (
  bucket_id = 'task-attachments' and
  exists (
    select 1 from public.attachments a
    where a.file_path = name and public.can_view_task(a.task_id)
  )
);

create policy task_files_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'task-attachments' and
  public.is_active_user() and
  exists (
    select 1 from public.tasks t
    where t.id::text = (storage.foldername(name))[2]
      and t.school_id::text = (storage.foldername(name))[1]
      and public.can_update_task(t.id)
  )
);

create policy task_files_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'task-attachments' and
  exists (
    select 1 from public.attachments a
    where a.file_path = name and public.can_update_task(a.task_id)
  )
);

revoke execute on function public.restore_backup(text), public.write_log_entry(jsonb) from public, anon;
grant execute on function public.restore_backup(text), public.write_log_entry(jsonb) to authenticated;

commit;
