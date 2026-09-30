create or replace function public.staff_evaluation_scores_valid(p_sequence_key text, p_scores jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  limits jsonb;
  score_item record;
  score_count integer;
  limit_count integer;
begin
  limits := case p_sequence_key
    when 'principal' then '{"relationships":2,"cooperation":3,"meetings":2,"complaints":3}'::jsonb
    when 'deputy' then '{"delivery":2,"grade_record":2,"attendance":2,"correction":2,"accuracy":2,"supervision":3}'::jsonb
    when 'educational_supervisor' then '{"supervisor_form":20,"special_form":10,"tests":2,"planning":2,"screen":2,"appendices":2}'::jsonb
    when 'administrative_supervisor' then '{"morning":2,"lesson_time":2,"class_exit":2,"discipline":2,"parent_contact":4,"building":2,"notebooks":4,"dismissal":3,"values":2}'::jsonb
    when 'computer_unit' then '{"matching":2,"android":2}'::jsonb
    when 'printing_unit' then '{"cover":2}'::jsonb
    when 'school_secretary' then '{"work_time":2}'::jsonb
    when 'activity_supervisor' then '{"broadcast":2,"activities":4}'::jsonb
    when 'social_specialist' then '{"pioneer":2,"values":2}'::jsonb
    else null
  end;

  if limits is null or jsonb_typeof(p_scores) <> 'object' then
    return false;
  end if;

  select count(*) into score_count from jsonb_object_keys(p_scores);
  select count(*) into limit_count from jsonb_object_keys(limits);
  if score_count <> limit_count then return false; end if;

  for score_item in select key, value from jsonb_each(p_scores)
  loop
    if not (limits ? score_item.key)
       or jsonb_typeof(score_item.value) <> 'number'
       or (score_item.value #>> '{}')::numeric < 0
       or (score_item.value #>> '{}')::numeric > (limits ->> score_item.key)::numeric then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

alter table public.staff_evaluations validate constraint staff_evaluations_scores_limit;
