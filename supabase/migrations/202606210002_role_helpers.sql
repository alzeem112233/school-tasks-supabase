begin;

create or replace function public.get_current_user_role() returns text
language sql stable security definer set search_path = '' as $$
  select public.current_user_role();
$$;

create or replace function public.get_current_school_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select public.current_user_school_id();
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.get_current_user_role() = 'super_admin';
$$;

create or replace function public.is_school_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.get_current_user_role() = 'school_admin';
$$;

create or replace function public.can_manage_users() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.get_current_user_role() in ('super_admin', 'school_admin');
$$;

create or replace function public.can_manage_tasks() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.get_current_user_role() in ('super_admin', 'school_admin', 'deputy_principal');
$$;

revoke execute on function public.get_current_user_role(), public.get_current_school_id(),
  public.is_super_admin(), public.is_school_admin(), public.can_manage_users(), public.can_manage_tasks()
from public, anon;

grant execute on function public.get_current_user_role(), public.get_current_school_id(),
  public.is_super_admin(), public.is_school_admin(), public.can_manage_users(), public.can_manage_tasks()
to authenticated;

commit;
