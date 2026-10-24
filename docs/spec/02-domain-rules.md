# 02 · Domain rules

These rules are written once, in `src/domain`: pure TypeScript with no I/O. The client uses them for Today and statistics, and the server for notifications and Siri replies, so the numbers always match (decision D10). **Every example in this document is a unit test.**

The one exception is check-in writes, which run in a single Postgres function (`apply_check_in_op`, see [API §5](05-api.md#5-database-functions-rpc)) so every source writes the same way. The function and `src/domain` share the state rules in `R-STATE`, and a parity test checks they agree.

## R-DAY · The habit day

- **R-DAY-1** Each user has a `timezone` (IANA name, e.g. `America/Lima`) and a `day_start_hour` *h* from 0 to 6 (default 4).
- **R-DAY-2** `local_date(t)` = the calendar date of (*t* in the user's timezone − *h* hours).
- **R-DAY-3** *Today* = `local_date(now)`.
- **R-DAY-4** A week is 7 habit days starting on `week_start` (1 = Monday, 7 = Sunday).
- **R-DAY-5** When the timezone changes (travel), only new calculations use it. Check-ins already saved keep their `local_date`.
- Exception: Health totals use calendar days from midnight, as Health reports them (`R-HLT-2`).

| Timezone | *h* | Instant (local time) | `local_date` |
|---|---|---|---|
| America/Lima | 4 | 2026-10-20 01:30 | 2026-10-19 |
| America/Lima | 4 | 2026-10-20 04:00 | 2026-10-20 |
| Europe/Madrid | 0 | 2026-10-20 00:10 | 2026-10-20 |

## R-SCHED · When a habit is expected

- **R-SCHED-0** **Schedule history.** The schedule (type, weekdays, N, kind, target) that applies on date *d* is the `habit_versions` row with the latest `valid_from` ≤ *d*. Editing these fields writes a new version starting today (`FR-HAB-7`).
- **R-SCHED-1** A habit is **active** on *d* if `start_date ≤ d`, it's not archived (`archived_on` is null or > *d*), it's not deleted, and no pause covers *d* (a pause of that habit or a global pause).
- **R-SCHED-2** **Fixed schedules:** `daily` → every active day; `days_of_week` → active days whose ISO weekday is in `days_of_week`. Those days are **scheduled occurrences**.
- **R-SCHED-3** **Flexible schedule:** `times_per_week` = N → no scheduled days. The target is N completions per week, any active day can count, and at most one completion per day.
- **R-SCHED-4** **Weekly target with pauses:** `N_eff = round(N × active_days_in_week / 7)`, rounding halves up. The same applies to the week a habit starts. A week with `N_eff = 0` is neutral.
  - N = 4 with 5 active days → 2.86 → **3**. N = 4 with 7 active days → **4**. N = 1 with 3 active days → 0.43 → **0** (neutral week).
- **R-SCHED-5** **Occurrence time** = `habit.time_of_day`, otherwise the routine's `start_time`, otherwise none ("anytime").

## R-STATE · State of an occurrence

For a scheduled occurrence of habit *h* on date *d*:

| Check-in on (*h*, *d*) | *d* = today | *d* < today |
|---|---|---|
| status `skipped` | **skipped** | **skipped** |
| boolean, status `done` | **done** | **done** |
| measurable, value ≥ target | **done** | **done** |
| measurable, 0 < value < target | **partial** | **partial** |
| none, cleared, or value 0 | **pending** | **missed** |

**Credit** used by scores: done = 1 · partial = value ÷ target · pending or missed = 0 · skipped = not counted.

For a flexible habit, a day is **done** under the same rules. Partial days earn no credit.

## R-SCORE · Scores

- **R-SCORE-1** **Daily score** for *d* = Σ credit ÷ count, over the *fixed-schedule* occurrences on *d* that weren't skipped.
  - Flexible habits are left out of the daily score and shown as weekly progress ("2/4").
  - If the count is 0, the score is `null` (a **rest day**). It isn't averaged, and the heatmap shows it as rest.
- **R-SCORE-2** Today's score is "so far": pending occurrences count as 0 and it updates live.
- **R-SCORE-3** **Weekly score** for week *w* = (Σ fixed credits in *w* + Σ over flexible habits of `min(done_days, N_eff)`) ÷ (fixed non-skipped occurrences in *w* + Σ over flexible habits of `N_eff`).
- **R-SCORE-4** **Completion rate of a habit** over a period. Fixed: done ÷ (scheduled − skipped). Flexible: Σ `min(done_days, N_eff)` ÷ Σ `N_eff` over the period's weeks. The current week is included only once its target is met, so an unfinished week doesn't pull the rate down.
- **R-SCORE-5** Calculations keep full precision. Only the displayed value is rounded to a whole percent (halves up).

**Example — daily score, Tuesday 2026-10-20**

| Habit | Schedule | Result | Credit |
|---|---|---|---|
| Meditate | daily | done | 1 |
| Read (20 pages) | daily, measurable | 10 / 20 | 0.5 |
| Water (8 glasses) | daily, measurable | 6 / 8 | 0.75 |
| Stretch | daily | skipped (sick) | not counted |
| Journal | daily | pending | 0 |
| Gym | 4× per week | done today | not in daily score (week: 2/4) |

Daily score = (1 + 0.5 + 0.75 + 0) ÷ 4 = 0.5625 → **56%**.

**Example — weekly score.** A week has 12 fixed occurrences that weren't skipped, earning 9.5 credits in total, plus Gym (N_eff = 4) done on 3 days. Weekly score = (9.5 + 3) ÷ (12 + 4) = 0.78125 → **78%**.

## R-STREAK · Streaks

- **R-STREAK-1** **Fixed habits.** The unit is a scheduled occurrence. Start at the latest scheduled occurrence on or before today and go back in time:
  - **done** → +1 and continue;
  - **skipped**, paused, or **pending today** → no change, continue;
  - **missed** or **partial** → stop.
  - Days that aren't scheduled are ignored.
- **R-STREAK-2** **Flexible habits.** The unit is a week. The current week adds +1 if its target is already met; otherwise it's neutral (still in progress). Then go back week by week: target met → +1; `N_eff = 0` → neutral; otherwise stop.
- **R-STREAK-3** **Best streak** = the longest run in the whole history, under the same rules.
- **R-STREAK-4** Each occurrence is judged by the schedule version that applied on its date (`R-SCHED-0`). Changing a schedule neither breaks nor inflates a streak.
- **R-STREAK-5** **Milestones:** 3, 7, 14, 30, 60, 100, 200, 365. A milestone is celebrated when a check-in makes the current streak equal to it. Nothing extra is stored.
- **R-STREAK-6** **Don't miss twice.** A fixed habit whose last scheduled occurrence was *missed* is flagged on its next occurrence. A flexible habit is flagged **at risk** when the completions still needed equal the active days left in the week.

**Example — the brief's "Train Mon, Tue, Thu, Fri"; today is Tuesday 2026-10-20**

| Date | Day | Result | Streak effect |
|---|---|---|---|
| 2026-10-12 | Mon | done | (not reached) |
| 2026-10-13 | Tue | missed | stop |
| 2026-10-15 | Thu | done | +1 |
| 2026-10-16 | Fri | done | +1 |
| 2026-10-19 | Mon | skipped (travel) | neutral |
| 2026-10-20 | Tue (today) | pending | neutral |

Current streak = **2**. If today becomes done, it's **3**. If today ends with no check-in, tomorrow's calculation finds a missed occurrence and the streak resets to 0, and the habit's next occurrence (Thursday) gets the "don't miss twice" flag.

## R-CHK · Check-in rules

- **R-CHK-1** At most one check-in row per (habit, `local_date`). Operations: `complete`, `increment(amount)`, `set_value(value)`, `skip(reason)`, `clear`, `set_note(note)`.
- **R-CHK-2** `complete` on a boolean habit → done. On a measurable habit → value = target, done.
- **R-CHK-3** `increment` adds `amount` (default: the habit's `increment_step`). The state follows from the value. The value never goes below 0.
- **R-CHK-4** `skip` is only allowed for fixed-schedule habits (flexible habits use pause), and only while the habit has skips left (`R-SKIP`).
- **R-CHK-5** Allowed dates: `start_date ≤ d ≤ today` and `today − d ≤ retro_edit_days`. The Shortcuts API accepts `today` and `yesterday`, inside that same window.
- **R-CHK-6** Flexible habit: `complete` on a day that's already done does nothing.
- **R-CHK-7** **Idempotency:** every operation has an `op_id` (UUID). An operation sent again with the same `op_id` is ignored and returns the current state.
- **R-CHK-8** **Undo** restores the exact previous state of that check-in, which is saved in the event log.
- **R-CHK-9** In the app, tapping a boolean habit that's already done performs `clear`.

## R-SKIP · Skip limits

- **R-SKIP-1** Each habit allows at most `max_skips_per_month` skips (profile setting, 0–10, default 4) per **calendar month of `local_date`**. The count includes skips logged for past days.
- **R-SKIP-2** A `skip` that would exceed the limit is rejected (`skip_limit_reached`). Removing a skip (undo, clear, or replacing it with done) gives that skip back.
- **R-SKIP-3** **Pauses can't start in the past** (`start_date ≥ today`) and aren't limited. They're the tool for planned absences; skips are for the unexpected. Ending a pause early is always allowed.
- **R-SKIP-4** Lowering the limit doesn't remove skips already logged. It only blocks new ones.
- **R-SKIP-5** Statistics show skips used per habit and month.

| Habit | Month | Skips logged | Limit | New skip on 2026-10-20 |
|---|---|---|---|---|
| Meditate | October 2026 | 3 | 4 | allowed → 4 of 4 used |
| Meditate | October 2026 | 4 | 4 | rejected, `skip_limit_reached` |
| Meditate | (skip dated 2026-09-30) | 4 in September | 4 | rejected for September; October's count is separate |

## R-NTF · Notification timing and suppression

- **R-NTF-1** **Planning window.** Notifications are created ahead of time for today and tomorrow (habit days). They're re-planned whenever habits, routines, pauses or notification settings change.
- **R-NTF-2** **Habit reminder:** for each fixed-schedule occurrence with its own `time_of_day` and `reminder_enabled` → `send_at` = local (*d*, time) − lead time, where the lead time is the habit's override or the profile's `reminder_lead_min`. A flexible habit with a time gets a reminder on every active day until its weekly target is met.
- **R-NTF-3** **Routine digest:** at the routine's `start_time`, on every day the routine has at least one scheduled occurrence and `digest_enabled` is on.
- **R-NTF-4** **Daily report:** at `daily_report_time`, for each habit day. A report time after midnight but before the day ends (e.g. 00:30 with *h* = 4) belongs to the *previous* habit day.
- **R-NTF-5** **Weekly review:** on `weekly_review_dow` at `weekly_review_time`, about the week that's ending. On the first day of a week (Sunday with weeks starting on Sunday) that's the week before.
- **R-NTF-6** **Daylight saving time.** A local time that doesn't exist (clocks jump forward) moves to the first valid minute after it. A local time that happens twice (clocks go back) uses the first one.
- **R-NTF-7** **Suppression** is checked again when the notification is sent, not only when it's planned:

  | Kind | Not sent when |
  |---|---|
  | `habit_reminder` | Occurrence done or skipped · habit paused, archived or deleted · Health metric already meets the target · flexible target already met this week |
  | `routine_digest` | No pending occurrences left in the routine |
  | `daily_report` | Rest day with no flexible habits |
  | all kinds | `muted_until` > now · `send_at` falls in quiet hours · user has no push subscriptions · too late: reminders > 10 min, digests > 30 min, reports > 2 h |

- **R-NTF-8** **Snooze** creates a new reminder at now + N minutes, under the same suppression rules. `dedupe_key`s are unique across users: reminders and digests name their habit or routine, reports and reviews name the user.
- **R-NTF-9** **Badge** = the number of pending fixed-schedule occurrences today.
- **R-NTF-10** Settings warn when a habit's reminder falls inside quiet hours (it would never be sent).

| Example | Local time | `send_at` (UTC) |
|---|---|---|
| Meditate 07:00, lead 5 min, America/Lima (UTC−5) | 06:55 | 11:55Z |
| Reminder 02:30 on 2026-03-29, Europe/Madrid (clocks jump at 02:00) | 02:30 doesn't exist → 03:00 CEST | 01:00Z |
| Reminder 02:30 on 2026-10-25, Europe/Madrid (02:30 happens twice) | first one, CEST | 00:30Z |

## R-HLT · Apple Health

- **R-HLT-1** Only rules of the form *metric ≥ target* in v1.
- **R-HLT-2** Metrics are stored as daily totals by **calendar date** (from midnight), as Health reports them. A metric's date *D* is applied to the occurrence with `local_date` = *D*. The small offset between midnight and the day end (e.g. 00:00–04:00) is a known, accepted approximation.
- **R-HLT-3** Every time a metric is saved, the habits with a rule on that metric are evaluated for that date:

  | Situation | Result |
  |---|---|
  | Meets the target, no check-in | Create a **done** check-in, source `health`, `health_verified = true` |
  | Meets the target, manual check-in exists | Keep it, set `health_verified = true` |
  | Meets the target, user undid an automatic completion that day (`auto_dismissed`) | Do nothing |
  | Measurable habit whose unit is that metric, check-in from Health or none | Value = metric value (mirrored), state follows `R-STATE` |
  | Below the target | Never un-complete. A mirrored measurable value is still updated (it can become partial) |

- **R-HLT-4** Data for yesterday that arrives late can still complete yesterday's occurrence, even if `retro_edit_days` is 0.
- **R-HLT-5** Only metrics used by at least one of the user's habits are stored. Others are discarded when received.
