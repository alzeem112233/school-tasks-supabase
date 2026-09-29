begin;

-- Keep assignees able to execute/comment on tasks, but prevent editing task definitions.
create or replace function public.enforce_task_security() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  actor_role text := public.current_user_role();
  matching_department_id uuid;
begin
  select department.id into matching_department_id
  from public.departments department
  where department.school_id = new.school_id
    and department.name = new.department_name;

  if matching_department_id is null then
    raise exception 'Task department must belong to the same school' using errcode = '23514';
  end if;
  new.department_id := matching_department_id;

  if new.assigned_to is not null and not exists (
    select 1
    from public.profiles assignee
    where assignee.id = new.assigned_to
      and assignee.school_id = new.school_id
      and assignee.status = 'active'
  ) then
    raise exception 'Task assignee must be active and belong to the same school' using errcode = '23514';
  end if;

  if new.created_by is not null and not exists (
    select 1
    from public.profiles creator
    where creator.id = new.created_by
      and (creator.role = 'general_manager' or creator.school_id = new.school_id)
  ) then
    raise exception 'Task creator must belong to the same school' using errcode = '23514';
  end if;

  if new.source_task_id is not null and not exists (
    select 1
    from public.tasks source
    where source.id = new.source_task_id
      and source.school_id = new.school_id
  ) then
    raise exception 'Recurring task source must belong to the same school' using errcode = '23514';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if not public.is_active_user() then
    raise exception 'Inactive users cannot modify tasks' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  if actor_role in ('general_manager', 'school_principal') then
    return new;
  end if;

  if old.assigned_to = auth.uid()
    and new.assigned_to = old.assigned_to
    and new.school_id = old.school_id then
    if (to_jsonb(new) - array['status','progress','comments','feedback','completed_at','updated_at'])
      is distinct from
      (to_jsonb(old) - array['status','progress','comments','feedback','completed_at','updated_at']) then
      raise exception 'Assigned users can only update task workflow fields' using errcode = '42501';
    end if;
    if new.status not in ('pending', 'in_progress', 'under_review', 'completed') then
      raise exception 'Assigned users cannot set this task status' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'This role cannot update this task' using errcode = '42501';
end;
$$;

commit;
