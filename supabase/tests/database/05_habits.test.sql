-- Phase 1: defaults, habits, schedule history, pauses and check-in operations
-- (docs/spec/02-domain-rules.md R-SCHED-0, R-CHK, R-SKIP; docs/spec/04-data-model.md).
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'uno@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'dos@example.test');

-- UTC and a midnight day boundary, so "today" is current_date inside this transaction.
update public.profiles set timezone = 'UTC', day_start_hour = 0, max_skips_per_month = 1;
insert into public.routines (id, user_id, name, start_time)
values ('cccc0000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Noon', '12:00');

-- ---------------------------------------------------------------------------
-- Defaults (FR-RTN-1, FR-HAB-3)
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select array_agg(system_key order by sort_order), array_agg(start_time order by sort_order)
       from public.routines where user_id = '11111111-1111-4111-8111-111111111111' and system_key is not null $$,
  $$ values (array['morning', 'evening'], array[time '07:00', time '21:00']) $$,
  'new accounts get Morning (07:00) and Evening (21:00)'
);
select is(
  (select count(*)::int from public.categories where user_id = '11111111-1111-4111-8111-111111111111'),
  6, 'new accounts get the six default categories'
);

-- ---------------------------------------------------------------------------
-- As user 1
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}';

insert into public.habits (id, name, start_date, routine_id)
select 'aaaa0000-0000-4000-8000-000000000001', 'Meditate', current_date - 30, r.id
  from public.routines r where r.system_key = 'morning';
insert into public.habits (id, name, kind, target_value, unit, increment_step, start_date)
values ('aaaa0000-0000-4000-8000-000000000002', 'Water', 'measurable', 8, 'glasses', 1, current_date - 30);
insert into public.habits (id, name, schedule_type, times_per_week, start_date)
values ('aaaa0000-0000-4000-8000-000000000003', 'Gym', 'times_per_week', 4, current_date - 30);

select is(
  (select user_id from public.habits where id = 'aaaa0000-0000-4000-8000-000000000001'),
  '11111111-1111-4111-8111-111111111111'::uuid, 'user_id defaults to the signed-in user'
);
select results_eq(
  $$ select valid_from, schedule_type::text from public.habit_versions
      where habit_id = 'aaaa0000-0000-4000-8000-000000000001' $$,
  $$ values (current_date - 30, 'daily') $$,
  'creating a habit records its first schedule version at the start date (R-SCHED-0)'
);

update public.habits set schedule_type = 'days_of_week', days_of_week = '{5,1,1,3}'
 where id = 'aaaa0000-0000-4000-8000-000000000001';
select results_eq(
  $$ select valid_from, schedule_type::text, days_of_week from public.habit_versions
      where habit_id = 'aaaa0000-0000-4000-8000-000000000001' order by valid_from $$,
  $$ values (current_date - 30, 'daily', null::smallint[]),
            (current_date, 'days_of_week', '{1,3,5}'::smallint[]) $$,
  'a schedule change adds a version from today; weekdays are sorted and deduplicated'
);

-- Check-ins are written only through apply_check_in_op.
select throws_ok(
  $$ insert into public.check_ins (user_id, habit_id, local_date, status, source)
     values ('11111111-1111-4111-8111-111111111111', 'aaaa0000-0000-4000-8000-000000000001', current_date, 'done', 'app') $$,
  '42501', null, 'users cannot insert check-ins directly'
);

-- complete (boolean)
select is(
  (public.apply_check_in_op('bbbb0000-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001',
                            current_date, 'complete')).status::text,
  'done', 'complete marks a boolean habit done'
);
select is(
  (public.apply_check_in_op('bbbb0000-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001',
                            current_date, 'clear')).status::text,
  'done', 'the same op_id sent again is ignored (R-CHK-7)'
);
select is(
  (select count(*)::int from public.check_in_events where op_id = 'bbbb0000-0000-4000-8000-000000000001'),
  1, 'and logged once'
);

-- increment (measurable)
select results_eq(
  $$ select status::text, value from public.apply_check_in_op('bbbb0000-0000-4000-8000-000000000002',
       'aaaa0000-0000-4000-8000-000000000002', current_date, 'increment', '{"amount": 6}') $$,
  $$ values ('partial', 6::numeric) $$,
  'increment below the target is partial'
);
select results_eq(
  $$ select status::text, value from public.apply_check_in_op('bbbb0000-0000-4000-8000-000000000003',
       'aaaa0000-0000-4000-8000-000000000002', current_date, 'increment') $$,
  $$ values ('partial', 7::numeric) $$,
  'increment without an amount adds the habit step'
);
select results_eq(
  $$ select status::text, value from public.apply_check_in_op('bbbb0000-0000-4000-8000-000000000004',
       'aaaa0000-0000-4000-8000-000000000002', current_date, 'complete') $$,
  $$ values ('done', 8::numeric) $$,
  'complete on a measurable habit sets the value to the target'
);
select ok(
  (public.apply_check_in_op('bbbb0000-0000-4000-8000-000000000005', 'aaaa0000-0000-4000-8000-000000000002',
                            current_date, 'set_value', '{"value": 0}')).deleted_at is not null,
  'a value of 0 clears the check-in'
);
select throws_ok(
  $$ select public.apply_check_in_op('bbbb0000-0000-4000-8000-000000000006',
       'aaaa0000-0000-4000-8000-000000000001', current_date, 'increment') $$,
  '22023', 'not_allowed_for_habit', 'increment is only for measurable habits'
);

-- Dates (R-CHK-5)
select throws_ok(
  $$ select public.apply_check_in_op(gen_random_uuid(), 'aaaa0000-0000-4000-8000-000000000001',
       current_date + 1, 'complete') $$,
  '22023', 'outside_edit_window', 'future dates are rejected'
);
select throws_ok(
  $$ select public.apply_check_in_op(gen_random_uuid(), 'aaaa0000-0000-4000-8000-000000000001',
       current_date - 8, 'complete') $$,
  '22023', 'outside_edit_window', 'dates beyond the 7-day edit window are rejected'
);
select is(
  (public.apply_check_in_op(gen_random_uuid(), 'aaaa0000-0000-4000-8000-000000000001',
                            current_date - 7, 'complete')).status::text,
  'done', 'the 7th day back is still editable'
);

-- Skips (R-SKIP), with a limit of 1 per month for this test
select is(
  (public.apply_check_in_op(gen_random_uuid(), 'aaaa0000-0000-4000-8000-000000000002',
                            current_date, 'skip', '{"reason": "sick"}')).skip_reason::text,
  'sick', 'skip records the reason'
);
select throws_ok(
  $$ select public.apply_check_in_op(gen_random_uuid(), 'aaaa0000-0000-4000-8000-000000000002',
       case when extract(day from current_date) > 1 then current_date - 1 else current_date end,
       'skip') $$,
  '22023', 'skip_limit_reached', 'a second skip in the same month goes over the limit'
);
select throws_ok(
  $$ select public.apply_check_in_op(gen_random_uuid(), 'aaaa0000-0000-4000-8000-000000000003',
       current_date, 'skip') $$,
  '22023', 'not_allowed_for_habit', 'flexible habits cannot be skipped (they use pauses)'
);

-- Undo (R-CHK-8)
select public.apply_check_in_op('bbbb0000-0000-4000-8000-000000000010', 'aaaa0000-0000-4000-8000-000000000003',
                                current_date, 'complete');
select ok(
  (public.undo_op('bbbb0000-0000-4000-8000-000000000010')).deleted_at is not null,
  'undoing the first operation of the day clears the check-in'
);
-- The latest operation of today is the skip of habit 2, which had been cleared before it.
select results_eq(
  $$ select habit_id, skip_reason::text, deleted_at is not null from public.undo_last_op() $$,
  $$ values ('aaaa0000-0000-4000-8000-000000000002'::uuid, null::text, true) $$,
  'undo_last_op restores the state before the latest operation of today'
);
select throws_ok(
  $$ select public.apply_check_in_op(gen_random_uuid(), 'aaaa0000-0000-4000-8000-000000000001',
       current_date, 'complete', '{}', 'siri') $$,
  '22023', 'validation_error', 'users cannot claim server-only sources such as siri'
);

-- Pauses (R-SKIP-3)
select throws_ok(
  $$ insert into public.pauses (habit_id, start_date) values ('aaaa0000-0000-4000-8000-000000000001', current_date - 1) $$,
  '23514', 'pause cannot start in the past', 'pauses cannot start in the past'
);
select lives_ok(
  $$ insert into public.pauses (habit_id, start_date, end_date)
     values ('aaaa0000-0000-4000-8000-000000000001', current_date, current_date + 3) $$,
  'pauses can start today'
);

-- Routine deleted → habits move to Anytime (FR-RTN-4)
update public.routines set deleted_at = now() where system_key = 'morning';
select is(
  (select routine_id from public.habits where id = 'aaaa0000-0000-4000-8000-000000000001'),
  null::uuid, 'soft-deleting a routine moves its habits to Anytime'
);

select throws_ok(
  $$ delete from public.habits where id = 'aaaa0000-0000-4000-8000-000000000001' $$,
  '42501', null, 'hard deletes are server-only (soft delete with deleted_at)'
);

-- ---------------------------------------------------------------------------
-- As user 2
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}';

select is((select count(*)::int from public.habits), 0, 'users see only their own habits');
select is((select count(*)::int from public.check_ins), 0, 'users see only their own check-ins');
select throws_ok(
  $$ select public.apply_check_in_op(gen_random_uuid(), 'aaaa0000-0000-4000-8000-000000000001',
       current_date, 'complete') $$,
  'P0002', 'habit_not_found', 'users cannot check in on another user''s habit'
);
select throws_ok(
  $$ insert into public.habits (name, start_date, routine_id)
     values ('Steal', current_date, 'cccc0000-0000-4000-8000-000000000001') $$,
  '23503', null, 'a habit cannot point to another user''s routine'
);

select * from finish();
rollback;
