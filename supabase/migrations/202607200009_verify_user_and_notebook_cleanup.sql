do $$
declare
  inactive_count integer;
  duplicate_count integer;
begin
  select count(*)
  into inactive_count
  from public.profiles profile
  where profile.status <> 'active';

  select count(*)
  into duplicate_count
  from (
    select
      task.school_id,
      task.assigned_to,
      public.notebook_item_title_key(task.title, task.comments)
    from public.tasks task
    where task.assigned_to is not null
      and task.recurrence_type = 'permanent'
      and task.source_task_id is null
      and task.status <> 'archived'
    group by
      task.school_id,
      task.assigned_to,
      public.notebook_item_title_key(task.title, task.comments)
    having count(*) > 1
  ) duplicate_groups;

  raise notice 'Inactive profiles remaining after cleanup: %', inactive_count;
  raise notice 'Duplicate active notebook task groups remaining after cleanup: %', duplicate_count;

  if inactive_count <> 0 or duplicate_count <> 0 then
    raise exception 'User or notebook cleanup verification failed';
  end if;
end;
$$;
