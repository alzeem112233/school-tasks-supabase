begin;

update storage.buckets
set allowed_mime_types = array[
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
where id = 'task-attachments';

create or replace function public.enforce_attachment_metadata() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  file_extension text := lower(regexp_replace(new.file_path, '^.*\.', ''));
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
  if new.file_type is null or not (
    (new.file_type = 'image/png' and file_extension = 'png') or
    (new.file_type = 'image/jpeg' and file_extension in ('jpg', 'jpeg')) or
    (new.file_type = 'image/webp' and file_extension = 'webp') or
    (new.file_type = 'image/gif' and file_extension = 'gif') or
    (new.file_type = 'application/pdf' and file_extension = 'pdf') or
    (new.file_type = 'application/msword' and file_extension = 'doc') or
    (new.file_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' and file_extension = 'docx') or
    (new.file_type = 'application/vnd.ms-excel' and file_extension = 'xls') or
    (new.file_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and file_extension = 'xlsx') or
    (new.file_type = 'application/vnd.ms-powerpoint' and file_extension = 'ppt') or
    (new.file_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' and file_extension = 'pptx')
  ) then
    raise exception 'Attachment type or extension is not allowed' using errcode = '23514';
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

revoke execute on function public.enforce_attachment_metadata() from public, anon, authenticated;

commit;
