-- Keep the existing rule and init-plan the session identity lookup.
alter policy grade_adjustments_insert on public.grade_adjustments
  with check ((is_active_user() and (created_by = (select auth.uid())) and ((current_user_role() = 'general_manager'::text) or ((school_id = current_user_school_id()) and (current_user_role() = any (array['school_principal'::text, 'deputy_principal'::text]))))));
