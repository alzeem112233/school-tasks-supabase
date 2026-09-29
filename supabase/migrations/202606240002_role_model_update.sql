begin;

alter table public.profiles add column if not exists department_name text;

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  generated_name text;
  generated_email text;
begin
  generated_email := coalesce(nullif(lower(new.email), ''), new.id::text || '@pending.invalid');
  generated_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(split_part(generated_email, '@', 1), ''),
    'مستخدم جديد'
  );

  insert into public.profiles (
    id,
    school_id,
    full_name,
    email,
    role,
    status,
    department_name,
    created_at,
    updated_at
  ) values (
    new.id,
    null,
    generated_name,
    generated_email,
    'school_secretary',
    'inactive',
    null,
    now(),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

update public.profiles
set role = case role
  when 'super_admin' then 'general_manager'
  when 'school_admin' then 'school_principal'
  when 'supervisor' then 'stage_supervisor'
  when 'teacher' then 'educational_supervisor'
  when 'employee' then 'school_secretary'
  when 'viewer' then 'school_secretary'
  else role
end;

update public.tasks
set approver_role = case approver_role
  when 'super_admin' then 'general_manager'
  when 'school_admin' then 'school_principal'
  when 'supervisor' then 'school_principal'
  when 'teacher' then 'educational_supervisor'
  when 'employee' then 'school_secretary'
  when 'viewer' then 'school_secretary'
  else approver_role
end;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in (
    'general_manager',
    'general_secretary',
    'school_principal',
    'deputy_principal',
    'stage_supervisor',
    'school_secretary',
    'educational_supervisor',
    'specialist_supervisor',
    'computer_unit',
    'printing_unit'
  ));

alter table public.tasks alter column approver_role set default 'school_principal';
alter table public.tasks drop constraint if exists tasks_approver_role_check;
alter table public.tasks
  add constraint tasks_approver_role_check check (approver_role in (
    'general_manager',
    'school_principal',
    'deputy_principal'
  ));

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
  select public.is_active_user() and public.current_user_role() = 'general_manager';
$$;

create or replace function public.is_school_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.current_user_role() = 'school_principal';
$$;

create or replace function public.can_access_school(p_school_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.current_user_role() = 'general_manager' or p_school_id = public.current_user_school_id()
  );
$$;

create or replace function public.can_manage_users() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.current_user_role() in (
    'general_manager',
    'general_secretary',
    'school_principal',
    'deputy_principal',
    'school_secretary'
  );
$$;

create or replace function public.can_manage_tasks() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.current_user_role() in (
    'general_manager',
    'general_secretary',
    'school_principal',
    'deputy_principal',
    'school_secretary'
  );
$$;

create or replace function public.can_read_school_tasks() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.current_user_role() in (
    'general_manager',
    'general_secretary',
    'school_principal',
    'deputy_principal',
    'school_secretary'
  );
$$;

create or replace function public.can_view_task_values(
  p_school_id uuid,
  p_assigned_to uuid,
  p_department_name text
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (
      p_school_id = public.current_user_school_id()
      and (
        public.current_user_role() in ('general_secretary', 'school_principal', 'deputy_principal', 'school_secretary')
        or p_assigned_to = auth.uid()
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
    public.current_user_role() = 'general_manager'
    or (
      p_school_id = public.current_user_school_id()
      and (
        public.current_user_role() in ('general_secretary', 'school_principal', 'deputy_principal', 'school_secretary')
        or p_assigned_to = auth.uid()
      )
    )
  );
$$;

drop policy if exists schools_read on public.schools;
drop policy if exists schools_manage on public.schools;
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_manage on public.profiles;
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
using (public.is_active_user() and (public.current_user_role() = 'general_manager' or id = public.current_user_school_id()));

create policy schools_manage on public.schools for all to authenticated
using (public.current_user_role() = 'general_manager')
with check (public.current_user_role() = 'general_manager');

create policy profiles_read on public.profiles for select to authenticated
using (public.is_active_user() and (
  id = auth.uid()
  or public.current_user_role() = 'general_manager'
  or school_id = public.current_user_school_id()
));

create policy profiles_manage on public.profiles for all to authenticated
using (public.current_user_role() = 'general_manager' or (public.current_user_role() = 'school_principal' and school_id = public.current_user_school_id()))
with check (public.current_user_role() = 'general_manager' or (public.current_user_role() = 'school_principal' and school_id = public.current_user_school_id()));

create policy departments_read on public.departments for select to authenticated
using (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id());

create policy departments_manage on public.departments for all to authenticated
using (public.current_user_role() = 'general_manager' or (public.current_user_role() = 'school_principal' and school_id = public.current_user_school_id()))
with check (public.current_user_role() = 'general_manager' or (public.current_user_role() = 'school_principal' and school_id = public.current_user_school_id()));

create policy tasks_read on public.tasks for select to authenticated
using (
  public.current_user_role() = 'general_manager'
  or (school_id = public.current_user_school_id() and public.can_read_school_tasks())
  or assigned_to = auth.uid()
);

create policy tasks_insert on public.tasks for insert to authenticated
with check (
  public.can_manage_tasks()
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
  and (assigned_to is null or exists (
    select 1 from public.profiles p
    where p.id = assigned_to and p.school_id = school_id and p.status = 'active'
  ))
);

create policy tasks_update on public.tasks for update to authenticated
using (
  public.current_user_role() = 'general_manager'
  or (school_id = public.current_user_school_id() and (public.can_manage_tasks() or assigned_to = auth.uid()))
)
with check (
  public.current_user_role() = 'general_manager'
  or (school_id = public.current_user_school_id() and (public.can_manage_tasks() or assigned_to = auth.uid()))
);

create policy tasks_delete on public.tasks for delete to authenticated
using (
  public.current_user_role() = 'general_manager'
  or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
);

create policy attachments_read on public.attachments for select to authenticated
using (exists (
  select 1 from public.tasks t
  where t.id = task_id
    and (
      public.current_user_role() = 'general_manager'
      or (t.school_id = public.current_user_school_id() and (public.can_read_school_tasks() or t.assigned_to = auth.uid()))
    )
));

create policy attachments_insert on public.attachments for insert to authenticated
with check (uploaded_by = auth.uid() and exists (
  select 1 from public.tasks t
  where t.id = task_id
    and t.school_id = school_id
    and (
      public.current_user_role() = 'general_manager'
      or (t.school_id = public.current_user_school_id() and (public.can_manage_tasks() or t.assigned_to = auth.uid()))
    )
));

create policy attachments_delete on public.attachments for delete to authenticated
using (exists (
  select 1 from public.tasks t
  where t.id = task_id
    and (
      public.current_user_role() = 'general_manager'
      or (t.school_id = public.current_user_school_id() and (public.current_user_role() = 'school_principal' or t.assigned_to = auth.uid()))
    )
));

create policy notifications_read on public.notifications for select to authenticated
using (user_id = auth.uid() or public.current_user_role() = 'general_manager' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary')));

create policy notifications_update on public.notifications for update to authenticated
using (user_id = auth.uid() or public.current_user_role() = 'general_manager')
with check (user_id = auth.uid() or public.current_user_role() = 'general_manager');

create policy activity_read on public.activity_logs for select to authenticated
using (public.current_user_role() = 'general_manager' or user_id = auth.uid() or (school_id = public.current_user_school_id() and public.can_read_school_tasks()));

create policy audit_read on public.audit_logs for select to authenticated
using (public.current_user_role() = 'general_manager' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary')));

create policy backups_read on public.backups for select to authenticated
using (public.current_user_role() = 'general_manager' or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal'));

revoke execute on function public.current_profile(), public.current_user_role(), public.current_user_school_id(),
  public.current_user_department_name(), public.is_active_user(), public.is_super_admin(), public.is_school_admin(),
  public.can_access_school(uuid), public.can_manage_users(), public.can_manage_tasks(), public.can_read_school_tasks(),
  public.can_view_task_values(uuid, uuid, text), public.can_update_task_values(uuid, uuid, text)
from public, anon;

grant execute on function public.current_profile(), public.current_user_role(), public.current_user_school_id(),
  public.current_user_department_name(), public.is_active_user(), public.is_super_admin(), public.is_school_admin(),
  public.can_access_school(uuid), public.can_manage_users(), public.can_manage_tasks(), public.can_read_school_tasks(),
  public.can_view_task_values(uuid, uuid, text), public.can_update_task_values(uuid, uuid, text)
to authenticated;

commit;
