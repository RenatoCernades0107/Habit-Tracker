-- Phase 2: daily mood and note (FR-REV-1), weekly reflection (FR-REV-3)
-- (docs/spec/04-data-model.md §2.3).

create table public.daily_entries (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  local_date  date not null,
  mood        smallint check (mood between 1 and 5),
  note        text check (char_length(note) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (user_id, local_date)
);

create table public.weekly_reviews (
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  week_start    date not null,
  reflection    text check (char_length(reflection) <= 2000),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, week_start)
);

create index daily_entries_user_updated_idx on public.daily_entries (user_id, updated_at);
create index weekly_reviews_user_updated_idx on public.weekly_reviews (user_id, updated_at);

create trigger daily_entries_set_updated_at before update on public.daily_entries
  for each row execute function public.set_updated_at();
create trigger weekly_reviews_set_updated_at before update on public.weekly_reviews
  for each row execute function public.set_updated_at();

-- The day being written about can't be in the future (R-DAY-3).
create or replace function public.validate_reflection_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'user_id cannot change' using errcode = '42501';
  end if;
  -- Read the date through jsonb: PL/pgSQL resolves record fields even in a false branch.
  if (to_jsonb(new) ->> case tg_table_name when 'daily_entries' then 'local_date' else 'week_start' end)::date
       > public.srv_user_today(new.user_id) then
    raise exception 'outside_edit_window' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function public.validate_reflection_date() from public, anon, authenticated;
create trigger daily_entries_validate before insert or update on public.daily_entries
  for each row execute function public.validate_reflection_date();
create trigger weekly_reviews_validate before insert or update on public.weekly_reviews
  for each row execute function public.validate_reflection_date();

alter table public.daily_entries enable row level security;
alter table public.weekly_reviews enable row level security;

create policy "daily_entries: own rows" on public.daily_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "weekly_reviews: own rows" on public.weekly_reviews for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on table public.daily_entries, public.weekly_reviews from anon, authenticated;
grant select, insert, update on table public.daily_entries, public.weekly_reviews to authenticated;
grant all on table public.daily_entries, public.weekly_reviews to service_role;

alter publication supabase_realtime add table public.daily_entries, public.weekly_reviews;
