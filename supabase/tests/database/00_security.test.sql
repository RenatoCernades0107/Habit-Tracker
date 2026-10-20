-- Schema-wide security rules (docs/spec/03-architecture.md §10, docs/spec/04-data-model.md §3).
-- These checks scan the catalog, so they also cover tables and functions added in later phases.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

select is(
  array(
    select c.relname::text
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and not c.relrowsecurity
     order by 1
  ),
  '{}'::text[],
  'every table in public has row level security enabled'
);

select is(
  array(
    select c.relname::text
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm')
       and (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
            or has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE'))
     order by 1
  ),
  '{}'::text[],
  'anon has no privileges on any table or view in public'
);

-- Server-only functions: srv_*, trigger functions and security definer functions. RPCs meant for
-- signed-in users (e.g. apply_check_in_op in Phase 1) go in the allow-list.
select is(
  array(
    select p.oid::regprocedure::text
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'srv\_%' or p.prosecdef or p.prorettype = 'trigger'::regtype)
       and p.proname <> all (array['apply_check_in_op', 'undo_op', 'undo_last_op', 'user_today']::text[])
       and (has_function_privilege('anon', p.oid, 'EXECUTE')
            or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     order by 1
  ),
  '{}'::text[],
  'anon and authenticated cannot execute server-only functions'
);

select is(
  array(
    select p.oid::regprocedure::text
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'srv\_%'
       and not has_function_privilege('service_role', p.oid, 'EXECUTE')
     order by 1
  ),
  '{}'::text[],
  'service_role can execute every srv_* function'
);

select isnt_empty(
  $$ select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'srv\_%' $$,
  'the srv_* checks above found functions to check'
);

select is(
  array(
    select p.oid::regprocedure::text
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (
         select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and not coalesce(p.proconfig @> array['search_path=""'], false)
     order by 1
  ),
  '{}'::text[],
  'every function in public pins search_path to an empty string'
);

select * from finish();
rollback;
