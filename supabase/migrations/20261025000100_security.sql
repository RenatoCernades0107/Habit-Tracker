-- Phase 7 · Security review fixes.

-- A replayed op_id returned the check-in of whatever habit and date the caller passed, read with
-- the owner's rights: someone else's row, given its habit id. It now returns the operation's own
-- row, and only if it's the caller's (docs/spec/03-architecture.md §10).
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
    -- The row of that operation, the caller's own, whatever habit and date were passed again.
    select c.* into v_row
      from public.check_in_events e
      join public.check_ins c on c.habit_id = e.habit_id and c.local_date = e.local_date
     where e.op_id = p_op_id and e.user_id = p_user_id and c.user_id = p_user_id;
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
