begin;

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  generated_name text;
  generated_email text;
begin
  generated_email := coalesce(nullif(lower(new.email), ''), new.id::text || '@pending.invalid');
  generated_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(split_part(generated_email, '@', 1), ''),
    'مستخدم جديد'
  );

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
    new.id,
    null,
    generated_name,
    generated_email,
    'school_secretary',
    'inactive',
    null,
    now(),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

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
)
select
  auth_user.id,
  null,
  coalesce(
    nullif(trim(auth_user.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(auth_user.raw_user_meta_data->>'name'), ''),
    nullif(split_part(coalesce(auth_user.email, ''), '@', 1), ''),
    'مستخدم جديد'
  ),
  coalesce(nullif(lower(auth_user.email), ''), auth_user.id::text || '@pending.invalid'),
  'school_secretary',
  'inactive',
  null,
  coalesce(auth_user.created_at, now()),
  now()
from auth.users auth_user
left join public.profiles profile on profile.id = auth_user.id
where profile.id is null
on conflict (id) do nothing;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

commit;
