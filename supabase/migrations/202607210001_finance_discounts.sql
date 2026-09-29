begin;

create table if not exists public.finance_discounts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_name text not null check (char_length(trim(student_name)) between 2 and 200),
  student_number text not null default '',
  class_name text not null default '',
  discount_type text not null default 'amount' check (discount_type in ('amount', 'percentage')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  details text not null default '',
  status text not null default 'pending' check (status in ('pending', 'received', 'completed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_to_name text not null default '',
  received_by uuid references public.profiles(id) on delete set null,
  received_by_name text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null default '',
  received_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finance_discounts_school_status_idx on public.finance_discounts (school_id, status, created_at desc);
create index if not exists finance_discounts_received_by_idx on public.finance_discounts (received_by, created_at desc);
create index if not exists finance_discounts_student_name_idx on public.finance_discounts (school_id, student_name);

create or replace function public.enforce_finance_discount_workflow() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := public.current_user_role();
begin
  if current_setting('app.secure_restore', true) = 'on' then
    return new;
  end if;

  if not public.is_active_user() then
    raise exception 'Inactive users cannot manage finance discounts' using errcode = '42501';
  end if;

  if new.assigned_to is not null and not exists (
    select 1 from public.profiles profile
    where profile.id = new.assigned_to
      and profile.school_id = new.school_id
      and profile.role = 'finance'
      and profile.status = 'active'
  ) then
    raise exception 'The assigned finance employee is invalid' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if actor_role not in ('general_manager', 'school_principal') then
      raise exception 'Only managers can create finance discounts' using errcode = '42501';
    end if;
    new.created_by := auth.uid();
    select coalesce(profile.full_name, '') into new.created_by_name
    from public.profiles profile where profile.id = auth.uid();
    select coalesce(profile.full_name, '') into new.assigned_to_name
    from public.profiles profile where profile.id = new.assigned_to;
    new.assigned_to_name := coalesce(new.assigned_to_name, '');
    new.status := 'pending';
    new.received_by := null;
    new.received_at := null;
    new.completed_at := null;
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
    return new;
  end if;

  if actor_role = 'finance' then
    if new.school_id is distinct from old.school_id
      or new.student_name is distinct from old.student_name
      or new.student_number is distinct from old.student_number
      or new.class_name is distinct from old.class_name
      or new.discount_type is distinct from old.discount_type
      or new.discount_value is distinct from old.discount_value
      or new.details is distinct from old.details
      or new.assigned_to is distinct from old.assigned_to
      or new.assigned_to_name is distinct from old.assigned_to_name
      or new.created_by is distinct from old.created_by
      or new.created_by_name is distinct from old.created_by_name
      or new.created_at is distinct from old.created_at then
      raise exception 'Finance users can update workflow status only' using errcode = '42501';
    end if;
    if old.status = 'completed' then
      raise exception 'A completed discount cannot be changed' using errcode = '23514';
    end if;
    if new.status = 'received' and old.status = 'pending' then
      if old.assigned_to is not null and old.assigned_to is distinct from auth.uid() then
        raise exception 'This discount is assigned to another finance employee' using errcode = '42501';
      end if;
      new.received_by := auth.uid();
      select coalesce(profile.full_name, '') into new.received_by_name
      from public.profiles profile where profile.id = auth.uid();
      new.received_by_name := coalesce(new.received_by_name, '');
      new.received_at := now();
      new.completed_at := null;
    elsif new.status = 'completed' and old.status = 'received' then
      if old.received_by is distinct from auth.uid() then
        raise exception 'Only the receiving finance employee can complete this discount' using errcode = '42501';
      end if;
      new.received_by := old.received_by;
      new.received_by_name := old.received_by_name;
      new.received_at := old.received_at;
      new.completed_at := now();
    elsif new.status is distinct from old.status then
      raise exception 'Invalid finance discount status transition' using errcode = '23514';
    end if;
  elsif actor_role not in ('general_manager', 'school_principal') then
    raise exception 'You cannot update finance discounts' using errcode = '42501';
  else
    if new.assigned_to is distinct from old.assigned_to then
      select coalesce(profile.full_name, '') into new.assigned_to_name
      from public.profiles profile where profile.id = new.assigned_to;
      new.assigned_to_name := coalesce(new.assigned_to_name, '');
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists finance_discount_workflow_trigger on public.finance_discounts;
create trigger finance_discount_workflow_trigger
before insert or update on public.finance_discounts
for each row execute function public.enforce_finance_discount_workflow();

alter table public.finance_discounts enable row level security;
alter table public.finance_discounts force row level security;

drop policy if exists finance_discounts_read on public.finance_discounts;
create policy finance_discounts_read on public.finance_discounts for select to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() in ('school_principal', 'finance'))
  )
);

drop policy if exists finance_discounts_insert on public.finance_discounts;
create policy finance_discounts_insert on public.finance_discounts for insert to authenticated
with check (
  public.is_active_user()
  and created_by = auth.uid()
  and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
  )
);

drop policy if exists finance_discounts_update on public.finance_discounts;
create policy finance_discounts_update on public.finance_discounts for update to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() = 'finance'
      and (assigned_to is null or assigned_to = auth.uid() or received_by = auth.uid())
    )
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() = 'finance'
      and (assigned_to is null or assigned_to = auth.uid() or received_by = auth.uid())
    )
  )
);

drop policy if exists finance_discounts_delete on public.finance_discounts;
create policy finance_discounts_delete on public.finance_discounts for delete to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (school_id = public.current_user_school_id() and public.current_user_role() = 'school_principal')
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finance_discounts'
  ) then
    alter publication supabase_realtime add table public.finance_discounts;
  end if;
end $$;

grant select, insert, update, delete on public.finance_discounts to authenticated;
revoke all on function public.enforce_finance_discount_workflow() from public, anon;
grant execute on function public.enforce_finance_discount_workflow() to authenticated, service_role;

commit;
