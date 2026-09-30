alter table public.staff_evaluations
  drop constraint if exists staff_evaluations_sequence_key_check;

alter table public.staff_evaluations
  add constraint staff_evaluations_sequence_key_check
  check (sequence_key in (
    'principal',
    'deputy',
    'educational_supervisor',
    'administrative_supervisor',
    'computer_unit',
    'printing_unit',
    'school_secretary',
    'activity_supervisor',
    'social_specialist'
  ));

insert into public.staff_evaluations (
  id, school_id, teacher_id, teacher_name, subject_name, sequence_key,
  evaluated_at, scores, total, max_total, notes, evaluated_by, created_at, updated_at
)
select
  gen_random_uuid(), school_id, teacher_id, teacher_name, subject_name, 'printing_unit',
  evaluated_at, jsonb_build_object('cover', coalesce((scores ->> 'cover')::numeric, 0)),
  coalesce((scores ->> 'cover')::numeric, 0), 2, notes, evaluated_by, created_at, now()
from public.staff_evaluations
where sequence_key = 'secretary_computer';

insert into public.staff_evaluations (
  id, school_id, teacher_id, teacher_name, subject_name, sequence_key,
  evaluated_at, scores, total, max_total, notes, evaluated_by, created_at, updated_at
)
select
  gen_random_uuid(), school_id, teacher_id, teacher_name, subject_name, 'school_secretary',
  evaluated_at, jsonb_build_object('work_time', coalesce((scores ->> 'work_time')::numeric, 0)),
  coalesce((scores ->> 'work_time')::numeric, 0), 2, notes, evaluated_by, created_at, now()
from public.staff_evaluations
where sequence_key = 'secretary_computer';

update public.staff_evaluations
set
  sequence_key = 'computer_unit',
  scores = jsonb_build_object(
    'matching', coalesce((scores ->> 'matching')::numeric, 0),
    'android', coalesce((scores ->> 'android')::numeric, 0)
  ),
  total = coalesce((scores ->> 'matching')::numeric, 0) + coalesce((scores ->> 'android')::numeric, 0),
  max_total = 4,
  updated_at = now()
where sequence_key = 'secretary_computer';

drop policy if exists staff_evaluations_write on public.staff_evaluations;

create policy staff_evaluations_write
on public.staff_evaluations
for all
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
