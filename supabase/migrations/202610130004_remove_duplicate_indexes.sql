begin;

-- The deployment already had equivalent indexes under the idx_* names.
-- Remove only the duplicate names introduced by the previous audit pass.
drop index if exists public.tasks_created_by_idx;
drop index if exists public.tasks_department_id_idx;
drop index if exists public.attachments_school_id_idx;
drop index if exists public.notifications_school_id_idx;

commit;
