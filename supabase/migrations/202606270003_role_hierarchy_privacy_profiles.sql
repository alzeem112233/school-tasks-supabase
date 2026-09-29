begin;

update public.profiles
set role = 'school_secretary', updated_at = now()
where role = 'general_secretary';

update public.tasks
set approver_role = 'school_principal'
where approver_role not in ('general_manager', 'school_principal');

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in (
  'general_manager',
  'school_principal',
  'deputy_principal',
  'school_secretary',
  'educational_supervisor',
  'specialist_supervisor',
  'stage_supervisor',
  'activity_supervisor',
  'finance',
  'computer_unit',
  'printing_unit'
));

alter table public.tasks drop constraint if exists tasks_approver_role_check;
alter table public.tasks add constraint tasks_approver_role_check check (approver_role in (
  'general_manager',
  'school_principal'
));

create or replace function public.role_rank(p_role text) returns integer
language sql immutable security definer set search_path = '' as $$
  select case p_role
    when 'general_manager' then 100
    when 'school_principal' then 90
    when 'deputy_principal' then 80
    when 'school_secretary' then 70
    when 'educational_supervisor' then 60
    when 'specialist_supervisor' then 50
    when 'stage_supervisor' then 40
    when 'activity_supervisor' then 35
    when 'finance' then 30
    when 'computer_unit' then 20
    when 'printing_unit' then 10
    else 0
  end;
$$;

create or replace function public.is_higher_role(p_actor_role text, p_target_role text) returns boolean
language sql immutable security definer set search_path = '' as $$
  select public.role_rank(p_actor_role) > public.role_rank(p_target_role);
$$;

create or replace function public.can_manage_users() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.current_user_role() in ('general_manager', 'school_principal');
$$;

create or replace function public.can_manage_tasks() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.current_user_role() in ('general_manager', 'school_principal');
$$;

create or replace function public.can_read_school_tasks() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.current_user_role() in ('general_manager', 'school_principal', 'deputy_principal');
$$;

create or replace function public.can_view_profile_values(
  p_profile_id uuid,
  p_school_id uuid,
  p_role text
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    p_profile_id = auth.uid()
    or public.current_user_role() = 'general_manager'
    or (
      p_school_id = public.current_user_school_id()
      and public.current_user_role() = 'school_principal'
      and p_role <> 'general_manager'
    )
    or (
      p_school_id = public.current_user_school_id()
      and public.current_user_role() = 'deputy_principal'
      and public.is_higher_role(public.current_user_role(), p_role)
    )
  );
$$;

create or replace function public.can_manage_profile_values(
  p_profile_id uuid,
  p_school_id uuid,
  p_role text
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and p_profile_id <> auth.uid() and (
    public.current_user_role() = 'general_manager'
    or (
      public.current_user_role() = 'school_principal'
      and p_school_id = public.current_user_school_id()
      and public.is_higher_role(public.current_user_role(), p_role)
    )
  );
$$;

create or replace function public.can_assign_task_values(
  p_school_id uuid,
  p_assigned_to uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (p_assigned_to = auth.uid() and p_school_id = public.current_user_school_id())
    or (
      p_school_id = public.current_user_school_id()
      and public.current_user_role() = 'school_principal'
      and (
        p_assigned_to is null
        or exists (
          select 1
          from public.profiles target
          where target.id = p_assigned_to
            and target.status = 'active'
            and target.school_id = p_school_id
            and (
              target.id = auth.uid()
              or public.is_higher_role(public.current_user_role(), target.role)
            )
        )
      )
    )
  );
$$;

create or replace function public.change_user_role_internal(
  p_user_id uuid,
  p_role text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles;
  target public.profiles;
  previous_role text;
  general_school_id uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  target_school_id uuid;
  allowed_roles text[] := array[
    'general_manager',
    'school_principal',
    'deputy_principal',
    'school_secretary',
    'educational_supervisor',
    'specialist_supervisor',
    'stage_supervisor',
    'activity_supervisor',
    'finance',
    'computer_unit',
    'printing_unit'
  ];
begin
  p_role := case p_role
    when 'general_secretary' then 'school_secretary'
    else p_role
  end;

  select *
    into actor
    from public.profiles
   where id = p_actor_id
     and status = 'active';

  if actor.id is null or actor.role not in ('general_manager', 'school_principal') then
    raise exception 'لا توجد صلاحية لتغيير الأدوار.' using errcode = '42501';
  end if;

  if not (p_role = any(allowed_roles)) then
    raise exception 'الدور غير صالح.' using errcode = '22023';
  end if;

  select *
    into target
    from public.profiles
   where id = p_user_id;

  if target.id is null then
    raise exception 'المستخدم غير موجود.' using errcode = 'P0002';
  end if;

  if p_user_id = p_actor_id then
    raise exception 'لا يمكن تغيير دور حسابك الحالي.' using errcode = '42501';
  end if;

  target.role := case target.role
    when 'general_secretary' then 'school_secretary'
    else target.role
  end;

  target_school_id := case
    when p_role = 'general_manager' then general_school_id
    else target.school_id
  end;

  if p_role <> 'general_manager' and target_school_id = general_school_id then
    raise exception 'اختر فرعا للمستخدم قبل تغيير هذا الدور.' using errcode = '22023';
  end if;

  if target.school_id is distinct from target_school_id and exists (
    select 1
      from public.tasks task
     where task.assigned_to = target.id
        or task.created_by = target.id
  ) then
    raise exception 'لا يمكن نقل المستخدم إلى فرع آخر قبل إعادة إسناد مهامه.' using errcode = '23503';
  end if;

  if actor.role <> 'general_manager' and (
    target.school_id <> actor.school_id
    or not public.is_higher_role(actor.role, target.role)
    or not public.is_higher_role(actor.role, p_role)
  ) then
    raise exception 'لا توجد صلاحية لتغيير دور هذا المستخدم.' using errcode = '42501';
  end if;

  previous_role := target.role;
  if previous_role = p_role and target.school_id is not distinct from target_school_id then
    return jsonb_build_object('ok', true, 'id', p_user_id, 'unchanged', true);
  end if;

  update public.profiles
     set role = p_role,
         school_id = target_school_id,
         updated_at = now()
   where id = p_user_id;

  insert into public.activity_logs (school_id, user_id, action, entity_type, entity_id, details)
  values (
    target_school_id,
    p_actor_id,
    'user_role_changed',
    'profile',
    p_user_id,
    jsonb_build_object('title', 'تم تغيير دور مستخدم', 'description', target.email || ': ' || previous_role || ' -> ' || p_role)
  );

  insert into public.audit_logs (school_id, user_id, action, severity, details)
  values (
    target_school_id,
    p_actor_id,
    'user_role_changed',
    'critical',
    jsonb_build_object('targetType', 'profile', 'targetId', p_user_id, 'message', target.email || ': ' || previous_role || ' -> ' || p_role)
  );

  insert into public.notifications (school_id, user_id, title, message, type, dedupe_key)
  values (
    target_school_id,
    p_user_id,
    'تم تحديث دورك',
    'تم تغيير دور حسابك إلى ' || p_role || '.',
    'role_changed',
    'role-change:' || p_user_id || ':' || p_role || ':' || extract(epoch from now())::bigint
  );

  return jsonb_build_object('ok', true, 'id', p_user_id, 'previousRole', previous_role, 'role', p_role);
end;
$$;

create or replace function public.can_view_task_values(
  p_school_id uuid,
  p_assigned_to uuid,
  p_department_name text
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (p_assigned_to = auth.uid() and p_school_id = public.current_user_school_id())
    or (
      p_school_id = public.current_user_school_id()
      and public.current_user_role() = 'school_principal'
    )
    or (
      p_school_id = public.current_user_school_id()
      and public.current_user_role() = 'deputy_principal'
      and exists (
        select 1
        from public.profiles target
        where target.id = p_assigned_to
          and target.school_id = p_school_id
          and public.is_higher_role(public.current_user_role(), target.role)
      )
    )
  );
$$;

create or replace function public.can_update_task_values(
  p_school_id uuid,
  p_assigned_to uuid,
  p_department_name text
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (p_assigned_to = auth.uid() and p_school_id = public.current_user_school_id())
    or (
      p_school_id = public.current_user_school_id()
      and public.current_user_role() = 'school_principal'
    )
  );
$$;

drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_manage on public.profiles;
drop policy if exists tasks_read on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
drop policy if exists activity_read on public.activity_logs;
drop policy if exists audit_read on public.audit_logs;

create policy profiles_read on public.profiles for select to authenticated
using (public.can_view_profile_values(id, school_id, role));

create policy profiles_manage on public.profiles for all to authenticated
using (public.can_manage_profile_values(id, school_id, role))
with check (public.can_manage_profile_values(id, school_id, role));

create policy tasks_read on public.tasks for select to authenticated
using (public.can_view_task_values(school_id, assigned_to, department_name));

create policy tasks_insert on public.tasks for insert to authenticated
with check (
  public.can_manage_tasks()
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
  and public.can_assign_task_values(school_id, assigned_to)
);

create policy tasks_update on public.tasks for update to authenticated
using (public.can_update_task_values(school_id, assigned_to, department_name))
with check (
  public.can_update_task_values(school_id, assigned_to, department_name)
  and public.can_assign_task_values(school_id, assigned_to)
);

create policy tasks_delete on public.tasks for delete to authenticated
using (
  public.current_user_role() = 'general_manager'
  or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
);

create policy activity_read on public.activity_logs for select to authenticated
using (
  public.current_user_role() = 'general_manager'
  or user_id = auth.uid()
  or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal'))
);

create policy audit_read on public.audit_logs for select to authenticated
using (
  public.current_user_role() = 'general_manager'
  or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal'))
);

revoke insert, update, delete on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant insert, update, delete on table public.tasks to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_avatars_public_read on storage.objects;
drop policy if exists profile_avatars_own_insert on storage.objects;
drop policy if exists profile_avatars_own_update on storage.objects;
drop policy if exists profile_avatars_own_delete on storage.objects;

create policy profile_avatars_public_read on storage.objects
for select to public
using (bucket_id = 'profile-avatars');

create policy profile_avatars_own_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy profile_avatars_own_update on storage.objects
for update to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy profile_avatars_own_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

revoke execute on function public.role_rank(text), public.is_higher_role(text, text),
  public.can_manage_users(), public.can_manage_tasks(), public.can_read_school_tasks(),
  public.can_view_profile_values(uuid, uuid, text), public.can_manage_profile_values(uuid, uuid, text),
  public.can_assign_task_values(uuid, uuid), public.can_view_task_values(uuid, uuid, text),
  public.can_update_task_values(uuid, uuid, text)
from public, anon;

grant execute on function public.role_rank(text), public.is_higher_role(text, text),
  public.can_manage_users(), public.can_manage_tasks(), public.can_read_school_tasks(),
  public.can_view_profile_values(uuid, uuid, text), public.can_manage_profile_values(uuid, uuid, text),
  public.can_assign_task_values(uuid, uuid), public.can_view_task_values(uuid, uuid, text),
  public.can_update_task_values(uuid, uuid, text)
to authenticated;

grant execute on function public.change_user_role_internal(uuid, text, uuid) to service_role;
revoke execute on function public.change_user_role_internal(uuid, text, uuid) from public, anon, authenticated;

commit;
