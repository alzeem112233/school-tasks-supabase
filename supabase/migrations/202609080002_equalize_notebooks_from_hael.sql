-- Add only missing notebook items, using active employees in Hael as the role reference.
-- Existing notebook items and all of their edited content remain untouched.
begin;

do $$
declare
  hael_school_id uuid;
  inserted_count integer := 0;
  employee_count integer := 0;
begin
  select id into hael_school_id
  from public.schools
  where status = 'active' and trim(name) ilike '%هائل%'
  order by created_at, id
  limit 1;

  if hael_school_id is null then
    raise exception 'Hael school was not found; notebook equalization was not applied.';
  end if;

  create temporary table hael_role_notebook_items on commit drop as
  select distinct on (p.role, public.notebook_item_title_key(t.title, t.comments))
    p.role,
    public.notebook_item_title_key(t.title, t.comments) as item_key,
    t.*
  from public.profiles p
  join public.tasks t on t.assigned_to = p.id
  where p.school_id = hael_school_id
    and p.status = 'active'
    and t.recurrence_type = 'permanent'
    and t.source_task_id is null
    and coalesce(t.status, '') <> 'archived'
    and public.notebook_item_title_key(t.title, t.comments) <> ''
  order by p.role, public.notebook_item_title_key(t.title, t.comments), t.created_at, t.id;

  if not exists (select 1 from hael_role_notebook_items) then
    raise exception 'Hael has no active notebook items; notebook equalization was not applied.';
  end if;

  alter table public.tasks disable trigger user;

  with targets as (
    select p.*,
      'TSK-' || to_char((now() at time zone 'Asia/Aden')::date, 'YYYYMMDD') || '-'
        || upper(right(replace(gen_random_uuid()::text, '-', ''), 8)) as notebook_number
    from public.profiles p
    where p.status = 'active'
      and exists (select 1 from hael_role_notebook_items source where source.role = p.role)
  ), missing as (
    select target.id as target_id, target.school_id as target_school_id,
      target.notebook_number, source.*
    from targets target
    join hael_role_notebook_items source on source.role = target.role
    where not exists (
      select 1 from public.tasks current_item
      where current_item.assigned_to = target.id
        and current_item.recurrence_type = 'permanent'
        and current_item.source_task_id is null
        and coalesce(current_item.status, '') <> 'archived'
        and public.notebook_item_title_key(current_item.title, current_item.comments) = source.item_key
    )
  )
  insert into public.tasks (
    id, school_id, title, description, status, priority, created_by, assigned_to,
    department_id, due_date, completed_at, recurrence_type, created_at, updated_at,
    task_number, department_name, progress, occurrence_date, source_task_id,
    approval_required, approver_role, comments, feedback, approvals
  )
  select
    gen_random_uuid(), missing.target_school_id, missing.title, missing.description,
    'pending', missing.priority, missing.created_by, missing.target_id, null,
    missing.due_date, null, 'permanent', now(), now(),
    'TSK-' || to_char((now() at time zone 'Asia/Aden')::date, 'YYYYMMDD') || '-'
      || upper(right(replace(gen_random_uuid()::text, '-', ''), 8)),
    missing.department_name, 0, (now() at time zone 'Asia/Aden')::date, null,
    coalesce(missing.approval_required, true),
    coalesce(missing.approver_role, 'school_principal'),
    coalesce((
      select jsonb_agg(comment.value order by comment.ordinality)
      from jsonb_array_elements(coalesce(missing.comments, '[]'::jsonb))
        with ordinality comment(value, ordinality)
      where coalesce(comment.value ->> 'type', '') <> 'notebook_number'
    ), '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'userId', coalesce(missing.created_by, missing.target_id)::text,
      'text', missing.notebook_number,
      'at', (now() at time zone 'Asia/Aden')::date::text,
      'type', 'notebook_number'
    )),
    '[]'::jsonb, '[]'::jsonb
  from missing;

  get diagnostics inserted_count = row_count;
  select count(distinct assigned_to) into employee_count
  from public.tasks
  where created_at >= transaction_timestamp()
    and recurrence_type = 'permanent';

  alter table public.tasks enable trigger user;
  raise notice 'NOTEBOOK_EQUALIZATION inserted_items=% affected_employees=% reference_school=%',
    inserted_count, employee_count, hael_school_id;
exception when others then
  alter table public.tasks enable trigger user;
  raise;
end $$;

commit;
