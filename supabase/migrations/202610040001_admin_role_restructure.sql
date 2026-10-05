do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%role = ANY%';

  if constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check check (
    role in (
      'superadmin',
      'general_manager',
      'branch_manager',
      'finance_manager',
      'development_supervision_manager',
      'general_secretary',
      'school_principal',
      'deputy_principal',
      'school_secretary',
      'educational_supervisor',
      'specialist_supervisor',
      'stage_supervisor',
      'activity_supervisor',
      'finance',
      'computer_unit',
      'printing_unit',
      'tracker'
    )
  );

update public.profiles
set role = 'superadmin',
    school_id = '11111111-1111-4111-8111-111111111111'::uuid,
    updated_at = now()
where role = 'general_manager'
  and school_id = '11111111-1111-4111-8111-111111111111'::uuid
  and lower(email) = 'alzeem112233@gmail.com';

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (public.current_profile()).role in (
      'superadmin',
      'branch_manager',
      'finance_manager',
      'development_supervision_manager',
      'general_secretary'
    ) then 'general_manager'
    else (public.current_profile()).role
  end;
$$;
