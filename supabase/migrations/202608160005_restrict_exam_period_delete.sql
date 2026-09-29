drop policy if exists exam_periods_write on public.exam_periods;
drop policy if exists exam_periods_read on public.exam_periods;
drop policy if exists exam_periods_insert on public.exam_periods;
drop policy if exists exam_periods_update on public.exam_periods;
drop policy if exists exam_periods_delete on public.exam_periods;

create policy exam_periods_read on public.exam_periods for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))
  )
);

create policy exam_periods_insert on public.exam_periods for insert to authenticated
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal', 'educational_supervisor', 'printing_unit'))
  )
);

create policy exam_periods_update on public.exam_periods for update to authenticated
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

create policy exam_periods_delete on public.exam_periods for delete to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
  )
);
