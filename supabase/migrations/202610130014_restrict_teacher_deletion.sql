drop policy if exists teacher_directory_write on public.teacher_directory;
drop policy if exists teacher_directory_insert on public.teacher_directory;
drop policy if exists teacher_directory_update on public.teacher_directory;
drop policy if exists teacher_directory_delete on public.teacher_directory;

create policy teacher_directory_insert
on public.teacher_directory
for insert
to authenticated
with check (
  public.is_active_user()
  and public.current_user_role() in ('general_manager', 'school_principal', 'deputy_principal', 'school_secretary', 'computer_unit')
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
);

create policy teacher_directory_update
on public.teacher_directory
for update
to authenticated
using (
  public.is_active_user()
  and public.current_user_role() in ('general_manager', 'school_principal', 'deputy_principal', 'school_secretary', 'computer_unit')
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
)
with check (
  public.is_active_user()
  and public.current_user_role() in ('general_manager', 'school_principal', 'deputy_principal', 'school_secretary', 'computer_unit')
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
);

create policy teacher_directory_delete
on public.teacher_directory
for delete
to authenticated
using (
  public.is_active_user()
  and (public.current_profile()).role in ('superadmin', 'general_manager', 'branch_manager', 'school_principal')
  and (
    (public.current_profile()).role = 'superadmin'
    or public.can_access_school(school_id)
  )
);
