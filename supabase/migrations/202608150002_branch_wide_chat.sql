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
          public.current_user_role() <> 'general_manager'
          and target.school_id = public.current_user_school_id()
          and target.role <> 'general_manager'
          and school_id = public.current_user_school_id()
        )
      )
  )
);
