-- Correct the notebook assigned to خالد حسن علي الحميضة.
-- The operation is intentionally scoped to this exact profile and is idempotent.
begin;

do $$
declare
  target_id uuid;
  target_school_id uuid;
  source_id uuid;
  source_seed uuid;
  source_title text;
  source_number text;
  today_key date := (now() at time zone 'Asia/Aden')::date;
  wrong_ids uuid[];
  has_stage_notebook boolean;
begin
  select p.id, p.school_id
    into target_id, target_school_id
  from public.profiles p
  where p.full_name = 'خالد حسن علي الحميضة'
    and p.role = 'stage_supervisor'
    and p.status = 'active'
  order by p.created_at
  limit 1;

  if target_id is null then
    raise notice 'Target profile was not found; no changes made.';
    return;
  end if;

  select coalesce(array_agg(t.id), '{}'::uuid[])
    into wrong_ids
  from public.tasks t
  where t.assigned_to = target_id
    and t.recurrence_type = 'permanent'
    and t.source_task_id is null
    and coalesce(t.status, '') <> 'archived'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(t.comments, '[]'::jsonb)) elem
      where elem ->> 'type' = 'notebook_title'
        and (
          elem ->> 'text' ilike '%سكرتير%'
          or elem ->> 'text' ilike '%الاسكرتير%'
        )
    );

  delete from public.notifications n
  where n.related_task_id = any(wrong_ids);

  delete from public.attachments a
  where a.task_id = any(wrong_ids);

  delete from public.tasks t
  where t.id = any(wrong_ids);

  select exists (
    select 1
    from public.tasks t
    where t.assigned_to = target_id
      and t.recurrence_type = 'permanent'
      and t.source_task_id is null
      and coalesce(t.status, '') <> 'archived'
      and exists (
        select 1
        from jsonb_array_elements(coalesce(t.comments, '[]'::jsonb)) elem
        where elem ->> 'type' = 'notebook_title'
          and elem ->> 'text' ilike '%مشرف المرحلة%'
      )
  ) into has_stage_notebook;

  if not has_stage_notebook then
    select p.id
      into source_id
    from public.profiles p
    where p.id <> target_id
      and p.school_id = target_school_id
      and p.role = 'stage_supervisor'
      and p.status = 'active'
      and exists (
        select 1
        from public.tasks t
        where t.assigned_to = p.id
          and t.recurrence_type = 'permanent'
          and t.source_task_id is null
          and coalesce(t.status, '') <> 'archived'
      )
    order by p.created_at
    limit 1;

    if source_id is not null then
      source_seed := gen_random_uuid();
      source_number := 'TSK-' || to_char(today_key, 'YYYYMMDD') || '-' || upper(right(replace(source_seed::text, '-', ''), 4));
      source_title := 'دفتر مهام مشرف المرحلة';

      -- This is a controlled repair after deduplicating the source items.
      alter table public.tasks disable trigger user;
      insert into public.tasks (
        id, school_id, title, description, status, priority, created_by,
        assigned_to, department_id, due_date, completed_at, recurrence_type,
        created_at, updated_at, task_number, department_name, progress,
        occurrence_date, source_task_id, approval_required, approver_role,
        comments, feedback, approvals
      )
      select
        case when row_number() over (order by source_task.created_at, source_task.id) = 1 then source_seed else gen_random_uuid() end,
        target_school_id,
        source_task.title,
        source_task.description,
        'pending',
        source_task.priority,
        source_task.created_by,
        target_id,
        source_task.department_id,
        source_task.due_date,
        null,
        'permanent',
        now(),
        now(),
        'TSK-' || to_char(today_key, 'YYYYMMDD') || '-' || upper(right(replace(gen_random_uuid()::text, '-', ''), 8)),
        source_task.department_name,
        0,
        today_key,
        null,
        coalesce(source_task.approval_required, true),
        coalesce(source_task.approver_role, 'school_principal'),
        coalesce(source_task.comments, '[]'::jsonb) || jsonb_build_object(
          'id', gen_random_uuid()::text,
          'userId', coalesce(source_task.created_by, target_id)::text,
          'text', source_number,
          'at', today_key::text,
          'type', 'notebook_number'
        ) || jsonb_build_object(
          'id', gen_random_uuid()::text,
          'userId', coalesce(source_task.created_by, target_id)::text,
          'text', source_title,
          'at', today_key::text,
          'type', 'notebook_title'
        ),
        '[]'::jsonb,
        '[]'::jsonb
      from (
        select distinct on (public.notebook_item_title_key(t.title, t.comments)) t.*
        from public.tasks t
        where t.assigned_to = source_id
          and t.recurrence_type = 'permanent'
          and t.source_task_id is null
          and coalesce(t.status, '') <> 'archived'
        order by public.notebook_item_title_key(t.title, t.comments), t.created_at, t.id
      ) source_task
      order by source_task.created_at, source_task.id;
      alter table public.tasks enable trigger user;
    else
      raise notice 'No stage supervisor notebook source was found; wrong notebook removed only.';
    end if;
  end if;
end $$;

commit;
