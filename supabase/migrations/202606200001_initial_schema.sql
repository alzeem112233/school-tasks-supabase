begin;

create extension if not exists pgcrypto;

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete restrict,
  full_name text not null,
  email text not null,
  role text not null check (role in ('super_admin','school_admin','deputy_principal','supervisor','teacher','employee','viewer')),
  status text not null default 'active' check (status in ('active','inactive')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_idx on public.profiles (lower(email));
create index profiles_school_idx on public.profiles (school_id);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending','in_progress','under_review','approved','completed','overdue','archived')),
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  created_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  due_date timestamptz,
  completed_at timestamptz,
  recurrence_type text check (recurrence_type in ('once','daily','permanent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  task_number text not null unique,
  department_name text not null default 'الإدارة',
  progress integer not null default 0 check (progress between 0 and 100),
  occurrence_date date,
  source_task_id uuid references public.tasks(id) on delete cascade,
  approval_required boolean not null default true,
  approver_role text not null default 'supervisor' check (approver_role in ('super_admin','school_admin','deputy_principal','supervisor','teacher','employee','viewer')),
  comments jsonb not null default '[]'::jsonb,
  feedback jsonb not null default '[]'::jsonb,
  approvals jsonb not null default '[]'::jsonb
);

create index tasks_school_status_due_idx on public.tasks (school_id, status, due_date);
create index tasks_assigned_to_idx on public.tasks (assigned_to, due_date);
create index tasks_source_idx on public.tasks (source_task_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  file_name text not null,
  file_path text not null unique,
  file_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  bucket_name text not null default 'task-attachments',
  created_at timestamptz not null default now()
);

create index attachments_task_idx on public.attachments (task_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text,
  is_read boolean not null default false,
  related_task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  dedupe_key text not null default ''
);

create unique index notifications_dedupe_idx on public.notifications (user_id, dedupe_key) where dedupe_key <> '';
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  severity text not null default 'info' check (severity in ('info','low','medium','high','critical')),
  ip_address text,
  user_agent text,
  details jsonb,
  created_at timestamptz not null default now()
);

create table public.backups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  backup_name text not null,
  backup_data jsonb,
  created_at timestamptz not null default now(),
  entity_counts jsonb not null default '{"profiles":0,"tasks":0,"notifications":0}'::jsonb
);

create index activity_logs_school_created_idx on public.activity_logs (school_id, created_at desc);
create index audit_logs_school_created_idx on public.audit_logs (school_id, created_at desc);
create index backups_school_created_idx on public.backups (school_id, created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create trigger schools_updated_at before update on public.schools for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger departments_updated_at before update on public.departments for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();

create or replace function public.current_profile() returns public.profiles
language sql stable security definer set search_path = '' as $$
  select p from public.profiles p where p.id = auth.uid();
$$;
create or replace function public.current_user_role() returns text language sql stable security definer set search_path = '' as $$ select (public.current_profile()).role; $$;
create or replace function public.current_user_school_id() returns uuid language sql stable security definer set search_path = '' as $$ select (public.current_profile()).school_id; $$;
create or replace function public.is_active_user() returns boolean language sql stable security definer set search_path = '' as $$ select coalesce((public.current_profile()).status = 'active', false); $$;
create or replace function public.can_manage_users() returns boolean language sql stable security definer set search_path = '' as $$ select public.is_active_user() and public.current_user_role() in ('super_admin','school_admin'); $$;
create or replace function public.can_manage_tasks() returns boolean language sql stable security definer set search_path = '' as $$ select public.is_active_user() and public.current_user_role() in ('super_admin','school_admin','deputy_principal'); $$;
create or replace function public.can_read_school_tasks() returns boolean language sql stable security definer set search_path = '' as $$ select public.is_active_user() and public.current_user_role() in ('super_admin','school_admin','deputy_principal','supervisor','viewer'); $$;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.tasks enable row level security;
alter table public.attachments enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.backups enable row level security;

create policy schools_read on public.schools for select to authenticated using (public.is_active_user());
create policy profiles_read on public.profiles for select to authenticated using (auth.uid() = id or public.current_user_role() = 'super_admin' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_admin','deputy_principal','supervisor','viewer')));
create policy departments_read on public.departments for select to authenticated using (public.current_user_role() = 'super_admin' or school_id = public.current_user_school_id());
create policy departments_manage on public.departments for all to authenticated using (public.current_user_role() = 'super_admin' or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_admin')) with check (public.current_user_role() = 'super_admin' or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_admin'));
create policy tasks_read on public.tasks for select to authenticated using (public.current_user_role() = 'super_admin' or (school_id = public.current_user_school_id() and public.can_read_school_tasks()) or assigned_to = auth.uid());
create policy tasks_insert on public.tasks for insert to authenticated with check (public.can_manage_tasks() and (public.current_user_role() = 'super_admin' or school_id = public.current_user_school_id()) and (assigned_to is null or exists (select 1 from public.profiles p where p.id = assigned_to and p.school_id = school_id and p.status = 'active')));
create policy tasks_update on public.tasks for update to authenticated using (public.current_user_role() = 'super_admin' or (school_id = public.current_user_school_id() and (public.current_user_role() in ('school_admin','deputy_principal','supervisor') or assigned_to = auth.uid()))) with check ((public.current_user_role() = 'super_admin' or school_id = public.current_user_school_id()) and (assigned_to is null or exists (select 1 from public.profiles p where p.id = assigned_to and p.school_id = school_id and p.status = 'active')));
create policy tasks_delete on public.tasks for delete to authenticated using (public.can_manage_tasks() and (public.current_user_role() = 'super_admin' or school_id = public.current_user_school_id()));
create policy attachments_read on public.attachments for select to authenticated using (exists (select 1 from public.tasks t where t.id = task_id and (public.current_user_role() = 'super_admin' or (t.school_id = public.current_user_school_id() and public.can_read_school_tasks()) or t.assigned_to = auth.uid())));
create policy attachments_insert on public.attachments for insert to authenticated with check (uploaded_by = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id and t.school_id = school_id and (public.current_user_role() = 'super_admin' or (t.school_id = public.current_user_school_id() and (public.current_user_role() in ('school_admin','deputy_principal') or t.assigned_to = auth.uid())))));
create policy attachments_delete on public.attachments for delete to authenticated using (exists (select 1 from public.tasks t where t.id = task_id and (public.current_user_role() = 'super_admin' or (t.school_id = public.current_user_school_id() and (public.current_user_role() in ('school_admin','deputy_principal') or t.assigned_to = auth.uid())))));
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid() or public.current_user_role() = 'super_admin' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_admin','deputy_principal')));
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid() or public.current_user_role() = 'super_admin') with check (user_id = auth.uid() or public.current_user_role() = 'super_admin');
create policy activity_read on public.activity_logs for select to authenticated using (public.current_user_role() = 'super_admin' or user_id = auth.uid() or (school_id = public.current_user_school_id() and public.can_read_school_tasks()));
create policy audit_read on public.audit_logs for select to authenticated using (public.current_user_role() = 'super_admin' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_admin','deputy_principal')));
create policy backups_read on public.backups for select to authenticated using (public.current_user_role() = 'super_admin' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_admin','deputy_principal')));

create or replace function public.enforce_task_assignment_permission() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.assigned_to is distinct from old.assigned_to and not public.can_manage_tasks() then
    raise exception 'Only task managers can assign tasks' using errcode='42501';
  end if;
  return new;
end; $$;

create trigger task_assignment_guard before update of assigned_to on public.tasks for each row execute function public.enforce_task_assignment_permission();

create or replace function public.handle_task_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare item public.tasks := coalesce(new,old); event_action text; event_title text; event_message text;
begin
  event_action := case when tg_op='INSERT' then 'task_created' when tg_op='DELETE' then 'task_deleted' when old.status is distinct from new.status then 'task_status' else 'task_updated' end;
  event_title := case event_action when 'task_created' then 'تم إنشاء مهمة' when 'task_deleted' then 'تم حذف مهمة' when 'task_status' then 'تم تحديث حالة المهمة' else 'تم تحديث المهمة' end;
  event_message := item.task_number||' - '||item.title;
  if tg_op<>'DELETE' then
    insert into public.notifications(school_id,user_id,title,message,type,related_task_id,dedupe_key)
    select item.school_id,recipient.id,event_title,event_message,event_action,item.id,event_action||':'||item.id||':'||extract(epoch from item.updated_at)::bigint
    from (select item.assigned_to id union select item.created_by) recipient where recipient.id is not null
    on conflict(user_id,dedupe_key) where dedupe_key<>'' do nothing;
  end if;
  insert into public.activity_logs(school_id,user_id,action,entity_type,entity_id,details)
  values(item.school_id,coalesce(auth.uid(),item.created_by),event_action,'task',item.id,jsonb_build_object('title',event_title,'description',event_message));
  insert into public.audit_logs(school_id,user_id,action,severity,details)
  values(item.school_id,coalesce(auth.uid(),item.created_by),event_action,case when tg_op='DELETE' then 'high' else 'medium' end,jsonb_build_object('targetType','task','targetId',item.id,'message',event_message));
  return coalesce(new,old);
end; $$;

create trigger task_change_events after insert or update or delete on public.tasks for each row execute function public.handle_task_change();

create or replace function public.write_log_entry(p_entry jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare sid uuid := coalesce((p_entry->>'schoolId')::uuid, public.current_user_school_id());
begin
  if not public.is_active_user() then raise exception 'Unauthorized' using errcode='42501'; end if;
  if p_entry->>'kind' = 'activity' then
    insert into public.activity_logs(school_id,user_id,action,entity_type,entity_id,details) values(sid,auth.uid(),coalesce(p_entry->>'type','activity'),p_entry->>'entityType',nullif(p_entry->>'entityId','')::uuid,jsonb_build_object('title',p_entry->>'title','description',p_entry->>'description'));
  else
    insert into public.audit_logs(school_id,user_id,action,severity,user_agent,details) values(sid,auth.uid(),coalesce(p_entry->>'action','audit_event'),coalesce(p_entry->>'severity','info'),p_entry->>'userAgent',jsonb_build_object('targetType',p_entry->>'targetType','targetId',p_entry->>'targetId','message',p_entry->>'details'));
  end if;
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.create_backup(p_school_id uuid default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare sid uuid := case when public.current_user_role()='super_admin' then coalesce(p_school_id,public.current_user_school_id()) else public.current_user_school_id() end; bid uuid := gen_random_uuid(); data jsonb;
begin
  if not public.can_manage_users() then raise exception 'Forbidden' using errcode='42501'; end if;
  select jsonb_build_object('profiles',coalesce((select jsonb_agg(to_jsonb(p)) from public.profiles p where p.school_id=sid),'[]'::jsonb),'tasks',coalesce((select jsonb_agg(to_jsonb(t)) from public.tasks t where t.school_id=sid),'[]'::jsonb),'notifications',coalesce((select jsonb_agg(to_jsonb(n)) from public.notifications n where n.school_id=sid),'[]'::jsonb)) into data;
  insert into public.backups(id,school_id,created_by,backup_name,backup_data,entity_counts) values(bid,sid,auth.uid(),'نسخة احتياطية '||current_date,data,jsonb_build_object('profiles',jsonb_array_length(data->'profiles'),'tasks',jsonb_array_length(data->'tasks'),'notifications',jsonb_array_length(data->'notifications')));
  return jsonb_build_object('ok',true,'backupId',bid);
end; $$;

create or replace function public.restore_backup(p_backup_id text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.backups; data jsonb;
begin
  if not public.can_manage_users() then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into item from public.backups where id=p_backup_id::uuid;
  if not found then raise exception 'Backup not found'; end if;
  if public.current_user_role()<>'super_admin' and item.school_id<>public.current_user_school_id() then raise exception 'Forbidden' using errcode='42501'; end if;
  data := item.backup_data;
  delete from public.notifications where school_id=item.school_id;
  delete from public.tasks where school_id=item.school_id;
  insert into public.tasks select * from jsonb_populate_recordset(null::public.tasks,data->'tasks') on conflict(id) do nothing;
  insert into public.notifications select * from jsonb_populate_recordset(null::public.notifications,data->'notifications') on conflict(id) do nothing;
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.sync_task_notifications(p_school_scope text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare processed integer;
begin
  if not public.is_active_user() then raise exception 'Unauthorized' using errcode='42501'; end if;
  insert into public.notifications(school_id,user_id,title,message,type,related_task_id,dedupe_key)
  select t.school_id,t.assigned_to,'تذكير بموعد الاستحقاق',t.task_number||' يستحق اليوم.','deadline_reminder',t.id,'deadline:'||t.id||':'||current_date
  from public.tasks t where t.assigned_to is not null and t.status not in ('completed','archived')
    and t.due_date::date<=current_date
    and (public.current_user_role()='super_admin' and (coalesce(p_school_scope,'all')='all' or t.school_id=p_school_scope::uuid)
      or public.current_user_role()<>'super_admin' and t.school_id=public.current_user_school_id())
  on conflict(user_id,dedupe_key) where dedupe_key<>'' do nothing;
  get diagnostics processed = row_count;
  return jsonb_build_object('ok',true,'processed',processed);
end; $$;

grant execute on function public.write_log_entry(jsonb), public.create_backup(uuid), public.restore_backup(text), public.sync_task_notifications(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('task-attachments','task-attachments',false,10485760) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;
create policy task_files_read on storage.objects for select to authenticated using (bucket_id='task-attachments' and exists(select 1 from public.attachments a where a.file_path=name and (public.current_user_role()='super_admin' or a.school_id=public.current_user_school_id() or a.uploaded_by=auth.uid())));
create policy task_files_insert on storage.objects for insert to authenticated with check (bucket_id='task-attachments' and public.is_active_user() and exists(select 1 from public.tasks t where t.id::text=(storage.foldername(name))[2] and (public.current_user_role()='super_admin' or (t.school_id=public.current_user_school_id() and (public.current_user_role() in ('school_admin','deputy_principal') or t.assigned_to=auth.uid())))));
create policy task_files_delete on storage.objects for delete to authenticated using (bucket_id='task-attachments' and exists(select 1 from public.attachments a join public.tasks t on t.id=a.task_id where a.file_path=name and (public.current_user_role()='super_admin' or (t.school_id=public.current_user_school_id() and (public.current_user_role() in ('school_admin','deputy_principal') or t.assigned_to=auth.uid())))));

do $$ declare t text; begin foreach t in array array['schools','profiles','departments','tasks','attachments','notifications','activity_logs','audit_logs','backups'] loop execute format('alter publication supabase_realtime add table public.%I',t); end loop; end $$;

commit;
