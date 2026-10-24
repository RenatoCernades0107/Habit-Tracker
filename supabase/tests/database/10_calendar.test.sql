-- Phase 6: calendar tables, job triggers and srv_claim_calendar_jobs (Integrations §3.6, §3.7).
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email) values
  ('77777777-7777-4777-8777-777777777777', 'gc@example.test'),
  ('88888888-8888-4888-8888-888888888888', 'nc@example.test');
-- current_date is the habit day only with a midnight day start (else it fails before 04:00 UTC).
update public.profiles set timezone = 'UTC', day_start_hour = 0;

-- Not connected: nothing is queued.
insert into public.habits (id, user_id, name, time_of_day, calendar_sync, start_date) values
  ('cccc0000-0000-4000-8000-000000000009', '88888888-8888-4888-8888-888888888888', 'Leer', '21:00', true, current_date);
select is((select count(*)::int from public.calendar_sync_jobs), 0, 'without a connection nothing is queued');

insert into public.calendar_connections (user_id, google_email, calendar_id, refresh_token_enc) values
  ('77777777-7777-4777-8777-777777777777', 'gc@gmail.example', 'cal-1', '\x00');

insert into public.habits (id, user_id, name, time_of_day, calendar_sync, start_date) values
  ('cccc0000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', 'Meditar', '07:00', true, current_date - 5);
select results_eq($$ select op from public.calendar_sync_jobs order by id $$, $$ values ('sync_series') $$,
  'a synced habit queues its series');

update public.habits set time_of_day = '07:30' where id = 'cccc0000-0000-4000-8000-000000000001';
update public.habits set sort_order = 3 where id = 'cccc0000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.calendar_sync_jobs where op = 'sync_series'), 2,
  'a time change re-syncs; an unrelated change does not');

select public.srv_apply_check_in_op('77777777-7777-4777-8777-777777777777', gen_random_uuid(),
  'cccc0000-0000-4000-8000-000000000001', current_date, 'complete', '{}', 'siri');
select results_eq($$ select op, local_date from public.calendar_sync_jobs where op = 'mark_instance' $$,
  $$ values ('mark_instance'::text, current_date) $$, 'a check-in marks that day');
select public.srv_apply_check_in_op('77777777-7777-4777-8777-777777777777', gen_random_uuid(),
  'cccc0000-0000-4000-8000-000000000001', current_date, 'set_note', '{"note": "bien"}', 'app');
select is((select count(*)::int from public.calendar_sync_jobs where op = 'mark_instance'), 1,
  'a note alone does not re-mark');

insert into public.pauses (user_id, habit_id, start_date, end_date) values
  ('77777777-7777-4777-8777-777777777777', 'cccc0000-0000-4000-8000-000000000001', current_date + 1, current_date + 3);
select is((select count(*)::int from public.calendar_sync_jobs where op = 'sync_series'), 3,
  'a pause re-syncs the series');

insert into public.calendar_series (user_id, habit_id, google_event_id, valid_from, rrule) values
  ('77777777-7777-4777-8777-777777777777', 'cccc0000-0000-4000-8000-000000000001', 'evt-1', current_date - 5, 'RRULE:FREQ=DAILY');
update public.habits set archived_on = current_date where id = 'cccc0000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.calendar_sync_jobs where op = 'end_series'), 1,
  'archiving ends the series');
update public.habits set deleted_at = now() where id = 'cccc0000-0000-4000-8000-000000000001';
select results_eq($$ select payload -> 'event_ids' from public.calendar_sync_jobs where op = 'delete_series' $$,
  $$ values ('["evt-1"]'::jsonb) $$, 'deleting queues the deletion with the event ids');

-- Users can see their connection, not the token, and nothing of the queue.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "77777777-7777-4777-8777-777777777777", "role": "authenticated"}', true);
select results_eq($$ select google_email, status from public.calendar_connections $$,
  $$ values ('gc@gmail.example'::text, 'active'::text) $$, 'users see their connection');
select throws_ok($$ select refresh_token_enc from public.calendar_connections $$, '42501', null,
  'the token is not readable');
select throws_ok($$ select * from public.calendar_sync_jobs $$, '42501', null, 'the queue is server only');
reset role;
select set_config('request.jwt.claims', '', true);

-- Claiming coalesces duplicates: only the newest sync_series runs.
set local role service_role;
select results_eq(
  $$ select op from public.srv_claim_calendar_jobs(10) order by id $$,
  $$ values ('mark_instance'), ('sync_series'), ('end_series'), ('delete_series') $$,
  'one job per (habit, op, date): the newest of each, in queue order');
update public.calendar_connections set status = 'needs_reauth';
insert into public.calendar_sync_jobs (user_id, habit_id, op) values
  ('77777777-7777-4777-8777-777777777777', 'cccc0000-0000-4000-8000-000000000001', 'full_resync');
select is_empty($$ select * from public.srv_claim_calendar_jobs(10) $$,
  'jobs wait while the connection needs reauthorizing');
reset role;

select * from finish();
rollback;
