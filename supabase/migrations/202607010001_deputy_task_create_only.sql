-- Allow deputy principals to create tasks for employees in their school,
-- while keeping task updates/deletes restricted by the existing policies.

create or replace function public.can_assign_task_values(
  p_school_id uuid,
  p_assigned_to uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (p_assigned_to = auth.uid() and p_school_id = public.current_user_school_id())
    or (
      p_school_id = public.current_user_school_id()
      and public.current_user_role() = 'school_principal'
      and (
        p_assigned_to is null
        or exists (
          select 1
          from public.profiles target
          where target.id = p_assigned_to
            and target.status = 'active'
            and target.school_id = p_school_id
            and (
              target.id = auth.uid()
              or public.is_higher_role(public.current_user_role(), target.role)
            )
        )
      )
    )
    or (
      p_school_id = public.current_user_school_id()
      and public.current_user_role() = 'deputy_principal'
      and (
        p_assigned_to is null
        or exists (
          select 1
          from public.profiles target
          where target.id = p_assigned_to
            and target.status = 'active'
            and target.school_id = p_school_id
            and public.is_higher_role(public.current_user_role(), target.role)
        )
      )
    )
  );
$$;

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
with check (
  (
    public.can_manage_tasks()
    or (public.current_user_role() = 'deputy_principal' and school_id = public.current_user_school_id())
  )
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
  and public.can_assign_task_values(school_id, assigned_to)
);
