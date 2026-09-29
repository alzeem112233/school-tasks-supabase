begin;

drop trigger if exists task_completion_guard on public.tasks;

create or replace function public.enforce_task_completion_workflow() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  actor_role text := public.current_user_role();
begin
  if new.status = 'completed' then
    if tg_op = 'UPDATE'
      and actor_role in ('supervisor', 'teacher', 'employee')
      and new.approval_required
      and old.status <> 'approved' then
      raise exception 'Approval is required before completing this task' using errcode = '42501';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger task_completion_guard
before insert or update of status, completed_at on public.tasks
for each row execute function public.enforce_task_completion_workflow();

revoke execute on function public.enforce_task_completion_workflow() from public, anon, authenticated;

commit;
