-- Administrative circulars and meetings modules.
-- Safe additive migration: creates new tables, indexes and RLS policies only.

create table if not exists public.administrative_circulars (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  circular_number text not null,
  title text not null,
  category text not null default 'administrative'
    check (category in ('administrative', 'academic', 'finance', 'exams', 'activities', 'attendance', 'urgent', 'custom')),
  issuer text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'draft'
    check (status in ('draft', 'review', 'approval', 'published', 'archived', 'rejected')),
  content text not null default '',
  publish_date date,
  expiry_date date,
  due_date date,
  require_read_receipt boolean not null default true,
  require_action boolean not null default false,
  targets jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  workflow jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  published_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz
);

create table if not exists public.circular_recipients (
  id uuid primary key default gen_random_uuid(),
  circular_id uuid not null references public.administrative_circulars(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  acknowledged_at timestamptz,
  action_status text not null default 'pending' check (action_status in ('pending', 'in_progress', 'completed', 'not_required')),
  action_note text not null default '',
  reminder_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (circular_id, user_id)
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  meeting_number text not null,
  title text not null,
  meeting_type text not null default 'administrative',
  chair_id uuid references public.profiles(id) on delete set null,
  organizer_id uuid references public.profiles(id) on delete set null,
  meeting_date date not null,
  hijri_label text not null default '',
  start_time time,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  location text not null default '',
  online_url text not null default '',
  confidentiality text not null default 'normal' check (confidentiality in ('normal', 'restricted', 'confidential')),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'active', 'minutes_review', 'approved', 'archived', 'cancelled')),
  agenda jsonb not null default '[]'::jsonb,
  minutes jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  reminders jsonb not null default '[]'::jsonb,
  recurrence jsonb not null default '{}'::jsonb,
  approved_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.meeting_attendees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invite_status text not null default 'invited' check (invite_status in ('invited', 'accepted', 'declined', 'tentative')),
  attendance_status text not null default 'pending' check (attendance_status in ('pending', 'present', 'absent', 'excused')),
  response_note text not null default '',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (meeting_id, user_id)
);

create table if not exists public.meeting_decisions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  description text not null default '',
  owner_id uuid references public.profiles(id) on delete set null,
  due_date date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'completed', 'overdue', 'cancelled')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  delay_reason text not null default '',
  related_task_id uuid references public.tasks(id) on delete set null,
  attachments jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists administrative_circulars_school_status_idx on public.administrative_circulars (school_id, status, publish_date desc);
create index if not exists administrative_circulars_search_idx on public.administrative_circulars using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(circular_number, '') || ' ' || coalesce(content, '')));
create index if not exists circular_recipients_user_idx on public.circular_recipients (user_id, read_at, created_at desc);
create index if not exists meetings_school_date_idx on public.meetings (school_id, meeting_date desc, status);
create index if not exists meeting_attendees_user_idx on public.meeting_attendees (user_id, attendance_status);
create index if not exists meeting_decisions_owner_idx on public.meeting_decisions (owner_id, due_date, status);

alter table public.administrative_circulars enable row level security;
alter table public.circular_recipients enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.meeting_decisions enable row level security;

drop policy if exists administrative_circulars_read on public.administrative_circulars;
create policy administrative_circulars_read on public.administrative_circulars for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or school_id = public.current_user_school_id()
    or exists (
      select 1 from public.circular_recipients recipient
      where recipient.circular_id = id and recipient.user_id = auth.uid()
    )
  )
);

drop policy if exists administrative_circulars_insert on public.administrative_circulars;
create policy administrative_circulars_insert on public.administrative_circulars for insert to authenticated
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary'))
  )
);

drop policy if exists administrative_circulars_update on public.administrative_circulars;
create policy administrative_circulars_update on public.administrative_circulars for update to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary'))
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary'))
  )
);

drop policy if exists administrative_circulars_delete on public.administrative_circulars;
create policy administrative_circulars_delete on public.administrative_circulars for delete to authenticated
using (
  public.is_active_user() and status in ('draft', 'rejected') and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
  )
);

drop policy if exists circular_recipients_read on public.circular_recipients;
create policy circular_recipients_read on public.circular_recipients for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or user_id = auth.uid()
    or school_id = public.current_user_school_id()
  )
);

drop policy if exists circular_recipients_write on public.circular_recipients;
create policy circular_recipients_write on public.circular_recipients for all to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or user_id = auth.uid()
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary'))
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or user_id = auth.uid()
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary'))
  )
);

drop policy if exists meetings_read on public.meetings;
create policy meetings_read on public.meetings for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or school_id = public.current_user_school_id()
    or chair_id = auth.uid()
    or organizer_id = auth.uid()
    or exists (select 1 from public.meeting_attendees attendee where attendee.meeting_id = id and attendee.user_id = auth.uid())
  )
);

drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings for insert to authenticated
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary'))
  )
);

drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings for update to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or organizer_id = auth.uid()
    or chair_id = auth.uid()
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal'))
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or organizer_id = auth.uid()
    or chair_id = auth.uid()
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal'))
  )
);

drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete on public.meetings for delete to authenticated
using (
  public.is_active_user() and status in ('draft', 'cancelled') and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
  )
);

drop policy if exists meeting_attendees_read on public.meeting_attendees;
create policy meeting_attendees_read on public.meeting_attendees for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or user_id = auth.uid()
    or school_id = public.current_user_school_id()
  )
);

drop policy if exists meeting_attendees_write on public.meeting_attendees;
create policy meeting_attendees_write on public.meeting_attendees for all to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or user_id = auth.uid()
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary'))
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or user_id = auth.uid()
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary'))
  )
);

drop policy if exists meeting_decisions_read on public.meeting_decisions;
create policy meeting_decisions_read on public.meeting_decisions for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or owner_id = auth.uid()
    or school_id = public.current_user_school_id()
  )
);

drop policy if exists meeting_decisions_write on public.meeting_decisions;
create policy meeting_decisions_write on public.meeting_decisions for all to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or owner_id = auth.uid()
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary'))
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or owner_id = auth.uid()
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary'))
  )
);

grant select, insert, update, delete on public.administrative_circulars to authenticated;
grant select, insert, update, delete on public.circular_recipients to authenticated;
grant select, insert, update, delete on public.meetings to authenticated;
grant select, insert, update, delete on public.meeting_attendees to authenticated;
grant select, insert, update, delete on public.meeting_decisions to authenticated;
