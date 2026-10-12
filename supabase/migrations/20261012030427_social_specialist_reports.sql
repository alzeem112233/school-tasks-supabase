create or replace function public.save_social_specialist_report(p_report jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  actor_school_id uuid := public.current_user_school_id();
  report_id uuid := coalesce(nullif(p_report->>'id', '')::uuid, gen_random_uuid());
  report_school_id uuid := nullif(p_report->>'schoolId', '')::uuid;
  report_specialist_id uuid := nullif(p_report->>'supervisorId', '')::uuid;
  report_type text := nullif(p_report->>'type', '');
  report_status text := coalesce(nullif(p_report->>'status', ''), 'draft');
  report_date_text text := nullif(p_report->>'date', '');
  report_date date;
  report_sections jsonb;
  submitted_at_value timestamptz;
  principal_approved_at_value timestamptz;
  principal_approved_by_value uuid;
begin
  if actor_id is null or not public.is_active_user() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if report_type is null or report_type not like 'social_specialist_%' then
    raise exception 'Invalid social specialist report type' using errcode = '22023';
  end if;
  if report_status not in ('draft', 'submitted', 'principal_approved') then
    raise exception 'Invalid report status' using errcode = '22023';
  end if;
  if report_school_id is null or report_specialist_id is null then
    raise exception 'Report branch and specialist are required' using errcode = '23502';
  end if;
  if not public.can_access_school(report_school_id) then
    raise exception 'Report branch is outside the user scope' using errcode = '42501';
  end if;

  if actor_role = 'specialist_supervisor' then
    if report_school_id is distinct from actor_school_id or report_specialist_id is distinct from actor_id then
      raise exception 'Specialists can only save their own branch reports' using errcode = '42501';
    end if;
    if report_status not in ('draft', 'submitted') then
      raise exception 'Specialists cannot approve reports' using errcode = '42501';
    end if;
    if exists (select 1 from public.administrative_reports where id = report_id and status = 'principal_approved') then
      raise exception 'Approved reports cannot be changed' using errcode = '42501';
    end if;
  elsif actor_role not in ('superadmin','general_manager','branch_manager','development_supervision_manager','general_secretary','school_principal') then
    raise exception 'This role cannot save social specialist reports' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = report_specialist_id
      and profile.school_id = report_school_id
      and profile.status = 'active'
      and profile.role = 'specialist_supervisor'
  ) then
    raise exception 'The social specialist is not active in this branch' using errcode = '23503';
  end if;

  report_date := case when report_date_text ~ '^\d{4}-\d{2}-\d{2}$' then report_date_text::date else current_date end;
  report_sections := case when jsonb_typeof(p_report->'sections') = 'object' then p_report->'sections' else '{}'::jsonb end;
  submitted_at_value := case when report_status in ('submitted','principal_approved') then coalesce(nullif(p_report->>'submittedAt', '')::timestamptz, now()) else null end;
  principal_approved_at_value := case when report_status = 'principal_approved' then coalesce(nullif(p_report->>'principalApprovedAt', '')::timestamptz, now()) else null end;
  principal_approved_by_value := case when report_status = 'principal_approved' then coalesce(nullif(p_report->>'principalApprovedBy', '')::uuid, actor_id) else null end;

  insert into public.administrative_reports (
    id, school_id, supervisor_id, type, report_date, status, sections,
    submitted_at, principal_approved_at, principal_approved_by, updated_at
  ) values (
    report_id, report_school_id, report_specialist_id, report_type, report_date, report_status, report_sections,
    submitted_at_value, principal_approved_at_value, principal_approved_by_value, now()
  )
  on conflict (id) do update set
    school_id = excluded.school_id,
    supervisor_id = excluded.supervisor_id,
    type = excluded.type,
    report_date = excluded.report_date,
    status = excluded.status,
    sections = excluded.sections,
    submitted_at = coalesce(excluded.submitted_at, public.administrative_reports.submitted_at),
    principal_approved_at = excluded.principal_approved_at,
    principal_approved_by = excluded.principal_approved_by,
    updated_at = now();

  if report_status = 'submitted' then
    insert into public.notifications (school_id, user_id, title, message, type, related_task_id, dedupe_key)
    select report_school_id, recipient.id, 'تقرير جديد من الأخصائي الاجتماعي',
      'تم رفع تقرير أخصائي اجتماعي للمراجعة والاعتماد.', 'administrative_report', null,
      'social-specialist-report-' || report_id::text || '-' || recipient.id::text
    from public.profiles recipient
    where recipient.status = 'active'
      and recipient.role in ('superadmin','general_manager','branch_manager','development_supervision_manager','general_secretary','school_principal')
      and (
        recipient.role = 'superadmin'
        or recipient.school_id = report_school_id
        or report_school_id = any(coalesce(recipient.linked_school_ids, '{}'::uuid[]))
      )
      and recipient.id is distinct from actor_id
    on conflict do nothing;
  end if;

  return report_id;
end;
$$;

revoke execute on function public.save_social_specialist_report(jsonb) from public, anon;
grant execute on function public.save_social_specialist_report(jsonb) to authenticated;
