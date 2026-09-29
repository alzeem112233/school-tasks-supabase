begin;

create or replace function public.admin_upsert_user_profile(
  p_email text,
  p_full_name text,
  p_role text,
  p_school_id uuid,
  p_department_name text default null,
  p_active boolean default true,
  p_user_id uuid default null,
  p_access_flags jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles;
  existing public.profiles;
  target_id uuid;
  general_school_id constant uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  target_school_id uuid;
  allowed_roles constant text[] := array[
    'general_manager', 'school_principal', 'deputy_principal', 'school_secretary',
    'educational_supervisor', 'specialist_supervisor', 'stage_supervisor',
    'activity_supervisor', 'finance', 'computer_unit', 'printing_unit', 'tracker'
  ];
begin
  select * into actor
  from public.profiles
  where id = auth.uid() and status = 'active';

  if actor.id is null or actor.role not in ('general_manager', 'school_principal') then
    raise exception 'No permission to manage users.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is null
     or nullif(trim(coalesce(p_full_name, '')), '') is null
     or not (p_role = any(allowed_roles)) then
    raise exception 'Invalid user profile data.' using errcode = '22023';
  end if;

  target_school_id := case when p_role = 'general_manager' then general_school_id else p_school_id end;
  if target_school_id is null then
    raise exception 'School is required.' using errcode = '22023';
  end if;
  if p_role <> 'general_manager' and target_school_id = general_school_id then
    raise exception 'General administration is reserved for general accounts.' using errcode = '22023';
  end if;
  if actor.role = 'school_principal' and (
    target_school_id <> actor.school_id
    or p_role in ('general_manager', 'school_principal', 'tracker')
  ) then
    raise exception 'No permission to assign this role or school.' using errcode = '42501';
  end if;

  target_id := p_user_id;
  if target_id is null then
    raise exception 'User id is required.' using errcode = '22023';
  end if;
  select * into existing from public.profiles where id = target_id;
  if existing.id is not null and actor.role = 'school_principal' and (
    existing.school_id <> actor.school_id
    or existing.role in ('general_manager', 'school_principal', 'tracker')
  ) then
    raise exception 'No permission to modify this user.' using errcode = '42501';
  end if;

  insert into public.profiles (
    id, school_id, full_name, email, role, status, department_name,
    access_flags, created_at, updated_at
  ) values (
    target_id, target_school_id, trim(p_full_name), lower(trim(p_email)), p_role,
    case when p_active then 'active' else 'inactive' end,
    nullif(trim(coalesce(p_department_name, '')), ''),
    coalesce(p_access_flags, '{}'::jsonb), coalesce(existing.created_at, now()), now()
  )
  on conflict (id) do update set
    school_id = excluded.school_id,
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role,
    status = excluded.status,
    department_name = excluded.department_name,
    access_flags = excluded.access_flags,
    updated_at = now();

  return jsonb_build_object('ok', true, 'id', target_id);
end;
$$;

revoke execute on function public.admin_upsert_user_profile(text, text, text, uuid, text, boolean, uuid, jsonb)
from public, anon;
grant execute on function public.admin_upsert_user_profile(text, text, text, uuid, text, boolean, uuid, jsonb)
to authenticated;

commit;
