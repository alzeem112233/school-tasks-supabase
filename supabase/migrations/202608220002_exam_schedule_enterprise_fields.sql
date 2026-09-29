-- Add enterprise workflow fields to exam schedules without removing existing data.

alter table public.exam_periods
  add column if not exists month_label text not null default '',
  add column if not exists target_grades jsonb not null default '[]'::jsonb,
  add column if not exists version integer not null default 1,
  add column if not exists review_requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists review_requested_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists published_by uuid references public.profiles(id) on delete set null,
  add column if not exists published_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists rejection_note text not null default '',
  add column if not exists public_share_enabled boolean not null default false,
  add column if not exists public_share_token text;

alter table public.exam_slots
  add column if not exists day_name text not null default '',
  add column if not exists hijri_date text not null default '',
  add column if not exists section_names jsonb not null default '[]'::jsonb,
  add column if not exists syllabus text not null default '',
  add column if not exists duration_minutes integer,
  add column if not exists committee_head text not null default '',
  add column if not exists total_score numeric(8,2),
  add column if not exists instructions text not null default '',
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'approved', 'published', 'postponed', 'cancelled'));

create index if not exists exam_periods_workflow_idx on public.exam_periods (school_id, status, version, updated_at desc);
create index if not exists exam_slots_conflict_idx on public.exam_slots (school_id, exam_date, start_time, end_time, room);
create index if not exists exam_slots_subject_lookup_idx on public.exam_slots (period_id, grade_id, subject);

alter table public.exam_periods drop constraint if exists exam_periods_status_check;
alter table public.exam_periods add constraint exam_periods_status_check
  check (status in ('draft', 'review', 'approval', 'approved', 'published', 'archived'));
