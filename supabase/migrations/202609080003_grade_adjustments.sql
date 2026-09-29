begin;

create table if not exists public.grade_adjustments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_name text not null check (char_length(trim(student_name)) between 2 and 200),
  adjustment_month text not null check (adjustment_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  subject_name text not null check (char_length(trim(subject_name)) between 2 and 120),
  teacher_name text not null check (char_length(trim(teacher_name)) between 2 and 200),
  class_name text not null check (char_length(trim(class_name)) between 1 and 100),
  section_name text not null check (char_length(trim(section_name)) between 1 and 50),
  previous_grade numeric(6,2) not null check (previous_grade between 0 and 100),
  new_grade numeric(6,2) not null check (new_grade between 0 and 100),
  reason text not null check (char_length(trim(reason)) between 5 and 2000),
  status text not null default 'pending' check (status in ('pending','received','completed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  received_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  received_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index if not exists grade_adjustments_school_status_idx on public.grade_adjustments(school_id,status,created_at desc);
create index if not exists grade_adjustments_month_idx on public.grade_adjustments(school_id,adjustment_month);

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
    if new.school_id is distinct from old.school_id or new.student_name is distinct from old.student_name or new.adjustment_month is distinct from old.adjustment_month or new.subject_name is distinct from old.subject_name or new.teacher_name is distinct from old.teacher_name or new.class_name is distinct from old.class_name or new.section_name is distinct from old.section_name or new.previous_grade is distinct from old.previous_grade or new.new_grade is distinct from old.new_grade or new.reason is distinct from old.reason or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then raise exception 'Computer unit may update workflow only' using errcode='42501'; end if;
    if old.status='pending' and new.status='received' then new.received_by:=auth.uid();new.received_at:=now();new.completed_at:=null;
    elsif old.status='received' and new.status='completed' and old.received_by=auth.uid() then new.received_by:=old.received_by;new.received_at:=old.received_at;new.completed_at:=now();
    elsif new.status is distinct from old.status then raise exception 'Invalid status transition' using errcode='23514'; end if;
  elsif actor_role not in ('general_manager','school_principal','deputy_principal') then raise exception 'No permission' using errcode='42501';
  end if;
  new.updated_at:=now(); return new;
end $$;

drop trigger if exists grade_adjustment_workflow_trigger on public.grade_adjustments;
create trigger grade_adjustment_workflow_trigger before insert or update on public.grade_adjustments for each row execute function public.enforce_grade_adjustment_workflow();
alter table public.grade_adjustments enable row level security;
alter table public.grade_adjustments force row level security;

create policy grade_adjustments_read on public.grade_adjustments for select to authenticated using (public.is_active_user() and (public.current_user_role()='general_manager' or (school_id=public.current_user_school_id() and public.current_user_role() in ('school_principal','deputy_principal','computer_unit'))));
create policy grade_adjustments_insert on public.grade_adjustments for insert to authenticated with check (public.is_active_user() and created_by=auth.uid() and (public.current_user_role()='general_manager' or (school_id=public.current_user_school_id() and public.current_user_role() in ('school_principal','deputy_principal'))));
create policy grade_adjustments_update on public.grade_adjustments for update to authenticated using (public.is_active_user() and (public.current_user_role()='general_manager' or (school_id=public.current_user_school_id() and public.current_user_role() in ('school_principal','deputy_principal','computer_unit')))) with check (public.is_active_user() and (public.current_user_role()='general_manager' or (school_id=public.current_user_school_id() and public.current_user_role() in ('school_principal','deputy_principal','computer_unit'))));
create policy grade_adjustments_delete on public.grade_adjustments for delete to authenticated using (public.is_active_user() and (public.current_user_role()='general_manager' or (school_id=public.current_user_school_id() and public.current_user_role() in ('school_principal','deputy_principal'))));

do $$ begin if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='grade_adjustments') then alter publication supabase_realtime add table public.grade_adjustments; end if; end $$;
grant select,insert,update,delete on public.grade_adjustments to authenticated;
revoke all on function public.enforce_grade_adjustment_workflow() from public,anon;
grant execute on function public.enforce_grade_adjustment_workflow() to authenticated,service_role;
commit;
