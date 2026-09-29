insert into public.schools (id, name, status) values
  ('11111111-1111-4111-8111-111111111111', 'الإدارة العامة', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'المدرسة أ', 'active'),
  ('33333333-3333-4333-8333-333333333333', 'المدرسة ب', 'active')
on conflict (id) do update set name = excluded.name, status = excluded.status;

insert into public.departments (school_id, name)
select school.id, department.name
from public.schools school
cross join (values
  ('الإدارة'), ('الشؤون الأكاديمية'), ('الغياب'), ('شؤون الطلاب'), ('العمليات'),
  ('تقنية المعلومات'), ('المالية'), ('الموارد البشرية'), ('المرافق'), ('المكتبة')
) as department(name)
on conflict (school_id, name) do nothing;

-- أنشئ هوية المدير الأول في Supabase Auth، ثم أضف ملفه:
-- insert into public.profiles (id, school_id, full_name, email, role)
-- values ('AUTH_USER_UUID', '11111111-1111-4111-8111-111111111111',
--         'المدير العام', 'admin@example.com', 'general_manager');
