begin;

update public.profiles
   set department_name = null,
       updated_at = now()
 where department_name is not null;

create or replace function public.clear_profile_department_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.department_name := null;
  return new;
end;
$$;

drop trigger if exists clear_profile_department_name on public.profiles;
create trigger clear_profile_department_name
before insert or update on public.profiles
for each row execute function public.clear_profile_department_name();

revoke execute on function public.clear_profile_department_name() from public, anon, authenticated;

commit;
