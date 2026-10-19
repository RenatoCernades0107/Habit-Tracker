-- push_subscriptions and scheduled_notifications: RLS and privileges (spec 04 §2.4, §3).
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ana@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ben@example.test');

-- Written by /api/push/subscriptions with the secret key; here as the table owner.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, platform, device_label) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'https://push.example.test/a1', 'p-a1', 'k-a1', 'ios', 'iPhone · Safari'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'https://push.example.test/a2', 'p-a2', 'k-a2', 'desktop', 'Mac · Chrome'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'https://push.example.test/b1', 'p-b1', 'k-b1', 'android', 'Pixel · Chrome');

insert into public.scheduled_notifications (user_id, kind, local_date, send_at, dedupe_key) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test', current_date, now(), 'pgtap:push:a');

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

select enum_has_labels(
  'public', 'notification_kind',
  array['habit_reminder', 'routine_digest', 'daily_report', 'weekly_review', 'test'],
  'notification_kind has the five kinds, including test'
);

select enum_has_labels(
  'public', 'notification_status',
  array['pending', 'sending', 'sent', 'suppressed', 'failed'],
  'notification_status has the five states'
);

select col_type_is(
  'public', 'scheduled_notifications', 'claimed_at', 'timestamp with time zone',
  'scheduled_notifications.claimed_at is a timestamptz'
);

select throws_ok(
  $$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
     values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'https://push.example.test/a1', 'p', 'k') $$,
  '23505', null, 'a push endpoint is stored only once'
);

select throws_ok(
  $$ insert into public.scheduled_notifications (user_id, kind, local_date, send_at, dedupe_key)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test', current_date, now(), 'pgtap:push:a') $$,
  '23505', null, 'dedupe_key is unique'
);

-- ---------------------------------------------------------------------------
-- A signed-in user: list and delete own devices only; no access to the queue
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select results_eq(
  $$ select endpoint from public.push_subscriptions order by endpoint $$,
  $$ values ('https://push.example.test/a1'), ('https://push.example.test/a2') $$,
  'a user sees only their own push subscriptions'
);

select throws_ok(
  $$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'https://push.example.test/a3', 'p', 'k') $$,
  '42501', null, 'a user cannot insert push subscriptions directly'
);

select throws_ok(
  $$ update public.push_subscriptions set device_label = 'Mine'
      where endpoint = 'https://push.example.test/a1' $$,
  '42501', null, 'a user cannot update push subscriptions'
);

select is_empty(
  $$ delete from public.push_subscriptions
      where endpoint = 'https://push.example.test/b1' returning id $$,
  'a user cannot delete another user''s subscription'
);

select results_eq(
  $$ delete from public.push_subscriptions
      where endpoint = 'https://push.example.test/a1' returning endpoint $$,
  $$ values ('https://push.example.test/a1') $$,
  'a user can delete their own subscription'
);

select throws_ok(
  $$ select * from public.scheduled_notifications $$,
  '42501', null, 'a user cannot read scheduled_notifications'
);

select throws_ok(
  $$ insert into public.scheduled_notifications (user_id, kind, local_date, send_at, dedupe_key)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test', current_date, now(), 'pgtap:push:mine') $$,
  '42501', null, 'a user cannot insert into scheduled_notifications'
);

select throws_ok(
  $$ update public.scheduled_notifications set status = 'sent' $$,
  '42501', null, 'a user cannot update scheduled_notifications'
);

-- ---------------------------------------------------------------------------
-- Anonymous visitors
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select throws_ok(
  $$ select * from public.push_subscriptions $$,
  '42501', null, 'anon cannot read push subscriptions'
);

select throws_ok(
  $$ select * from public.scheduled_notifications $$,
  '42501', null, 'anon cannot read scheduled_notifications'
);

-- ---------------------------------------------------------------------------
-- The server (secret key = service_role) manages both tables
-- ---------------------------------------------------------------------------

reset role;
set local role service_role;

select lives_ok(
  $$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'https://push.example.test/a3', 'p', 'k')
     on conflict (endpoint) do update set user_id = excluded.user_id $$,
  'service_role can upsert push subscriptions'
);

select results_eq(
  $$ select endpoint from public.push_subscriptions
      where endpoint like 'https://push.example.test/%' order by endpoint $$,
  $$ values ('https://push.example.test/a2'), ('https://push.example.test/a3'),
            ('https://push.example.test/b1') $$,
  'service_role sees every subscription; the other user''s row survived'
);

select lives_ok(
  $$ update public.scheduled_notifications set status = 'sent', sent_at = now()
      where dedupe_key = 'pgtap:push:a' $$,
  'service_role can update scheduled_notifications'
);

reset role;

-- ---------------------------------------------------------------------------
-- Account deletion cascades (FR-ACC-5)
-- ---------------------------------------------------------------------------

delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select is_empty(
  $$ select 1 from public.push_subscriptions where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'deleting the auth user deletes their push subscriptions'
);

select is_empty(
  $$ select 1 from public.scheduled_notifications
      where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'deleting the auth user deletes their scheduled notifications'
);

select * from finish();
rollback;
