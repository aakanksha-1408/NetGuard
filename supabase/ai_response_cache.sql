-- ============================================================================
-- NetGuard AI response cache + quota guardrails
-- Run this whole file in the Supabase SQL Editor (it is idempotent: safe to
-- re-run). It creates the objects that src/lib/aiQuota.ts uses to reduce real
-- Gemini calls, because the free tier has a hard 20 requests/DAY cap shared
-- across ALL users (quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier).
--
-- Objects:
--   ai_response_cache : SHA-256(normalized input) -> stored Gemini JSON.
--                       A cache hit returns the previous analysis WITHOUT
--                       calling Gemini at all (free + instant).
--   ai_call_counters  : one row per day counting REAL (non-cached) Gemini
--                       calls. At the soft limit (AI_DAILY_SOFT_LIMIT in
--                       src/lib/aiQuota.ts, currently 40 for the 3-model
--                       pool) the API routes proactively return a friendly
--                       "daily limit reached" message instead of burning the
--                       free-tier pools on raw Gemini 429s.
--   ai_call_throttle  : per user/session last real-call timestamp. Gives each
--                       actor a 2-minute cooldown between NEW (uncached)
--                       Gemini calls so one visitor can't drain the day's
--                       quota alone. Cache hits are never throttled.
--
-- Access model: ALL reads/writes go through the server-side service-role
-- client (which bypasses RLS) and the SECURITY DEFINER functions below.
-- No policy or grant here lets an anon/authenticated client write anything.
-- RLS is ENABLED on every table so none of them appear as
-- "RLS disabled" findings in the Supabase Security Advisor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ai_response_cache
-- ----------------------------------------------------------------------------
create table if not exists ai_response_cache (
  input_hash          text primary key,
  original_input_text text,
  gemini_response     jsonb not null,
  created_at          timestamptz not null default now()
);

create index if not exists ai_response_cache_created_at_idx
  on ai_response_cache (created_at);

alter table ai_response_cache enable row level security;

drop policy if exists "arc_public_select" on ai_response_cache;
-- Public read: identical text from ANY visitor benefits from the cached
-- analysis. Stored content is generated analysis, never user PII.
create policy "arc_public_select" on ai_response_cache for select
  to anon, authenticated using (true);
-- No insert/update/delete policies exist on purpose: only the service-role
-- key (API routes) writes cache entries, and it bypasses RLS entirely.

-- ----------------------------------------------------------------------------
-- ai_call_counters (global daily count of real Gemini calls)
-- ----------------------------------------------------------------------------
create table if not exists ai_call_counters (
  day   date primary key default current_date,
  calls integer not null default 0
);

alter table ai_call_counters enable row level security;
-- RLS enabled with ZERO policies: clients can neither read nor write this
-- table directly. Access is exclusively via the two functions below.

create or replace function get_ai_call_count() returns integer
language sql stable security definer set search_path = public as
$$ select coalesce((select calls from ai_call_counters where day = current_date), 0); $$;

-- Atomic upsert-increment; returns the new count. The slot is consumed BEFORE
-- the Gemini call happens, so concurrent requests cannot both slide past the
-- soft limit thinking they are the 18th call.
create or replace function increment_ai_call() returns integer
language sql security definer set search_path = public as
$$
  insert into ai_call_counters (day, calls)
  values (current_date, 1)
  on conflict (day) do update
    set calls = ai_call_counters.calls + 1
  returning calls;
$$;

-- ----------------------------------------------------------------------------
-- ai_call_throttle (per-actor cooldown between real Gemini calls)
-- ----------------------------------------------------------------------------
create table if not exists ai_call_throttle (
  actor_key      text primary key,
  last_real_call timestamptz not null default now()
);

alter table ai_call_throttle enable row level security;

-- Returns TRUE (and stamps now) when the actor may make a real call: either no
-- row exists yet or the last call is older than p_window_seconds. Returns
-- FALSE while inside the cooldown window. The insert ... on conflict is a
-- single atomic statement, so two simultaneous requests for the same actor
-- cannot both be allowed.
create or replace function throttle_check(p_actor_key text, p_window_seconds integer default 120)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  affected bigint;
begin
  insert into ai_call_throttle (actor_key, last_real_call)
  values (p_actor_key, now())
  on conflict (actor_key)
  do update set last_real_call = now()
  where ai_call_throttle.last_real_call < now() - make_interval(secs => p_window_seconds);

  get diagnostics affected = row_count;

  return affected > 0;  -- 0 means a recent row existed -> still cooling down
end;
$$;

-- ----------------------------------------------------------------------------
-- Function grants: server-side only (service_role), never client-facing
-- ----------------------------------------------------------------------------
revoke execute on function get_ai_call_count()                      from public, anon, authenticated;
grant  execute on function get_ai_call_count()                      to service_role;
revoke execute on function increment_ai_call()                      from public, anon, authenticated;
grant  execute on function increment_ai_call()                      to service_role;
revoke execute on function throttle_check(text, integer)            from public, anon, authenticated;
grant  execute on function throttle_check(text, integer)            to service_role;

comment on function get_ai_call_count()              is 'NetGuard: todays real Gemini call count. service_role only.';
comment on function increment_ai_call()              is 'NetGuard: atomically counts one real Gemini call. service_role only.';
comment on function throttle_check(text, integer)    is 'NetGuard: atomic per-actor cooldown gate for real Gemini calls. service_role only.';

-- PostgREST must learn about the new tables + functions after this runs.
notify pgrst, 'reload schema';
