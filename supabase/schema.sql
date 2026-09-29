-- Canonical readable schema. Deploy the versioned file in migrations/.
create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(), name text not null,
  status text default 'active', created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid references public.schools(id), full_name text not null, email text not null,
  role text not null check (role in ('general_manager','school_principal','deputy_principal','school_secretary','educational_supervisor','specialist_supervisor','stage_supervisor','activity_supervisor','finance','computer_unit','printing_unit','tracker')),
  status text default 'active', avatar_url text, department_name text, linked_school_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(), school_id uuid references public.schools(id),
  name text not null, description text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), school_id uuid references public.schools(id),
  title text not null, description text, status text default 'pending', priority text default 'medium',
  created_by uuid references public.profiles(id), assigned_to uuid references public.profiles(id),
  department_id uuid references public.departments(id), due_date timestamptz, completed_at timestamptz,
  recurrence_type text, created_at timestamptz default now(), updated_at timestamptz default now(),
  task_number text not null unique, department_name text default 'الإدارة', progress integer default 0,
  occurrence_date date, source_task_id uuid references public.tasks(id) on delete cascade,
  approval_required boolean default true, approver_role text default 'school_principal' check (approver_role in ('general_manager','school_principal')),
  comments jsonb default '[]', feedback jsonb default '[]', approvals jsonb default '[]'
);
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(), school_id uuid references public.schools(id),
  task_id uuid references public.tasks(id) on delete cascade, uploaded_by uuid references public.profiles(id),
  file_name text not null, file_path text not null, file_type text, file_size bigint,
  bucket_name text default 'task-attachments', created_at timestamptz default now()
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), school_id uuid references public.schools(id),
  user_id uuid references public.profiles(id), title text not null, message text not null, type text,
  is_read boolean default false, related_task_id uuid references public.tasks(id), created_at timestamptz default now(),
  dedupe_key text not null default '',
  constraint notifications_user_dedupe_key unique (user_id, dedupe_key)
);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(), school_id uuid references public.schools(id),
  user_id uuid references public.profiles(id), action text not null, entity_type text,
  entity_id uuid, details jsonb, created_at timestamptz default now()
);
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(), school_id uuid references public.schools(id),
  user_id uuid references public.profiles(id), action text not null, severity text default 'info',
  ip_address text, user_agent text, details jsonb, created_at timestamptz default now()
);
create table if not exists public.backups (
  id uuid primary key default gen_random_uuid(), school_id uuid references public.schools(id),
  created_by uuid references public.profiles(id), backup_name text not null, backup_data jsonb,
  created_at timestamptz default now(), entity_counts jsonb default '{}'::jsonb
);
create table if not exists public.finance_discounts (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  student_name text not null, student_number text not null default '', class_name text not null default '',
  discount_type text not null default 'amount' check (discount_type in ('amount','percentage')),
  discount_value numeric(12,2) not null check (discount_value > 0), details text not null default '',
  status text not null default 'pending' check (status in ('pending','received','completed')),
  assigned_to uuid references public.profiles(id) on delete set null, assigned_to_name text not null default '',
  received_by uuid references public.profiles(id) on delete set null, received_by_name text not null default '',
  created_by uuid references public.profiles(id) on delete set null, created_by_name text not null default '',
  received_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
