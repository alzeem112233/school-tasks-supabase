begin;

insert into public.schools (id, name, status)
values ('11111111-1111-4111-8111-111111111111', 'الإدارة العامة', 'active')
on conflict (id) do update set name = excluded.name, status = 'active';

update public.profiles
   set school_id = '11111111-1111-4111-8111-111111111111',
       updated_at = now()
 where role in ('general_manager', 'general_secretary')
   and school_id is distinct from '11111111-1111-4111-8111-111111111111';

create or replace function public.admin_upsert_user_profile(
  p_email text,
  p_full_name text,
  p_role text,
  p_school_id uuid,
  p_department_name text default null,
  p_active boolean default true,
  p_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles;
  target auth.users;
  existing public.profiles;
  clean_email text;
  clean_name text;
  clean_department text;
  event_type text;
  general_school_id uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  target_school_id uuid;
  allowed_roles text[] := array[
    'general_manager',
    'general_secretary',
    'school_principal',
    'deputy_principal',
    'school_secretary',
    'stage_supervisor',
    'educational_supervisor',
    'specialist_supervisor',
    'computer_unit',
    'printing_unit'
  ];
begin
  clean_email := lower(trim(coalesce(p_email, '')));
  clean_name := trim(coalesce(p_full_name, ''));
  clean_department := nullif(trim(coalesce(p_department_name, '')), '');
  target_school_id := case
    when p_role in ('general_manager', 'general_secretary') then general_school_id
    else p_school_id
  end;

  select *
    into actor
    from public.profiles
   where id = auth.uid()
     and status = 'active';

  if actor.id is null or actor.role not in ('general_manager', 'general_secretary', 'school_principal', 'deputy_principal', 'school_secretary') then
    raise exception 'لا توجد صلاحية لتنفيذ هذه العملية.' using errcode = '42501';
  end if;

  if clean_email = '' or clean_name = '' or target_school_id is null or not (p_role = any(allowed_roles)) then
    raise exception 'بيانات المستخدم غير مكتملة أو غير صالحة.' using errcode = '22023';
  end if;

  if p_role not in ('general_manager', 'general_secretary') and target_school_id = general_school_id then
    raise exception 'اختر فرعًا للموظف. الإدارة العامة مخصصة لحسابات الإدارة العامة فقط.' using errcode = '22023';
  end if;

  if actor.role <> 'general_manager' and target_school_id <> actor.school_id then
    raise exception 'لا توجد صلاحية لإدارة مستخدمين خارج المدرسة.' using errcode = '42501';
  end if;

  if clean_department is not null and not exists (
    select 1
      from public.departments department
     where department.school_id = target_school_id
       and department.name = clean_department
  ) then
    raise exception 'القسم المحدد لا يتبع المدرسة المختارة.' using errcode = '22023';
  end if;

  if p_user_id is not null then
    select *
      into target
      from auth.users auth_user
     where auth_user.id = p_user_id
     limit 1;
  else
    select *
      into target
      from auth.users auth_user
     where lower(auth_user.email) = clean_email
     order by auth_user.created_at desc
     limit 1;
  end if;

  if target.id is null then
    raise exception 'لم يتم إنشاء حساب المصادقة بعد. تحقق من إعداد التسجيل أو انشر وظائف Edge.' using errcode = 'P0002';
  end if;

  select *
    into existing
    from public.profiles
   where id = target.id;

  if existing.id is not null and actor.role <> 'general_manager' and (
    existing.school_id <> actor.school_id
    or existing.role in ('general_manager', 'general_secretary', 'school_principal')
  ) then
    raise exception 'لا توجد صلاحية لتعديل هذا المستخدم.' using errcode = '42501';
  end if;

  if coalesce(existing.role, '') <> p_role then
    if actor.role = 'general_manager' then
      null;
    elsif actor.role = 'school_principal' and p_role not in ('general_manager', 'general_secretary', 'school_principal') then
      null;
    elsif existing.id is null
      and actor.role in ('general_secretary', 'deputy_principal', 'school_secretary')
      and p_role not in ('general_manager', 'general_secretary', 'school_principal', 'deputy_principal') then
      null;
    else
      raise exception 'لا توجد صلاحية لتعيين هذا الدور.' using errcode = '42501';
    end if;
  end if;

  if existing.id is not null and existing.school_id is distinct from target_school_id and exists (
    select 1
      from public.tasks task
     where task.assigned_to = target.id
        or task.created_by = target.id
  ) then
    raise exception 'لا يمكن نقل المستخدم إلى مدرسة أخرى قبل إعادة إسناد مهامه.' using errcode = '23503';
  end if;

  update auth.users
     set email = clean_email,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('name', clean_name, 'full_name', clean_name),
         updated_at = now()
   where id = target.id;

  insert into public.profiles (
    id,
    school_id,
    full_name,
    email,
    role,
    status,
    department_name,
    created_at,
    updated_at
  ) values (
    target.id,
    target_school_id,
    clean_name,
    clean_email,
    p_role,
    case when p_active then 'active' else 'inactive' end,
    clean_department,
    coalesce(existing.created_at, now()),
    now()
  )
  on conflict (id) do update set
    school_id = excluded.school_id,
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role,
    status = excluded.status,
    department_name = excluded.department_name,
    updated_at = now();

  event_type := case when existing.id is null then 'user_created' else 'user_updated' end;

  insert into public.activity_logs (
    school_id,
    user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    target_school_id,
    actor.id,
    event_type,
    'profile',
    target.id,
    jsonb_build_object(
      'title', case when existing.id is null then 'تم إنشاء مستخدم' else 'تم تحديث مستخدم' end,
      'description', clean_email || ' (' || p_role || ')'
    )
  );

  insert into public.audit_logs (
    school_id,
    user_id,
    action,
    severity,
    details
  ) values (
    target_school_id,
    actor.id,
    event_type,
    'high',
    jsonb_build_object('targetType', 'profile', 'targetId', target.id, 'message', clean_email || ' (' || p_role || ')')
  );

  return jsonb_build_object('ok', true, 'id', target.id, 'event', event_type);
end;
$$;

revoke execute on function public.admin_upsert_user_profile(text, text, text, uuid, text, boolean, uuid)
from public, anon;

grant execute on function public.admin_upsert_user_profile(text, text, text, uuid, text, boolean, uuid)
to authenticated;

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
    'general_secretary',
    'school_principal',
    'deputy_principal',
    'school_secretary',
    'stage_supervisor',
    'educational_supervisor',
    'specialist_supervisor',
    'computer_unit',
    'printing_unit'
  ];
begin
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

  target_school_id := case
    when p_role in ('general_manager', 'general_secretary') then general_school_id
    else target.school_id
  end;

  if p_role not in ('general_manager', 'general_secretary') and target_school_id = general_school_id then
    raise exception 'اختر فرعًا للمستخدم قبل تغيير هذا الدور.' using errcode = '22023';
  end if;

  if target.school_id is distinct from target_school_id and exists (
    select 1
      from public.tasks task
     where task.assigned_to = target.id
        or task.created_by = target.id
  ) then
    raise exception 'لا يمكن نقل المستخدم إلى مدرسة أخرى قبل إعادة إسناد مهامه.' using errcode = '23503';
  end if;

  if actor.role <> 'general_manager' and (
    target.school_id <> actor.school_id
    or target.role in ('general_manager', 'general_secretary', 'school_principal')
  ) then
    raise exception 'لا توجد صلاحية لتغيير دور هذا المستخدم.' using errcode = '42501';
  end if;

  if p_role <> target.role then
    if actor.role = 'general_manager' then
      null;
    elsif actor.role = 'school_principal' and p_role not in ('general_manager', 'general_secretary', 'school_principal') then
      null;
    else
      raise exception 'لا توجد صلاحية لتعيين هذا الدور.' using errcode = '42501';
    end if;
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

grant execute on function public.change_user_role_internal(uuid, text, uuid) to service_role;
revoke execute on function public.change_user_role_internal(uuid, text, uuid) from public, anon, authenticated;

commit;
