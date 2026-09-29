-- Experimental local-only migration for the "جداول الاختبارات" module.
-- Do not apply to production until the local prototype is reviewed and approved.

create table if not exists public.exam_periods (
  id uuid primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  academic_year text not null default '',
  term text not null default '',
  exam_type text not null default 'monthly' check (exam_type in ('monthly', 'midterm', 'final', 'custom')),
  start_date date not null,
  end_date date not null,
  hijri_label text not null default '',
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'published', 'archived')),
  notes text not null default '',
  prepared_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_period_dates_valid check (end_date >= start_date)
);

create table if not exists public.exam_grade_settings (
  id uuid primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  stage_id text not null,
  stage_name text not null,
  grade_id text not null,
  grade_name text not null,
  sections jsonb not null default '[]'::jsonb,
  subjects jsonb not null default '[]'::jsonb,
  required_count integer not null default 1 check (required_count > 0),
  visible boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, grade_id)
);

create table if not exists public.exam_slots (
  id uuid primary key,
  period_id uuid not null references public.exam_periods(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  grade_id text not null,
  subject text not null,
  exam_date date not null,
  start_time time,
  end_time time,
  room text not null default '',
  proctors jsonb not null default '[]'::jsonb,
  notes text not null default '',
  color text not null default '#2563eb',
  approval_status text not null default 'draft' check (approval_status in ('draft', 'approved')),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_slot_time_valid check (end_time is null or start_time is null or end_time > start_time)
);

create table if not exists public.exam_slot_sections (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.exam_slots(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  grade_id text not null,
  section_name text not null,
  created_at timestamptz not null default now(),
  unique (slot_id, grade_id, section_name)
);

create table if not exists public.exam_schedule_logs (
  id uuid primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  period_id uuid references public.exam_periods(id) on delete cascade,
  action text not null,
  title text not null,
  details text not null default '',
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default '',
  actor_role text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists exam_periods_school_status_idx on public.exam_periods (school_id, status, start_date desc);
create index if not exists exam_slots_period_date_idx on public.exam_slots (period_id, exam_date, grade_id);
create index if not exists exam_slot_sections_lookup_idx on public.exam_slot_sections (school_id, grade_id, section_name);
create index if not exists exam_schedule_logs_period_idx on public.exam_schedule_logs (period_id, created_at desc);

alter table public.exam_periods enable row level security;
alter table public.exam_grade_settings enable row level security;
alter table public.exam_slots enable row level security;
alter table public.exam_slot_sections enable row level security;
alter table public.exam_schedule_logs enable row level security;

-- Only these roles can access the module:
-- general_manager, school_principal, deputy_principal, educational_supervisor.

drop policy if exists exam_periods_read on public.exam_periods;
create policy exam_periods_read on public.exam_periods for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))
  )
);

drop policy if exists exam_periods_write on public.exam_periods;
create policy exam_periods_write on public.exam_periods for all to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))
  )
);

drop policy if exists exam_grade_settings_read on public.exam_grade_settings;
create policy exam_grade_settings_read on public.exam_grade_settings for select to authenticated
using (public.is_active_user() and (public.current_user_role() = 'general_manager' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))));

drop policy if exists exam_grade_settings_write on public.exam_grade_settings;
create policy exam_grade_settings_write on public.exam_grade_settings for all to authenticated
using (public.is_active_user() and (public.current_user_role() = 'general_manager' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))))
with check (public.is_active_user() and (public.current_user_role() = 'general_manager' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))));

drop policy if exists exam_slots_read on public.exam_slots;
create policy exam_slots_read on public.exam_slots for select to authenticated
using (public.is_active_user() and (public.current_user_role() = 'general_manager' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))));

drop policy if exists exam_slots_write on public.exam_slots;
create policy exam_slots_write on public.exam_slots for all to authenticated
using (public.is_active_user() and (public.current_user_role() = 'general_manager' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))))
with check (public.is_active_user() and (public.current_user_role() = 'general_manager' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))));

drop policy if exists exam_slot_sections_read on public.exam_slot_sections;
create policy exam_slot_sections_read on public.exam_slot_sections for select to authenticated
using (public.is_active_user() and (public.current_user_role() = 'general_manager' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))));

drop policy if exists exam_slot_sections_write on public.exam_slot_sections;
create policy exam_slot_sections_write on public.exam_slot_sections for all to authenticated
using (public.is_active_user() and (public.current_user_role() = 'general_manager' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))))
with check (public.is_active_user() and (public.current_user_role() = 'general_manager' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))));

drop policy if exists exam_schedule_logs_read on public.exam_schedule_logs;
create policy exam_schedule_logs_read on public.exam_schedule_logs for select to authenticated
using (public.is_active_user() and (public.current_user_role() = 'general_manager' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))));

drop policy if exists exam_schedule_logs_insert on public.exam_schedule_logs;
create policy exam_schedule_logs_insert on public.exam_schedule_logs for insert to authenticated
with check (public.is_active_user() and (public.current_user_role() = 'general_manager' or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))));

grant select, insert, update, delete on public.exam_periods to authenticated;
grant select, insert, update, delete on public.exam_grade_settings to authenticated;
grant select, insert, update, delete on public.exam_slots to authenticated;
grant select, insert, update, delete on public.exam_slot_sections to authenticated;
grant select, insert on public.exam_schedule_logs to authenticated;

