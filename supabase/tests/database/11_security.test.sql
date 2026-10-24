-- Phase 7: a replayed op_id never returns another user's check-in.
begin;
create extension if not exists pgtap with schema extensions;

select plan(2);

insert into auth.users (id, email) values
  ('12121212-1212-4212-8212-121212121212', 'a@example.test'),
  ('34343434-3434-4434-8434-343434343434', 'b@example.test');
insert into public.habits (id, user_id, name, start_date) values
  ('56565656-5656-4656-8656-565656565656', '12121212-1212-4212-8212-121212121212', 'Mine', current_date),
  ('78787878-7878-4878-8878-787878787878', '34343434-3434-4434-8434-343434343434', 'Theirs', current_date);
select public.srv_apply_check_in_op('34343434-3434-4434-8434-343434343434', gen_random_uuid(),
  '78787878-7878-4878-8878-787878787878', current_date, 'complete', '{}', 'app');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "12121212-1212-4212-8212-121212121212", "role": "authenticated"}', true);
select public.apply_check_in_op('9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a',
  '56565656-5656-4656-8656-565656565656', current_date, 'complete');

select is(
  (public.apply_check_in_op('9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a',
     '78787878-7878-4878-8878-787878787878', current_date, 'complete')).habit_id,
  '56565656-5656-4656-8656-565656565656'::uuid,
  'a replay with someone else''s habit returns the caller''s own row');
select is(
  (select count(*)::int from public.check_ins where habit_id = '78787878-7878-4878-8878-787878787878'),
  0, 'and the other user''s check-in stays invisible');
reset role;

select * from finish();
rollback;
