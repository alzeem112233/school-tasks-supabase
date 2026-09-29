begin;

create or replace function public.admin_upsert_user_profile(
  p_email text,
  p_full_name text,
  p_role text,
  p_school_id uuid,
  p_department_name text default null,
  p_active boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles;
  target auth.users;
  clean_email text;
  clean_name text;
  clean_department text;
  allowed_roles text[] := array[
    'general_manager',
    'general_secretary',
    'school_principal',
    'deputy_principal',
    'stage_supervisor',
    'school_secretary',
    'educational_supervisor',
    'specialist_supervisor',
    'computer_unit',
    'printing_unit'
  ];
begin
  clean_email := lower(trim(coalesce(p_email, '')));
  clean_name := trim(coalesce(p_full_name, ''));
  clean_department := nullif(trim(coalesce(p_department_name, '')), '');

  select *
    into actor
    from public.profiles
   where id = auth.uid()
     and status = 'active';

  if actor.id is null or actor.role not in ('general_manager', 'general_secretary', 'school_principal', 'deputy_principal', 'school_secretary') then
    raise exception 'هذه العملية متاحة للمسؤولين فقط.';
  end if;

  if clean_email = '' or clean_name = '' or p_school_id is null or not (p_role = any(allowed_roles)) then
    raise exception 'بيانات المستخدم غير مكتملة أو غير صالحة.';
  end if;

  if actor.role <> 'general_manager' and p_school_id <> actor.school_id then
    raise exception 'مدير المدرسة يدير مستخدمي مدرسته فقط.';
  end if;

  if actor.role <> 'general_manager' and p_role in ('general_manager', 'general_secretary') then
    raise exception 'إنشاء حسابات الإدارة العامة متاح لمدير الإدارة فقط.';
  end if;

  if actor.role not in ('general_manager', 'school_principal') and p_role in ('general_manager', 'general_secretary', 'school_principal', 'deputy_principal') then
    raise exception 'لا توجد صلاحية لتعيين هذا الدور.';
  end if;

  if clean_department is not null and not exists (
    select 1
      from public.departments department
     where department.school_id = p_school_id
       and department.name = clean_department
  ) then
    raise exception 'القسم المحدد لا يتبع المدرسة المختارة.';
  end if;

  select *
    into target
    from auth.users auth_user
   where lower(auth_user.email) = clean_email
   order by auth_user.created_at desc
   limit 1;

  if target.id is null then
    raise exception 'لم يتم إنشاء حساب المصادقة بعد. تحقق من إعداد التسجيل أو انشر وظائف Edge.';
  end if;

  update auth.users
     set email_confirmed_at = coalesce(email_confirmed_at, now()),
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
    updated_at
  ) values (
    target.id,
    p_school_id,
    clean_name,
    clean_email,
    p_role,
    case when p_active then 'active' else 'inactive' end,
    clean_department,
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

  insert into public.activity_logs (
    school_id,
    user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    p_school_id,
    actor.id,
    'user_created',
    'profile',
    target.id,
    jsonb_build_object('title', 'تم إنشاء مستخدم', 'description', clean_email || ' (' || p_role || ')')
  );

  insert into public.audit_logs (
    school_id,
    user_id,
    action,
    severity,
    details
  ) values (
    p_school_id,
    actor.id,
    'user_created',
    'high',
    jsonb_build_object('targetType', 'profile', 'targetId', target.id, 'message', clean_email || ' (' || p_role || ')')
  );

  return jsonb_build_object('ok', true, 'id', target.id);
end;
$$;

revoke execute on function public.admin_upsert_user_profile(text, text, text, uuid, text, boolean)
from public, anon;

grant execute on function public.admin_upsert_user_profile(text, text, text, uuid, text, boolean)
to authenticated;

commit;
