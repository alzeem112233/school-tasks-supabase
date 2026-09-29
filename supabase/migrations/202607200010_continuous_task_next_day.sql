begin;

create or replace function public.schedule_continuous_task_next_day() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  root_id uuid;
  next_task_id uuid;
  next_date date;
  lock_key text;
begin
  if new.recurrence_type is distinct from 'daily'
    or new.status is distinct from 'completed'
    or old.status is not distinct from 'completed' then
    return new;
  end if;

  root_id := coalesce(new.source_task_id, new.id);
  next_date := (now() at time zone 'Asia/Aden')::date + 1;
  lock_key := root_id::text || '|' || next_date::text;
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));

  if exists (
    select 1
    from public.tasks existing
    where coalesce(existing.source_task_id, existing.id) = root_id
      and existing.occurrence_date = next_date
      and existing.status <> 'archived'
  ) then
    return new;
  end if;

  next_task_id := gen_random_uuid();
  insert into public.tasks (
    id,
    school_id,
    title,
    description,
    status,
    priority,
    created_by,
    assigned_to,
    department_id,
    due_date,
    completed_at,
    recurrence_type,
    created_at,
    updated_at,
    task_number,
    department_name,
    progress,
    occurrence_date,
    source_task_id,
    approval_required,
    approver_role,
    comments,
    feedback,
    approvals
  ) values (
    next_task_id,
    new.school_id,
    new.title,
    new.description,
    'pending',
    new.priority,
    new.created_by,
    new.assigned_to,
    new.department_id,
    next_date::timestamptz,
    null,
    'daily',
    now(),
    now(),
    'TSK-' || to_char(next_date, 'YYYYMMDD') || '-' || upper(substr(replace(next_task_id::text, '-', ''), 1, 8)),
    new.department_name,
    0,
    next_date,
    root_id,
    new.approval_required,
    new.approver_role,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );

  return new;
end;
$$;

drop trigger if exists schedule_continuous_task_next_day on public.tasks;
create trigger schedule_continuous_task_next_day
after update of status on public.tasks
for each row execute function public.schedule_continuous_task_next_day();

grant execute on function public.schedule_continuous_task_next_day() to authenticated;

commit;
