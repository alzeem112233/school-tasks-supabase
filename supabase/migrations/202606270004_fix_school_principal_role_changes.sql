begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in (
  'general_manager',
  'school_principal',
  'deputy_principal',
  'school_secretary',
  'educational_supervisor',
  'specialist_supervisor',
  'stage_supervisor',
  'activity_supervisor',
  'finance',
  'computer_unit',
  'printing_unit'
));

create or replace function public.change_user_role_internal(
  p_user_id uuid,
  p_role text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles;
  target public.profiles;
  previous_role text;
  general_school_id uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  target_school_id uuid;
  allowed_roles text[] := array[
    'general_manager',
    'school_principal',
    'deputy_principal',
    'school_secretary',
    'educational_supervisor',
    'specialist_supervisor',
    'stage_supervisor',
    'activity_supervisor',
    'finance',
    'computer_unit',
    'printing_unit'
  ];
begin
  p_role := case p_role
    when 'general_secretary' then 'school_secretary'
    else p_role
  end;

  select *
    into actor
    from public.profiles
   where id = p_actor_id
     and status = 'active';

  if actor.id is null or actor.role not in ('general_manager', 'school_principal') then
    raise exception 'No permission to change user roles.' using errcode = '42501';
  end if;

  if not (p_role = any(allowed_roles)) then
    raise exception 'Invalid role.' using errcode = '22023';
  end if;

  select *
    into target
    from public.profiles
   where id = p_user_id;

  if target.id is null then
    raise exception 'User was not found.' using errcode = 'P0002';
  end if;

  if p_user_id = p_actor_id then
    raise exception 'You cannot change your own role.' using errcode = '42501';
  end if;

  actor.role := case actor.role
    when 'general_secretary' then 'school_secretary'
    else actor.role
  end;
  target.role := case target.role
    when 'general_secretary' then 'school_secretary'
    else target.role
  end;

  target_school_id := case
    when p_role = 'general_manager' then general_school_id
    else target.school_id
  end;

  if p_role <> 'general_manager' and target_school_id = general_school_id then
    raise exception 'Choose a branch before assigning this role.' using errcode = '22023';
  end if;

  if target.school_id is distinct from target_school_id and exists (
    select 1
      from public.tasks task
     where task.assigned_to = target.id
        or task.created_by = target.id
  ) then
    raise exception 'User cannot be moved to another branch before reassigning tasks.' using errcode = '23503';
  end if;

  if actor.role = 'school_principal' and (
    target.school_id is distinct from actor.school_id
    or target.role in ('general_manager', 'school_principal')
    or p_role in ('general_manager', 'school_principal')
    or not public.is_higher_role(actor.role, target.role)
    or not public.is_higher_role(actor.role, p_role)
  ) then
    raise exception 'No permission to change this user role.' using errcode = '42501';
  end if;

  previous_role := target.role;
  if previous_role = p_role and target.school_id is not distinct from target_school_id then
    return jsonb_build_object('ok', true, 'id', p_user_id, 'unchanged', true);
  end if;

  update public.profiles
     set role = p_role,
         school_id = target_school_id,
         updated_at = now()
   where id = p_user_id;

  insert into public.activity_logs (school_id, user_id, action, entity_type, entity_id, details)
  values (
    target_school_id,
    p_actor_id,
    'user_role_changed',
    'profile',
    p_user_id,
    jsonb_build_object('title', 'User role changed', 'description', target.email || ': ' || previous_role || ' -> ' || p_role)
  );

  insert into public.audit_logs (school_id, user_id, action, severity, details)
  values (
    target_school_id,
    p_actor_id,
    'user_role_changed',
    'critical',
    jsonb_build_object('targetType', 'profile', 'targetId', p_user_id, 'message', target.email || ': ' || previous_role || ' -> ' || p_role)
  );

  insert into public.notifications (school_id, user_id, title, message, type, dedupe_key)
  values (
    target_school_id,
    p_user_id,
    'تم تحديث دورك',
    'تم تغيير دور حسابك إلى ' || p_role || '.',
    'role_changed',
    'role-change:' || p_user_id || ':' || p_role || ':' || extract(epoch from now())::bigint
  );

  return jsonb_build_object('ok', true, 'id', p_user_id, 'previousRole', previous_role, 'role', p_role);
end;
$$;

grant execute on function public.change_user_role_internal(uuid, text, uuid) to service_role;
revoke execute on function public.change_user_role_internal(uuid, text, uuid) from public, anon, authenticated;

commit;
