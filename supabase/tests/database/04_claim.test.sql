-- srv_claim_due_notifications (API §5, Architecture §5 steps 3 and 6).
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ana@example.test');

-- Start from a known state.
delete from public.scheduled_notifications;

insert into public.scheduled_notifications
  (user_id, kind, local_date, send_at, status, claimed_at, attempts, dedupe_key)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'habit_reminder', current_date,
       now() + v.send_in, v.status::public.notification_status, now() + v.claimed_in, v.attempts,
       'pgtap:claim:' || v.name
  from (values
    -- name        send_in                       status      claimed_in                  attempts
    ('due-old',    interval '-3 minutes',        'pending',  null::interval,             0),
    ('due-new',    interval '-1 minute',         'pending',  null,                       0),
    ('future',     interval '10 minutes',        'pending',  null,                       0),
    ('sent',       interval '-1 hour',           'sent',     interval '-1 hour',         1),
    ('stuck',      interval '-10 minutes',       'sending',  interval '-6 minutes',      1),
    ('busy',       interval '-2 minutes',        'sending',  interval '-1 minute',       1),
    ('exhausted',  interval '-30 minutes',       'sending',  interval '-6 minutes',      3)
  ) as v(name, send_in, status, claimed_in, attempts);

-- Users can't claim anything.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select throws_ok(
  $$ select * from public.srv_claim_due_notifications(10) $$,
  '42501', null, 'authenticated cannot execute srv_claim_due_notifications'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select throws_ok(
  $$ select * from public.srv_claim_due_notifications(10) $$,
  '42501', null, 'anon cannot execute srv_claim_due_notifications'
);

reset role;

-- The tick calls it with the secret key.
set local role service_role;

select results_eq(
  $$ select dedupe_key from public.srv_claim_due_notifications(10) $$,
  $$ values ('pgtap:claim:stuck'), ('pgtap:claim:due-old'), ('pgtap:claim:due-new') $$,
  'claims due rows and rows stuck in sending for over 5 minutes, oldest first'
);

select is_empty(
  $$ select * from public.srv_claim_due_notifications(10) $$,
  'a second claim returns nothing: each row is claimed once'
);

reset role;

select results_eq(
  $$ select dedupe_key, status::text, attempts::int, claimed_at = now()
       from public.scheduled_notifications
      where dedupe_key in ('pgtap:claim:stuck', 'pgtap:claim:due-old', 'pgtap:claim:due-new')
      order by dedupe_key $$,
  $$ values ('pgtap:claim:due-new', 'sending', 1, true),
            ('pgtap:claim:due-old', 'sending', 1, true),
            ('pgtap:claim:stuck', 'sending', 2, true) $$,
  'claimed rows are marked sending, with claimed_at = now() and one more attempt'
);

select results_eq(
  $$ select status::text, attempts::int, claimed_at
       from public.scheduled_notifications where dedupe_key = 'pgtap:claim:future' $$,
  $$ values ('pending', 0, null::timestamptz) $$,
  'future rows are not claimed'
);

select results_eq(
  $$ select status::text, attempts::int, claimed_at = now() - interval '1 minute'
       from public.scheduled_notifications where dedupe_key = 'pgtap:claim:busy' $$,
  $$ values ('sending', 1, true) $$,
  'rows claimed less than 5 minutes ago are left alone'
);

select results_eq(
  $$ select status::text, attempts::int, last_error, claimed_at
       from public.scheduled_notifications where dedupe_key = 'pgtap:claim:exhausted' $$,
  $$ values ('failed', 3, 'Stuck in sending', null::timestamptz) $$,
  'a stuck row that used its 3 attempts is marked failed instead of retried'
);

select results_eq(
  $$ select status::text, attempts::int
       from public.scheduled_notifications where dedupe_key = 'pgtap:claim:sent' $$,
  $$ values ('sent', 1) $$,
  'sent rows are untouched'
);

-- p_max limits the batch; the rest waits for the next tick.
insert into public.scheduled_notifications (user_id, kind, local_date, send_at, dedupe_key)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'daily_report', current_date,
       now() - make_interval(mins => n), 'pgtap:claim:batch-' || n
  from generate_series(1, 3) as n;

set local role service_role;

select results_eq(
  $$ select dedupe_key from public.srv_claim_due_notifications(2) $$,
  $$ values ('pgtap:claim:batch-3'), ('pgtap:claim:batch-2') $$,
  'p_max limits the batch to the oldest due rows'
);

select is_empty(
  $$ select * from public.srv_claim_due_notifications(0) $$,
  'p_max = 0 claims nothing'
);

select is_empty(
  $$ select * from public.srv_claim_due_notifications(null) $$,
  'p_max = null claims nothing'
);

select results_eq(
  $$ select dedupe_key from public.srv_claim_due_notifications(10) $$,
  $$ values ('pgtap:claim:batch-1') $$,
  'the next claim takes the remaining row'
);

reset role;

select * from finish();
rollback;
