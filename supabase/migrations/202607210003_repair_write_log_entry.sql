begin;

create or replace function public.write_log_entry(p_entry jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  requested_school text := nullif(p_entry->>'schoolId', '');
  sid uuid := public.current_user_school_id();
begin
  if not public.is_active_user() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if requested_school is not null then
    sid := requested_school::uuid;
  end if;

  if not public.can_access_school(sid) then
    raise exception 'Cross-school log writes are forbidden' using errcode = '42501';
  end if;

  if coalesce(p_entry->>'kind', 'activity') <> 'activity' then
    raise exception 'Audit logs are append-only' using errcode = '42501';
  end if;

  insert into public.activity_logs (school_id, user_id, action, entity_type, entity_id, details)
  values (
    sid,
    auth.uid(),
    coalesce(p_entry->>'type', 'activity'),
    nullif(p_entry->>'entityType', ''),
    nullif(p_entry->>'entityId', '')::uuid,
    jsonb_build_object(
      'title', coalesce(p_entry->>'title', 'نشاط'),
      'description', coalesce(p_entry->>'description', '')
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.write_log_entry(jsonb) from public, anon;
grant execute on function public.write_log_entry(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
