begin;

alter table public.grade_adjustments
  add column if not exists student_number text not null default '';

comment on column public.grade_adjustments.student_number is 'Optional student number captured with grade adjustment requests.';

create index if not exists grade_adjustments_student_number_idx
  on public.grade_adjustments(school_id, student_number)
  where student_number <> '';

create or replace function public.enforce_grade_adjustment_workflow() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor_role text := public.current_user_role();
begin
  if not public.is_active_user() then raise exception 'Inactive user' using errcode='42501'; end if;
  if tg_op = 'INSERT' then
    if actor_role not in ('general_manager','school_principal','deputy_principal') then raise exception 'Only management can create grade adjustments' using errcode='42501'; end if;
    if actor_role <> 'general_manager' and new.school_id <> public.current_user_school_id() then raise exception 'Invalid school' using errcode='42501'; end if;
    new.created_by := auth.uid(); new.status := 'pending'; new.received_by := null; new.received_at := null; new.completed_at := null; new.created_at := now(); new.updated_at := now(); return new;
  end if;
  if actor_role = 'computer_unit' then
    if new.school_id is distinct from old.school_id or new.student_name is distinct from old.student_name or new.student_number is distinct from old.student_number or new.adjustment_month is distinct from old.adjustment_month or new.subject_name is distinct from old.subject_name or new.teacher_name is distinct from old.teacher_name or new.class_name is distinct from old.class_name or new.section_name is distinct from old.section_name or new.previous_grade is distinct from old.previous_grade or new.new_grade is distinct from old.new_grade or new.reason is distinct from old.reason or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then raise exception 'Computer unit may update workflow only' using errcode='42501'; end if;
    if old.status='pending' and new.status='received' then new.received_by:=auth.uid();new.received_at:=now();new.completed_at:=null;
    elsif old.status='received' and new.status='completed' and old.received_by=auth.uid() then new.received_by:=old.received_by;new.received_at:=old.received_at;new.completed_at:=now();
    elsif new.status is distinct from old.status then raise exception 'Invalid status transition' using errcode='23514'; end if;
  elsif actor_role not in ('general_manager','school_principal','deputy_principal') then raise exception 'No permission' using errcode='42501';
  end if;
  new.updated_at:=now(); return new;
end $$;

revoke all on function public.enforce_grade_adjustment_workflow() from public,anon;
grant execute on function public.enforce_grade_adjustment_workflow() to authenticated,service_role;

commit;
