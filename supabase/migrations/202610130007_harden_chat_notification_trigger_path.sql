begin;

-- This trigger uses only public-qualified relations and is safe to isolate
-- from caller-controlled search_path entries.
alter function public.handle_chat_message_notification() set search_path = '';

commit;
