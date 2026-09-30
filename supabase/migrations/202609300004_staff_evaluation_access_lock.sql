create table if not exists public.staff_evaluation_settings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references public.schools(id) on delete cascade,
  open_to_all boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_evaluation_settings enable row level security;
grant select, insert, update on public.staff_evaluation_settings to authenticated;

drop policy if exists staff_evaluation_settings_read on public.staff_evaluation_settings;
drop policy if exists staff_evaluation_settings_insert on public.staff_evaluation_settings;
drop policy if exists staff_evaluation_settings_update on public.staff_evaluation_settings;

create policy staff_evaluation_settings_read
on public.staff_evaluation_settings
for select
to authenticated
using (
  public.is_active_user()
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
);

create policy staff_evaluation_settings_insert
on public.staff_evaluation_settings
for insert
to authenticated
with check (
  public.is_active_user()
  and public.current_user_role() in ('general_manager','school_principal','deputy_principal')
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
);

create policy staff_evaluation_settings_update
on public.staff_evaluation_settings
for update
to authenticated
using (
  public.is_active_user()
  and public.current_user_role() in ('general_manager','school_principal','deputy_principal')
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
)
with check (
  public.is_active_user()
  and public.current_user_role() in ('general_manager','school_principal','deputy_principal')
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
);

create or replace function public.staff_evaluation_scores_valid(p_sequence_key text, p_scores jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  limits jsonb;
  score_item record;
  score_count integer;
  limit_count integer;
begin
  limits := case p_sequence_key
    when 'principal' then '{"relationships":2,"cooperation":3,"meetings":2,"complaints":3}'::jsonb
    when 'deputy' then '{"delivery":2,"grade_record":2,"attendance":2,"correction":2,"accuracy":2,"supervision":3}'::jsonb
    when 'educational_supervisor' then '{"supervisor_form":20,"special_form":10,"tests":2,"planning":2,"screen":2,"appendices":2}'::jsonb
    when 'administrative_supervisor' then '{"morning":2,"lesson_time":2,"class_exit":2,"discipline":2,"parent_contact":4,"building":2,"notebooks":4,"dismissal":3,"values":2}'::jsonb
    when 'computer_unit' then '{"matching":2,"android":2}'::jsonb
    when 'printing_unit' then '{"cover":2}'::jsonb
    when 'school_secretary' then '{"work_time":2}'::jsonb
    when 'activity_supervisor' then '{"broadcast":2,"activities":4}'::jsonb
    when 'social_specialist' then '{"pioneer":2,"values":2}'::jsonb
    else null
  end;

  if limits is null or jsonb_typeof(p_scores) <> 'object' then
    return false;
  end if;

  select count(*) into score_count from jsonb_object_keys(p_scores);
  select count(*) into limit_count from jsonb_object_keys(limits);
  if score_count <> limit_count then return false; end if;

  for score_item in select key, value from jsonb_each(p_scores)
  loop
    if not (limits ? score_item.key)
       or jsonb_typeof(score_item.value) <> 'number'
       or (score_item.value #>> '{}')::numeric < 0
       or (score_item.value #>> '{}')::numeric > (limits ->> score_item.key)::numeric then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

alter table public.staff_evaluations
  drop constraint if exists staff_evaluations_total_limit,
  drop constraint if exists staff_evaluations_scores_limit;

alter table public.staff_evaluations
  add constraint staff_evaluations_total_limit check (total between 0 and 100 and max_total between 0 and 100),
  add constraint staff_evaluations_scores_limit check (public.staff_evaluation_scores_valid(sequence_key, scores)) not valid;

alter table public.staff_evaluations validate constraint staff_evaluations_scores_limit;

create index if not exists staff_evaluations_owner_lookup_idx
  on public.staff_evaluations (school_id, evaluated_by, teacher_id, sequence_key, updated_at desc);

drop policy if exists staff_evaluations_read on public.staff_evaluations;
drop policy if exists staff_evaluations_insert on public.staff_evaluations;
drop policy if exists staff_evaluations_update on public.staff_evaluations;
drop policy if exists staff_evaluations_delete on public.staff_evaluations;

create policy staff_evaluations_read
on public.staff_evaluations
for select
to authenticated
using (
  public.is_active_user()
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
  and (
    public.current_user_role() in ('general_manager','school_principal','deputy_principal')
    or evaluated_by = (select auth.uid())
  )
);

create policy staff_evaluations_insert
on public.staff_evaluations
for insert
to authenticated
with check (
  public.is_active_user()
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
  and (
    public.current_user_role() in ('general_manager','school_principal','deputy_principal','school_secretary','computer_unit','printing_unit')
    or (
      evaluated_by = (select auth.uid())
      and exists (
        select 1 from public.staff_evaluation_settings setting
        where setting.school_id = staff_evaluations.school_id and setting.open_to_all
      )
    )
  )
);

create policy staff_evaluations_update
on public.staff_evaluations
for update
to authenticated
using (
  public.is_active_user()
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
  and (
    public.current_user_role() in ('general_manager','school_principal','deputy_principal','school_secretary','computer_unit','printing_unit')
    or (
      evaluated_by = (select auth.uid())
      and exists (
        select 1 from public.staff_evaluation_settings setting
        where setting.school_id = staff_evaluations.school_id and setting.open_to_all
      )
    )
  )
)
with check (
  public.is_active_user()
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
  and (
    public.current_user_role() in ('general_manager','school_principal','deputy_principal','school_secretary','computer_unit','printing_unit')
    or (
      evaluated_by = (select auth.uid())
      and exists (
        select 1 from public.staff_evaluation_settings setting
        where setting.school_id = staff_evaluations.school_id and setting.open_to_all
      )
    )
  )
);

create policy staff_evaluations_delete
on public.staff_evaluations
for delete
to authenticated
using (
  public.is_active_user()
  and (public.current_user_role() = 'general_manager' or school_id = public.current_user_school_id())
  and (
    public.current_user_role() in ('general_manager','school_principal','deputy_principal','school_secretary','computer_unit','printing_unit')
    or (
      evaluated_by = (select auth.uid())
      and exists (
        select 1 from public.staff_evaluation_settings setting
        where setting.school_id = staff_evaluations.school_id and setting.open_to_all
      )
    )
  )
);
