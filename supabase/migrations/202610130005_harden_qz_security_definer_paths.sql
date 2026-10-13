begin;

-- All references inside these functions are schema-qualified. An empty search
-- path prevents a caller from shadowing objects used by SECURITY DEFINER code.
alter function public.qz_session() set search_path = '';
alter function public.qz_role() set search_path = '';
alter function public.qz_academy_id() set search_path = '';
alter function public.qz_is_super_admin() set search_path = '';
alter function public.qz_can_access_academy(text) set search_path = '';
alter function public.qz_has_permission(text) set search_path = '';
alter function public.qz_can_access_row(text, uuid) set search_path = '';
alter function public.qz_set_academy_from_school() set search_path = '';
alter function public.qz_set_school_academy() set search_path = '';
alter function public.qz_set_player_badge_academy() set search_path = '';

commit;
