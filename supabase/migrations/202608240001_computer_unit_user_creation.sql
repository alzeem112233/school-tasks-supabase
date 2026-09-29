begin;

create or replace function public.can_manage_users() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user()
    and public.current_user_role() in ('general_manager', 'school_principal', 'computer_unit');
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
    or (
      p_school_id = public.current_user_school_id()
      and public.current_user_role() = 'computer_unit'
      and p_role not in ('general_manager', 'school_principal')
    )
  );
$$;

grant execute on function public.can_manage_users(), public.can_view_profile_values(uuid, uuid, text) to authenticated;
revoke execute on function public.can_manage_users(), public.can_view_profile_values(uuid, uuid, text) from public, anon;

commit;
