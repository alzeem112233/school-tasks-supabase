create table if not exists public.administrative_reports (
  id uuid primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  supervisor_id uuid references public.profiles(id) on delete set null,
  type text not null default 'daily',
  report_date date not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'deputy_approved', 'principal_approved')),
  sections jsonb not null default '{}'::jsonb,
  building_notes text not null default '',
  suggestions text not null default '',
  deputy_teacher_summary text not null default '',
  deputy_learner_summary text not null default '',
  deputy_parent_summary text not null default '',
  deputy_building_summary text not null default '',
  deputy_recommendations text not null default '',
  submitted_at timestamptz,
  deputy_approved_at timestamptz,
  deputy_approved_by uuid references public.profiles(id) on delete set null,
  principal_approved_at timestamptz,
  principal_approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists administrative_reports_school_date_idx on public.administrative_reports (school_id, report_date desc);
create index if not exists administrative_reports_supervisor_date_idx on public.administrative_reports (supervisor_id, report_date desc);

alter table public.administrative_reports enable row level security;
alter table public.administrative_reports force row level security;

drop policy if exists administrative_reports_read on public.administrative_reports;
create policy administrative_reports_read on public.administrative_reports for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal'))
    or supervisor_id = auth.uid()
  )
);

drop policy if exists administrative_reports_insert on public.administrative_reports;
create policy administrative_reports_insert on public.administrative_reports for insert to authenticated
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
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
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal'))
    or (supervisor_id = auth.uid() and status in ('draft', 'submitted'))
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'deputy_principal'))
    or (supervisor_id = auth.uid() and status in ('draft', 'submitted'))
  )
);

drop policy if exists administrative_reports_delete on public.administrative_reports;
create policy administrative_reports_delete on public.administrative_reports for delete to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
  )
);

grant select, insert, update, delete on table public.administrative_reports to authenticated;
revoke all on table public.administrative_reports from anon;

alter function public.create_complete_backup_internal(uuid, uuid, boolean, jsonb)
  rename to create_complete_backup_administrative_reports_base_internal;

create function public.create_complete_backup_internal(
  p_school_id uuid,
  p_actor_id uuid,
  p_include_all boolean default false,
  p_client_settings jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  backup_id uuid;
  backup_payload jsonb;
  reports_data jsonb;
  reports_count integer;
begin
  result := public.create_complete_backup_administrative_reports_base_internal(p_school_id, p_actor_id, p_include_all, p_client_settings);
  backup_id := (result->>'backupId')::uuid;

  select coalesce(jsonb_agg(to_jsonb(report) order by report.report_date desc, report.created_at desc), '[]'::jsonb)
  into reports_data
  from public.administrative_reports report
  where p_include_all or report.school_id = p_school_id;

  reports_count := jsonb_array_length(reports_data);

  update public.backups
  set backup_data = jsonb_set(backup_data, '{administrativeReports}', reports_data, true),
      entity_counts = jsonb_set(entity_counts, '{administrativeReports}', to_jsonb(reports_count), true)
  where id = backup_id
  returning backup_data into backup_payload;

  return result || jsonb_build_object(
    'entityCounts', coalesce(result->'entityCounts', '{}'::jsonb) || jsonb_build_object('administrativeReports', reports_count),
    'backupData', backup_payload
  );
end;
$$;

alter function public.restore_complete_backup_internal(uuid, uuid)
  rename to restore_complete_backup_administrative_reports_base_internal;

create function public.restore_complete_backup_internal(
  p_backup_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  item public.backups;
  data jsonb;
  is_site_backup boolean;
begin
  result := public.restore_complete_backup_administrative_reports_base_internal(p_backup_id, p_actor_id);
  select * into item from public.backups where id = p_backup_id;
  data := item.backup_data;
  is_site_backup := coalesce(data->>'scopeType', 'school') = 'site';

  if data ? 'administrativeReports' then
    if is_site_backup then
      delete from public.administrative_reports;
    else
      delete from public.administrative_reports where school_id = item.school_id;
    end if;

    insert into public.administrative_reports
    select * from jsonb_populate_recordset(null::public.administrative_reports, coalesce(data->'administrativeReports', '[]'::jsonb))
    on conflict (id) do update set
      school_id = excluded.school_id,
      supervisor_id = excluded.supervisor_id,
      type = excluded.type,
      report_date = excluded.report_date,
      status = excluded.status,
      sections = excluded.sections,
      building_notes = excluded.building_notes,
      suggestions = excluded.suggestions,
      deputy_teacher_summary = excluded.deputy_teacher_summary,
      deputy_learner_summary = excluded.deputy_learner_summary,
      deputy_parent_summary = excluded.deputy_parent_summary,
      deputy_building_summary = excluded.deputy_building_summary,
      deputy_recommendations = excluded.deputy_recommendations,
      submitted_at = excluded.submitted_at,
      deputy_approved_at = excluded.deputy_approved_at,
      deputy_approved_by = excluded.deputy_approved_by,
      principal_approved_at = excluded.principal_approved_at,
      principal_approved_by = excluded.principal_approved_by,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;
  end if;

  return result || jsonb_build_object('administrativeReportsRestored', jsonb_array_length(coalesce(data->'administrativeReports', '[]'::jsonb)));
end;
$$;

revoke execute on function public.create_complete_backup_administrative_reports_base_internal(uuid, uuid, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.restore_complete_backup_administrative_reports_base_internal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_complete_backup_administrative_reports_base_internal(uuid, uuid, boolean, jsonb) to service_role;
grant execute on function public.restore_complete_backup_administrative_reports_base_internal(uuid, uuid) to service_role;
revoke execute on function public.create_complete_backup_internal(uuid, uuid, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.restore_complete_backup_internal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_complete_backup_internal(uuid, uuid, boolean, jsonb) to service_role;
grant execute on function public.restore_complete_backup_internal(uuid, uuid) to service_role;
