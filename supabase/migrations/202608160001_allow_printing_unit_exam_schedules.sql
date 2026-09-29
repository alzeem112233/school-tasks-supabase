-- Allow printing unit users to create and edit exam schedules before final approval.
-- Final approval locking is enforced in the app by school principal/general manager only.

drop policy if exists exam_periods_read on public.exam_periods;
create policy exam_periods_read on public.exam_periods for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit')
    )
  )
);

drop policy if exists exam_periods_write on public.exam_periods;
create policy exam_periods_write on public.exam_periods for all to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit')
    )
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit')
    )
  )
);

drop policy if exists exam_schedule_logs_read on public.exam_schedule_logs;
create policy exam_schedule_logs_read on public.exam_schedule_logs for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit')
    )
  )
);

drop policy if exists exam_schedule_logs_insert on public.exam_schedule_logs;
create policy exam_schedule_logs_insert on public.exam_schedule_logs for insert to authenticated
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit')
    )
  )
);
