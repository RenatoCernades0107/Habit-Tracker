-- Phase 6 · Google Calendar (FR-CAL-1…7, docs/spec/06-integrations.md §3, data model §2 and §4).

create type public.job_status as enum ('pending', 'running', 'done', 'failed');

-- ---------------------------------------------------------------------------
-- calendar_connections: one Google link per user; the token never leaves the server
-- ---------------------------------------------------------------------------

create table public.calendar_connections (
  user_id            uuid primary key references auth.users on delete cascade,
  provider           text not null default 'google',
  google_email       text,
  calendar_id        text,                                 -- the app's own "Habits" calendar
  refresh_token_enc  bytea not null,                       -- AES-256-GCM (TOKEN_ENCRYPTION_KEY)
  status             text not null default 'active'
                     check (status in ('active', 'needs_reauth', 'disconnected')),
  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger calendar_connections_set_updated_at before update on public.calendar_connections
  for each row execute function public.set_updated_at();

alter table public.calendar_connections enable row level security;
create policy "calendar_connections: select own" on public.calendar_connections
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.calendar_connections from anon, authenticated;
-- Everything but the token (data model §3).
grant select (user_id, provider, google_email, calendar_id, status, connected_at, updated_at)
  on table public.calendar_connections to authenticated;
grant select, insert, update, delete on table public.calendar_connections to service_role;

-- ---------------------------------------------------------------------------
-- calendar_series: one Google recurring event per habit and schedule period
-- ---------------------------------------------------------------------------

create table public.calendar_series (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  habit_id         uuid not null references public.habits on delete cascade,
  google_event_id  text not null,
  valid_from       date not null,
  valid_until      date,
  rrule            text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index calendar_series_habit_idx on public.calendar_series (habit_id, valid_from);
create trigger calendar_series_set_updated_at before update on public.calendar_series
  for each row execute function public.set_updated_at();

alter table public.calendar_series enable row level security;
revoke all on table public.calendar_series from anon, authenticated;
grant select, insert, update, delete on table public.calendar_series to service_role;

-- ---------------------------------------------------------------------------
-- calendar_sync_jobs: the sync queue, drained by the tick
-- ---------------------------------------------------------------------------

create table public.calendar_sync_jobs (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users on delete cascade,
  habit_id         uuid,                                   -- no FK: delete jobs outlive the habit
  local_date       date,
  op               text not null check (op in ('sync_series', 'end_series', 'delete_series',
                                                 'mark_instance', 'full_resync', 'delete_calendar')),
  payload          jsonb not null default '{}',
  status           public.job_status not null default 'pending',
  attempts         smallint not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  claimed_at       timestamptz,
  created_at       timestamptz not null default now()
);

create index calendar_sync_jobs_due_idx on public.calendar_sync_jobs (next_attempt_at)
  where status = 'pending';
create index calendar_sync_jobs_running_idx on public.calendar_sync_jobs (claimed_at)
  where status = 'running';

alter table public.calendar_sync_jobs enable row level security;
revoke all on table public.calendar_sync_jobs from anon, authenticated;
grant select, insert, update, delete on table public.calendar_sync_jobs to service_role;

-- ---------------------------------------------------------------------------
-- Triggers that queue jobs (data model §4)
-- ---------------------------------------------------------------------------

create or replace function private.calendar_connected(p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.calendar_connections c
                  where c.user_id = p_user_id and c.status <> 'disconnected');
$$;

create or replace function private.queue_calendar_job(
  p_user_id uuid, p_habit_id uuid, p_op text, p_local_date date default null,
  p_payload jsonb default '{}'
)
returns void
language sql
set search_path = ''
as $$
  insert into public.calendar_sync_jobs (user_id, habit_id, op, local_date, payload)
  values (p_user_id, p_habit_id, p_op, p_local_date, coalesce(p_payload, '{}'));
$$;

-- Habits: schedule, time, routine, archive, the switch, deletion.
create or replace function public.queue_calendar_series()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.calendar_connected(new.user_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.calendar_sync then
      perform private.queue_calendar_job(new.user_id, new.id, 'sync_series');
    end if;
    return new;
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    if old.calendar_sync or exists (select 1 from public.calendar_series s where s.habit_id = new.id) then
      perform private.queue_calendar_job(new.user_id, new.id, 'delete_series', null,
        jsonb_build_object('event_ids',
          coalesce((select jsonb_agg(s.google_event_id) from public.calendar_series s
                     where s.habit_id = new.id), '[]'::jsonb)));
    end if;
  elsif old.calendar_sync and not new.calendar_sync
        or (new.archived_on is not null and old.archived_on is null and new.calendar_sync) then
    perform private.queue_calendar_job(new.user_id, new.id, 'end_series');
  elsif new.calendar_sync and (
           not old.calendar_sync
        or (old.archived_on is not null and new.archived_on is null)
        or (new.schedule_type, new.days_of_week, new.times_per_week, new.time_of_day,
            new.routine_id, new.duration_min, new.name, new.icon, new.cue, new.description)
           is distinct from
           (old.schedule_type, old.days_of_week, old.times_per_week, old.time_of_day,
            old.routine_id, old.duration_min, old.name, old.icon, old.cue, old.description)) then
    perform private.queue_calendar_job(new.user_id, new.id, 'sync_series');
  end if;
  return new;
end;
$$;

create trigger habits_queue_calendar after insert or update on public.habits
  for each row execute function public.queue_calendar_series();

-- A routine's start time is the time of its habits that have none of their own.
create or replace function public.queue_calendar_routine()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.start_time is distinct from old.start_time and private.calendar_connected(new.user_id) then
    perform private.queue_calendar_job(h.user_id, h.id, 'sync_series')
       from public.habits h
      where h.routine_id = new.id and h.calendar_sync and h.deleted_at is null
        and h.time_of_day is null;
  end if;
  return new;
end;
$$;

create trigger routines_queue_calendar after update on public.routines
  for each row execute function public.queue_calendar_routine();

-- Pauses remove days from the series (FR-CAL-4).
create or replace function public.queue_calendar_pause()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.pauses := coalesce(new, old);
begin
  if not private.calendar_connected(v_row.user_id) then
    return null;
  end if;
  perform private.queue_calendar_job(h.user_id, h.id, 'sync_series')
     from public.habits h
    where h.user_id = v_row.user_id and h.calendar_sync and h.deleted_at is null
      and (v_row.habit_id is null or h.id = v_row.habit_id);
  return null;
end;
$$;

create trigger pauses_queue_calendar after insert or update or delete on public.pauses
  for each row execute function public.queue_calendar_pause();

-- Check-ins mark that day's event (FR-CAL-3).
create or replace function public.queue_calendar_mark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.deleted_at is not distinct from old.deleted_at then
    return null;
  end if;
  if exists (select 1 from public.habits h where h.id = new.habit_id and h.calendar_sync)
     and private.calendar_connected(new.user_id) then
    perform private.queue_calendar_job(new.user_id, new.habit_id, 'mark_instance', new.local_date);
  end if;
  return null;
end;
$$;

create trigger check_ins_queue_calendar after insert or update on public.check_ins
  for each row execute function public.queue_calendar_mark();

revoke execute on function private.calendar_connected(uuid) from public, anon, authenticated;
revoke execute on function private.queue_calendar_job(uuid, uuid, text, date, jsonb) from public, anon, authenticated;
revoke execute on function public.queue_calendar_series() from public, anon, authenticated;
revoke execute on function public.queue_calendar_routine() from public, anon, authenticated;
revoke execute on function public.queue_calendar_pause() from public, anon, authenticated;
revoke execute on function public.queue_calendar_mark() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- srv_claim_calendar_jobs (API §5): due jobs, coalesced, with SKIP LOCKED
-- ---------------------------------------------------------------------------

-- Integrations §3.7: for the same (user, habit, op, date) only the newest pending job runs; the
-- older ones are marked done. Jobs of a user whose connection needs reauthorizing wait.
create or replace function public.srv_claim_calendar_jobs(p_max integer, p_user_id uuid default null)
returns setof public.calendar_sync_jobs
language plpgsql
volatile
set search_path = ''
as $$
begin
  -- Recovery: a worker that died mid-job.
  update public.calendar_sync_jobs j
     set status = case when j.attempts >= 6 then 'failed' else 'pending' end::public.job_status,
         claimed_at = null
   where j.status = 'running' and j.claimed_at < now() - interval '5 minutes';

  update public.calendar_sync_jobs j
     set status = 'done', last_error = 'superseded'
   where j.status = 'pending'
     and (p_user_id is null or j.user_id = p_user_id)
     and exists (select 1 from public.calendar_sync_jobs n
                  where n.status = 'pending' and n.id > j.id and n.user_id = j.user_id
                    and n.op = j.op
                    and n.habit_id is not distinct from j.habit_id
                    and n.local_date is not distinct from j.local_date);

  return query
  with due as (
    select j.id from public.calendar_sync_jobs j
      join public.calendar_connections c on c.user_id = j.user_id
     where j.status = 'pending' and j.next_attempt_at <= now()
       and (p_user_id is null or j.user_id = p_user_id)
       and (c.status = 'active' or j.op = 'delete_calendar')
     order by j.next_attempt_at, j.id
     limit greatest(coalesce(p_max, 0), 0)
     for update of j skip locked
  )
  update public.calendar_sync_jobs j
     set status = 'running', claimed_at = now(), attempts = j.attempts + 1
    from due where j.id = due.id
  returning j.*;
end;
$$;

revoke execute on function public.srv_claim_calendar_jobs(integer, uuid) from public, anon, authenticated;
grant execute on function public.srv_claim_calendar_jobs(integer, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- srv_tick_if_due: also wake for due calendar jobs
-- ---------------------------------------------------------------------------

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
  if not exists (
       select 1 from public.scheduled_notifications
        where status = 'pending' and send_at <= now())
     and not exists (
       select 1 from public.scheduled_notifications
        where status = 'sending' and claimed_at < now() - interval '5 minutes')
     and not exists (
       select 1 from public.profiles p
        where p.plan_dirty
           or p.planned_through is null
           or p.planned_through < public.srv_user_today(p.id) + 1)
     and not exists (
       select 1 from public.calendar_sync_jobs j
         join public.calendar_connections c on c.user_id = j.user_id
        where j.status = 'pending' and j.next_attempt_at <= now()
          and (c.status = 'active' or j.op = 'delete_calendar'))
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

-- Retention (data model §6): done jobs 14 days, failed 30 days.
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

  delete from public.rate_limits where window_start < now() - interval '1 day';

  delete from public.calendar_sync_jobs
   where (status = 'done' and created_at < now() - interval '14 days')
      or (status = 'failed' and created_at < now() - interval '30 days');

  delete from cron.job_run_details
   where end_time < now() - interval '7 days';

  return v_deleted;
end;
$$;
