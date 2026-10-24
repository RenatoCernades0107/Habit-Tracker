-- Phase 2: daily entries and weekly reviews (FR-REV-1, FR-REV-3).
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email) values
  ('31111111-1111-4111-8111-111111111111', 'tres@example.test'),
  ('32222222-2222-4222-8222-222222222222', 'cuatro@example.test');
update public.profiles set timezone = 'UTC', day_start_hour = 0;

set local role authenticated;
set local request.jwt.claims = '{"sub": "31111111-1111-4111-8111-111111111111", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.daily_entries (local_date, mood, note) values (current_date, 4, 'Good day') $$,
  'a user records today''s mood and note'
);
select throws_ok(
  $$ insert into public.daily_entries (local_date, mood) values (current_date + 1, 3) $$,
  '22023', 'outside_edit_window', 'future days are rejected'
);
select throws_ok(
  $$ insert into public.daily_entries (local_date, mood) values (current_date - 1, 9) $$,
  '23514', null, 'mood is 1 to 5'
);
select lives_ok(
  $$ insert into public.weekly_reviews (week_start, reflection, completed_at)
     values (current_date - 7, 'Mornings worked.', now()) $$,
  'a user saves a weekly reflection'
);
select throws_ok(
  $$ delete from public.daily_entries $$, '42501', null, 'deletes are not allowed (soft delete)'
);

set local request.jwt.claims = '{"sub": "32222222-2222-4222-8222-222222222222", "role": "authenticated"}';
select is((select count(*)::int from public.daily_entries), 0, 'other users see no daily entries');
select is((select count(*)::int from public.weekly_reviews), 0, 'other users see no reviews');

select * from finish();
rollback;
