begin;

do $$
declare
  id_type text;
  primary_key_name text;
begin
  select data_type into id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'backups' and column_name = 'id';

  if id_type in ('smallint', 'integer', 'bigint') then
    alter table public.backups add column if not exists backup_uuid uuid default gen_random_uuid();
    update public.backups set backup_uuid = gen_random_uuid() where backup_uuid is null;
    alter table public.backups alter column backup_uuid set not null;

    select constraint_name into primary_key_name
    from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'backups' and constraint_type = 'PRIMARY KEY'
    limit 1;
    if primary_key_name is not null then
      execute format('alter table public.backups drop constraint %I', primary_key_name);
    end if;

    alter table public.backups rename column id to legacy_id;
    alter table public.backups rename column backup_uuid to id;
    alter table public.backups add constraint backups_pkey primary key (id);
  end if;
end;
$$;

alter table public.backups alter column id set default gen_random_uuid();

commit;
