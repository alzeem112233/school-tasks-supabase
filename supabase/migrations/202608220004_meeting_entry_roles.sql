-- Allow printing and computer units to create and manage meeting records for their branch.

drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings for insert to authenticated
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary', 'printing_unit', 'computer_unit')
    )
  )
);

drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings for update to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or organizer_id = auth.uid()
    or chair_id = auth.uid()
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary', 'printing_unit', 'computer_unit')
    )
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or organizer_id = auth.uid()
    or chair_id = auth.uid()
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary', 'printing_unit', 'computer_unit')
    )
  )
);

drop policy if exists meeting_attendees_write on public.meeting_attendees;
create policy meeting_attendees_write on public.meeting_attendees for all to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or user_id = auth.uid()
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary', 'printing_unit', 'computer_unit')
    )
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or user_id = auth.uid()
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary', 'printing_unit', 'computer_unit')
    )
  )
);

drop policy if exists meeting_decisions_write on public.meeting_decisions;
create policy meeting_decisions_write on public.meeting_decisions for all to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or owner_id = auth.uid()
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary', 'printing_unit', 'computer_unit')
    )
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or owner_id = auth.uid()
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary', 'printing_unit', 'computer_unit')
    )
  )
);
