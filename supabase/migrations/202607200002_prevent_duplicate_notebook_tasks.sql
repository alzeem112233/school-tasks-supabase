begin;

create or replace function public.prevent_duplicate_notebook_task() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  identity_key text;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.recurrence_type is distinct from 'permanent'
    or new.source_task_id is not null
    or new.assigned_to is null
    or new.status = 'archived' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.school_id is not distinct from old.school_id
    and new.assigned_to is not distinct from old.assigned_to
    and new.title is not distinct from old.title
    and new.description is not distinct from old.description
    and new.department_name is not distinct from old.department_name
    and new.due_date is not distinct from old.due_date
    and old.status <> 'archived' then
    return new;
  end if;

  identity_key := concat_ws(
    '|',
    new.school_id::text,
    new.assigned_to::text,
    lower(regexp_replace(btrim(coalesce(new.title, '')), '[[:space:]]+', ' ', 'g')),
    lower(regexp_replace(btrim(coalesce(new.description, '')), '[[:space:]]+', ' ', 'g')),
    lower(regexp_replace(btrim(coalesce(new.department_name, '')), '[[:space:]]+', ' ', 'g')),
    coalesce(new.due_date::text, '')
  );

  perform pg_advisory_xact_lock(hashtextextended(identity_key, 0));

  if exists (
    select 1
    from public.tasks existing
    where existing.id <> new.id
      and existing.school_id = new.school_id
      and existing.assigned_to = new.assigned_to
      and existing.recurrence_type = 'permanent'
      and existing.source_task_id is null
      and existing.status <> 'archived'
      and existing.due_date is not distinct from new.due_date
      and lower(regexp_replace(btrim(coalesce(existing.title, '')), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(btrim(coalesce(new.title, '')), '[[:space:]]+', ' ', 'g'))
      and lower(regexp_replace(btrim(coalesce(existing.description, '')), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(btrim(coalesce(new.description, '')), '[[:space:]]+', ' ', 'g'))
      and lower(regexp_replace(btrim(coalesce(existing.department_name, '')), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(btrim(coalesce(new.department_name, '')), '[[:space:]]+', ' ', 'g'))
  ) then
    raise exception 'Duplicate notebook task for this employee' using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_notebook_task on public.tasks;
create trigger prevent_duplicate_notebook_task
before insert or update of school_id, assigned_to, title, description, department_name, due_date, recurrence_type, source_task_id, status
on public.tasks
for each row execute function public.prevent_duplicate_notebook_task();

grant execute on function public.prevent_duplicate_notebook_task() to authenticated;

commit;
