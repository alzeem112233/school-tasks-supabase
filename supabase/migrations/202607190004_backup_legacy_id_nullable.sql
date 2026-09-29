do $$
declare
  legacy_is_identity text;
begin
  select is_identity into legacy_is_identity
  from information_schema.columns
  where table_schema = 'public' and table_name = 'backups' and column_name = 'legacy_id';

  if legacy_is_identity = 'NO' then
    alter table public.backups alter column legacy_id drop not null;
  end if;
end;
$$;
