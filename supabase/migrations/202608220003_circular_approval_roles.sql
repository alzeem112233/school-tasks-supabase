-- Tighten circular writing/publishing permissions.
-- Writers: general manager, school principal, deputy principal, school secretary, computer unit, printing unit.
-- Publishing requires manager approval: general manager or school principal.

create or replace function public.enforce_circular_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := public.current_user_role();
begin
  if not public.is_active_user() then
    raise exception 'Inactive users cannot modify circulars' using errcode = '42501';
  end if;

  if actor_role not in ('general_manager', 'school_principal', 'deputy_principal', 'school_secretary', 'computer_unit', 'printing_unit') then
    raise exception 'This role cannot write administrative circulars' using errcode = '42501';
  end if;

  if new.status = 'published' and actor_role not in ('general_manager', 'school_principal') then
    raise exception 'Administrative circulars must be approved by a manager before publishing' using errcode = '42501';
  end if;

  if actor_role <> 'general_manager' and new.school_id <> public.current_user_school_id() then
    raise exception 'Cannot modify circulars outside current school' using errcode = '42501';
  end if;

  if new.status = 'published' then
    new.approved_by := coalesce(new.approved_by, auth.uid());
    new.approved_at := coalesce(new.approved_at, now());
    new.published_by := coalesce(new.published_by, auth.uid());
    new.published_at := coalesce(new.published_at, now());
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists enforce_circular_workflow_trigger on public.administrative_circulars;
create trigger enforce_circular_workflow_trigger
before insert or update on public.administrative_circulars
for each row execute function public.enforce_circular_workflow();

drop policy if exists administrative_circulars_insert on public.administrative_circulars;
create policy administrative_circulars_insert on public.administrative_circulars for insert to authenticated
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary', 'computer_unit', 'printing_unit')
    )
  )
);

drop policy if exists administrative_circulars_update on public.administrative_circulars;
create policy administrative_circulars_update on public.administrative_circulars for update to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary', 'computer_unit', 'printing_unit')
    )
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary', 'computer_unit', 'printing_unit')
    )
  )
);

drop policy if exists circular_recipients_write on public.circular_recipients;
create policy circular_recipients_write on public.circular_recipients for all to authenticated
using (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or user_id = auth.uid()
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary', 'computer_unit', 'printing_unit')
    )
  )
)
with check (
  public.is_active_user() and (
    public.current_user_role() = 'general_manager'
    or user_id = auth.uid()
    or (
      school_id = public.current_user_school_id()
      and public.current_user_role() in ('school_principal', 'deputy_principal', 'school_secretary', 'computer_unit', 'printing_unit')
    )
  )
);

revoke execute on function public.enforce_circular_workflow() from public, anon, authenticated;
