begin;

-- These helpers are used by RLS and signed-in application flows, but never by
-- the public login/bootstrap surface. Anonymous RPC execution is unnecessary.
revoke execute on function public.can_create_task_values(text) from anon;
revoke execute on function public.current_profile() from anon;
revoke execute on function public.current_user_access_flag(text) from anon;
revoke execute on function public.current_user_role() from anon;
revoke execute on function public.current_user_school_id() from anon;
revoke execute on function public.is_active_user() from anon;
revoke execute on function public.qz_academy_id() from anon;
revoke execute on function public.qz_can_access_academy(text) from anon;
revoke execute on function public.qz_can_access_row(text, uuid) from anon;
revoke execute on function public.qz_has_permission(text) from anon;
revoke execute on function public.qz_is_super_admin() from anon;
revoke execute on function public.qz_role() from anon;
revoke execute on function public.qz_session() from anon;
revoke execute on function public.qz_set_academy_from_school() from anon;
revoke execute on function public.qz_set_player_badge_academy() from anon;
revoke execute on function public.qz_set_school_academy() from anon;
revoke execute on function public.schedule_continuous_task_next_day() from anon;

-- Foreign-key indexes used by task, notification, reporting, and evaluation
-- joins. IF NOT EXISTS keeps this migration safe on existing deployments.
create index if not exists tasks_created_by_idx on public.tasks (created_by);
create index if not exists tasks_department_id_idx on public.tasks (department_id);
create index if not exists attachments_school_id_idx on public.attachments (school_id);
create index if not exists attachments_uploaded_by_idx on public.attachments (uploaded_by);
create index if not exists notifications_related_task_id_idx on public.notifications (related_task_id);
create index if not exists notifications_school_id_idx on public.notifications (school_id);
create index if not exists administrative_reports_supervisor_id_idx on public.administrative_reports (supervisor_id);
create index if not exists administrative_reports_approvers_idx on public.administrative_reports (deputy_approved_by, principal_approved_by);
create index if not exists staff_evaluations_evaluated_by_idx on public.staff_evaluations (evaluated_by);
create index if not exists staff_evaluations_teacher_id_idx on public.staff_evaluations (teacher_id);
create index if not exists notebook_role_templates_updated_by_idx on public.notebook_role_templates (updated_by);

commit;
