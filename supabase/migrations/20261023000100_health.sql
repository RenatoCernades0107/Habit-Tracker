-- Phase 5 · Apple Health (FR-HLT-1…7, R-HLT-1…5, docs/spec/06-integrations.md §2).

create type public.health_metric as enum (
  'steps', 'exercise_minutes', 'active_energy_kcal', 'distance_km',
  'mindful_minutes', 'workouts', 'sleep_hours'
);

-- R-HLT-1: a rule is "metric ≥ target".
alter table public.habits
  add column health_metric public.health_metric,
  add column health_target numeric check (health_target > 0 and health_target <= 1000000),
  add constraint health_rule_is_complete check ((health_metric is null) = (health_target is null));

-- ---------------------------------------------------------------------------
-- health_metric_days: daily totals by calendar date (R-HLT-2)
-- ---------------------------------------------------------------------------

create table public.health_metric_days (
  user_id     uuid not null references auth.users on delete cascade,
  metric      public.health_metric not null,
  local_date  date not null,
  value       numeric not null check (value >= 0),
  synced_at   timestamptz not null default now(),
  primary key (user_id, metric, local_date)
);

comment on table public.health_metric_days is
  'Apple Health daily totals, written by POST /api/v1/health. Users can read and delete theirs (FR-HLT-6).';

alter table public.health_metric_days enable row level security;
create policy "health_metric_days: select own" on public.health_metric_days for select to authenticated
  using (user_id = (select auth.uid()));
create policy "health_metric_days: delete own" on public.health_metric_days for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on table public.health_metric_days from anon, authenticated;
grant select, delete on table public.health_metric_days to authenticated;
grant select, insert, update, delete on table public.health_metric_days to service_role;

-- ---------------------------------------------------------------------------
-- srv_apply_health_metrics (API §5): save totals and apply R-HLT-3, in one transaction
-- ---------------------------------------------------------------------------

-- p_metrics: [{ "metric", "date", "value" }]. Returns
-- { "accepted": n, "ignored": n, "completed": [{ "habit_id", "habit", "date" }] }.
create or replace function public.srv_apply_health_metrics(p_user_id uuid, p_metrics jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item       jsonb;
  v_metric     public.health_metric;
  v_date       date;
  v_value      numeric;
  v_accepted   int := 0;
  v_ignored    int := 0;
  v_completed  jsonb := '[]'::jsonb;
  v_habit      public.habits;
  v_kind       public.habit_kind;
  v_schedule   public.schedule_type;
  v_days       smallint[];
  v_target     numeric;
  v_row        public.check_ins;
  v_live       boolean;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_metrics, '[]'::jsonb)) loop
    begin
      v_metric := (v_item ->> 'metric')::public.health_metric;
      v_date := (v_item ->> 'date')::date;
      v_value := (v_item ->> 'value')::numeric;
    exception when others then
      v_ignored := v_ignored + 1;
      continue;
    end;
    if v_value is null or v_value < 0 or v_date is null then
      v_ignored := v_ignored + 1;
      continue;
    end if;

    -- R-HLT-5: only metrics that a habit uses are kept.
    if not exists (select 1 from public.habits h
                    where h.user_id = p_user_id and h.deleted_at is null
                      and h.health_metric = v_metric) then
      v_ignored := v_ignored + 1;
      continue;
    end if;

    insert into public.health_metric_days as d (user_id, metric, local_date, value, synced_at)
    values (p_user_id, v_metric, v_date, v_value, now())
    on conflict (user_id, metric, local_date)
      do update set value = excluded.value, synced_at = now();
    v_accepted := v_accepted + 1;

    -- R-HLT-3 for each habit with a rule on this metric.
    for v_habit in
      select * from public.habits h
       where h.user_id = p_user_id and h.deleted_at is null and h.health_metric = v_metric
         and h.start_date <= v_date and (h.archived_on is null or v_date < h.archived_on)
         and not exists (select 1 from public.pauses p
                          where p.user_id = p_user_id and p.deleted_at is null
                            and (p.habit_id = h.id or p.habit_id is null)
                            and v_date >= p.start_date
                            and (p.end_date is null or v_date <= p.end_date))
    loop
      -- The schedule in force that day (R-SCHED-0); fixed days off are left alone.
      select v.kind, v.schedule_type, v.days_of_week, v.target_value
        into v_kind, v_schedule, v_days, v_target
        from public.habit_versions v
       where v.habit_id = v_habit.id and v.valid_from <= v_date
       order by v.valid_from desc limit 1;
      if not found then
        v_kind := v_habit.kind; v_schedule := v_habit.schedule_type;
        v_days := v_habit.days_of_week; v_target := v_habit.target_value;
      end if;
      if v_schedule = 'days_of_week' and not (extract(isodow from v_date)::smallint = any (v_days)) then
        continue;
      end if;

      select * into v_row from public.check_ins c
       where c.habit_id = v_habit.id and c.local_date = v_date;
      v_live := v_row.id is not null and v_row.deleted_at is null;

      -- The user undid an automatic completion that day: Health stays out of it.
      if v_row.id is not null and v_row.auto_dismissed then
        continue;
      end if;

      begin
        if v_kind = 'measurable' and (not v_live or v_row.source = 'health') then
          -- Mirror the metric's value (FR-HLT-4); the state follows R-STATE, and a
          -- Health-only value may go down as totals are corrected.
          if not v_live or v_row.value is distinct from v_value then
            perform private.apply_check_in_op(
              p_user_id, gen_random_uuid(), v_habit.id, v_date, 'set_value',
              jsonb_build_object('value', v_value), 'health');
            if not v_live and v_value >= v_target then
              v_completed := v_completed || jsonb_build_object(
                'habit_id', v_habit.id, 'habit', v_habit.name, 'date', v_date);
            end if;
          end if;
        elsif v_value >= v_habit.health_target and not v_live then
          perform private.apply_check_in_op(
            p_user_id, gen_random_uuid(), v_habit.id, v_date, 'complete', '{}'::jsonb, 'health');
          v_completed := v_completed || jsonb_build_object(
            'habit_id', v_habit.id, 'habit', v_habit.name, 'date', v_date);
        end if;
      exception when sqlstate '22023' then
        -- Outside the edit window, or not allowed for this habit: nothing to do.
        null;
      end;

      -- Verified when the metric meets the rule, whoever logged it (manual check-ins win).
      if v_value >= v_habit.health_target then
        update public.check_ins c set health_verified = true
         where c.habit_id = v_habit.id and c.local_date = v_date
           and c.deleted_at is null and c.status = 'done' and not c.health_verified;
      end if;
    end loop;
  end loop;

  update public.profiles set last_health_sync_at = now() where id = p_user_id;
  return jsonb_build_object('accepted', v_accepted, 'ignored', v_ignored, 'completed', v_completed);
end;
$$;

revoke execute on function public.srv_apply_health_metrics(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.srv_apply_health_metrics(uuid, jsonb) to service_role;

-- "Undo the last operation" orders events by created_at. now() is the same for every operation
-- in one transaction (a Health sync applies several), so each event gets its own clock time.
alter table public.check_in_events alter column created_at set default clock_timestamp();
