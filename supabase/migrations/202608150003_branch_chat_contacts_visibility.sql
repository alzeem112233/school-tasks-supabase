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
      and p_role <> 'general_manager'
    )
  );
$$;

revoke execute on function public.can_view_profile_values(uuid, uuid, text) from public, anon;
grant execute on function public.can_view_profile_values(uuid, uuid, text) to authenticated, service_role;
