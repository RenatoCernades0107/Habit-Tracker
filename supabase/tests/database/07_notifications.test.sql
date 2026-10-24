-- Phase 3: plan triggers, srv_claim_profiles_to_plan, srv_replace_plan (Architecture §5 step 2).
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bo@example.test');
-- Start from a known state: only this user needs planning.
update public.profiles set plan_dirty = false, planned_through = date '2999-01-01';
update public.profiles set plan_dirty = false, planned_through = public.srv_user_today(id) + 1
 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

update public.profiles set daily_report_time = '21:30' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select ok(
  (select plan_dirty from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'changing a notification setting marks the plan dirty'
);

update public.profiles set plan_dirty = false where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
update public.profiles set quiet_hours_start = '22:00', quiet_hours_end = '07:00'
 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select ok(
  not (select plan_dirty from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'quiet hours are checked when sending and do not need a new plan'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select throws_ok($$ select * from public.srv_claim_profiles_to_plan(10) $$, '42501', null,
  'authenticated cannot claim plans');
select throws_ok($$ select public.srv_replace_plan('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_date, current_date, '[]') $$,
  '42501', null, 'authenticated cannot replace a plan');
reset role;
select set_config('request.jwt.claims', '', true);

set local role service_role;
select is_empty($$ select * from public.srv_claim_profiles_to_plan(10) $$,
  'nothing to plan while every plan is current');
reset role;

update public.profiles set daily_report_time = '22:00' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set local role service_role;
select results_eq(
  $$ select user_id from public.srv_claim_profiles_to_plan(10) $$,
  $$ values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid) $$,
  'a dirty profile is claimed'
);
select ok(
  not (select plan_dirty from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'claiming clears plan_dirty'
);

-- A sent notification and a snooze survive a new plan; pending ones are replaced.
insert into public.scheduled_notifications (user_id, kind, local_date, send_at, status, dedupe_key) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'daily_report', current_date, now() - interval '1 hour', 'sent', 'pgtap:sent'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'daily_report', current_date, now() + interval '1 hour', 'pending', 'pgtap:old'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'habit_reminder', current_date, now() + interval '5 minutes', 'pending', 'pgtap:x:snooze:1');

select is(
  public.srv_replace_plan('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_date - 1, current_date + 1,
    jsonb_build_array(
      jsonb_build_object('kind', 'daily_report', 'local_date', current_date, 'send_at', now() + interval '2 hours', 'dedupe_key', 'pgtap:new'),
      jsonb_build_object('kind', 'daily_report', 'local_date', current_date, 'send_at', now() + interval '2 hours', 'dedupe_key', 'pgtap:sent'))),
  1,
  'inserts the new plan, skipping keys already used'
);
select results_eq(
  $$ select dedupe_key from public.scheduled_notifications
      where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' order by dedupe_key $$,
  $$ values ('pgtap:new'), ('pgtap:sent'), ('pgtap:x:snooze:1') $$,
  'old pending rows are gone; sent rows and snoozes stay'
);
select is(
  (select planned_through from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  current_date + 1,
  'records how far the plan goes'
);
reset role;

select * from finish();
rollback;
