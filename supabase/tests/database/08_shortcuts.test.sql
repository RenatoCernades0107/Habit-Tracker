-- Phase 4: api_tokens, srv_verify_api_token, srv_rate_limit, srv_match_habit, srv_undo_last_op.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'cy@example.test'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'di@example.test');

insert into public.api_tokens (id, user_id, name, token_prefix, token_hash) values
  ('11111111-0000-4000-8000-000000000001', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'iPhone', 'ht_abcde',
   extensions.digest('ht_secret', 'sha256')),
  ('11111111-0000-4000-8000-000000000002', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Mac', 'ht_zzzzz',
   extensions.digest('ht_other', 'sha256'));

insert into public.habits (id, user_id, name, voice_aliases, start_date) values
  ('22222222-0000-4000-8000-000000000001', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Meditar', '{}', current_date - 3),
  ('22222222-0000-4000-8000-000000000002', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Leer 20 páginas', '{lectura}', current_date - 3),
  ('22222222-0000-4000-8000-000000000003', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Agua', '{}', current_date - 3);

-- Users see their own tokens, without the hash, and can only revoke them.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "role": "authenticated"}', true);
select results_eq($$ select name from public.api_tokens $$, $$ values ('iPhone') $$,
  'users see only their own tokens');
select throws_ok($$ select token_hash from public.api_tokens $$, '42501', null,
  'the hash is not readable');
select throws_ok($$ insert into public.api_tokens (user_id, name, token_prefix, token_hash)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'x', 'ht_x', '\x00') $$, '42501', null,
  'users cannot create tokens directly');
update public.api_tokens set revoked_at = now() where id = '11111111-0000-4000-8000-000000000002';
select throws_ok($$ select * from public.srv_verify_api_token(extensions.digest('ht_secret', 'sha256')) $$,
  '42501', null, 'users cannot verify tokens');
reset role;
select set_config('request.jwt.claims', '', true);
select ok((select revoked_at is null from public.api_tokens where id = '11111111-0000-4000-8000-000000000002'),
  'nobody can revoke another user''s token');

set local role service_role;
select results_eq(
  $$ select user_id, token_id from public.srv_verify_api_token(extensions.digest('ht_secret', 'sha256')) $$,
  $$ values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid, '11111111-0000-4000-8000-000000000001'::uuid) $$,
  'a live token resolves to its user');
select isnt((select last_used_at from public.api_tokens where id = '11111111-0000-4000-8000-000000000001'),
  null, 'and records last_used_at');
select is_empty($$ select * from public.srv_verify_api_token(extensions.digest('ht_wrong', 'sha256')) $$,
  'an unknown token resolves to nothing');
update public.api_tokens set revoked_at = now() where id = '11111111-0000-4000-8000-000000000001';
select is_empty($$ select * from public.srv_verify_api_token(extensions.digest('ht_secret', 'sha256')) $$,
  'a revoked token resolves to nothing');

-- Fixed windows: the third call in a window of two is refused.
select results_eq(
  $$ select public.srv_rate_limit('pgtap:k', 2, interval '1 minute') from generate_series(1, 3) $$,
  $$ values (true), (true), (false) $$,
  'srv_rate_limit counts calls per window');

-- Matching: case, accents, aliases and small differences (FR-SIR-3).
select results_eq(
  $$ select name, score from public.srv_match_habit('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'MEDITÁR') $$,
  $$ values ('Meditar'::text, 1::real) $$,
  'an exact name matches regardless of case and accents');
select results_eq(
  $$ select name from public.srv_match_habit('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'la lectura') $$,
  $$ values ('Leer 20 páginas'::text) $$,
  'an alias matches, filler words dropped');
select results_eq(
  $$ select name from public.srv_match_habit('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'medita') limit 1 $$,
  $$ values ('Meditar'::text) $$,
  'small differences still match');
select is_empty(
  $$ select * from public.srv_match_habit('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'meditar') $$,
  'only the user''s own habits match');
reset role;

select * from finish();
rollback;
