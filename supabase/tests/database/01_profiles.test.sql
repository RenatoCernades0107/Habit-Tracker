-- profiles: sign-up trigger (FR-ACC-2), RLS and column privileges (spec 04 §2.1, §3), R-DAY-2.
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

-- ---------------------------------------------------------------------------
-- handle_new_user copies sign-up metadata and falls back to the defaults
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ana@example.test',
   '{"locale": "es", "timezone": "America/Lima", "week_start": 7, "full_name": "  Ana Pérez  "}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ben@example.test',
   jsonb_build_object('locale', 'fr', 'timezone', 'Mars/Olympus', 'week_start', 3,
                      'name', repeat('x', 100))),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'cy@example.test', null),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'di@example.test',
   '{"locale": "es-PE", "timezone": "Europe/Madrid", "week_start": "7", "name": "Di"}'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ed@example.test',
   '{"locale": ["es"], "timezone": {"tz": "UTC"}, "week_start": true, "full_name": "   "}');

select results_eq(
  $$ select locale, timezone, week_start::int, display_name
       from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  $$ values ('es', 'America/Lima', 7, 'Ana Pérez') $$,
  'handle_new_user copies locale, timezone, week_start and the trimmed full_name'
);

select results_eq(
  $$ select locale, timezone, week_start::int, display_name
       from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  $$ values ('en', 'UTC', 1, repeat('x', 80)) $$,
  'unsupported locale, unknown timezone and invalid week_start fall back; name is cut to 80'
);

select results_eq(
  $$ select locale, timezone, week_start::int, display_name, day_start_hour::int, theme,
            retro_edit_days::int, max_skips_per_month::int, plan_dirty
       from public.profiles where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' $$,
  $$ values ('en', 'UTC', 1, null::text, 4, 'system', 7, 4, true) $$,
  'no metadata gives the defaults (English, UTC, Monday, day ends at 04:00)'
);

select results_eq(
  $$ select locale, timezone, week_start::int, display_name
       from public.profiles where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  $$ values ('es', 'Europe/Madrid', 7, 'Di') $$,
  'region subtags are ignored, week_start may be a string and name is used without full_name'
);

select results_eq(
  $$ select locale, timezone, week_start::int, display_name
       from public.profiles where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' $$,
  $$ values ('en', 'UTC', 1, null::text) $$,
  'metadata of the wrong JSON type is ignored and a blank name becomes null'
);

-- ---------------------------------------------------------------------------
-- updated_at is always set by the trigger
-- ---------------------------------------------------------------------------

update public.profiles
   set updated_at = '2000-01-01', display_name = 'Cy'
 where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

select is(
  (select updated_at from public.profiles where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  now(),
  'set_updated_at overwrites updated_at on update'
);

-- ---------------------------------------------------------------------------
-- RLS: a user sees and edits only their own profile
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid) $$,
  'a user sees only their own profile'
);

select is_empty(
  $$ update public.profiles set theme = 'dark'
      where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning id $$,
  'a user cannot update another user''s profile'
);

select lives_ok(
  $$ update public.profiles
        set locale = 'en', theme = 'dark', display_name = 'Ana', day_start_hour = 3,
            week_start = 1, retro_edit_days = 10, max_skips_per_month = 2,
            quiet_hours_start = '22:00', quiet_hours_end = '07:00',
            onboarding_completed_at = now()
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'a user can update their user-editable settings'
);

select results_eq(
  $$ select locale, theme, display_name, day_start_hour::int, max_skips_per_month::int
       from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  $$ values ('en', 'dark', 'Ana', 3, 2) $$,
  'the settings were saved'
);

select throws_ok(
  $$ update public.profiles set plan_dirty = false
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'a user cannot update plan_dirty'
);

select throws_ok(
  $$ update public.profiles set planned_through = current_date
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'a user cannot update planned_through'
);

select throws_ok(
  $$ update public.profiles set last_health_sync_at = now()
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'a user cannot update last_health_sync_at'
);

select throws_ok(
  $$ update public.profiles set id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'a user cannot update id'
);

select throws_ok(
  $$ update public.profiles set created_at = now()
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'a user cannot update created_at'
);

select throws_ok(
  $$ update public.profiles set updated_at = now()
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'a user cannot update updated_at'
);

select throws_ok(
  $$ insert into public.profiles (id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  '42501', null, 'a user cannot insert profiles'
);

select throws_ok(
  $$ delete from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'a user cannot delete profiles'
);

-- Value checks
select throws_ok(
  $$ update public.profiles set locale = 'fr'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'an unsupported locale is rejected'
);

select throws_ok(
  $$ update public.profiles set timezone = 'Mars/Olympus'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', 'Invalid timezone: Mars/Olympus', 'an unknown timezone is rejected'
);

select throws_ok(
  $$ update public.profiles set timezone = '+05:30'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'a UTC offset is not accepted as a timezone'
);

select lives_ok(
  $$ update public.profiles set timezone = 'Asia/Tokyo'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'a valid IANA timezone is accepted'
);

select throws_ok(
  $$ update public.profiles set theme = 'blue'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'an unknown theme is rejected'
);

select throws_ok(
  $$ update public.profiles set day_start_hour = 7
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'day_start_hour must be between 0 and 6'
);

select throws_ok(
  $$ update public.profiles set max_skips_per_month = 11
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'max_skips_per_month must be between 0 and 10'
);

-- Another user
select set_config('request.jwt.claims',
  '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);

select results_eq(
  $$ select id, theme from public.profiles $$,
  $$ values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, 'system') $$,
  'the other user sees only their own, unchanged profile'
);

-- Server-only helpers are not callable by users
select throws_ok(
  $$ select public.srv_user_today('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  '42501', null, 'authenticated cannot execute srv_user_today'
);

-- Anonymous visitors
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select throws_ok(
  $$ select * from public.profiles $$,
  '42501', null, 'anon cannot read profiles'
);

select throws_ok(
  $$ update public.profiles set theme = 'dark' $$,
  '42501', null, 'anon cannot update profiles'
);

reset role;

-- ---------------------------------------------------------------------------
-- R-DAY-2 / R-DAY-3: the habit day
-- ---------------------------------------------------------------------------

-- Examples from docs/spec/02-domain-rules.md (R-DAY table), plus a DST change.
select is(
  public.srv_local_date('2026-10-20 01:30-05', 'America/Lima', 4), date '2026-10-19',
  'R-DAY-2: Lima, h = 4, 01:30 belongs to the previous day'
);

select is(
  public.srv_local_date('2026-10-20 04:00-05', 'America/Lima', 4), date '2026-10-20',
  'R-DAY-2: Lima, h = 4, 04:00 starts the new day'
);

select is(
  public.srv_local_date('2026-10-20 00:10+02', 'Europe/Madrid', 0), date '2026-10-20',
  'R-DAY-2: Madrid, h = 0, 00:10 is already the new day'
);

select is(
  public.srv_local_date('2026-10-25 03:30+01', 'Europe/Madrid', 4), date '2026-10-24',
  'R-DAY-2: on the night clocks go back, 03:30 still belongs to the previous day'
);

select is(
  public.srv_local_date('2026-10-25 04:00+01', 'Europe/Madrid', 4), date '2026-10-25',
  'R-DAY-2: after clocks go back, 04:00 local time starts the day'
);

select is(
  public.srv_user_today('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  ((now() at time zone 'Europe/Madrid') - interval '4 hours')::date,
  'srv_user_today uses the profile timezone and day_start_hour'
);

select is(
  public.srv_user_today('00000000-0000-4000-8000-000000000000'),
  null,
  'srv_user_today is null for an unknown user'
);

-- ---------------------------------------------------------------------------
-- Account deletion cascades (FR-ACC-5)
-- ---------------------------------------------------------------------------

delete from auth.users where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

select is_empty(
  $$ select 1 from public.profiles where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' $$,
  'deleting the auth user deletes the profile'
);

select * from finish();
rollback;
