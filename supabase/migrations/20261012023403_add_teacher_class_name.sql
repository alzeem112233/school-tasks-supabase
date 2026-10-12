alter table public.teacher_directory
  add column if not exists class_name text not null default '';

comment on column public.teacher_directory.class_name is
  'الصف أو الصفوف التي يدرسها المعلم';
