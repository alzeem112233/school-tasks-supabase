-- Preserve the existing access rules while evaluating auth.uid() once per statement.
alter policy chat_messages_read on public.chat_messages
  using ((is_active_user() and ((sender_id = (select auth.uid())) or (recipient_id = (select auth.uid())))));

alter policy chat_messages_update on public.chat_messages
  using ((is_active_user() and ((sender_id = (select auth.uid())) or (recipient_id = (select auth.uid())))))
  with check ((is_active_user() and ((sender_id = (select auth.uid())) or (recipient_id = (select auth.uid())))));

alter policy circular_recipients_read on public.circular_recipients
  using ((is_active_user() and ((current_user_role() = 'general_manager'::text) or (user_id = (select auth.uid())) or can_access_school(school_id))));

alter policy meeting_attendees_read on public.meeting_attendees
  using ((is_active_user() and ((current_user_role() = 'general_manager'::text) or (user_id = (select auth.uid())) or can_access_school(school_id))));

alter policy meeting_decisions_read on public.meeting_decisions
  using ((is_active_user() and ((current_user_role() = 'general_manager'::text) or (owner_id = (select auth.uid())) or can_access_school(school_id))));
