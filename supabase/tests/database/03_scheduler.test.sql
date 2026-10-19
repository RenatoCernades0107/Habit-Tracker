-- Scheduler: srv_tick_if_due (spec 04 §7, Architecture §5), pg_cron jobs and nightly cleanup (§6).
-- Vault secrets and queued pg_net requests are created inside this transaction and rolled back, so
-- nothing is ever sent (pg_net only sends requests after commit).
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- Requests queued by this transaction only (other sessions' requests have another xmin).
create function pg_temp.queued_ticks() returns bigint
language sql as $$
  select count(*) from net.http_request_queue where xmin = pg_current_xact_id()::xid
$$;

insert into auth.users (id, email) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ana@example.test');

-- Start from a known state: no notifications and no scheduler secrets.
delete from public.scheduled_notifications;
delete from vault.secrets where name in ('restart_app_url', 'restart_cron_secret');

-- ---------------------------------------------------------------------------
-- pg_cron jobs
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select jobname::text, schedule::text, command::text, active
       from cron.job where jobname like 'restart-%' order by jobname $$,
  $$ values ('restart-cleanup', '23 4 * * *', 'select public.srv_nightly_cleanup()', true),
            ('restart-tick', '* * * * *', 'select public.srv_tick_if_due()', true) $$,
  'pg_cron runs the tick every minute and the cleanup every night'
);

-- ---------------------------------------------------------------------------
-- srv_tick_if_due only calls the app when secrets exist and work is due
-- ---------------------------------------------------------------------------

select public.srv_tick_if_due();
select is(pg_temp.queued_ticks(), 0::bigint, 'no secrets and nothing due: no request');

insert into public.scheduled_notifications (user_id, kind, local_date, send_at, dedupe_key)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test', current_date, now() - interval '1 minute',
        'pgtap:tick:due');

select public.srv_tick_if_due();
select is(pg_temp.queued_ticks(), 0::bigint, 'a due notification but no secrets: no request');

select vault.create_secret('http://pgtap.invalid:3000/', 'restart_app_url');
select public.srv_tick_if_due();
select is(pg_temp.queued_ticks(), 0::bigint, 'only the app URL secret: no request');

select vault.create_secret('pgtap-cron-secret', 'restart_cron_secret');
select public.srv_tick_if_due();
select is(pg_temp.queued_ticks(), 1::bigint, 'secrets and a due notification: one request');

select results_eq(
  $$ select method::text, url, headers ->> 'x-cron-secret', headers ->> 'content-type',
            timeout_milliseconds
       from net.http_request_queue where xmin = pg_current_xact_id()::xid $$,
  $$ values ('POST', 'http://pgtap.invalid:3000/api/internal/tick', 'pgtap-cron-secret',
             'application/json', 60000) $$,
  'the request is a POST to /api/internal/tick with the x-cron-secret header'
);

update public.scheduled_notifications
   set send_at = now() + interval '10 minutes'
 where dedupe_key = 'pgtap:tick:due';
insert into public.scheduled_notifications (user_id, kind, local_date, send_at, status, sent_at, dedupe_key)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test', current_date, now() - interval '1 hour',
        'sent', now() - interval '1 hour', 'pgtap:tick:sent');
insert into public.scheduled_notifications
  (user_id, kind, local_date, send_at, status, claimed_at, attempts, dedupe_key)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test', current_date, now() - interval '2 minutes',
        'sending', now() - interval '1 minute', 1, 'pgtap:tick:busy');

select public.srv_tick_if_due();
select is(
  pg_temp.queued_ticks(), 1::bigint,
  'only future, sent and recently claimed notifications: no new request'
);

update public.scheduled_notifications
   set claimed_at = now() - interval '6 minutes'
 where dedupe_key = 'pgtap:tick:busy';

select public.srv_tick_if_due();
select is(pg_temp.queued_ticks(), 2::bigint, 'a notification stuck in sending: one more request');

-- ---------------------------------------------------------------------------
-- Users can't trigger the scheduler or the cleanup
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select throws_ok(
  $$ select public.srv_tick_if_due() $$,
  '42501', null, 'authenticated cannot execute srv_tick_if_due'
);

select throws_ok(
  $$ select public.srv_nightly_cleanup() $$,
  '42501', null, 'authenticated cannot execute srv_nightly_cleanup'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select throws_ok(
  $$ select public.srv_tick_if_due() $$,
  '42501', null, 'anon cannot execute srv_tick_if_due'
);

reset role;

-- ---------------------------------------------------------------------------
-- srv_nightly_cleanup keeps finished notifications for 30 days
-- ---------------------------------------------------------------------------

delete from public.scheduled_notifications;
insert into public.scheduled_notifications (user_id, kind, local_date, send_at, status, dedupe_key)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test', current_date - age_days, now() - make_interval(days => age_days),
       status::public.notification_status, 'pgtap:cleanup:' || status || ':' || age_days
  from (values ('sent', 31), ('suppressed', 31), ('failed', 31), ('pending', 31), ('sending', 31),
               ('sent', 29), ('failed', 29)) as v(status, age_days);

select is(public.srv_nightly_cleanup(), 3::bigint, 'cleanup deletes three old finished notifications');

select results_eq(
  $$ select dedupe_key from public.scheduled_notifications order by dedupe_key $$,
  $$ values ('pgtap:cleanup:failed:29'), ('pgtap:cleanup:pending:31'),
            ('pgtap:cleanup:sending:31'), ('pgtap:cleanup:sent:29') $$,
  'recent finished rows and unfinished rows are kept'
);

set local role service_role;
select lives_ok($$ select public.srv_nightly_cleanup() $$, 'service_role can run the cleanup');
reset role;

select * from finish();
rollback;
