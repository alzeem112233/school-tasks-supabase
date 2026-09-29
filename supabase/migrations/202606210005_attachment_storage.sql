begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'task-attachments',
  'task-attachments',
  false,
  10485760,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop trigger if exists attachment_metadata_guard on public.attachments;

create or replace function public.enforce_attachment_metadata() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_active_user() or new.uploaded_by is distinct from auth.uid() then
    raise exception 'Attachment uploader must match the authenticated user' using errcode = '42501';
  end if;
  if new.bucket_name <> 'task-attachments' then
    raise exception 'Invalid attachment bucket' using errcode = '23514';
  end if;
  if new.file_size is null or new.file_size <= 0 or new.file_size > 10485760 then
    raise exception 'Attachment size is invalid' using errcode = '23514';
  end if;
  if new.file_type is null or new.file_type not in (
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) then
    raise exception 'Attachment type is not allowed' using errcode = '23514';
  end if;
  if split_part(new.file_path, '/', 1) <> new.school_id::text
    or split_part(new.file_path, '/', 2) <> new.task_id::text
    or nullif(split_part(new.file_path, '/', 3), '') is null
    or split_part(new.file_path, '/', 4) <> '' then
    raise exception 'Attachment path must use schoolId/taskId/fileName' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.tasks task
    where task.id = new.task_id and task.school_id = new.school_id
  ) then
    raise exception 'Attachment task must belong to the same school' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger attachment_metadata_guard
before insert or update on public.attachments
for each row execute function public.enforce_attachment_metadata();

revoke execute on function public.enforce_attachment_metadata() from public, anon, authenticated;

drop policy if exists task_files_delete on storage.objects;
create policy task_files_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'task-attachments' and (
    exists (
      select 1 from public.attachments attachment
      where attachment.file_path = name and public.can_update_task(attachment.task_id)
    ) or
    exists (
      select 1 from public.tasks task
      where task.id::text = (storage.foldername(name))[2]
        and task.school_id::text = (storage.foldername(name))[1]
        and public.can_update_task(task.id)
    )
  )
);

commit;
