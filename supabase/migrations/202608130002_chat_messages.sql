create table if not exists public.chat_messages (
  id uuid primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chat_messages_no_self check (sender_id <> recipient_id)
);

create index if not exists chat_messages_sender_idx on public.chat_messages (sender_id, created_at desc);
create index if not exists chat_messages_recipient_idx on public.chat_messages (recipient_id, created_at desc);
create index if not exists chat_messages_school_idx on public.chat_messages (school_id, created_at desc);

alter table public.chat_messages enable row level security;
alter table public.chat_messages force row level security;

drop policy if exists chat_messages_read on public.chat_messages;
create policy chat_messages_read on public.chat_messages for select to authenticated
using (
  public.is_active_user()
  and (sender_id = auth.uid() or recipient_id = auth.uid())
);

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert to authenticated
with check (
  public.is_active_user()
  and sender_id = auth.uid()
  and exists (
    select 1
    from public.profiles target
    where target.id = recipient_id
      and target.status = 'active'
      and (
        (
          public.current_user_role() = 'general_manager'
          and target.role <> 'general_manager'
        )
        or (
          public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary')
          and target.school_id = public.current_user_school_id()
          and target.role <> 'general_manager'
          and school_id = public.current_user_school_id()
        )
        or (
          public.current_user_role() not in ('general_manager', 'school_principal', 'deputy_principal', 'school_secretary')
          and target.school_id = public.current_user_school_id()
          and target.role in ('school_principal', 'deputy_principal', 'school_secretary')
          and school_id = public.current_user_school_id()
        )
      )
  )
);

drop policy if exists chat_messages_update on public.chat_messages;
create policy chat_messages_update on public.chat_messages for update to authenticated
using (
  public.is_active_user()
  and (sender_id = auth.uid() or recipient_id = auth.uid())
)
with check (
  public.is_active_user()
  and (sender_id = auth.uid() or recipient_id = auth.uid())
);

drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages for delete to authenticated
using (
  public.is_active_user()
  and public.current_user_role() in ('general_manager', 'school_principal')
  and (
    public.current_user_role() = 'general_manager'
    or school_id = public.current_user_school_id()
  )
);

grant select, insert, update, delete on table public.chat_messages to authenticated;
revoke all on table public.chat_messages from anon;

alter function public.create_complete_backup_internal(uuid, uuid, boolean, jsonb)
  rename to create_complete_backup_chat_messages_base_internal;

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
  messages_data jsonb;
  messages_count integer;
begin
  result := public.create_complete_backup_chat_messages_base_internal(p_school_id, p_actor_id, p_include_all, p_client_settings);
  backup_id := (result->>'backupId')::uuid;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at desc), '[]'::jsonb)
  into messages_data
  from public.chat_messages item
  where p_include_all or item.school_id = p_school_id;

  messages_count := jsonb_array_length(messages_data);

  update public.backups
  set backup_data = jsonb_set(backup_data, '{chatMessages}', messages_data, true),
      entity_counts = jsonb_set(entity_counts, '{chatMessages}', to_jsonb(messages_count), true)
  where id = backup_id
  returning backup_data into backup_payload;

  return result || jsonb_build_object(
    'entityCounts', coalesce(result->'entityCounts', '{}'::jsonb) || jsonb_build_object('chatMessages', messages_count),
    'backupData', backup_payload
  );
end;
$$;

alter function public.restore_complete_backup_internal(uuid, uuid)
  rename to restore_complete_backup_chat_messages_base_internal;

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
  result := public.restore_complete_backup_chat_messages_base_internal(p_backup_id, p_actor_id);
  select * into item from public.backups where id = p_backup_id;
  data := item.backup_data;
  is_site_backup := coalesce(data->>'scopeType', 'school') = 'site';

  if data ? 'chatMessages' then
    if is_site_backup then
      delete from public.chat_messages;
    else
      delete from public.chat_messages where school_id = item.school_id;
    end if;

    insert into public.chat_messages
    select * from jsonb_populate_recordset(null::public.chat_messages, coalesce(data->'chatMessages', '[]'::jsonb))
    on conflict (id) do update set
      school_id = excluded.school_id,
      sender_id = excluded.sender_id,
      recipient_id = excluded.recipient_id,
      message = excluded.message,
      read_at = excluded.read_at,
      created_at = excluded.created_at;
  end if;

  return result || jsonb_build_object('chatMessagesRestored', jsonb_array_length(coalesce(data->'chatMessages', '[]'::jsonb)));
end;
$$;

revoke execute on function public.create_complete_backup_chat_messages_base_internal(uuid, uuid, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.restore_complete_backup_chat_messages_base_internal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_complete_backup_chat_messages_base_internal(uuid, uuid, boolean, jsonb) to service_role;
grant execute on function public.restore_complete_backup_chat_messages_base_internal(uuid, uuid) to service_role;
revoke execute on function public.create_complete_backup_internal(uuid, uuid, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.restore_complete_backup_internal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_complete_backup_internal(uuid, uuid, boolean, jsonb) to service_role;
grant execute on function public.restore_complete_backup_internal(uuid, uuid) to service_role;
