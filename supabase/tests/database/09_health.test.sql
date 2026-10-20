-- Phase 5: srv_apply_health_metrics (R-HLT-1…5), with the brief's two examples (FR-HLT-7).
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email) values ('99999999-9999-4999-8999-999999999999', 'hl@example.test');

create temp table d as
select public.srv_user_today('99999999-9999-4999-8999-999999999999') as today,
       (select g::date from generate_series(public.srv_user_today('99999999-9999-4999-8999-999999999999') - 6,
          public.srv_user_today('99999999-9999-4999-8999-999999999999'), '1 day') g
         where extract(isodow from g) = 1) as monday,
       (select g::date from generate_series(public.srv_user_today('99999999-9999-4999-8999-999999999999') - 6,
          public.srv_user_today('99999999-9999-4999-8999-999999999999'), '1 day') g
         where extract(isodow from g) = 3) as wednesday;
grant select on d to service_role;

insert into public.habits (id, user_id, name, health_metric, health_target, start_date) values
  ('aaaa0000-0000-4000-8000-000000000001', '99999999-9999-4999-8999-999999999999',
   'Caminar 5.000 pasos', 'steps', 5000, (select today - 10 from d));
insert into public.habits (id, user_id, name, schedule_type, days_of_week, health_metric, health_target, start_date) values
  ('aaaa0000-0000-4000-8000-000000000002', '99999999-9999-4999-8999-999999999999',
   'Entrenar', 'days_of_week', '{1,2,4,5}', 'workouts', 1, (select today - 10 from d));
insert into public.habits (id, user_id, name, kind, target_value, unit, health_metric, health_target, start_date) values
  ('aaaa0000-0000-4000-8000-000000000003', '99999999-9999-4999-8999-999999999999',
   'Minutos de ejercicio', 'measurable', 30, 'min', 'exercise_minutes', 30, (select today - 10 from d));

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "99999999-9999-4999-8999-999999999999", "role": "authenticated"}', true);
select throws_ok($$ select public.srv_apply_health_metrics('99999999-9999-4999-8999-999999999999', '[]') $$,
  '42501', null, 'users cannot apply Health metrics directly');
reset role;
select set_config('request.jwt.claims', '', true);

set local role service_role;

-- Example 1: 5,000 steps completes the habit by itself.
select is(
  public.srv_apply_health_metrics('99999999-9999-4999-8999-999999999999', jsonb_build_array(
    jsonb_build_object('metric', 'steps', 'date', (select today from d), 'value', 6234),
    jsonb_build_object('metric', 'active_energy_kcal', 'date', (select today from d), 'value', 300))) - 'completed',
  '{"accepted": 1, "ignored": 1}'::jsonb,
  'saves used metrics and ignores the rest (R-HLT-5)');
select results_eq(
  $$ select status::text, source::text, health_verified from public.check_ins
      where habit_id = 'aaaa0000-0000-4000-8000-000000000001' $$,
  $$ values ('done', 'health', true) $$,
  'steps over the target complete the habit, verified by Health');
select is((select count(*)::int from public.health_metric_days where metric = 'active_energy_kcal'), 0,
  'unused metrics are not stored');
select isnt((select last_health_sync_at from public.profiles where id = '99999999-9999-4999-8999-999999999999'),
  null, 'records the last sync');

-- Example 2: workouts on Mon, Tue, Thu, Fri; a Wednesday workout isn't an occurrence.
select public.srv_apply_health_metrics('99999999-9999-4999-8999-999999999999', jsonb_build_array(
  jsonb_build_object('metric', 'workouts', 'date', (select monday from d), 'value', 1),
  jsonb_build_object('metric', 'workouts', 'date', (select wednesday from d), 'value', 1)));
select results_eq(
  $$ select local_date from public.check_ins where habit_id = 'aaaa0000-0000-4000-8000-000000000002' $$,
  $$ select monday from d where monday is not null $$,
  'a workout verifies the scheduled day, not a day off');

-- Below the target never un-completes (R-HLT-3).
select public.srv_apply_health_metrics('99999999-9999-4999-8999-999999999999', jsonb_build_array(
  jsonb_build_object('metric', 'steps', 'date', (select today from d), 'value', 100)));
select is((select status::text from public.check_ins where habit_id = 'aaaa0000-0000-4000-8000-000000000001'),
  'done', 'a lower total never un-completes');

-- Undoing an automatic completion keeps Health out for that day (FR-HLT-5).
select public.srv_apply_check_in_op('99999999-9999-4999-8999-999999999999', gen_random_uuid(),
  'aaaa0000-0000-4000-8000-000000000001', (select today from d), 'clear', '{}', 'app');
select ok((select auto_dismissed from public.check_ins where habit_id = 'aaaa0000-0000-4000-8000-000000000001'),
  'clearing a Health completion marks it dismissed');
select public.srv_apply_health_metrics('99999999-9999-4999-8999-999999999999', jsonb_build_array(
  jsonb_build_object('metric', 'steps', 'date', (select today from d), 'value', 9000)));
select isnt((select deleted_at from public.check_ins where habit_id = 'aaaa0000-0000-4000-8000-000000000001'),
  null, 'Health does not complete it again that day');

-- Manual check-ins win, and get verified (R-HLT-3).
select public.srv_apply_check_in_op('99999999-9999-4999-8999-999999999999', gen_random_uuid(),
  'aaaa0000-0000-4000-8000-000000000001', (select today - 1 from d), 'complete', '{}', 'app');
select public.srv_apply_health_metrics('99999999-9999-4999-8999-999999999999', jsonb_build_array(
  jsonb_build_object('metric', 'steps', 'date', (select today - 1 from d), 'value', 7000)));
select results_eq(
  $$ select source::text, health_verified from public.check_ins
      where habit_id = 'aaaa0000-0000-4000-8000-000000000001' and local_date = (select today - 1 from d) $$,
  $$ values ('app', true) $$,
  'a manual check-in stays manual and is marked verified');

-- Measurable habits mirror the metric (FR-HLT-4).
select public.srv_apply_health_metrics('99999999-9999-4999-8999-999999999999', jsonb_build_array(
  jsonb_build_object('metric', 'exercise_minutes', 'date', (select today from d), 'value', 12)));
select results_eq(
  $$ select status::text, value from public.check_ins where habit_id = 'aaaa0000-0000-4000-8000-000000000003' $$,
  $$ values ('partial', 12::numeric) $$,
  'a measurable habit shows the metric''s value');
select is(
  public.srv_apply_health_metrics('99999999-9999-4999-8999-999999999999', jsonb_build_array(
    jsonb_build_object('metric', 'exercise_minutes', 'date', (select today from d), 'value', 35))) -> 'completed',
  '[]'::jsonb,
  'a mirrored habit that was already started is not reported as newly completed');
select results_eq(
  $$ select status::text, value, health_verified from public.check_ins
      where habit_id = 'aaaa0000-0000-4000-8000-000000000003' $$,
  $$ values ('done', 35::numeric, true) $$,
  'and completes when it reaches the target');

-- Yesterday's late data counts even with no edit window (R-HLT-4).
update public.profiles set retro_edit_days = 0 where id = '99999999-9999-4999-8999-999999999999';
insert into public.habits (id, user_id, name, health_metric, health_target, start_date) values
  ('aaaa0000-0000-4000-8000-000000000004', '99999999-9999-4999-8999-999999999999',
   'Meditar', 'mindful_minutes', 10, (select today - 10 from d));
select is(
  public.srv_apply_health_metrics('99999999-9999-4999-8999-999999999999', jsonb_build_array(
    jsonb_build_object('metric', 'mindful_minutes', 'date', (select today - 1 from d), 'value', 12))) -> 'completed' -> 0 ->> 'habit',
  'Meditar',
  'late data can still complete yesterday');
select is(
  public.srv_apply_health_metrics('99999999-9999-4999-8999-999999999999', jsonb_build_array(
    jsonb_build_object('metric', 'steps', 'date', (select today - 3 from d), 'value', 9000))) -> 'completed',
  '[]'::jsonb,
  'older days stay closed when the edit window is 0');
reset role;

-- FR-HLT-6: users can delete their Health data.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "99999999-9999-4999-8999-999999999999", "role": "authenticated"}', true);
delete from public.health_metric_days;
select is((select count(*)::int from public.health_metric_days), 0, 'users can delete their Health data');
reset role;

select * from finish();
rollback;
