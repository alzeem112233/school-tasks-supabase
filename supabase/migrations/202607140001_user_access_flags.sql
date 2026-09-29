alter table public.profiles
  add column if not exists access_flags jsonb not null default '{}'::jsonb;

drop function if exists public.admin_upsert_user_profile(text, text, text, uuid, text, boolean, uuid);
drop function if exists public.admin_upsert_user_profile(text, text, text, uuid, text, boolean, uuid, jsonb);

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
begin
  select * into actor from public.profiles where id = auth.uid() and status = 'active';
  if actor.id is null or actor.role not in ('general_manager', 'school_principal') then
    raise exception 'No permission to manage users.' using errcode = '42501';
  end if;

  target_id := coalesce(p_user_id, auth.uid());
  if target_id is null then
    raise exception 'User id is required.' using errcode = '22023';
  end if;

  select * into existing from public.profiles where id = target_id;

  insert into public.profiles (
    id, school_id, full_name, email, role, status, department_name, access_flags, created_at, updated_at
  ) values (
    target_id,
    p_school_id,
    trim(p_full_name),
    lower(trim(p_email)),
    p_role,
    case when p_active then 'active' else 'inactive' end,
    nullif(trim(coalesce(p_department_name, '')), ''),
    coalesce(p_access_flags, '{}'::jsonb),
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
    access_flags = excluded.access_flags,
    updated_at = now();

  return jsonb_build_object('ok', true, 'id', target_id);
end;
$$;

grant execute on function public.admin_upsert_user_profile(text, text, text, uuid, text, boolean, uuid, jsonb)
  to authenticated;
