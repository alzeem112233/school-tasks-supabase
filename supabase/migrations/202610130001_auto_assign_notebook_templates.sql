begin;

create or replace function public.assign_notebook_template_to_profile(
  p_profile_id uuid,
  p_actor_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  profile_record public.profiles%rowtype;
  template_items jsonb := '[]'::jsonb;
  actor_id uuid;
  today_key date := (now() at time zone 'Asia/Aden')::date;
  inserted_count integer := 0;
begin
  select * into profile_record
  from public.profiles
  where id = p_profile_id and status = 'active';

  if not found then
    return 0;
  end if;

  select items into template_items
  from public.notebook_role_templates
  where role_key = profile_record.role;

  if not found or jsonb_array_length(template_items) = 0 then
    return 0;
  end if;

  actor_id := coalesce(p_actor_id, auth.uid(), profile_record.id);

  insert into public.tasks (
    id, school_id, title, description, status, priority, created_by, assigned_to,
    due_date, recurrence_type, task_number, department_name, progress,
    occurrence_date, source_task_id, approval_required, approver_role,
    comments, feedback, approvals, created_at, updated_at, academy_id
  )
  select
    gen_random_uuid(), profile_record.school_id, item.value ->> 'title', item.value ->> 'description',
    'pending', 'medium', actor_id, profile_record.id,
    ((date_trunc('year', today_key::timestamp) + interval '1 year - 1 second') at time zone 'Asia/Aden'),
    'permanent',
    'TSK-' || to_char(today_key, 'YYYYMMDD') || '-' || upper(right(replace(gen_random_uuid()::text, '-', ''), 8)),
    'الإدارة', 0, today_key, null, true, 'school_principal',
    jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'userId', actor_id::text, 'text', 'دفتر المهام اليومية', 'at', today_key::text, 'type', 'notebook_title'),
      jsonb_build_object('id', gen_random_uuid()::text, 'userId', actor_id::text, 'text', item.value ->> 'title', 'at', today_key::text, 'type', 'notebook_item_title'),
      jsonb_build_object('id', gen_random_uuid()::text, 'userId', actor_id::text, 'text', item.value ->> 'id', 'at', today_key::text, 'type', 'role_template_item')
    ),
    '[]'::jsonb, '[]'::jsonb, now(), now(), profile_record.academy_id
  from jsonb_array_elements(template_items) item(value)
  where not exists (
    select 1
    from public.tasks task
    where task.assigned_to = profile_record.id
      and task.recurrence_type = 'permanent'
      and task.source_task_id is null
      and task.status <> 'archived'
      and (
        select comment ->> 'text'
        from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) comment
        where comment ->> 'type' = 'role_template_item'
        limit 1
      ) = item.value ->> 'id'
  );
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.auto_assign_notebook_on_profile_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.assign_notebook_template_to_profile(new.id, auth.uid());
  return new;
end;
$$;

drop trigger if exists profiles_auto_assign_notebook on public.profiles;
create trigger profiles_auto_assign_notebook
after insert on public.profiles
for each row
execute function public.auto_assign_notebook_on_profile_insert();

do $$
declare
  profile_id uuid;
begin
  for profile_id in
    select profile.id
    from public.profiles profile
    join public.notebook_role_templates template on template.role_key = profile.role
    where profile.status = 'active'
      and jsonb_array_length(template.items) > 0
  loop
    perform public.assign_notebook_template_to_profile(profile_id, null);
  end loop;
end;
$$;

revoke all on function public.assign_notebook_template_to_profile(uuid, uuid) from public, anon, authenticated;
revoke all on function public.auto_assign_notebook_on_profile_insert() from public, anon, authenticated;
grant execute on function public.assign_notebook_template_to_profile(uuid, uuid) to service_role;
grant execute on function public.auto_assign_notebook_on_profile_insert() to service_role;

commit;
