begin;

create table if not exists public.notebook_role_templates (
  role_key text primary key,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notebook_role_templates_role_check check (role_key in (
    'superadmin','general_manager','branch_manager','finance_manager',
    'development_supervision_manager','general_secretary','school_principal',
    'deputy_principal','school_secretary','educational_supervisor',
    'specialist_supervisor','stage_supervisor','activity_supervisor','finance',
    'computer_unit','printing_unit'
  ))
);

alter table public.notebook_role_templates enable row level security;
alter table public.notebook_role_templates force row level security;

create or replace function public.can_manage_notebook_role_templates()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.is_active_user()
    and public.current_user_role() in (
      'superadmin','general_manager','branch_manager','finance_manager',
      'development_supervision_manager','school_principal','computer_unit'
    );
$$;

drop policy if exists notebook_role_templates_select on public.notebook_role_templates;
create policy notebook_role_templates_select
on public.notebook_role_templates
for select
to authenticated
using (public.can_manage_notebook_role_templates());

revoke all on public.notebook_role_templates from public, anon;
grant select on public.notebook_role_templates to authenticated;

-- Seed one role template from the existing active notebooks. This preserves the
-- current production titles instead of replacing them with a hard-coded list.
with source_items as (
  select distinct on (
    profile.role,
    lower(regexp_replace(btrim(coalesce(
      (select comment ->> 'text' from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) comment where comment ->> 'type' = 'notebook_item_title' limit 1),
      task.title,
      ''
    )), '[[:space:]]+', ' ', 'g'))
  )
    profile.role as role_key,
    coalesce(
      (select comment ->> 'text' from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) comment where comment ->> 'type' = 'notebook_item_title' limit 1),
      task.title
    ) as title,
    coalesce(task.description, '') as description
  from public.profiles profile
  join public.tasks task on task.assigned_to = profile.id
  where profile.status = 'active'
    and task.recurrence_type = 'permanent'
    and task.source_task_id is null
    and task.status <> 'archived'
    and btrim(coalesce(task.title, '')) <> ''
  order by profile.role,
    lower(regexp_replace(btrim(coalesce(
      (select comment ->> 'text' from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) comment where comment ->> 'type' = 'notebook_item_title' limit 1),
      task.title,
      ''
    )), '[[:space:]]+', ' ', 'g')),
    task.created_at,
    task.id
), grouped as (
  select role_key,
    jsonb_agg(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'title', title,
      'description', description
    ) order by title) as items
  from source_items
  group by role_key
)
insert into public.notebook_role_templates (role_key, items)
select role_key, items from grouped
on conflict (role_key) do nothing;

-- Attach stable template item IDs to existing notebook rows by normalized title.
update public.tasks task
set comments = coalesce(task.comments, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'userId', coalesce(task.created_by, task.assigned_to)::text,
      'text', template_item.item ->> 'id',
      'at', (now() at time zone 'Asia/Aden')::date::text,
      'type', 'role_template_item'
    )),
    updated_at = now()
from public.profiles profile
join public.notebook_role_templates template on template.role_key = profile.role
cross join lateral jsonb_array_elements(template.items) template_item(item)
where task.assigned_to = profile.id
  and task.recurrence_type = 'permanent'
  and task.source_task_id is null
  and task.status <> 'archived'
  and not exists (
    select 1 from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) comment
    where comment ->> 'type' = 'role_template_item'
  )
  and lower(regexp_replace(btrim(coalesce(
    (select comment ->> 'text' from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) comment where comment ->> 'type' = 'notebook_item_title' limit 1),
    task.title,
    ''
  )), '[[:space:]]+', ' ', 'g'))
    = lower(regexp_replace(btrim(template_item.item ->> 'title'), '[[:space:]]+', ' ', 'g'));

create or replace function public.save_notebook_role_template(p_role_key text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  normalized_items jsonb := '[]'::jsonb;
  employee_count integer := 0;
  inserted_count integer := 0;
  updated_count integer := 0;
  archived_count integer := 0;
  today_key date := (now() at time zone 'Asia/Aden')::date;
begin
  if actor_id is null or not public.is_active_user() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if actor_role not in (
    'superadmin','general_manager','branch_manager','finance_manager',
    'development_supervision_manager','school_principal','computer_unit'
  ) then
    raise exception 'This role cannot manage notebook role templates' using errcode = '42501';
  end if;
  if p_role_key not in (
    'superadmin','general_manager','branch_manager','finance_manager',
    'development_supervision_manager','general_secretary','school_principal',
    'deputy_principal','school_secretary','educational_supervisor',
    'specialist_supervisor','stage_supervisor','activity_supervisor','finance',
    'computer_unit','printing_unit'
  ) then
    raise exception 'Invalid role key' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then
    raise exception 'Notebook items must be an array of at most 100 items' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where btrim(coalesce(item ->> 'title', '')) = ''
      or length(btrim(item ->> 'title')) > 300
      or length(coalesce(item ->> 'description', '')) > 800
  ) then
    raise exception 'Invalid notebook item title or description' using errcode = '22023';
  end if;
  if (
    select count(*) from jsonb_array_elements(p_items)
  ) <> (
    select count(distinct lower(regexp_replace(btrim(item ->> 'title'), '[[:space:]]+', ' ', 'g')))
    from jsonb_array_elements(p_items) item
  ) then
    raise exception 'Duplicate notebook item title' using errcode = '23505';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', case when coalesce(item ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then item ->> 'id' else gen_random_uuid()::text end,
    'title', btrim(item ->> 'title'),
    'description', btrim(coalesce(item ->> 'description', ''))
  ) order by ordinality), '[]'::jsonb)
  into normalized_items
  from jsonb_array_elements(p_items) with ordinality source(item, ordinality);

  insert into public.notebook_role_templates (role_key, items, updated_by, updated_at)
  values (p_role_key, normalized_items, actor_id, now())
  on conflict (role_key) do update set
    items = excluded.items,
    updated_by = excluded.updated_by,
    updated_at = now();

  select count(*) into employee_count
  from public.profiles
  where status = 'active' and role = p_role_key;

  -- Link legacy rows that have the same title before applying edits.
  update public.tasks task
  set comments = coalesce(task.comments, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'userId', actor_id::text,
        'text', item.value ->> 'id',
        'at', today_key::text,
        'type', 'role_template_item'
      )),
      updated_at = now()
  from public.profiles profile
  cross join lateral jsonb_array_elements(normalized_items) item(value)
  where task.assigned_to = profile.id
    and profile.status = 'active'
    and profile.role = p_role_key
    and task.recurrence_type = 'permanent'
    and task.source_task_id is null
    and task.status <> 'archived'
    and not exists (select 1 from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) comment where comment ->> 'type' = 'role_template_item')
    and lower(regexp_replace(btrim(coalesce(
      (select comment ->> 'text' from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) comment where comment ->> 'type' = 'notebook_item_title' limit 1),
      task.title,
      ''
    )), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(btrim(item.value ->> 'title'), '[[:space:]]+', ' ', 'g'));

  -- Update linked items in place, preserving daily completion comments and approvals.
  update public.tasks task
  set title = item.value ->> 'title',
      description = item.value ->> 'description',
      comments = coalesce((
        select jsonb_agg(comment.value order by comment.ordinality)
        from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) with ordinality comment(value, ordinality)
        where comment.value ->> 'type' not in ('notebook_item_title','role_template_item')
      ), '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('id',gen_random_uuid()::text,'userId',actor_id::text,'text',item.value ->> 'title','at',today_key::text,'type','notebook_item_title'),
        jsonb_build_object('id',gen_random_uuid()::text,'userId',actor_id::text,'text',item.value ->> 'id','at',today_key::text,'type','role_template_item')
      ),
      updated_at = now()
  from public.profiles profile
  cross join lateral jsonb_array_elements(normalized_items) item(value)
  where task.assigned_to = profile.id
    and profile.status = 'active'
    and profile.role = p_role_key
    and task.recurrence_type = 'permanent'
    and task.source_task_id is null
    and task.status <> 'archived'
    and (select comment ->> 'text' from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) comment where comment ->> 'type' = 'role_template_item' limit 1) = item.value ->> 'id';
  get diagnostics updated_count = row_count;

  -- Removed items are archived from yesterday so they disappear immediately,
  -- while all completion history up to that date remains queryable.
  update public.tasks task
  set status = 'archived',
      comments = coalesce((
        select jsonb_agg(comment.value order by comment.ordinality)
        from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) with ordinality comment(value, ordinality)
        where comment.value ->> 'type' <> 'notebook_archived_at'
      ), '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'id',gen_random_uuid()::text,'userId',actor_id::text,'text',(today_key - 1)::text,'at',today_key::text,'type','notebook_archived_at'
      )),
      updated_at = now()
  from public.profiles profile
  where task.assigned_to = profile.id
    and profile.role = p_role_key
    and task.recurrence_type = 'permanent'
    and task.source_task_id is null
    and task.status <> 'archived'
    and exists (select 1 from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) comment where comment ->> 'type' = 'role_template_item')
    and not exists (
      select 1 from jsonb_array_elements(normalized_items) item
      where item ->> 'id' = (select comment ->> 'text' from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) comment where comment ->> 'type' = 'role_template_item' limit 1)
    );
  get diagnostics archived_count = row_count;

  insert into public.tasks (
    id, school_id, title, description, status, priority, created_by, assigned_to,
    due_date, recurrence_type, task_number, department_name, progress,
    occurrence_date, source_task_id, approval_required, approver_role,
    comments, feedback, approvals, created_at, updated_at
  )
  select
    gen_random_uuid(), profile.school_id, item.value ->> 'title', item.value ->> 'description',
    'pending', 'medium', actor_id, profile.id,
    ((date_trunc('year', today_key::timestamp) + interval '1 year - 1 second') at time zone 'Asia/Aden'),
    'permanent',
    'TSK-' || to_char(today_key, 'YYYYMMDD') || '-' || upper(right(replace(gen_random_uuid()::text, '-', ''), 8)),
    'الإدارة', 0, today_key, null, true, 'school_principal',
    jsonb_build_array(
      jsonb_build_object('id',gen_random_uuid()::text,'userId',actor_id::text,'text','دفتر المهام اليومية','at',today_key::text,'type','notebook_title'),
      jsonb_build_object('id',gen_random_uuid()::text,'userId',actor_id::text,'text',item.value ->> 'title','at',today_key::text,'type','notebook_item_title'),
      jsonb_build_object('id',gen_random_uuid()::text,'userId',actor_id::text,'text',item.value ->> 'id','at',today_key::text,'type','role_template_item')
    ),
    '[]'::jsonb, '[]'::jsonb, now(), now()
  from public.profiles profile
  cross join lateral jsonb_array_elements(normalized_items) item(value)
  where profile.status = 'active'
    and profile.role = p_role_key
    and not exists (
      select 1 from public.tasks task
      where task.assigned_to = profile.id
        and task.recurrence_type = 'permanent'
        and task.source_task_id is null
        and task.status <> 'archived'
        and (select comment ->> 'text' from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) comment where comment ->> 'type' = 'role_template_item' limit 1) = item.value ->> 'id'
    );
  get diagnostics inserted_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'roleKey', p_role_key,
    'employees', employee_count,
    'items', jsonb_array_length(normalized_items),
    'inserted', inserted_count,
    'updated', updated_count,
    'archived', archived_count
  );
end;
$$;

revoke execute on function public.can_manage_notebook_role_templates() from public, anon;
grant execute on function public.can_manage_notebook_role_templates() to authenticated;
revoke execute on function public.save_notebook_role_template(text, jsonb) from public, anon;
grant execute on function public.save_notebook_role_template(text, jsonb) to authenticated;

commit;
