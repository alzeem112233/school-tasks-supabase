create table if not exists public.teacher_directory (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  teacher_name text not null check (length(trim(teacher_name)) > 1), subject_name text not null check (length(trim(subject_name)) > 1),
  active boolean not null default true, created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (school_id, teacher_name, subject_name)
);
create table if not exists public.staff_evaluations (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid references public.teacher_directory(id) on delete set null, teacher_name text not null, subject_name text not null,
  sequence_key text not null check (sequence_key in ('principal','deputy','educational_supervisor','administrative_supervisor','secretary_computer','activity_supervisor','social_specialist')),
  evaluated_at date not null default current_date, scores jsonb not null default '{}'::jsonb, total numeric(8,2) not null default 0, max_total numeric(8,2) not null default 0, notes text not null default '', evaluated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.teacher_directory enable row level security;
alter table public.staff_evaluations enable row level security;
drop policy if exists teacher_directory_read on public.teacher_directory;
drop policy if exists teacher_directory_write on public.teacher_directory;
drop policy if exists staff_evaluations_read on public.staff_evaluations;
drop policy if exists staff_evaluations_write on public.staff_evaluations;
create policy teacher_directory_read on public.teacher_directory for select to authenticated using (public.is_active_user() and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id()));
create policy teacher_directory_write on public.teacher_directory for all to authenticated using (public.is_active_user() and (public.current_user_role() in ('general_manager','school_principal','deputy_principal','school_secretary','computer_unit')) and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())) with check (public.is_active_user() and (public.current_user_role() in ('general_manager','school_principal','deputy_principal','school_secretary','computer_unit')) and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id()));
create policy staff_evaluations_read on public.staff_evaluations for select to authenticated using (public.is_active_user() and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id()));
create policy staff_evaluations_write on public.staff_evaluations for all to authenticated using (public.is_active_user() and public.current_user_role() in ('general_manager','school_principal','deputy_principal','school_secretary','computer_unit') and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())) with check (public.is_active_user() and public.current_user_role() in ('general_manager','school_principal','deputy_principal','school_secretary','computer_unit') and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id()));
grant select, insert, update, delete on public.teacher_directory, public.staff_evaluations to authenticated;
