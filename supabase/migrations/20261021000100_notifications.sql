-- Phase 3 · Notification planning (docs/spec/03-architecture.md §5 step 2, R-NTF-1).

-- ---------------------------------------------------------------------------
-- Profile settings that change the plan mark it dirty (data model §4, mark_plan_dirty).
-- Quiet hours and mute are checked when sending, so they don't need a new plan.
-- ---------------------------------------------------------------------------

create or replace function public.profiles_mark_plan_dirty()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.timezone, new.day_start_hour, new.week_start, new.reminder_lead_min,
      new.daily_report_enabled, new.daily_report_time, new.weekly_review_enabled,
      new.weekly_review_dow, new.weekly_review_time)
     is distinct from
     (old.timezone, old.day_start_hour, old.week_start, old.reminder_lead_min,
      old.daily_report_enabled, old.daily_report_time, old.weekly_review_enabled,
      old.weekly_review_dow, old.weekly_review_time) then
    new.plan_dirty := true;
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_mark_plan_dirty() from public, anon, authenticated;

create trigger profiles_mark_plan_dirty
  before update on public.profiles
  for each row execute function public.profiles_mark_plan_dirty();

-- ---------------------------------------------------------------------------
-- srv_claim_profiles_to_plan: users whose plan is out of date
-- ---------------------------------------------------------------------------

-- Returns up to p_max users with plan_dirty, or planned only up to before their tomorrow, with
-- their habit day today. plan_dirty is cleared as they're claimed, so a change made while the
-- plan is being written marks it dirty again. SKIP LOCKED keeps overlapping ticks apart.
create or replace function public.srv_claim_profiles_to_plan(p_max integer)
returns table (user_id uuid, today date)
language plpgsql
volatile
set search_path = ''
as $$
begin
  return query
  with due as (
    select p.id
      from public.profiles p
     where p.plan_dirty
        or p.planned_through is null
        or p.planned_through < public.srv_user_today(p.id) + 1
     order by p.plan_dirty desc, p.id
     limit greatest(coalesce(p_max, 0), 0)
     for update skip locked
  )
  update public.profiles p
     set plan_dirty = false
    from due
   where p.id = due.id
  returning p.id, public.srv_user_today(p.id);
end;
$$;

revoke execute on function public.srv_claim_profiles_to_plan(integer) from public, anon, authenticated;
grant execute on function public.srv_claim_profiles_to_plan(integer) to service_role;

-- ---------------------------------------------------------------------------
-- srv_replace_plan: swap a user's pending notifications for a new plan, atomically
-- ---------------------------------------------------------------------------

-- Deletes the user's pending notifications from p_from on (except tests and snoozes, which the
-- planner doesn't make), inserts p_rows, and records planned_through. Rows whose dedupe_key was
-- already used (sent, suppressed or failed) are skipped, so nothing is sent twice.
-- p_rows: [{ "kind", "habit_id", "routine_id", "local_date", "send_at", "dedupe_key" }]
create or replace function public.srv_replace_plan(
  p_user_id uuid,
  p_from    date,
  p_through date,
  p_rows    jsonb
)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  delete from public.scheduled_notifications n
   where n.user_id = p_user_id
     and n.status = 'pending'
     and n.local_date >= p_from
     and n.kind <> 'test'
     and n.dedupe_key not like '%:snooze:%';

  insert into public.scheduled_notifications
    (user_id, kind, habit_id, routine_id, local_date, send_at, dedupe_key)
  select p_user_id,
         (r ->> 'kind')::public.notification_kind,
         nullif(r ->> 'habit_id', '')::uuid,
         nullif(r ->> 'routine_id', '')::uuid,
         (r ->> 'local_date')::date,
         (r ->> 'send_at')::timestamptz,
         r ->> 'dedupe_key'
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  on conflict (dedupe_key) do nothing;
  get diagnostics v_inserted = row_count;

  update public.profiles set planned_through = p_through where id = p_user_id;
  return v_inserted;
end;
$$;

revoke execute on function public.srv_replace_plan(uuid, date, date, jsonb) from public, anon, authenticated;
grant execute on function public.srv_replace_plan(uuid, date, date, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- srv_tick_if_due: also wake the tick when a plan is out of date
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
