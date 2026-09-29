begin;

create index if not exists tasks_school_priority_idx on public.tasks (school_id, priority);
create index if not exists tasks_school_assignee_idx on public.tasks (school_id, assigned_to);

create or replace function public.get_dashboard_data(
  p_school_scope text default null,
  p_status text default null,
  p_priority text default null,
  p_assignee_id uuid default null,
  p_department text default null,
  p_recurrence text default null,
  p_due_from date default null,
  p_due_to date default null,
  p_search text default null
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with eligible_tasks as materialized (
    select
      task.*,
      case
        when task.status not in ('completed', 'archived')
          and task.due_date::date < current_date then 'overdue'
        when task.status = 'pending' then 'new'
        else task.status
      end as effective_status
    from public.tasks task
    where public.is_active_user()
      and case
        when p_school_scope is null or p_school_scope = 'all' then true
        else task.school_id = p_school_scope::uuid
      end
      and (p_priority is null or task.priority = p_priority)
      and (p_assignee_id is null or task.assigned_to = p_assignee_id)
      and (p_department is null or task.department_name = p_department)
      and (p_recurrence is null or coalesce(task.recurrence_type, 'once') = p_recurrence)
      and (p_due_from is null or task.due_date::date >= p_due_from)
      and (p_due_to is null or task.due_date::date <= p_due_to)
      and (
        p_search is null or btrim(p_search) = '' or
        task.title ilike '%' || btrim(p_search) || '%' or
        coalesce(task.description, '') ilike '%' || btrim(p_search) || '%' or
        task.task_number ilike '%' || btrim(p_search) || '%'
      )
  ),
  scoped_tasks as materialized (
    select task.*
    from eligible_tasks task
    where p_status is null or task.effective_status = p_status
  ),
  summary as (
    select
      count(*)::integer as total_tasks,
      count(*) filter (where effective_status = 'completed')::integer as completed_tasks,
      count(*) filter (where effective_status = 'new')::integer as pending_tasks,
      count(*) filter (where effective_status not in ('completed', 'archived'))::integer as active_tasks,
      count(*) filter (where effective_status = 'overdue')::integer as overdue_tasks,
      coalesce(round(avg(progress)), 0)::integer as average_progress
    from scoped_tasks
  ),
  priority_groups as (
    select priority, count(*)::integer as task_count
    from scoped_tasks
    group by priority
  ),
  status_groups as (
    select effective_status as status, count(*)::integer as task_count
    from scoped_tasks
    group by effective_status
  ),
  department_groups as (
    select
      coalesce(nullif(department_name, ''), 'غير محدد') as department,
      count(*)::integer as task_count,
      coalesce(round(avg(progress)), 0)::integer as average_progress
    from scoped_tasks
    group by coalesce(nullif(department_name, ''), 'غير محدد')
  ),
  assignee_groups as (
    select
      task.assigned_to as user_id,
      coalesce(profile.full_name, 'غير مسندة') as full_name,
      count(*)::integer as task_count,
      count(*) filter (where task.effective_status = 'completed')::integer as completed_count,
      count(*) filter (where task.effective_status = 'overdue')::integer as overdue_count
    from scoped_tasks task
    left join public.profiles profile on profile.id = task.assigned_to
    group by task.assigned_to, profile.full_name
  )
  select jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'totalTasks', total_tasks,
        'completedTasks', completed_tasks,
        'pendingTasks', pending_tasks,
        'activeTasks', active_tasks,
        'overdueTasks', overdue_tasks,
        'completionPercentage', case when total_tasks = 0 then 0 else round(completed_tasks * 100.0 / total_tasks)::integer end,
        'averageProgress', average_progress
      ) from summary
    ),
    'byPriority', coalesce((
      select jsonb_agg(jsonb_build_object('priority', priority, 'count', task_count) order by task_count desc, priority)
      from priority_groups
    ), '[]'::jsonb),
    'byStatus', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'count', task_count) order by task_count desc, status)
      from status_groups
    ), '[]'::jsonb),
    'byDepartment', coalesce((
      select jsonb_agg(jsonb_build_object(
        'department', department,
        'count', task_count,
        'averageProgress', average_progress
      ) order by task_count desc, department)
      from department_groups
    ), '[]'::jsonb),
    'byAssignee', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', user_id,
        'name', full_name,
        'count', task_count,
        'completed', completed_count,
        'overdue', overdue_count
      ) order by task_count desc, full_name)
      from assignee_groups
    ), '[]'::jsonb),
    'recentActivity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'schoolId', recent.school_id,
        'userId', recent.user_id,
        'type', recent.action,
        'title', coalesce(recent.details->>'title', recent.action),
        'description', coalesce(recent.details->>'description', ''),
        'createdAt', recent.created_at
      ) order by recent.created_at desc)
      from (
        select activity.*
        from public.activity_logs activity
        where case
          when p_school_scope is null or p_school_scope = 'all' then true
          else activity.school_id = p_school_scope::uuid
        end
        order by activity.created_at desc
        limit 6
      ) recent
    ), '[]'::jsonb),
    'upcomingDeadlines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', upcoming.id,
        'taskNumber', upcoming.task_number,
        'title', upcoming.title,
        'department', upcoming.department_name,
        'assigneeId', upcoming.assigned_to,
        'assigneeName', coalesce(profile.full_name, 'غير مسندة'),
        'dueDate', upcoming.due_date,
        'status', upcoming.effective_status,
        'priority', upcoming.priority
      ) order by upcoming.due_date, upcoming.created_at)
      from (
        select task.*
        from scoped_tasks task
        where task.effective_status not in ('completed', 'archived', 'overdue')
          and task.due_date::date >= current_date
        order by task.due_date, task.created_at
        limit 6
      ) upcoming
      left join public.profiles profile on profile.id = upcoming.assigned_to
    ), '[]'::jsonb),
    'overdueTaskItems', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', overdue.id,
        'taskNumber', overdue.task_number,
        'title', overdue.title,
        'department', overdue.department_name,
        'assigneeId', overdue.assigned_to,
        'assigneeName', coalesce(profile.full_name, 'غير مسندة'),
        'dueDate', overdue.due_date,
        'status', overdue.effective_status,
        'priority', overdue.priority
      ) order by overdue.due_date, overdue.created_at)
      from (
        select task.*
        from scoped_tasks task
        where task.effective_status = 'overdue'
        order by task.due_date, task.created_at
        limit 5
      ) overdue
      left join public.profiles profile on profile.id = overdue.assigned_to
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.get_dashboard_data(text, text, text, uuid, text, text, date, date, text) from public, anon;
grant execute on function public.get_dashboard_data(text, text, text, uuid, text, text, date, date, text) to authenticated;

do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array['tasks', 'activity_logs', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
exception when undefined_object then
  null;
end;
$$;

commit;
