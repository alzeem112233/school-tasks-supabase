create or replace function public.save_administrative_report(p_report jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  actor_school_id uuid := public.current_user_school_id();
  report_id uuid;
  report_school_id uuid;
  report_supervisor_id uuid;
  report_status text;
  report_date date;
  report_date_text text;
  report_sections jsonb;
  submitted_at_value timestamptz;
  deputy_approved_at_value timestamptz;
  principal_approved_at_value timestamptz;
begin
  if actor_id is null or not public.is_active_user() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  report_id := coalesce(nullif(p_report->>'id', '')::uuid, gen_random_uuid());
  report_school_id := nullif(p_report->>'schoolId', '')::uuid;
  report_supervisor_id := nullif(p_report->>'supervisorId', '')::uuid;
  report_status := coalesce(nullif(p_report->>'status', ''), 'draft');
  report_date_text := nullif(p_report->>'date', '');
  report_date := case
    when report_date_text ~ '^\d{4}-\d{2}-\d{2}$' then report_date_text::date
    else current_date
  end;
  report_sections := case
    when jsonb_typeof(p_report->'sections') = 'object' then p_report->'sections'
    else '{}'::jsonb
  end;

  if report_status not in ('draft', 'submitted', 'deputy_approved', 'principal_approved') then
    report_status := 'draft';
  end if;

  submitted_at_value := nullif(p_report->>'submittedAt', '')::timestamptz;
  deputy_approved_at_value := nullif(p_report->>'deputyApprovedAt', '')::timestamptz;
  principal_approved_at_value := nullif(p_report->>'principalApprovedAt', '')::timestamptz;

  if actor_role = 'stage_supervisor' then
    report_school_id := actor_school_id;
    report_supervisor_id := actor_id;
    if report_status not in ('draft', 'submitted') then
      raise exception 'Stage supervisors can only save or submit their own reports' using errcode = '42501';
    end if;
    if exists (
      select 1
      from public.administrative_reports existing
      where existing.id = report_id
        and existing.status in ('deputy_approved', 'principal_approved')
    ) then
      raise exception 'Approved reports cannot be changed by the supervisor' using errcode = '42501';
    end if;
  elsif actor_role in ('deputy_principal', 'school_principal') then
    report_school_id := coalesce(report_school_id, actor_school_id);
    if report_school_id is distinct from actor_school_id then
      raise exception 'Reports can only be saved inside the same branch' using errcode = '42501';
    end if;
  elsif actor_role = 'general_manager' then
    if report_school_id is null then
      raise exception 'Report branch is required' using errcode = '23502';
    end if;
  else
    raise exception 'This role cannot save administrative reports' using errcode = '42501';
  end if;

  if report_supervisor_id is null then
    raise exception 'Report supervisor is required' using errcode = '23502';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = report_supervisor_id
      and profile.school_id = report_school_id
      and profile.status = 'active'
  ) then
    raise exception 'Report supervisor is not active in this branch' using errcode = '23503';
  end if;

  if report_status in ('submitted', 'deputy_approved', 'principal_approved') and submitted_at_value is null then
    submitted_at_value := now();
  end if;

  insert into public.administrative_reports (
    id,
    school_id,
    supervisor_id,
    type,
    report_date,
    status,
    sections,
    building_notes,
    suggestions,
    deputy_teacher_summary,
    deputy_learner_summary,
    deputy_parent_summary,
    deputy_building_summary,
    deputy_recommendations,
    submitted_at,
    deputy_approved_at,
    deputy_approved_by,
    principal_approved_at,
    principal_approved_by,
    updated_at
  )
  values (
    report_id,
    report_school_id,
    report_supervisor_id,
    coalesce(nullif(p_report->>'type', ''), 'daily'),
    report_date,
    report_status,
    report_sections,
    coalesce(p_report->>'buildingNotes', ''),
    coalesce(p_report->>'suggestions', ''),
    coalesce(p_report->>'deputyTeacherSummary', ''),
    coalesce(p_report->>'deputyLearnerSummary', ''),
    coalesce(p_report->>'deputyParentSummary', ''),
    coalesce(p_report->>'deputyBuildingSummary', ''),
    coalesce(p_report->>'deputyRecommendations', ''),
    submitted_at_value,
    deputy_approved_at_value,
    nullif(p_report->>'deputyApprovedBy', '')::uuid,
    principal_approved_at_value,
    nullif(p_report->>'principalApprovedBy', '')::uuid,
    now()
  )
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
    submitted_at = coalesce(excluded.submitted_at, public.administrative_reports.submitted_at),
    deputy_approved_at = excluded.deputy_approved_at,
    deputy_approved_by = excluded.deputy_approved_by,
    principal_approved_at = excluded.principal_approved_at,
    principal_approved_by = excluded.principal_approved_by,
    updated_at = now();

  if report_status in ('submitted', 'deputy_approved', 'principal_approved') then
    insert into public.notifications (
      school_id,
      user_id,
      title,
      message,
      type,
      related_task_id,
      dedupe_key
    )
    select
      report_school_id,
      recipient.id,
      'تقرير إشراف مرفوع',
      'تم رفع تقرير إشراف جديد ويحتاج إلى المراجعة.',
      'administrative_report',
      null,
      'administrative-report-' || report_id::text || '-' || recipient.id::text
    from public.profiles recipient
    where recipient.status = 'active'
      and (
        (recipient.school_id = report_school_id and recipient.role in ('deputy_principal', 'school_principal'))
        or recipient.role = 'general_manager'
      )
      and recipient.id is distinct from actor_id
    on conflict do nothing;
  end if;

  return report_id;
end;
$$;

revoke execute on function public.save_administrative_report(jsonb) from public, anon;
grant execute on function public.save_administrative_report(jsonb) to authenticated;
