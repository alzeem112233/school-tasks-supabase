begin;

alter table public.profiles add column if not exists linked_school_ids uuid[] not null default '{}';

create or replace function public.can_access_school(p_school_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.current_user_role() = 'superadmin'
    or p_school_id = public.current_user_school_id()
    or (public.current_user_role() in ('general_manager','branch_manager','finance_manager','development_supervision_manager','general_secretary') and p_school_id = any(public.current_user_linked_school_ids()))
  );
$$;

drop policy if exists administrative_reports_read on public.administrative_reports;
create policy administrative_reports_read on public.administrative_reports for select to authenticated using (
  public.is_active_user() and (
    (public.can_access_school(school_id) and public.current_user_role() in ('superadmin','general_manager','branch_manager','finance_manager','development_supervision_manager','general_secretary','school_principal','deputy_principal','school_secretary'))
    or supervisor_id = auth.uid()
  )
);

drop policy if exists administrative_reports_insert on public.administrative_reports;
create policy administrative_reports_insert on public.administrative_reports for insert to authenticated with check (
  public.is_active_user() and public.can_access_school(school_id) and (
    (type = 'secretary_daily' and public.current_user_role() = 'school_secretary' and supervisor_id = auth.uid())
    or public.current_user_role() in ('superadmin','general_manager','branch_manager','finance_manager','development_supervision_manager','general_secretary','school_principal','deputy_principal','stage_supervisor')
  )
);

drop policy if exists administrative_reports_update on public.administrative_reports;
create policy administrative_reports_update on public.administrative_reports for update to authenticated using (
  public.is_active_user() and public.can_access_school(school_id) and (
    public.current_user_role() in ('superadmin','general_manager','branch_manager','finance_manager','development_supervision_manager','general_secretary','school_principal','deputy_principal')
    or (type = 'secretary_daily' and supervisor_id = auth.uid() and status in ('draft','submitted'))
  )
) with check (
  public.is_active_user() and public.can_access_school(school_id) and (
    public.current_user_role() in ('superadmin','general_manager','branch_manager','finance_manager','development_supervision_manager','general_secretary','school_principal','deputy_principal')
    or (type = 'secretary_daily' and supervisor_id = auth.uid() and status in ('draft','submitted'))
  )
);

commit;
