begin;

create or replace function public.can_create_task_values(p_recurrence_type text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and coalesce(
    public.current_user_access_flag(
      case when p_recurrence_type = 'permanent' then 'createNotebook' else 'createTask' end
    ),
    public.current_user_role() in ('general_manager', 'school_principal', 'computer_unit')
  );
$$;

create or replace function public.can_assign_task_values(
  p_school_id uuid,
  p_assigned_to uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (
      p_school_id = public.current_user_school_id()
      and (
        p_assigned_to = auth.uid()
        or (
          public.current_user_role() in ('school_principal', 'deputy_principal')
          and exists (
            select 1
            from public.profiles target
            where target.id = p_assigned_to
              and target.status = 'active'
              and target.school_id = p_school_id
              and public.is_higher_role(public.current_user_role(), target.role)
          )
        )
        or (
          public.current_user_role() = 'computer_unit'
          and exists (
            select 1
            from public.profiles target
            where target.id = p_assigned_to
              and target.status = 'active'
              and target.school_id = p_school_id
              and target.role not in ('general_manager', 'school_principal', 'tracker')
          )
        )
        or (
          coalesce(public.current_user_access_flag('createTask'), false)
          or coalesce(public.current_user_access_flag('createNotebook'), false)
        )
        and exists (
          select 1
          from public.profiles target
          where target.id = p_assigned_to
            and target.status = 'active'
            and target.school_id = p_school_id
            and (target.id = auth.uid() or public.is_higher_role(public.current_user_role(), target.role))
        )
      )
    )
  );
$$;

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
with check (
  public.can_create_task_values(recurrence_type)
  and (
    public.current_user_role() = 'general_manager'
    or school_id = public.current_user_school_id()
  )
  and public.can_assign_task_values(school_id, assigned_to)
);

grant execute on function public.can_create_task_values(text) to authenticated;
grant execute on function public.can_assign_task_values(uuid, uuid) to authenticated;

commit;
