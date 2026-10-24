-- Phase 1: categories, routines, habits with schedule history, pauses and check-ins
-- (docs/spec/04-data-model.md §2.2–2.3, docs/spec/02-domain-rules.md).

create type public.habit_kind      as enum ('boolean', 'measurable');
create type public.schedule_type   as enum ('daily', 'days_of_week', 'times_per_week');
create type public.check_in_status as enum ('done', 'partial', 'skipped');
create type public.check_in_source as enum ('app', 'routine_mode', 'siri', 'notification', 'health', 'import');
create type public.skip_reason     as enum ('sick', 'travel', 'rest', 'other');

-- ---------------------------------------------------------------------------
-- Categories and routines
-- ---------------------------------------------------------------------------

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  system_key  text check (system_key in ('health', 'fitness', 'mind', 'learning', 'productivity', 'home')),
  name        text check (char_length(btrim(name)) between 1 and 40),
  color       text not null default 'slate' check (color ~ '^[a-z]{3,12}$'),
  icon        text check (char_length(icon) <= 16),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (system_key is not null or name is not null)
);

create table public.routines (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  system_key      text check (system_key in ('morning', 'evening')),
  name            text check (char_length(btrim(name)) between 1 and 40),
  icon            text check (char_length(icon) <= 16),
  start_time      time not null,
  end_time        time,
  digest_enabled  boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  check (system_key is not null or name is not null)
);

-- ---------------------------------------------------------------------------
-- Habits and their schedule history
-- ---------------------------------------------------------------------------

create table public.habits (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users on delete cascade,
  category_id        uuid references public.categories on delete set null,
  routine_id         uuid references public.routines on delete set null,
  name               text not null check (char_length(btrim(name)) between 1 and 80),
  description        text check (char_length(description) <= 500),
  icon               text check (char_length(icon) <= 16),
  color              text check (color ~ '^[a-z]{3,12}$'),
  cue                text check (char_length(cue) <= 120),
  voice_aliases      text[] not null default '{}' check (cardinality(voice_aliases) <= 10),
  kind               public.habit_kind not null default 'boolean',
  target_value       numeric check (target_value > 0 and target_value <= 1000000),
  unit               text check (char_length(unit) <= 20),
  increment_step     numeric not null default 1 check (increment_step > 0),
  schedule_type      public.schedule_type not null default 'daily',
  days_of_week       smallint[],
  times_per_week     smallint check (times_per_week between 1 and 7),
  time_of_day        time,
  duration_min       smallint check (duration_min between 1 and 600),
  reminder_enabled   boolean not null default true,
  reminder_lead_min  smallint check (reminder_lead_min between 0 and 120),
  calendar_sync      boolean not null default false,
  sort_order         int not null default 0,
  start_date         date not null,
  archived_on        date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint measurable_has_target check (kind = 'boolean' or target_value is not null),
  constraint schedule_is_consistent check (
       (schedule_type = 'daily')
    or (schedule_type = 'days_of_week' and cardinality(days_of_week) between 1 and 7
                                       and days_of_week <@ array[1,2,3,4,5,6,7]::smallint[])
    or (schedule_type = 'times_per_week' and times_per_week is not null))
);

-- R-SCHED-0: the schedule that applied on each date. Written only by a trigger.
create table public.habit_versions (
  habit_id        uuid not null references public.habits on delete cascade,
  valid_from      date not null,
  user_id         uuid not null references auth.users on delete cascade,
  schedule_type   public.schedule_type not null,
  days_of_week    smallint[],
  times_per_week  smallint,
  kind            public.habit_kind not null,
  target_value    numeric,
  updated_at      timestamptz not null default now(),
  primary key (habit_id, valid_from)
);

create table public.pauses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  habit_id    uuid references public.habits on delete cascade,   -- null = every habit (vacation)
  start_date  date not null,
  end_date    date,                                                -- inclusive; null = until resumed
  reason      public.skip_reason,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (end_date is null or end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- Check-ins: current state per habit and day, plus an append-only operation log
-- ---------------------------------------------------------------------------

create table public.check_ins (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  habit_id         uuid not null references public.habits on delete cascade,
  local_date       date not null,
  status           public.check_in_status not null,
  value            numeric check (value >= 0),
  skip_reason      public.skip_reason,
  note             text check (char_length(note) <= 500),
  source           public.check_in_source not null,
  health_verified  boolean not null default false,
  auto_dismissed   boolean not null default false,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (habit_id, local_date)
);

create table public.check_in_events (
  op_id       uuid primary key,
  user_id     uuid not null references auth.users on delete cascade,
  habit_id    uuid not null references public.habits on delete cascade,
  local_date  date not null,
  op          text not null check (op in ('complete', 'increment', 'set_value', 'skip', 'clear',
                                          'set_note', 'health_sync', 'undo')),
  payload     jsonb not null default '{}',
  prev_state  jsonb,
  source      public.check_in_source not null,
  undone_at   timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (spec §5)
-- ---------------------------------------------------------------------------

create index categories_user_updated_idx on public.categories (user_id, updated_at);
create index routines_user_updated_idx on public.routines (user_id, updated_at);
create index habits_user_idx on public.habits (user_id) where deleted_at is null;
create index habits_user_updated_idx on public.habits (user_id, updated_at);
create index habits_routine_idx on public.habits (routine_id);
create index habits_category_idx on public.habits (category_id);
create index habit_versions_user_updated_idx on public.habit_versions (user_id, updated_at);
create index pauses_user_habit_idx on public.pauses (user_id, habit_id);
create index pauses_user_updated_idx on public.pauses (user_id, updated_at);
create index check_ins_user_date_idx on public.check_ins (user_id, local_date);
create index check_ins_user_updated_idx on public.check_ins (user_id, updated_at);
create index check_in_events_user_created_idx on public.check_in_events (user_id, created_at desc);
create index check_in_events_habit_date_idx on public.check_in_events (habit_id, local_date);

-- Fill in FKs that Phase 0 left open.
alter table public.scheduled_notifications
  add constraint scheduled_notifications_habit_fk foreign key (habit_id) references public.habits on delete cascade,
  add constraint scheduled_notifications_routine_fk foreign key (routine_id) references public.routines on delete cascade;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger routines_set_updated_at before update on public.routines
  for each row execute function public.set_updated_at();
create trigger habits_set_updated_at before update on public.habits
  for each row execute function public.set_updated_at();
create trigger habit_versions_set_updated_at before update on public.habit_versions
  for each row execute function public.set_updated_at();
create trigger pauses_set_updated_at before update on public.pauses
  for each row execute function public.set_updated_at();
create trigger check_ins_set_updated_at before update on public.check_ins
  for each row execute function public.set_updated_at();

-- A habit may only point to the owner's own routine and category, and its owner never changes.
create or replace function public.validate_habit_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'user_id cannot change' using errcode = '42501';
  end if;
  if new.routine_id is not null and not exists (
       select 1 from public.routines r where r.id = new.routine_id and r.user_id = new.user_id) then
    raise exception 'routine not found' using errcode = '23503';
  end if;
  if new.category_id is not null and not exists (
       select 1 from public.categories c where c.id = new.category_id and c.user_id = new.user_id) then
    raise exception 'category not found' using errcode = '23503';
  end if;
  if new.days_of_week is not null then
    new.days_of_week := (select array_agg(distinct d order by d) from unnest(new.days_of_week) d);
  end if;
  return new;
end;
$$;
revoke execute on function public.validate_habit_refs() from public, anon, authenticated;
create trigger habits_validate_refs before insert or update on public.habits
  for each row execute function public.validate_habit_refs();

-- Same owner check for pauses.
create or replace function public.validate_pause()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'user_id cannot change' using errcode = '42501';
  end if;
  if new.habit_id is not null and not exists (
       select 1 from public.habits h where h.id = new.habit_id and h.user_id = new.user_id) then
    raise exception 'habit not found' using errcode = '23503';
  end if;
  -- R-SKIP-3: pauses can't start in the past, so they can't erase missed days.
  if (tg_op = 'INSERT' or new.start_date is distinct from old.start_date)
     and new.start_date < public.srv_user_today(new.user_id) then
    raise exception 'pause cannot start in the past' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.validate_pause() from public, anon, authenticated;
create trigger pauses_validate before insert or update on public.pauses
  for each row execute function public.validate_pause();

-- R-SCHED-0: record the schedule and target in force from the change on.
create or replace function public.write_habit_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from date;
begin
  if tg_op = 'UPDATE'
     and new.schedule_type is not distinct from old.schedule_type
     and new.days_of_week is not distinct from old.days_of_week
     and new.times_per_week is not distinct from old.times_per_week
     and new.kind is not distinct from old.kind
     and new.target_value is not distinct from old.target_value
     and new.start_date is not distinct from old.start_date then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_from := new.start_date;
  else
    v_from := greatest(public.srv_user_today(new.user_id), new.start_date);
    -- A start date moved later makes earlier versions meaningless.
    delete from public.habit_versions where habit_id = new.id and valid_from < new.start_date;
  end if;

  insert into public.habit_versions as v
    (habit_id, valid_from, user_id, schedule_type, days_of_week, times_per_week, kind, target_value)
  values
    (new.id, v_from, new.user_id, new.schedule_type, new.days_of_week, new.times_per_week, new.kind, new.target_value)
  on conflict (habit_id, valid_from) do update
     set schedule_type  = excluded.schedule_type,
         days_of_week   = excluded.days_of_week,
         times_per_week = excluded.times_per_week,
         kind           = excluded.kind,
         target_value   = excluded.target_value;
  return new;
end;
$$;
revoke execute on function public.write_habit_version() from public, anon, authenticated;
create trigger habits_write_version after insert or update on public.habits
  for each row execute function public.write_habit_version();

-- FR-RTN-4 / FR-HAB-3: deleting a routine or category leaves its habits in Anytime / uncategorized.
create or replace function public.detach_deleted_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if tg_table_name = 'routines' then
      update public.habits set routine_id = null where routine_id = new.id;
    else
      update public.habits set category_id = null where category_id = new.id;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.detach_deleted_group() from public, anon, authenticated;
create trigger routines_detach_habits after update of deleted_at on public.routines
  for each row execute function public.detach_deleted_group();
create trigger categories_detach_habits after update of deleted_at on public.categories
  for each row execute function public.detach_deleted_group();

-- Notification plans depend on habits, routines and pauses (R-NTF-1).
create or replace function public.mark_plan_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set plan_dirty = true
   where id = coalesce(new.user_id, old.user_id) and not plan_dirty;
  return null;
end;
$$;
revoke execute on function public.mark_plan_dirty() from public, anon, authenticated;
create trigger habits_mark_plan_dirty after insert or update or delete on public.habits
  for each row execute function public.mark_plan_dirty();
create trigger routines_mark_plan_dirty after insert or update or delete on public.routines
  for each row execute function public.mark_plan_dirty();
create trigger pauses_mark_plan_dirty after insert or update or delete on public.pauses
  for each row execute function public.mark_plan_dirty();

-- ---------------------------------------------------------------------------
-- Default routines and categories for every account (FR-RTN-1, FR-HAB-3)
-- ---------------------------------------------------------------------------

create or replace function public.seed_user_defaults(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.routines (user_id, system_key, start_time, sort_order)
  select p_user_id, k, t, o
    from (values ('morning', time '07:00', 0), ('evening', time '21:00', 1)) as d(k, t, o)
   where not exists (select 1 from public.routines r where r.user_id = p_user_id and r.system_key = d.k);

  insert into public.categories (user_id, system_key, color, icon, sort_order)
  select p_user_id, k, c, i, o
    from (values ('health', 'rose', '❤️', 0), ('fitness', 'orange', '💪', 1), ('mind', 'violet', '🧘', 2),
                 ('learning', 'sky', '📚', 3), ('productivity', 'amber', '✅', 4), ('home', 'emerald', '🏠', 5))
         as d(k, c, i, o)
   where not exists (select 1 from public.categories x where x.user_id = p_user_id and x.system_key = d.k);
$$;
revoke execute on function public.seed_user_defaults(uuid) from public, anon, authenticated;

create or replace function public.seed_defaults_for_new_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_user_defaults(new.id);
  return null;
end;
$$;
revoke execute on function public.seed_defaults_for_new_profile() from public, anon, authenticated;
create trigger profiles_seed_defaults after insert on public.profiles
  for each row execute function public.seed_defaults_for_new_profile();

-- Accounts created in Phase 0.
select public.seed_user_defaults(id) from public.profiles;

-- ---------------------------------------------------------------------------
-- Writing check-ins (R-CHK, R-SKIP, R-STATE)
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.apply_check_in_op(
  p_user_id    uuid,
  p_op_id      uuid,
  p_habit_id   uuid,
  p_local_date date,
  p_op         text,
  p_payload    jsonb,
  p_source     public.check_in_source
)
returns public.check_ins
language plpgsql
set search_path = ''
as $$
declare
  v_habit     public.habits;
  v_profile   public.profiles;
  v_today     date;
  v_kind      public.habit_kind;
  v_target    numeric;
  v_schedule  public.schedule_type;
  v_row       public.check_ins;
  v_prev      jsonb;
  v_value     numeric;
  v_amount    numeric;
  v_status    public.check_in_status;
  v_deleted   timestamptz;
  v_reason    public.skip_reason;
  v_note      text;
  v_dismissed boolean;
  v_skips     int;
begin
  if p_op_id is null or p_habit_id is null or p_local_date is null then
    raise exception 'validation_error' using errcode = '22023';
  end if;
  p_payload := coalesce(p_payload, '{}'::jsonb);

  -- R-CHK-7: an operation sent twice is applied once.
  if exists (select 1 from public.check_in_events e where e.op_id = p_op_id) then
    if not exists (select 1 from public.check_in_events e
                    where e.op_id = p_op_id and e.user_id = p_user_id) then
      raise exception 'validation_error' using errcode = '22023';
    end if;
    select * into v_row from public.check_ins c
     where c.habit_id = p_habit_id and c.local_date = p_local_date;
    return v_row;
  end if;

  select * into v_habit from public.habits h
   where h.id = p_habit_id and h.user_id = p_user_id and h.deleted_at is null
   for update;
  if not found then
    raise exception 'habit_not_found' using errcode = 'P0002';
  end if;

  select * into v_profile from public.profiles p where p.id = p_user_id;
  v_today := public.srv_user_today(p_user_id);

  -- R-CHK-5: allowed dates. Late Health data may still complete yesterday (R-HLT-4).
  if p_local_date > v_today
     or p_local_date < v_habit.start_date
     or (v_habit.archived_on is not null and p_local_date >= v_habit.archived_on)
     or (v_today - p_local_date > v_profile.retro_edit_days
         and not (p_source = 'health' and v_today - p_local_date <= 1)) then
    raise exception 'outside_edit_window' using errcode = '22023';
  end if;

  -- R-SCHED-0: the schedule and target in force on that date.
  select v.kind, v.target_value, v.schedule_type into v_kind, v_target, v_schedule
    from public.habit_versions v
   where v.habit_id = p_habit_id and v.valid_from <= p_local_date
   order by v.valid_from desc limit 1;
  if not found then
    v_kind := v_habit.kind; v_target := v_habit.target_value; v_schedule := v_habit.schedule_type;
  end if;

  select * into v_row from public.check_ins c
   where c.habit_id = p_habit_id and c.local_date = p_local_date
   for update;

  if v_row.id is not null then
    v_prev := to_jsonb(v_row);
    v_value := case when v_row.deleted_at is null then v_row.value end;
    v_status := case when v_row.deleted_at is null then v_row.status end;
    v_reason := v_row.skip_reason;
    v_note := v_row.note;
    v_dismissed := v_row.auto_dismissed;
  else
    v_dismissed := false;
  end if;
  v_deleted := null;

  case p_op
    when 'complete' then
      if v_kind = 'measurable' then
        v_value := v_target;
      else
        v_value := null;
      end if;
      v_status := 'done';
      v_reason := null;

    when 'increment', 'set_value' then
      if v_kind <> 'measurable' then
        raise exception 'not_allowed_for_habit' using errcode = '22023';
      end if;
      v_amount := case when jsonb_typeof(p_payload -> 'amount') = 'number' then (p_payload ->> 'amount')::numeric
                       when jsonb_typeof(p_payload -> 'value') = 'number' then (p_payload ->> 'value')::numeric end;
      if p_op = 'increment' then
        v_value := greatest(0, coalesce(case when v_status = 'skipped' then 0 else v_value end, 0)
                               + coalesce(v_amount, v_habit.increment_step));
      else
        if v_amount is null then
          raise exception 'validation_error' using errcode = '22023';
        end if;
        v_value := greatest(0, v_amount);
      end if;
      v_reason := null;
      v_status := case when v_value >= v_target then 'done' when v_value > 0 then 'partial' end;
      if v_status is null then
        v_deleted := now();
        v_status := 'partial';
      end if;

    when 'skip' then
      if v_schedule = 'times_per_week' then
        raise exception 'not_allowed_for_habit' using errcode = '22023';
      end if;
      -- R-SKIP-1/2: count the month's skips other than this day's.
      select count(*) into v_skips from public.check_ins c
       where c.habit_id = p_habit_id and c.status = 'skipped' and c.deleted_at is null
         and c.local_date <> p_local_date
         and date_trunc('month', c.local_date) = date_trunc('month', p_local_date);
      if v_skips >= v_profile.max_skips_per_month then
        raise exception 'skip_limit_reached' using errcode = '22023';
      end if;
      v_status := 'skipped';
      v_value := null;
      v_reason := coalesce((p_payload ->> 'reason')::public.skip_reason, 'other');

    when 'clear' then
      if v_row.id is null or v_row.deleted_at is not null then
        return v_row;
      end if;
      v_deleted := now();
      -- R-HLT-3: undoing an automatic completion stops Health from redoing it that day.
      v_dismissed := v_dismissed or v_row.source = 'health';

    when 'set_note' then
      if v_row.id is null or v_row.deleted_at is not null then
        raise exception 'not_allowed_for_habit' using errcode = '22023';
      end if;
      v_note := nullif(btrim(left(p_payload ->> 'note', 500)), '');

    else
      raise exception 'validation_error' using errcode = '22023';
  end case;

  insert into public.check_ins as c
    (user_id, habit_id, local_date, status, value, skip_reason, note, source,
     auto_dismissed, completed_at, deleted_at)
  values
    (p_user_id, p_habit_id, p_local_date, v_status, v_value, v_reason, v_note, p_source,
     v_dismissed, case when v_status = 'done' and v_deleted is null then now() end, v_deleted)
  on conflict (habit_id, local_date) do update
     set status         = excluded.status,
         value          = excluded.value,
         skip_reason    = excluded.skip_reason,
         note           = excluded.note,
         source         = case when p_op = 'set_note' then c.source else excluded.source end,
         auto_dismissed = excluded.auto_dismissed,
         completed_at   = case when excluded.status = 'done' and excluded.deleted_at is null
                               then coalesce(c.completed_at, now()) end,
         deleted_at     = excluded.deleted_at
  returning * into v_row;

  insert into public.check_in_events (op_id, user_id, habit_id, local_date, op, payload, prev_state, source)
  values (p_op_id, p_user_id, p_habit_id, p_local_date, p_op, p_payload, v_prev, p_source);

  return v_row;
end;
$$;

-- R-CHK-8: restore the check-in to its state before an operation.
create or replace function private.undo_op(p_user_id uuid, p_op_id uuid)
returns public.check_ins
language plpgsql
set search_path = ''
as $$
declare
  v_event public.check_in_events;
  v_row   public.check_ins;
  v_prev  public.check_ins;
begin
  select * into v_event from public.check_in_events e
   where e.op_id = p_op_id and e.user_id = p_user_id and e.op <> 'undo'
   for update;
  if not found then
    raise exception 'nothing_to_undo' using errcode = 'P0002';
  end if;
  if v_event.undone_at is not null then
    select * into v_row from public.check_ins c
     where c.habit_id = v_event.habit_id and c.local_date = v_event.local_date;
    return v_row;
  end if;

  select * into v_row from public.check_ins c
   where c.habit_id = v_event.habit_id and c.local_date = v_event.local_date
   for update;

  if v_event.prev_state is null then
    update public.check_ins c set deleted_at = now(), completed_at = null
     where c.id = v_row.id
    returning * into v_row;
  else
    v_prev := jsonb_populate_record(null::public.check_ins, v_event.prev_state);
    update public.check_ins c
       set status = v_prev.status, value = v_prev.value, skip_reason = v_prev.skip_reason,
           note = v_prev.note, source = v_prev.source, health_verified = v_prev.health_verified,
           auto_dismissed = v_prev.auto_dismissed, completed_at = v_prev.completed_at,
           deleted_at = v_prev.deleted_at
     where c.id = v_row.id
    returning * into v_row;
  end if;

  update public.check_in_events set undone_at = now() where op_id = v_event.op_id;
  insert into public.check_in_events (op_id, user_id, habit_id, local_date, op, payload, prev_state, source)
  values (gen_random_uuid(), p_user_id, v_event.habit_id, v_event.local_date, 'undo',
          jsonb_build_object('undone', v_event.op_id), to_jsonb(v_row), v_event.source);
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public entry points (05-api §5)
-- ---------------------------------------------------------------------------

create or replace function public.apply_check_in_op(
  p_op_id      uuid,
  p_habit_id   uuid,
  p_local_date date,
  p_op         text,
  p_payload    jsonb default '{}',
  p_source     public.check_in_source default 'app'
)
returns public.check_ins
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  -- Server-only sources come through srv_apply_check_in_op.
  if p_source not in ('app', 'routine_mode') then
    raise exception 'validation_error' using errcode = '22023';
  end if;
  return private.apply_check_in_op(auth.uid(), p_op_id, p_habit_id, p_local_date, p_op, p_payload, p_source);
end;
$$;

create or replace function public.undo_op(p_op_id uuid)
returns public.check_ins
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  return private.undo_op(auth.uid(), p_op_id);
end;
$$;

create or replace function public.undo_last_op()
returns public.check_ins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select e.op_id into v_op from public.check_in_events e
   where e.user_id = auth.uid() and e.op <> 'undo' and e.undone_at is null
     and e.local_date = public.srv_user_today(auth.uid())
   order by e.created_at desc limit 1;
  if v_op is null then
    raise exception 'nothing_to_undo' using errcode = 'P0002';
  end if;
  return private.undo_op(auth.uid(), v_op);
end;
$$;

create or replace function public.srv_apply_check_in_op(
  p_user_id    uuid,
  p_op_id      uuid,
  p_habit_id   uuid,
  p_local_date date,
  p_op         text,
  p_payload    jsonb,
  p_source     public.check_in_source
)
returns public.check_ins
language sql
security definer
set search_path = ''
as $$
  select private.apply_check_in_op(p_user_id, p_op_id, p_habit_id, p_local_date, p_op, p_payload, p_source);
$$;

revoke execute on function private.apply_check_in_op(uuid, uuid, uuid, date, text, jsonb, public.check_in_source) from public, anon, authenticated;
revoke execute on function private.undo_op(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.apply_check_in_op(uuid, uuid, date, text, jsonb, public.check_in_source) from public, anon;
revoke execute on function public.undo_op(uuid) from public, anon;
revoke execute on function public.undo_last_op() from public, anon;
grant execute on function public.apply_check_in_op(uuid, uuid, date, text, jsonb, public.check_in_source) to authenticated;
grant execute on function public.undo_op(uuid) to authenticated;
grant execute on function public.undo_last_op() to authenticated;
revoke execute on function public.srv_apply_check_in_op(uuid, uuid, uuid, date, text, jsonb, public.check_in_source) from public, anon, authenticated;
grant execute on function public.srv_apply_check_in_op(uuid, uuid, uuid, date, text, jsonb, public.check_in_source) to service_role;

-- Clients need today's habit day to know what they may edit (R-DAY-3).
create or replace function public.user_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select public.srv_user_today(auth.uid());
$$;
revoke execute on function public.user_today() from public, anon;
grant execute on function public.user_today() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.categories enable row level security;
alter table public.routines enable row level security;
alter table public.habits enable row level security;
alter table public.habit_versions enable row level security;
alter table public.pauses enable row level security;
alter table public.check_ins enable row level security;
alter table public.check_in_events enable row level security;

create policy "categories: own rows" on public.categories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "routines: own rows" on public.routines for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "habits: own rows" on public.habits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "pauses: own rows" on public.pauses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "habit_versions: select own" on public.habit_versions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "check_ins: select own" on public.check_ins for select to authenticated
  using (user_id = (select auth.uid()));
create policy "check_in_events: select own" on public.check_in_events for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.categories, public.routines, public.habits, public.pauses,
                    public.habit_versions, public.check_ins, public.check_in_events from anon, authenticated;
-- Deleting is a soft delete (deleted_at) so it reaches every device; hard deletes are server-side.
grant select, insert, update on table public.categories, public.routines, public.habits, public.pauses to authenticated;
grant select on table public.habit_versions, public.check_ins, public.check_in_events to authenticated;
grant all on table public.categories, public.routines, public.habits, public.pauses,
                   public.habit_versions, public.check_ins, public.check_in_events to service_role;

-- Live updates on other devices (FR-TOD-5).
alter publication supabase_realtime add table
  public.categories, public.routines, public.habits, public.habit_versions, public.pauses, public.check_ins;
