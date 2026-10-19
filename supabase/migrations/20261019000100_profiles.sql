-- Phase 0 · Extensions, shared helpers, profiles and the sign-up trigger.
-- Source: docs/spec/04-data-model.md §2.1, §3, §4, §7 and docs/spec/02-domain-rules.md (R-DAY).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;   -- fuzzy habit-name matching (Siri)
create extension if not exists unaccent with schema extensions;  -- accent-insensitive matching
-- pg_cron lives in pg_catalog and creates the `cron` schema, as the Supabase dashboard does.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
-- pg_net always creates its objects in the `net` schema; `extensions` only records the owner schema.
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at = now() on every synced table (spec §4)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is 'Trigger: sets updated_at = now() before each update.';

-- Trigger functions never need to be callable through the API (PostgreSQL checks EXECUTE only when
-- the trigger is created, not when it fires).
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- R-DAY-2: local_date(t) = calendar date of (t in the user's timezone − day_start_hour hours)
-- ---------------------------------------------------------------------------

create or replace function public.srv_local_date(
  p_at timestamptz,
  p_timezone text,
  p_day_start_hour integer
)
returns date
language sql
stable
set search_path = ''
as $$
  select ((p_at at time zone p_timezone) - make_interval(hours => p_day_start_hour))::date;
$$;

comment on function public.srv_local_date(timestamptz, text, integer) is
  'R-DAY-2: the habit day of an instant for a timezone and day-start hour.';

-- ---------------------------------------------------------------------------
-- Profiles (spec §2.1)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                      uuid primary key references auth.users on delete cascade,
  display_name            text,
  -- Default 'en': English is the fallback language (FR-I18N-2, decision 2026-10-19).
  locale                  text not null default 'en' check (locale in ('es', 'en')),
  timezone                text not null default 'UTC',            -- IANA name, see validate trigger
  day_start_hour          smallint not null default 4 check (day_start_hour between 0 and 6),
  week_start              smallint not null default 1 check (week_start in (1, 7)),  -- ISO: 1 Mon, 7 Sun
  reminder_lead_min       smallint not null default 5 check (reminder_lead_min between 0 and 120),
  daily_report_enabled    boolean not null default true,
  daily_report_time       time not null default '22:00',
  weekly_review_enabled   boolean not null default true,
  weekly_review_dow       smallint not null default 7 check (weekly_review_dow between 1 and 7),
  weekly_review_time      time not null default '19:00',
  quiet_hours_start       time,                                   -- both null = no quiet hours
  quiet_hours_end         time,
  muted_until             timestamptz,                            -- "mute for today"
  retro_edit_days         smallint not null default 7 check (retro_edit_days between 0 and 30),
  max_skips_per_month     smallint not null default 4 check (max_skips_per_month between 0 and 10),
  theme                   text not null default 'system' check (theme in ('system', 'light', 'dark')),
  plan_dirty              boolean not null default true,          -- notifications must be re-planned
  planned_through         date,                                   -- last habit day already planned
  last_health_sync_at     timestamptz,
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.profiles is 'One row per user: language, timezone, habit day and notification settings.';
comment on column public.profiles.plan_dirty is 'Set by triggers and server code only: notifications must be re-planned.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- A CHECK constraint can't query pg_timezone_names, so a trigger validates the IANA name. The view
-- reads the whole tz database (~20 ms), so it only runs when the value actually changes.
create or replace function public.validate_profile_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.timezone is not distinct from old.timezone then
    return new;
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid timezone: %', new.timezone
      using errcode = 'check_violation',
            constraint = 'profiles_timezone_check',
            hint = 'Use an IANA name such as America/Lima.';
  end if;
  return new;
end;
$$;

revoke execute on function public.validate_profile_timezone() from public, anon, authenticated;

create trigger profiles_validate_timezone
  before insert or update of timezone on public.profiles
  for each row execute function public.validate_profile_timezone();

-- RLS (spec §3): users read and update only their own row. The signup trigger inserts; account
-- deletion cascades from auth.users, so there are no insert or delete policies.
alter table public.profiles enable row level security;

create policy "profiles: select own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Column privileges: plan_dirty, planned_through and last_health_sync_at are written only by triggers
-- and server code; id, created_at and updated_at never change from the client.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (
  display_name,
  locale,
  timezone,
  day_start_hour,
  week_start,
  reminder_lead_min,
  daily_report_enabled,
  daily_report_time,
  weekly_review_enabled,
  weekly_review_dow,
  weekly_review_time,
  quiet_hours_start,
  quiet_hours_end,
  muted_until,
  retro_edit_days,
  max_skips_per_month,
  theme,
  onboarding_completed_at
) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- srv_user_today (R-DAY-3): the user's habit day right now
-- ---------------------------------------------------------------------------

create or replace function public.srv_user_today(p_user_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select public.srv_local_date(now(), p.timezone, p.day_start_hour)
  from public.profiles p
  where p.id = p_user_id;
$$;

comment on function public.srv_user_today(uuid) is
  'R-DAY-3: today''s habit day for a user (null if the user has no profile).';

-- ---------------------------------------------------------------------------
-- handle_new_user (FR-ACC-2): creates the profile from the sign-up metadata
-- ---------------------------------------------------------------------------

-- Metadata comes from signInWithOtp({ options: { data } }) or from the Google provider:
--   locale       'es' | 'en' (region subtags are ignored: 'es-PE' → 'es'); otherwise the default
--   timezone     an IANA name known to Postgres; otherwise the default (UTC)
--   week_start   1 | 7 (number or string); otherwise the default (Monday)
--   full_name | name   display name, trimmed, at most 80 characters
-- Bad values never block a sign-up: they fall back to the column defaults. Later phases also seed
-- the default routines and categories here (spec §4).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta       jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_locale     text;
  v_timezone   text;
  v_week_start smallint;
  v_name       text;
begin
  -- jsonb_typeof guards: metadata is user-controlled and may hold objects or arrays.
  if jsonb_typeof(v_meta -> 'locale') = 'string' then
    v_locale := lower(split_part(replace(v_meta ->> 'locale', '_', '-'), '-', 1));
    if v_locale not in ('es', 'en') then
      v_locale := null;
    end if;
  end if;

  if jsonb_typeof(v_meta -> 'timezone') = 'string'
     and exists (select 1 from pg_catalog.pg_timezone_names where name = v_meta ->> 'timezone') then
    v_timezone := v_meta ->> 'timezone';
  end if;

  if jsonb_typeof(v_meta -> 'week_start') in ('number', 'string')
     and v_meta ->> 'week_start' in ('1', '7') then
    v_week_start := (v_meta ->> 'week_start')::smallint;
  end if;

  v_name := case
    when jsonb_typeof(v_meta -> 'full_name') = 'string' then v_meta ->> 'full_name'
    when jsonb_typeof(v_meta -> 'name') = 'string' then v_meta ->> 'name'
  end;
  v_name := nullif(btrim(left(btrim(v_name), 80)), '');

  insert into public.profiles (id, display_name)
  values (new.id, v_name);

  -- Only override what the metadata provides, so the column defaults stay the single source of truth.
  if v_locale is not null or v_timezone is not null or v_week_start is not null then
    update public.profiles
       set locale     = coalesce(v_locale, locale),
           timezone   = coalesce(v_timezone, timezone),
           week_start = coalesce(v_week_start, week_start)
     where id = new.id;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Trigger on auth.users: creates the profile from sign-up metadata (FR-ACC-2).';

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Server-only helpers: never callable through the API with a user or anon key
-- ---------------------------------------------------------------------------

revoke execute on function public.srv_local_date(timestamptz, text, integer) from public, anon, authenticated;
revoke execute on function public.srv_user_today(uuid) from public, anon, authenticated;
grant execute on function public.srv_local_date(timestamptz, text, integer) to service_role;
grant execute on function public.srv_user_today(uuid) to service_role;
