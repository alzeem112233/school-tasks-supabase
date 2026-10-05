create or replace function public.staff_evaluation_sequence_allowed(p_sequence_key text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select case (public.current_profile()).role
    when 'superadmin' then true
    when 'general_manager' then p_sequence_key = 'principal'
    when 'branch_manager' then p_sequence_key = 'principal'
    when 'school_principal' then p_sequence_key = 'principal'
    when 'deputy_principal' then p_sequence_key = 'deputy'
    when 'development_supervision_manager' then p_sequence_key = 'educational_supervisor'
    when 'educational_supervisor' then p_sequence_key = 'educational_supervisor'
    when 'general_secretary' then p_sequence_key = 'school_secretary'
    when 'school_secretary' then p_sequence_key = 'school_secretary'
    when 'specialist_supervisor' then p_sequence_key = 'social_specialist'
    when 'stage_supervisor' then p_sequence_key = 'administrative_supervisor'
    when 'activity_supervisor' then p_sequence_key = 'activity_supervisor'
    when 'computer_unit' then p_sequence_key = 'computer_unit'
    when 'printing_unit' then p_sequence_key = 'printing_unit'
    else false
  end;
$$;

revoke all on function public.staff_evaluation_sequence_allowed(text) from public, anon;
grant execute on function public.staff_evaluation_sequence_allowed(text) to authenticated;

drop policy if exists staff_evaluations_insert on public.staff_evaluations;
create policy staff_evaluations_insert on public.staff_evaluations
for insert to authenticated
with check (public.is_active_user() and public.staff_evaluation_sequence_allowed(sequence_key) and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id()) and (public.current_user_role() in ('general_manager','school_principal','deputy_principal','school_secretary','computer_unit','printing_unit') or (evaluated_by = (select auth.uid()) and exists (select 1 from public.staff_evaluation_settings setting where setting.school_id = staff_evaluations.school_id and setting.open_to_all))) );

drop policy if exists staff_evaluations_update on public.staff_evaluations;
create policy staff_evaluations_update on public.staff_evaluations
for update to authenticated
using (public.is_active_user() and public.staff_evaluation_sequence_allowed(sequence_key) and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id()))
with check (public.is_active_user() and public.staff_evaluation_sequence_allowed(sequence_key) and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id()));

drop policy if exists staff_evaluations_delete on public.staff_evaluations;
create policy staff_evaluations_delete on public.staff_evaluations
for delete to authenticated
using (public.is_active_user() and public.staff_evaluation_sequence_allowed(sequence_key) and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id()));

update public.profiles
set department_name = 'الإشراف التربوي', updated_at = now()
where lower(email) = lower('m.algaadari@gmail.com')
  and role = 'educational_supervisor';
