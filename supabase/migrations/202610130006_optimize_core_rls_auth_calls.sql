begin;

-- These four policies keep the same access rules; only auth.uid() is wrapped
-- in a statement-level subquery for better RLS performance.
alter policy tasks_read on public.tasks using (
  (current_user_role() = 'general_manager'::text)
  or (can_access_school(school_id) and can_read_school_tasks())
  or (assigned_to = (select auth.uid()))
);

alter policy profiles_read on public.profiles using (
  is_active_user()
  and (
    (id = (select auth.uid()))
    or (current_user_role() = 'general_manager'::text)
    or can_access_school(school_id)
  )
);

alter policy notifications_read on public.notifications using (
  (user_id = (select auth.uid()))
  or (current_user_role() = 'general_manager'::text)
  or (
    school_id = current_user_school_id()
    and current_user_role() = any (
      array['school_principal'::text, 'deputy_principal'::text, 'school_secretary'::text]
    )
  )
);

alter policy notifications_update on public.notifications using (
  (user_id = (select auth.uid()))
  or (current_user_role() = 'general_manager'::text)
) with check (
  (user_id = (select auth.uid()))
  or (current_user_role() = 'general_manager'::text)
);

commit;
