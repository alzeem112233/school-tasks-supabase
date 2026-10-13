begin;

-- PUBLIC grants also cover anon. Keep these RLS helpers available to signed-in
-- sessions, while removing direct execution from unauthenticated callers.
revoke execute on function public.can_create_task_values(text) from public;
grant execute on function public.can_create_task_values(text) to authenticated;
revoke execute on function public.current_profile() from public;
grant execute on function public.current_profile() to authenticated;
revoke execute on function public.current_user_access_flag(text) from public;
grant execute on function public.current_user_access_flag(text) to authenticated;
revoke execute on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;
revoke execute on function public.current_user_school_id() from public;
grant execute on function public.current_user_school_id() to authenticated;
revoke execute on function public.is_active_user() from public;
grant execute on function public.is_active_user() to authenticated;
revoke execute on function public.qz_academy_id() from public;
grant execute on function public.qz_academy_id() to authenticated;
revoke execute on function public.qz_can_access_academy(text) from public;
grant execute on function public.qz_can_access_academy(text) to authenticated;
revoke execute on function public.qz_can_access_row(text, uuid) from public;
grant execute on function public.qz_can_access_row(text, uuid) to authenticated;
revoke execute on function public.qz_has_permission(text) from public;
grant execute on function public.qz_has_permission(text) to authenticated;
revoke execute on function public.qz_is_super_admin() from public;
grant execute on function public.qz_is_super_admin() to authenticated;
revoke execute on function public.qz_role() from public;
grant execute on function public.qz_role() to authenticated;
revoke execute on function public.qz_session() from public;
grant execute on function public.qz_session() to authenticated;
revoke execute on function public.qz_set_academy_from_school() from public;
grant execute on function public.qz_set_academy_from_school() to authenticated;
revoke execute on function public.qz_set_player_badge_academy() from public;
grant execute on function public.qz_set_player_badge_academy() to authenticated;
revoke execute on function public.qz_set_school_academy() from public;
grant execute on function public.qz_set_school_academy() to authenticated;
revoke execute on function public.schedule_continuous_task_next_day() from public;
grant execute on function public.schedule_continuous_task_next_day() to authenticated;

commit;
