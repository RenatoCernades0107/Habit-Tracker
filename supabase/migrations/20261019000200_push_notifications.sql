-- Phase 0 · Web Push subscriptions, the notification queue and the per-minute scheduler.
-- Source: docs/spec/04-data-model.md §2.4, §3, §5, §6, §7 and docs/spec/03-architecture.md §5.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.notification_kind as enum (
  'habit_reminder',
  'routine_digest',
  'daily_report',
  'weekly_review',
  'test'            -- "Send test" button in Settings and spike S2
);

create type public.notification_status as enum ('pending', 'sending', 'sent', 'suppressed', 'failed');

-- ---------------------------------------------------------------------------
-- push_subscriptions: one row per device (FR-NTF-1)
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  endpoint         text not null unique,
  p256dh           text not null,
  auth             text not null,
  platform         text,                                   -- 'ios', 'android', 'desktop'
  device_label     text,                                   -- "iPhone · Safari"
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  failure_count    smallint not null default 0
);

comment on table public.push_subscriptions is
  'Web Push subscriptions. Written by /api/push/subscriptions with the secret key; users may list and delete their own.';

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: select own"
  on public.push_subscriptions for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "push_subscriptions: delete own"
  on public.push_subscriptions for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.push_subscriptions from anon, authenticated;
grant select, delete on table public.push_subscriptions to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;

-- ---------------------------------------------------------------------------
-- scheduled_notifications: planned pushes, server only
-- ---------------------------------------------------------------------------

create table public.scheduled_notifications (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null references auth.users on delete cascade,
  kind               public.notification_kind not null,
  -- Phase 1 adds the foreign keys to habits and routines (on delete cascade) when those tables exist.
  habit_id           uuid,
  routine_id         uuid,
  local_date         date not null,
  send_at            timestamptz not null,
  status             public.notification_status not null default 'pending',
  suppressed_reason  text,
  attempts           smallint not null default 0,
  last_error         text,
  claimed_at         timestamptz,                          -- set when a tick claims it; stuck rows are reset
  sent_at            timestamptz,
  dedupe_key         text not null unique,   -- e.g. 'habit_reminder:<habit>:2026-10-20', snoozes add ':snooze:<n>'
  created_at         timestamptz not null default now()
);

comment on table public.scheduled_notifications is
  'Notification queue filled by the planner and drained by /api/internal/tick. Server only (secret key).';

create index scheduled_notifications_due_idx
  on public.scheduled_notifications (send_at) where status = 'pending';
create index scheduled_notifications_user_date_idx
  on public.scheduled_notifications (user_id, local_date);
-- Finds rows stuck in 'sending' cheaply, for srv_tick_if_due and the claim recovery step.
create index scheduled_notifications_sending_idx
  on public.scheduled_notifications (claimed_at) where status = 'sending';

-- RLS on with no policies: only the secret key (service_role, which bypasses RLS) can touch it.
alter table public.scheduled_notifications enable row level security;

revoke all on table public.scheduled_notifications from anon, authenticated;
grant select, insert, update, delete on table public.scheduled_notifications to service_role;

-- ---------------------------------------------------------------------------
-- srv_claim_due_notifications (API §5, Architecture §5 steps 3 and 6)
-- ---------------------------------------------------------------------------

-- 1. Recovery: rows left in 'sending' for more than 5 minutes (a tick that died mid-send) go back to
--    'pending'. A row that already used its 3 attempts (1 send + 2 retries) is marked 'failed' instead,
--    so one bad row can't loop forever.
-- 2. Claims up to p_max due rows, oldest first. FOR UPDATE SKIP LOCKED makes overlapping ticks safe:
--    each row is returned to exactly one caller.
create or replace function public.srv_claim_due_notifications(p_max integer)
returns setof public.scheduled_notifications
language plpgsql
volatile
set search_path = ''
as $$
begin
  update public.scheduled_notifications n
     set status     = case when n.attempts >= 3 then 'failed' else 'pending' end::public.notification_status,
         last_error = case when n.attempts >= 3 then 'Stuck in sending' else n.last_error end,
         claimed_at = null
   where n.status = 'sending'
     and n.claimed_at < now() - interval '5 minutes';

  if p_max is null or p_max < 1 then
    return;
  end if;

  return query
  with due as (
    select d.id
      from public.scheduled_notifications d
     where d.status = 'pending'
       and d.send_at <= now()
     order by d.send_at, d.id
     limit p_max
     for update skip locked
  ),
  claimed as (
    update public.scheduled_notifications n
       set status     = 'sending',
           claimed_at = now(),
           attempts   = n.attempts + 1
      from due
     where n.id = due.id
    returning n.*
  )
  select * from claimed order by claimed.send_at, claimed.id;
end;
$$;

comment on function public.srv_claim_due_notifications(integer) is
  'Resets stuck rows, then claims up to p_max due notifications (status sending, attempts + 1).';

-- ---------------------------------------------------------------------------
-- srv_tick_if_due (spec §7): called by pg_cron every minute
-- ---------------------------------------------------------------------------

-- Calls POST <app_url>/api/internal/tick only when there is work, so idle minutes cost nothing on
-- Vercel (Architecture §15). The app URL and the shared secret live in Supabase Vault:
--   restart_app_url      e.g. https://restart.vercel.app (no trailing path)
--   restart_cron_secret  the same value as CRON_SECRET in the app
-- Without either secret it does nothing, so local databases and fresh projects stay quiet.
-- security definer: reads vault.decrypted_secrets and calls pg_net, which service_role can't.
create or replace function public.srv_tick_if_due()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_app_url text;
  v_secret  text;
begin
  -- Cheap, indexed checks first. Later phases add: due calendar_sync_jobs, and profiles that need
  -- planning (plan_dirty, or planned_through before the user's tomorrow).
  if not exists (
       select 1 from public.scheduled_notifications
        where status = 'pending' and send_at <= now())
     and not exists (
       select 1 from public.scheduled_notifications
        where status = 'sending' and claimed_at < now() - interval '5 minutes')
  then
    return;
  end if;

  select s.decrypted_secret into v_app_url
    from vault.decrypted_secrets s
   where s.name = 'restart_app_url';
  select s.decrypted_secret into v_secret
    from vault.decrypted_secrets s
   where s.name = 'restart_cron_secret';

  if coalesce(btrim(v_app_url), '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;

  -- pg_net queues the request and sends it after this transaction commits. The timeout is longer
  -- than the tick's ~30 s work budget, so a busy tick isn't cut off.
  perform net.http_post(
    url                  := rtrim(btrim(v_app_url), '/') || '/api/internal/tick',
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object(
                              'content-type', 'application/json',
                              'x-cron-secret', v_secret),
    timeout_milliseconds := 60000
  );
end;
$$;

comment on function public.srv_tick_if_due() is
  'pg_cron, every minute: POSTs /api/internal/tick (x-cron-secret from Vault) only when work is due.';

-- ---------------------------------------------------------------------------
-- srv_nightly_cleanup (spec §6): pure SQL retention, run by pg_cron
-- ---------------------------------------------------------------------------

-- Later phases add: check_in_events (90 days), calendar_sync_jobs, soft-deleted rows, rate_limits.
-- security definer: also trims pg_cron's own run log, which grows by one row per minute.
create or replace function public.srv_nightly_cleanup()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.scheduled_notifications
   where status in ('sent', 'suppressed', 'failed')
     and send_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;

  delete from cron.job_run_details
   where end_time < now() - interval '7 days';

  return v_deleted;
end;
$$;

comment on function public.srv_nightly_cleanup() is
  'Nightly retention: deletes finished notifications older than 30 days and old pg_cron run logs.';

-- ---------------------------------------------------------------------------
-- Privileges: server only
-- ---------------------------------------------------------------------------

revoke execute on function public.srv_claim_due_notifications(integer) from public, anon, authenticated;
revoke execute on function public.srv_tick_if_due() from public, anon, authenticated;
revoke execute on function public.srv_nightly_cleanup() from public, anon, authenticated;
grant execute on function public.srv_claim_due_notifications(integer) to service_role;
grant execute on function public.srv_tick_if_due() to service_role;
grant execute on function public.srv_nightly_cleanup() to service_role;

-- ---------------------------------------------------------------------------
-- pg_cron jobs (times are UTC). cron.schedule upserts by job name, so re-running is safe.
-- ---------------------------------------------------------------------------

select cron.schedule('restart-tick', '* * * * *', 'select public.srv_tick_if_due()');
select cron.schedule('restart-cleanup', '23 4 * * *', 'select public.srv_nightly_cleanup()');
