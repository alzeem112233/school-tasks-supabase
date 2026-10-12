do $migration$
declare
  function_sql text;
  patched_sql text;
begin
  select pg_get_functiondef('public.save_notebook_role_template(text,jsonb)'::regprocedure)
  into function_sql;
  patched_sql := replace(
    function_sql,
    'or length(btrim(item ->> ''title'')) > 180',
    'or length(btrim(item ->> ''title'')) > 300'
  );
  if patched_sql = function_sql and position('> 300' in function_sql) = 0 then
    raise exception 'Could not update notebook template title length validation';
  end if;
  execute patched_sql;
end
$migration$;
