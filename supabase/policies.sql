-- Readable RLS snapshot. The executable version is:
-- migrations/202606210001_harden_rls.sql, then the latest role/privacy migrations.
-- Role helper aliases are defined in the migrations:
-- current_user_role(), current_user_school_id(), can_manage_users(), can_manage_tasks(),
-- can_create_task_values(), can_assign_task_values().

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.tasks enable row level security;
alter table public.attachments enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.backups enable row level security;
alter table public.finance_discounts enable row level security;

alter table public.schools force row level security;
alter table public.profiles force row level security;
alter table public.departments force row level security;
alter table public.tasks force row level security;
alter table public.attachments force row level security;
alter table public.notifications force row level security;
alter table public.activity_logs force row level security;
alter table public.audit_logs force row level security;
alter table public.backups force row level security;
alter table public.finance_discounts force row level security;

create policy schools_read on public.schools for select to authenticated
using (public.is_active_user() and (public.current_user_role() = 'general_manager' or id = public.current_user_school_id()));

create policy schools_manage on public.schools for all to authenticated
using (public.current_user_role() = 'general_manager')
with check (public.current_user_role() = 'general_manager');

create policy profiles_read on public.profiles for select to authenticated
using (public.can_view_profile_values(id, school_id, role));

create policy profiles_manage on public.profiles for all to authenticated
using (public.can_manage_profile_values(id, school_id, role))
with check (public.can_manage_profile_values(id, school_id, role));
-- Profile writes are still revoked from authenticated users; user changes go through protected Edge Functions.

create policy departments_read on public.departments for select to authenticated
using (public.can_access_school(school_id));

create policy departments_manage on public.departments for all to authenticated
using (public.current_user_role() = 'general_manager' or (public.current_user_role() = 'school_principal' and public.can_access_school(school_id)))
with check (public.current_user_role() = 'general_manager' or (public.current_user_role() = 'school_principal' and public.can_access_school(school_id)));

create policy tasks_read on public.tasks for select to authenticated
using (public.can_view_task_values(school_id, assigned_to, department_name));

create policy tasks_insert on public.tasks for insert to authenticated
with check (
  public.can_create_task_values(recurrence_type) and
  (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id()) and
  public.can_assign_task_values(school_id, assigned_to)
);

create policy tasks_update on public.tasks for update to authenticated
using (public.can_update_task_values(school_id, assigned_to, department_name))
with check (
  public.can_update_task_values(school_id, assigned_to, department_name) and
  public.can_assign_task_values(school_id, assigned_to)
);

create policy tasks_delete on public.tasks for delete to authenticated
using (
  public.current_user_role() = 'general_manager' or
  (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
);

create policy attachments_read on public.attachments for select to authenticated
using (public.can_view_task(task_id));

create policy attachments_insert on public.attachments for insert to authenticated
with check (
  uploaded_by = auth.uid() and public.can_update_task(task_id) and
  exists (select 1 from public.tasks t where t.id = task_id and t.school_id = school_id)
);

create policy attachments_delete on public.attachments for delete to authenticated
using (public.can_update_task(task_id));

-- The private task-attachments bucket uses schoolId/taskId/fileName paths.
-- Its storage.objects policies are defined in the versioned migrations and
-- call can_view_task()/can_update_task() so cross-school access is denied.

create policy notifications_read on public.notifications for select to authenticated
using (public.is_active_user() and (user_id = auth.uid() or public.current_user_role() = 'general_manager'));

create policy notifications_update on public.notifications for update to authenticated
using (public.is_active_user() and user_id = auth.uid())
with check (public.is_active_user() and user_id = auth.uid());

-- Notifications are inserted only by trusted database triggers/functions or Edge Functions.
-- Authenticated users may change only is_read on notifications addressed to themselves.

create policy activity_read on public.activity_logs for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager' or
    user_id = auth.uid() or
    (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal'))
  )
);

create policy audit_read on public.audit_logs for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager' or
    (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal'))
  )
);
-- audit_logs has no write policy and authenticated users have no write grants.

create policy backups_read on public.backups for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager' or
    (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
  )
);
-- Backup creation/restoration is restricted by security-definer RPC checks.

create policy finance_discounts_read on public.finance_discounts for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager' or
    (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'finance'))
  )
);

create policy finance_discounts_insert on public.finance_discounts for insert to authenticated
with check (
  public.is_active_user() and created_by = auth.uid() and (
    public.current_user_role() = 'general_manager' or
    (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
  )
);

-- Finance workflow changes and manager edits are validated by enforce_finance_discount_workflow().

-- The public profile-avatars bucket stores images under auth.uid()/fileName.
-- Storage policies allow public read and restrict write/delete to the owner's folder.
