drop policy if exists administrative_reports_read on public.administrative_reports;
create policy administrative_reports_read on public.administrative_reports for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (public.current_user_role() = 'superadmin' and type = 'stage_supervisor_leave_permissions')
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal'))
    or supervisor_id = auth.uid()
  )
);

drop policy if exists administrative_reports_insert on public.administrative_reports;
create policy administrative_reports_insert on public.administrative_reports for insert to authenticated
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (public.current_user_role() = 'superadmin' and type = 'stage_supervisor_leave_permissions')
    or (
      school_id = public.current_user_school_id()
      and (
        (public.current_user_role() = 'stage_supervisor' and supervisor_id = auth.uid())
        or public.current_user_role() in ('school_principal', 'deputy_principal')
      )
    )
  )
);

drop policy if exists administrative_reports_update on public.administrative_reports;
create policy administrative_reports_update on public.administrative_reports for update to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (public.current_user_role() = 'superadmin' and type = 'stage_supervisor_leave_permissions')
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal'))
    or (supervisor_id = auth.uid() and status in ('draft', 'submitted'))
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (public.current_user_role() = 'superadmin' and type = 'stage_supervisor_leave_permissions')
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal'))
    or (supervisor_id = auth.uid() and status in ('draft', 'submitted'))
  )
);

drop policy if exists administrative_reports_delete on public.administrative_reports;
create policy administrative_reports_delete on public.administrative_reports for delete to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (public.current_user_role() = 'superadmin' and type = 'stage_supervisor_leave_permissions')
    or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
  )
);

create or replace function public.save_stage_supervisor_leave_permissions_report(p_report jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  actor_school_id uuid := public.current_user_school_id();
  report_id uuid := coalesce(nullif(p_report->>'id', '')::uuid, gen_random_uuid());
  report_school_id uuid := nullif(p_report->>'schoolId', '')::uuid;
  report_supervisor_id uuid := nullif(p_report->>'supervisorId', '')::uuid;
  report_sections jsonb;
  permission_entries jsonb;
  permission_entry jsonb;
  permission_date_text text;
  report_date_value date;
  existing_report public.administrative_reports;
begin
  if actor_id is null or not public.is_active_user() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if actor_role = 'stage_supervisor' then
    report_school_id := actor_school_id;
    report_supervisor_id := actor_id;
  elsif actor_role = 'superadmin' then
    if report_school_id is null or report_supervisor_id is null then
      raise exception 'The school and stage supervisor are required' using errcode = '23502';
    end if;
  else
    raise exception 'Only stage supervisors and the main account can save learner leave permissions' using errcode = '42501';
  end if;

  select * into existing_report
  from public.administrative_reports
  where id = report_id;

  if found and existing_report.type is distinct from 'stage_supervisor_leave_permissions' then
    raise exception 'This record is not a learner leave permission report' using errcode = '42501';
  end if;

  if actor_role = 'stage_supervisor' and found and (
    existing_report.supervisor_id is distinct from actor_id
    or existing_report.school_id is distinct from actor_school_id
  ) then
    raise exception 'This leave permission report cannot be changed by the current user' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = report_supervisor_id
      and profile.school_id = report_school_id
      and profile.status = 'active'
      and profile.role = 'stage_supervisor'
  ) then
    raise exception 'The selected stage supervisor is not active in this school' using errcode = '23503';
  end if;

  permission_entries := p_report #> '{sections,leavePermissions,entries}';
  if jsonb_typeof(permission_entries) <> 'array' or jsonb_array_length(permission_entries) = 0 then
    raise exception 'At least one leave permission entry is required' using errcode = '23514';
  end if;

  for permission_entry in select value from jsonb_array_elements(permission_entries)
  loop
    if jsonb_typeof(permission_entry) <> 'object'
      or nullif(btrim(coalesce(permission_entry->>'studentName', '')), '') is null
      or nullif(btrim(coalesce(permission_entry->>'className', '')), '') is null
      or nullif(btrim(coalesce(permission_entry->>'reason', '')), '') is null
      or nullif(btrim(coalesce(permission_entry->>'releasedTo', '')), '') is null
      or nullif(btrim(coalesce(permission_entry->>'relation', '')), '') is null
      or nullif(btrim(coalesce(permission_entry->>'guardianPhone', '')), '') is null then
      raise exception 'Every leave permission entry must have complete learner and guardian details' using errcode = '23514';
    end if;

    permission_date_text := nullif(permission_entry->>'date', '');
    if permission_date_text is null or permission_date_text !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Every leave permission entry must have a valid date' using errcode = '22007';
    end if;
  end loop;

  select min((value->>'date')::date)
  into report_date_value
  from jsonb_array_elements(permission_entries);

  report_sections := jsonb_build_object(
    'leavePermissions',
    jsonb_build_object('entries', permission_entries)
  );

  insert into public.administrative_reports (
    id,
    school_id,
    supervisor_id,
    type,
    report_date,
    status,
    sections,
    updated_at
  ) values (
    report_id,
    report_school_id,
    report_supervisor_id,
    'stage_supervisor_leave_permissions',
    report_date_value,
    'draft',
    report_sections,
    now()
  )
  on conflict (id) do update set
    school_id = excluded.school_id,
    supervisor_id = excluded.supervisor_id,
    type = excluded.type,
    report_date = excluded.report_date,
    status = 'draft',
    sections = excluded.sections,
    updated_at = now();

  return report_id;
end;
$$;

revoke execute on function public.save_stage_supervisor_leave_permissions_report(jsonb) from public, anon;
grant execute on function public.save_stage_supervisor_leave_permissions_report(jsonb) to authenticated;
