begin;

create or replace function public.current_user_access_flag(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case lower(coalesce(profile.access_flags ->> p_key, ''))
    when 'true' then true
    when 'allow' then true
    when 'false' then false
    when 'deny' then false
    else null
  end
  from public.profiles profile
  where profile.id = auth.uid()
    and profile.status = 'active';
$$;

create or replace function public.can_create_task_values(p_recurrence_type text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and coalesce(
    public.current_user_access_flag(
      case when p_recurrence_type = 'permanent' then 'createNotebook' else 'createTask' end
    ),
    public.current_user_role() in ('general_manager', 'school_principal', 'deputy_principal')
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
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
  and public.can_assign_task_values(school_id, assigned_to)
);

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

  -- Trusted database maintenance and backup restoration have no end-user uid.
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

-- Repair older imported records whose school did not match the assigned account.
insert into public.departments (school_id, name, description)
select distinct
  assignee.school_id,
  task.department_name,
  'تمت إضافته تلقائيًا لتصحيح إسناد مهمة قديمة.'
from public.tasks task
join public.profiles assignee on assignee.id = task.assigned_to
where assignee.school_id is not null
  and nullif(btrim(task.department_name), '') is not null
on conflict (school_id, name) do nothing;

alter table public.tasks disable trigger user;

update public.tasks task
set school_id = assignee.school_id
from public.profiles assignee
where task.assigned_to = assignee.id
  and task.source_task_id is null
  and assignee.school_id is not null
  and task.school_id is distinct from assignee.school_id;

update public.tasks task
set school_id = assignee.school_id
from public.profiles assignee
where task.assigned_to = assignee.id
  and task.source_task_id is not null
  and assignee.school_id is not null
  and task.school_id is distinct from assignee.school_id;

alter table public.tasks enable trigger user;

update public.attachments attachment
set school_id = task.school_id
from public.tasks task
where attachment.task_id = task.id
  and attachment.school_id is distinct from task.school_id;

update public.notifications notification
set school_id = task.school_id
from public.tasks task
where notification.related_task_id = task.id
  and notification.school_id is distinct from task.school_id;

create index if not exists tasks_assignee_school_status_idx
  on public.tasks (assigned_to, school_id, status, due_date desc);

create index if not exists notifications_user_unread_created_idx
  on public.notifications (user_id, created_at desc)
  where is_read = false;

grant execute on function public.current_user_access_flag(text) to authenticated;
grant execute on function public.can_create_task_values(text) to authenticated;
grant execute on function public.can_assign_task_values(uuid, uuid) to authenticated;

commit;
