create or replace function public.handle_chat_message_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
begin
  select coalesce(full_name, email, 'مستخدم')
  into sender_name
  from public.profiles
  where id = new.sender_id;

  insert into public.notifications (school_id, user_id, title, message, type, related_task_id, dedupe_key)
  values (
    new.school_id,
    new.recipient_id,
    'رسالة جديدة',
    sender_name || ': ' || left(new.message, 140),
    'chat_message',
    null,
    'chat-message:' || new.id
  )
  on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;

  return new;
end;
$$;

drop trigger if exists chat_message_notification on public.chat_messages;
create trigger chat_message_notification
after insert on public.chat_messages
for each row execute function public.handle_chat_message_notification();

create or replace function public.sync_daily_notebook_reminders(p_school_scope text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reminder_count integer := 0;
  requested_school_id uuid := case
    when p_school_scope is null or p_school_scope = 'all' then null
    else p_school_scope::uuid
  end;
begin
  if not public.is_active_user() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if localtime < time '12:00' then
    return jsonb_build_object('ok', true, 'processed', 0, 'dailyNotebookReminders', 0, 'beforeNoon', true);
  end if;

  insert into public.notifications (
    school_id, user_id, title, message, type, related_task_id, dedupe_key
  )
  select distinct
    task.school_id,
    task.assigned_to,
    'تذكير دفتر المهام',
    'لم يتم تفعيل دفتر المهام اليوم. يرجى فتح دفتر المهام وتحديد حالة مهام اليوم.',
    'daily_notebook_reminder',
    task.id,
    'daily-notebook-reminder:' || task.assigned_to || ':' || current_date
  from public.tasks task
  where task.recurrence_type = 'permanent'
    and task.source_task_id is null
    and task.status <> 'archived'
    and task.assigned_to is not null
    and (task.due_date is null or task.due_date::date >= current_date)
    and (
      (public.current_user_role() = 'general_manager' and (
        requested_school_id is null or task.school_id = requested_school_id
      )) or
      (public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary') and task.school_id = public.current_user_school_id()) or
      task.assigned_to = auth.uid()
    )
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(task.comments, '[]'::jsonb)) item
      where item->>'type' = 'permanent_daily'
        and nullif(item->>'date', '')::date = current_date
        and coalesce(item->>'status', '') <> ''
    )
  on conflict (user_id, dedupe_key) where dedupe_key <> '' do nothing;
  get diagnostics reminder_count = row_count;

  return jsonb_build_object('ok', true, 'processed', reminder_count, 'dailyNotebookReminders', reminder_count);
end;
$$;

revoke execute on function public.handle_chat_message_notification() from public, anon, authenticated;
revoke execute on function public.sync_daily_notebook_reminders(text) from public, anon;
grant execute on function public.sync_daily_notebook_reminders(text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
