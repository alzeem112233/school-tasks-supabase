alter table public.staff_evaluations
  add column if not exists assessment_period text not null default 'first_term';

alter table public.staff_evaluations
  drop constraint if exists staff_evaluations_assessment_period_check;

alter table public.staff_evaluations
  add constraint staff_evaluations_assessment_period_check
  check (assessment_period in ('first_term', 'second_term'));

update public.staff_evaluations
set assessment_period = 'first_term'
where assessment_period is distinct from 'first_term'
  and assessment_period is distinct from 'second_term';

create index if not exists staff_evaluations_period_lookup_idx
  on public.staff_evaluations (school_id, assessment_period, teacher_id, sequence_key, updated_at desc);
