drop policy if exists staff_evaluations_write on public.staff_evaluations;
drop policy if exists staff_evaluations_insert on public.staff_evaluations;
drop policy if exists staff_evaluations_update on public.staff_evaluations;
drop policy if exists staff_evaluations_delete on public.staff_evaluations;

create policy staff_evaluations_insert
on public.staff_evaluations
for insert
to authenticated
with check (
  public.is_active_user()
  and public.current_user_role() in ('general_manager','school_principal','deputy_principal','school_secretary','computer_unit','printing_unit')
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
);

create policy staff_evaluations_update
on public.staff_evaluations
for update
to authenticated
using (
  public.is_active_user()
  and public.current_user_role() in ('general_manager','school_principal','deputy_principal','school_secretary','computer_unit','printing_unit')
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
)
with check (
  public.is_active_user()
  and public.current_user_role() in ('general_manager','school_principal','deputy_principal','school_secretary','computer_unit','printing_unit')
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
);

create policy staff_evaluations_delete
on public.staff_evaluations
for delete
to authenticated
using (
  public.is_active_user()
  and public.current_user_role() in ('general_manager','school_principal','deputy_principal','school_secretary','computer_unit','printing_unit')
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
);
