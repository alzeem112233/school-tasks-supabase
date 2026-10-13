create table if not exists public.teacher_evaluator_links (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  evaluator_id uuid not null references public.profiles(id) on delete cascade,
  teacher_id uuid not null references public.teacher_directory(id) on delete cascade,
  is_visible boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evaluator_id, teacher_id)
);

comment on table public.teacher_evaluator_links is
  'Per-user teacher visibility. Missing rows mean visible so existing users keep their current teacher list.';

create index if not exists teacher_evaluator_links_school_idx
  on public.teacher_evaluator_links (school_id);

create index if not exists teacher_evaluator_links_evaluator_idx
  on public.teacher_evaluator_links (evaluator_id, is_visible);

create index if not exists teacher_evaluator_links_teacher_idx
  on public.teacher_evaluator_links (teacher_id);

alter table public.teacher_evaluator_links enable row level security;

drop policy if exists teacher_evaluator_links_select on public.teacher_evaluator_links;
create policy teacher_evaluator_links_select
on public.teacher_evaluator_links
for select
to authenticated
using (
  public.is_active_user()
  and (
    evaluator_id = (select auth.uid())
    or (
      public.current_user_role() in ('general_manager', 'school_principal', 'deputy_principal')
      and ((public.current_profile()).role = 'superadmin' or public.can_access_school(school_id))
    )
  )
);

drop policy if exists teacher_evaluator_links_insert on public.teacher_evaluator_links;
create policy teacher_evaluator_links_insert
on public.teacher_evaluator_links
for insert
to authenticated
with check (
  public.is_active_user()
  and evaluator_id = (select auth.uid())
  and ((public.current_profile()).role = 'superadmin' or public.can_access_school(school_id))
  and exists (
    select 1
    from public.teacher_directory teacher
    where teacher.id = teacher_id
      and teacher.school_id = teacher_evaluator_links.school_id
      and teacher.active
  )
);

drop policy if exists teacher_evaluator_links_update on public.teacher_evaluator_links;
create policy teacher_evaluator_links_update
on public.teacher_evaluator_links
for update
to authenticated
using (
  public.is_active_user()
  and evaluator_id = (select auth.uid())
  and ((public.current_profile()).role = 'superadmin' or public.can_access_school(school_id))
)
with check (
  public.is_active_user()
  and evaluator_id = (select auth.uid())
  and ((public.current_profile()).role = 'superadmin' or public.can_access_school(school_id))
  and exists (
    select 1
    from public.teacher_directory teacher
    where teacher.id = teacher_id
      and teacher.school_id = teacher_evaluator_links.school_id
      and teacher.active
  )
);

drop policy if exists teacher_evaluator_links_delete on public.teacher_evaluator_links;
create policy teacher_evaluator_links_delete
on public.teacher_evaluator_links
for delete
to authenticated
using (
  public.is_active_user()
  and evaluator_id = (select auth.uid())
  and ((public.current_profile()).role = 'superadmin' or public.can_access_school(school_id))
);

grant select, insert, update, delete on public.teacher_evaluator_links to authenticated;
