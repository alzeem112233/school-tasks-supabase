begin;

alter function public.create_complete_backup_internal(uuid, uuid, boolean, jsonb)
  rename to create_complete_backup_base_internal;

create function public.create_complete_backup_internal(
  p_school_id uuid,
  p_actor_id uuid,
  p_include_all boolean default false,
  p_client_settings jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
  backup_id uuid;
  finance_data jsonb;
  finance_count integer;
begin
  result := public.create_complete_backup_base_internal(p_school_id, p_actor_id, p_include_all, p_client_settings);
  backup_id := (result->>'backupId')::uuid;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at), '[]'::jsonb)
  into finance_data
  from public.finance_discounts item
  where p_include_all or item.school_id = p_school_id;

  finance_count := jsonb_array_length(finance_data);
  update public.backups
  set backup_data = jsonb_set(backup_data, '{financeDiscounts}', finance_data, true),
      entity_counts = jsonb_set(entity_counts, '{financeDiscounts}', to_jsonb(finance_count), true)
  where id = backup_id;

  return result || jsonb_build_object(
    'entityCounts', coalesce(result->'entityCounts', '{}'::jsonb) || jsonb_build_object('financeDiscounts', finance_count)
  );
end;
$$;

alter function public.restore_complete_backup_internal(uuid, uuid)
  rename to restore_complete_backup_base_internal;

create function public.restore_complete_backup_internal(
  p_backup_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
  item public.backups;
  data jsonb;
  is_site_backup boolean;
begin
  result := public.restore_complete_backup_base_internal(p_backup_id, p_actor_id);
  select * into item from public.backups where id = p_backup_id;
  data := item.backup_data;
  is_site_backup := coalesce(data->>'scopeType', 'school') = 'site';

  if data ? 'financeDiscounts' then
    if is_site_backup then
      delete from public.finance_discounts;
    else
      delete from public.finance_discounts where school_id = item.school_id;
    end if;

    insert into public.finance_discounts
    select * from jsonb_populate_recordset(null::public.finance_discounts, coalesce(data->'financeDiscounts', '[]'::jsonb))
    on conflict (id) do nothing;
  end if;

  return result;
end;
$$;

revoke execute on function public.create_complete_backup_base_internal(uuid, uuid, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.restore_complete_backup_base_internal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_complete_backup_base_internal(uuid, uuid, boolean, jsonb) to service_role;
grant execute on function public.restore_complete_backup_base_internal(uuid, uuid) to service_role;
revoke execute on function public.create_complete_backup_internal(uuid, uuid, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.restore_complete_backup_internal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_complete_backup_internal(uuid, uuid, boolean, jsonb) to service_role;
grant execute on function public.restore_complete_backup_internal(uuid, uuid) to service_role;

commit;
