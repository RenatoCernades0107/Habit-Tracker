-- Phase 4 · Siri and Shortcuts: personal access tokens, rate limits and voice matching
-- (docs/spec/04-data-model.md §2, docs/spec/05-api.md §2 and §5, FR-SIR-1…9).

-- ---------------------------------------------------------------------------
-- api_tokens: personal access tokens for Shortcuts (FR-SIR-1)
-- ---------------------------------------------------------------------------

create table public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 40),
  token_prefix  text not null,                             -- first 8 characters, for display
  token_hash    bytea not null unique,                     -- sha256(token); the token is never stored
  scopes        text[] not null default '{habits:read,checkins:write,health:write}',
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

comment on table public.api_tokens is
  'Shortcuts tokens. Created by /api/tokens with the secret key; users list and revoke their own.';

create index api_tokens_user_id_idx on public.api_tokens (user_id);

alter table public.api_tokens enable row level security;

create policy "api_tokens: select own" on public.api_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy "api_tokens: revoke own" on public.api_tokens for update to authenticated
  using (user_id = (select auth.uid()) and revoked_at is null)
  with check (user_id = (select auth.uid()) and revoked_at is not null);

-- The hash never leaves the server; users may only set revoked_at.
revoke all on table public.api_tokens from anon, authenticated;
grant select (id, user_id, name, token_prefix, scopes, last_used_at, created_at, revoked_at)
  on table public.api_tokens to authenticated;
grant update (revoked_at) on table public.api_tokens to authenticated;
grant select, insert, update, delete on table public.api_tokens to service_role;

-- ---------------------------------------------------------------------------
-- rate_limits: fixed-window counters, server only
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;
grant select, insert, update, delete on table public.rate_limits to service_role;

-- True while `key` has made fewer than p_max calls in the current window, counting this one.
create or replace function public.srv_rate_limit(p_key text, p_max integer, p_window interval)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window))
                 * extract(epoch from p_window));
  v_count integer;
begin
  -- Old windows of this key are no longer needed.
  delete from public.rate_limits where key = p_key and window_start < v_window;
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;
  return v_count <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- srv_verify_api_token
-- ---------------------------------------------------------------------------

-- The user, token and scopes of a live token, recording last_used_at. Empty for unknown or
-- revoked tokens.
create or replace function public.srv_verify_api_token(p_hash bytea)
returns table (user_id uuid, token_id uuid, scopes text[])
language sql
volatile
set search_path = ''
as $$
  update public.api_tokens t
     set last_used_at = now()
   where t.token_hash = p_hash and t.revoked_at is null
  returning t.user_id, t.id, t.scopes;
$$;

-- ---------------------------------------------------------------------------
-- Voice matching (FR-SIR-3, API §5 "Matching a habit by voice")
-- ---------------------------------------------------------------------------

-- unaccent() is only stable, so it can't be indexed directly; this wrapper pins its dictionary.
create or replace function public.normalize_text(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, ''))),
    '\s+', ' ', 'g'));
$$;

create index habits_name_trgm_idx on public.habits
  using gin (public.normalize_text(name) extensions.gin_trgm_ops);

-- Candidates for a spoken habit name among the user's active habits, best first. An exact match
-- of the name or an alias scores 1; otherwise the best trigram similarity, if it's at least 0.3.
-- Filler words ("el", "la", "my", "the", …) are dropped from the query.
create or replace function public.srv_match_habit(p_user_id uuid, p_query text)
returns table (habit_id uuid, name text, score real)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_query text := btrim(regexp_replace(
    ' ' || public.normalize_text(p_query) || ' ',
    '\s(el|la|los|las|un|una|mi|mis|de|del|the|a|an|my|of)(?=\s)', ' ', 'g'));
begin
  v_query := btrim(regexp_replace(v_query, '\s+', ' ', 'g'));
  if v_query = '' then
    return;
  end if;
  return query
  with candidates as (
    select h.id, h.name,
           greatest(
             case when public.normalize_text(h.name) = v_query then 1::real
                  else extensions.similarity(public.normalize_text(h.name), v_query) end,
             coalesce((
               select max(case when public.normalize_text(a) = v_query then 1::real
                               else extensions.similarity(public.normalize_text(a), v_query) end)
                 from unnest(h.voice_aliases) a), 0::real)
           ) as score
      from public.habits h
     where h.user_id = p_user_id and h.deleted_at is null and h.archived_on is null
  )
  select c.id, c.name, c.score from candidates c
   where c.score >= 0.3
   order by c.score desc, c.name
   limit 5;
end;
$$;

-- ---------------------------------------------------------------------------
-- srv_undo_last_op (API §5): "Undo habit" for a given user
-- ---------------------------------------------------------------------------

-- Undoes the user's last operation of today that hasn't been undone, from any source, and says
-- which habit and operation it was.
create or replace function public.srv_undo_last_op(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.check_in_events;
begin
  select * into v_event from public.check_in_events e
   where e.user_id = p_user_id and e.op <> 'undo' and e.undone_at is null
     and e.local_date = public.srv_user_today(p_user_id)
   order by e.created_at desc limit 1;
  if not found then
    raise exception 'nothing_to_undo' using errcode = 'P0002';
  end if;
  perform private.undo_op(p_user_id, v_event.op_id);
  return jsonb_build_object('habit_id', v_event.habit_id, 'op', v_event.op,
                            'local_date', v_event.local_date);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: server only
-- ---------------------------------------------------------------------------

revoke execute on function public.srv_rate_limit(text, integer, interval) from public, anon, authenticated;
revoke execute on function public.srv_verify_api_token(bytea) from public, anon, authenticated;
revoke execute on function public.srv_match_habit(uuid, text) from public, anon, authenticated;
revoke execute on function public.srv_undo_last_op(uuid) from public, anon, authenticated;
grant execute on function public.srv_rate_limit(text, integer, interval) to service_role;
grant execute on function public.srv_verify_api_token(bytea) to service_role;
grant execute on function public.srv_match_habit(uuid, text) to service_role;
grant execute on function public.srv_undo_last_op(uuid) to service_role;
-- normalize_text is used by an index on habits, so whoever writes habits must be able to run it.
-- It only lowercases and strips accents.

-- The nightly cleanup also trims old rate-limit windows.
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

  delete from cron.job_run_details
   where end_time < now() - interval '7 days';

  return v_deleted;
end;
$$;
