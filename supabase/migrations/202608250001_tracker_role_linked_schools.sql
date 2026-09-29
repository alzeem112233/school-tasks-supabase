begin;

alter table public.profiles
  add column if not exists linked_school_ids uuid[] not null default '{}'::uuid[];

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in (
    'general_manager',
    'general_secretary',
    'school_principal',
    'deputy_principal',
    'stage_supervisor',
    'school_secretary',
    'educational_supervisor',
    'specialist_supervisor',
    'activity_supervisor',
    'finance',
    'computer_unit',
    'printing_unit',
    'tracker'
  ));

create or replace function public.current_user_linked_school_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce((public.current_profile()).linked_school_ids, '{}'::uuid[]);
$$;

create or replace function public.can_access_school(p_school_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or p_school_id = public.current_user_school_id()
    or (
      public.current_user_role() = 'tracker'
      and p_school_id = any(public.current_user_linked_school_ids())
    )
  );
$$;

create or replace function public.can_read_school_tasks() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.current_user_role() in (
    'general_manager',
    'general_secretary',
    'school_principal',
    'deputy_principal',
    'school_secretary',
    'tracker'
  );
$$;

drop policy if exists schools_read on public.schools;
create policy schools_read on public.schools for select to authenticated
using (public.can_access_school(id));

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (
  public.is_active_user()
  and (
    id = auth.uid()
    or public.current_user_role() = 'general_manager'
    or public.can_access_school(school_id)
  )
);

drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated
using (
  public.current_user_role() = 'general_manager'
  or (public.can_access_school(school_id) and public.can_read_school_tasks())
  or assigned_to = auth.uid()
);

drop policy if exists attachments_read on public.attachments;
create policy attachments_read on public.attachments for select to authenticated
using (exists (
  select 1 from public.tasks t
  where t.id = task_id
    and (
      public.current_user_role() = 'general_manager'
      or (public.can_access_school(t.school_id) and (public.can_read_school_tasks() or t.assigned_to = auth.uid()))
    )
));

drop policy if exists administrative_reports_read on public.administrative_reports;
create policy administrative_reports_read on public.administrative_reports for select to authenticated
using (
  public.is_active_user()
  and (
    public.current_user_role() = 'general_manager'
    or (public.can_access_school(school_id) and public.current_user_role() in ('school_principal', 'deputy_principal', 'tracker'))
    or supervisor_id = auth.uid()
  )
);

drop policy if exists finance_discounts_read on public.finance_discounts;
create policy finance_discounts_read on public.finance_discounts for select to authenticated
using (
  public.is_active_user()
  and (
    public.current_user_role() = 'general_manager'
    or (public.can_access_school(school_id) and public.current_user_role() in ('school_principal', 'finance', 'tracker'))
  )
);

drop policy if exists activity_read on public.activity_logs;
create policy activity_read on public.activity_logs for select to authenticated
using (
  public.current_user_role() = 'general_manager'
  or user_id = auth.uid()
  or (public.can_access_school(school_id) and public.can_read_school_tasks())
);

drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated
using (
  public.current_user_role() = 'general_manager'
  or (public.can_access_school(school_id) and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary', 'tracker'))
);

drop policy if exists backups_read on public.backups;
create policy backups_read on public.backups for select to authenticated
using (
  public.current_user_role() = 'general_manager'
  or (public.can_access_school(school_id) and public.current_user_role() in ('school_principal', 'tracker'))
);

drop policy if exists administrative_circulars_read on public.administrative_circulars;
create policy administrative_circulars_read on public.administrative_circulars for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or public.can_access_school(school_id)
    or exists (
      select 1 from public.circular_recipients recipient
      where recipient.circular_id = id and recipient.user_id = auth.uid()
    )
  )
);

drop policy if exists circular_recipients_read on public.circular_recipients;
create policy circular_recipients_read on public.circular_recipients for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or user_id = auth.uid()
    or public.can_access_school(school_id)
  )
);

drop policy if exists meetings_read on public.meetings;
create policy meetings_read on public.meetings for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or public.can_access_school(school_id)
    or chair_id = auth.uid()
    or organizer_id = auth.uid()
    or exists (select 1 from public.meeting_attendees attendee where attendee.meeting_id = id and attendee.user_id = auth.uid())
  )
);

drop policy if exists meeting_attendees_read on public.meeting_attendees;
create policy meeting_attendees_read on public.meeting_attendees for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or user_id = auth.uid()
    or public.can_access_school(school_id)
  )
);

drop policy if exists meeting_decisions_read on public.meeting_decisions;
create policy meeting_decisions_read on public.meeting_decisions for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or owner_id = auth.uid()
    or public.can_access_school(school_id)
  )
);

drop policy if exists exam_periods_read on public.exam_periods;
create policy exam_periods_read on public.exam_periods for select to authenticated
using (public.is_active_user() and (public.current_user_role() = 'general_manager' or public.can_access_school(school_id)));

drop policy if exists exam_grade_settings_read on public.exam_grade_settings;
create policy exam_grade_settings_read on public.exam_grade_settings for select to authenticated
using (public.is_active_user() and (public.current_user_role() = 'general_manager' or public.can_access_school(school_id)));

drop policy if exists exam_slots_read on public.exam_slots;
create policy exam_slots_read on public.exam_slots for select to authenticated
using (public.is_active_user() and (public.current_user_role() = 'general_manager' or public.can_access_school(school_id)));

drop policy if exists exam_slot_sections_read on public.exam_slot_sections;
create policy exam_slot_sections_read on public.exam_slot_sections for select to authenticated
using (public.is_active_user() and (public.current_user_role() = 'general_manager' or public.can_access_school(school_id)));

drop policy if exists exam_schedule_logs_read on public.exam_schedule_logs;
create policy exam_schedule_logs_read on public.exam_schedule_logs for select to authenticated
using (public.is_active_user() and (public.current_user_role() = 'general_manager' or public.can_access_school(school_id)));

revoke execute on function public.current_user_linked_school_ids() from public, anon, authenticated;
grant execute on function public.current_user_linked_school_ids() to authenticated, service_role;

commit;
