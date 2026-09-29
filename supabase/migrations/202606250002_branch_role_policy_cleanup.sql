begin;

create or replace function public.get_current_user_role() returns text
language sql stable security definer set search_path = '' as $$
  select (public.current_profile()).role;
$$;

create or replace function public.get_current_school_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select (public.current_profile()).school_id;
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

drop policy if exists schools_select_policy on public.schools;
drop policy if exists schools_manage_policy on public.schools;
drop policy if exists schools_read on public.schools;
drop policy if exists schools_manage on public.schools;

drop policy if exists profiles_select_policy on public.profiles;
drop policy if exists profiles_insert_policy on public.profiles;
drop policy if exists profiles_update_policy on public.profiles;
drop policy if exists profiles_delete_policy on public.profiles;
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_manage on public.profiles;

drop policy if exists departments_select_policy on public.departments;
drop policy if exists departments_manage_policy on public.departments;
drop policy if exists departments_read on public.departments;
drop policy if exists departments_manage on public.departments;

drop policy if exists tasks_select_policy on public.tasks;
drop policy if exists tasks_insert_policy on public.tasks;
drop policy if exists tasks_update_policy on public.tasks;
drop policy if exists tasks_delete_policy on public.tasks;
drop policy if exists tasks_read on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;

drop policy if exists notifications_select_policy on public.notifications;
drop policy if exists notifications_insert_policy on public.notifications;
drop policy if exists notifications_update_policy on public.notifications;
drop policy if exists notifications_read on public.notifications;
drop policy if exists notifications_update on public.notifications;

drop policy if exists activity_logs_select_policy on public.activity_logs;
drop policy if exists activity_logs_insert_policy on public.activity_logs;
drop policy if exists activity_read on public.activity_logs;

drop policy if exists audit_logs_select_policy on public.audit_logs;
drop policy if exists audit_read on public.audit_logs;

drop policy if exists backups_select_policy on public.backups;
drop policy if exists backups_insert_policy on public.backups;
drop policy if exists backups_read on public.backups;

create policy schools_read on public.schools for select to authenticated
using (
  public.is_active_user()
  and (public.current_user_role() = 'general_manager' or id = public.current_user_school_id())
);

create policy schools_manage on public.schools for all to authenticated
using (public.current_user_role() = 'general_manager')
with check (public.current_user_role() = 'general_manager');

create policy profiles_read on public.profiles for select to authenticated
using (
  public.is_active_user() and (
    id = auth.uid()
    or public.current_user_role() = 'general_manager'
    or school_id = public.current_user_school_id()
  )
);

create policy profiles_manage on public.profiles for all to authenticated
using (
  public.current_user_role() = 'general_manager'
  or (public.current_user_role() = 'school_principal' and school_id = public.current_user_school_id())
)
with check (
  public.current_user_role() = 'general_manager'
  or (public.current_user_role() = 'school_principal' and school_id = public.current_user_school_id())
);

create policy departments_read on public.departments for select to authenticated
using (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id());

create policy departments_manage on public.departments for all to authenticated
using (
  public.current_user_role() = 'general_manager'
  or (public.current_user_role() = 'school_principal' and school_id = public.current_user_school_id())
)
with check (
  public.current_user_role() = 'general_manager'
  or (public.current_user_role() = 'school_principal' and school_id = public.current_user_school_id())
);

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

create policy notifications_read on public.notifications for select to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() = 'general_manager'
  or (
    school_id = public.current_user_school_id()
    and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary')
  )
);

create policy notifications_update on public.notifications for update to authenticated
using (user_id = auth.uid() or public.current_user_role() = 'general_manager')
with check (user_id = auth.uid() or public.current_user_role() = 'general_manager');

create policy activity_read on public.activity_logs for select to authenticated
using (
  public.current_user_role() = 'general_manager'
  or user_id = auth.uid()
  or (school_id = public.current_user_school_id() and public.can_read_school_tasks())
);

create policy audit_read on public.audit_logs for select to authenticated
using (
  public.current_user_role() = 'general_manager'
  or (
    school_id = public.current_user_school_id()
    and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary')
  )
);

create policy backups_read on public.backups for select to authenticated
using (
  public.current_user_role() = 'general_manager'
  or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
);

grant select on table public.schools, public.profiles, public.departments, public.tasks,
  public.attachments, public.notifications, public.activity_logs, public.audit_logs, public.backups
to authenticated;

grant insert, update, delete on table public.schools, public.departments, public.tasks to authenticated;
grant update on table public.notifications to authenticated;

revoke execute on function public.get_current_user_role(), public.get_current_school_id(),
  public.is_super_admin(), public.is_school_admin(), public.can_access_school(uuid),
  public.can_manage_users(), public.can_manage_tasks(), public.can_read_school_tasks(),
  public.can_view_task_values(uuid, uuid, text), public.can_update_task_values(uuid, uuid, text)
from public, anon;

grant execute on function public.get_current_user_role(), public.get_current_school_id(),
  public.is_super_admin(), public.is_school_admin(), public.can_access_school(uuid),
  public.can_manage_users(), public.can_manage_tasks(), public.can_read_school_tasks(),
  public.can_view_task_values(uuid, uuid, text), public.can_update_task_values(uuid, uuid, text)
to authenticated;

commit;
