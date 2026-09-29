-- Remove the remaining secretary-style notebook items from the stage supervisor.
-- Keep only the notebook explicitly titled for the stage supervisor.
begin;

do $$
declare
  target_id uuid;
  wrong_ids uuid[];
begin
  select p.id into target_id
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

  select coalesce(array_agg(t.id), '{}'::uuid[]) into wrong_ids
  from public.tasks t
  where t.assigned_to = target_id
    and t.recurrence_type = 'permanent'
    and t.source_task_id is null
    and coalesce(t.status, '') <> 'archived'
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(t.comments, '[]'::jsonb)) e
      where e ->> 'type' = 'notebook_title'
        and e ->> 'text' ilike '%مشرف المرحلة%'
    );

  delete from public.notifications where related_task_id = any(wrong_ids);
  delete from public.attachments where task_id = any(wrong_ids);
  delete from public.tasks where id = any(wrong_ids);
end $$;

commit;
