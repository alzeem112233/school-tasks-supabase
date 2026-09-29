create or replace function public.create_complete_backup_internal(
  p_school_id uuid,
  p_actor_id uuid,
  p_include_all boolean default false,
  p_client_settings jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_complete_backup_chat_messages_base_internal(p_school_id, p_actor_id, p_include_all, p_client_settings);
end;
$$;

create or replace function public.restore_complete_backup_internal(
  p_backup_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.restore_complete_backup_chat_messages_base_internal(p_backup_id, p_actor_id);
end;
$$;

revoke execute on function public.create_complete_backup_internal(uuid, uuid, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.restore_complete_backup_internal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_complete_backup_internal(uuid, uuid, boolean, jsonb) to service_role;
grant execute on function public.restore_complete_backup_internal(uuid, uuid) to service_role;
