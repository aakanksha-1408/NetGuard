-- ============================================================================
-- NetGuard RLS hardening — PART 2
-- Addresses the Security Advisor "RLS Policy Always True" warnings on:
--   scam_reports, scam_investigations, news_checks
-- (chatbot_checks / link_checks / quiz_results are already reviewed and
--  intentional — see rls_hardening.sql — and are not repeated here.)
--
-- Idempotent: safe to re-run. Run the whole file in the Supabase SQL Editor.
--
-- Verdicts (reasoning is in the accompanying report):
--   scam_reports      : SELECT using(true)  -> INTENDED public heatmap data. LEFT ALONE.
--                       INSERT with check(true) -> coupled to app code (route inserts
--                       via ANON client at src/app/api/scam-reports/route.ts:217).
--                       Tightening this in SQL ALONE would break that route, so it is
--                       DELIBERATELY LEFT UNCHANGED here. See the paired code+SQL fix
--                       documented at the bottom of this file.
--   scam_investigations: INSERT with check(true) -> OVERSIGHT. Tightened to stop
--                       user_id spoofing. No app breakage (client always sends own id or null).
--   news_checks        : INSERT with check(true) -> OVERSIGHT. Tightened, same reasoning.
--   (SELECT policies on the last two are NOT always-true and are left untouched.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Step 0 — VERIFY current state first (optional but recommended).
-- This lists every policy the advisor is complaining about, so you can confirm
-- the exact policy NAMES in your project before/after running this file.
-- ----------------------------------------------------------------------------
-- select tablename, policyname, permissive, cmd, qual, with_check
-- from pg_policies
-- where tablename in ('scam_reports','scam_investigations','news_checks')
-- order by tablename, cmd;

-- confirm RLS is enabled on all three (the "always true" warning already implies yes):
-- select relname, relrowsecurity from pg_class
-- where relname in ('scam_reports','scam_investigations','news_checks');

-- ----------------------------------------------------------------------------
-- scam_investigations — replace the always-true INSERT with a self-scoped one.
-- Allows: anonymous inserts (user_id IS NULL) and authenticated users inserting
-- ONLY their own rows (auth.uid() = user_id). Prevents cross-user data poisoning.
-- ----------------------------------------------------------------------------
alter table scam_investigations enable row level security;

-- Drop the old always-true insert policy (try both the human-readable name used
-- by supabase/scam_investigations.sql and a defensive fallback, then re-create).
drop policy if exists "Anyone can insert scam_investigations" on scam_investigations;
drop policy if exists "si_scoped_insert" on scam_investigations;

create policy "si_scoped_insert" on scam_investigations for insert
  to anon, authenticated
  with check (user_id is null or auth.uid() = user_id);

-- NOTE: existing SELECT policies are intentionally left in place:
--   "Users can read own scam_investigations"  using (auth.uid() = user_id)
--   "Anyone can read anonymous scam_investigations" using (user_id is null)
-- These are not always-true. (The anonymous-read policy exposes all user_id-null
-- rows; that is the only way logged-out browser history can be re-read, since anon
-- rows have no owner to scope by. Flagged in the report, left as-is.)

-- ----------------------------------------------------------------------------
-- news_checks — same treatment.
-- ----------------------------------------------------------------------------
alter table news_checks enable row level security;

drop policy if exists "Anyone can insert news_checks" on news_checks;
drop policy if exists "nc_scoped_insert" on news_checks;

create policy "nc_scoped_insert" on news_checks for insert
  to anon, authenticated
  with check (user_id is null or auth.uid() = user_id);

-- NOTE: SELECT policies left untouched (owner-read + anonymous-read, not always-true).

-- ----------------------------------------------------------------------------
-- scam_reports — NO CHANGE in this file.
-- SELECT using(true) is intended (public heatmap). INSERT with check(true) is
-- currently required because the app writes via the ANON client. DO NOT run the
-- block below unless you ALSO make the code change described after it.
-- ----------------------------------------------------------------------------
-- >>> PAIRED FIX (only if you choose to close the public-insert hole): <<<
--   1. In src/app/api/scam-reports/route.ts, change line 217 from
--          await supabase.from("scam_reports").insert([...])
--      to use the admin client (bypasses RLS):
--          const admin = getAdminClient();
--          await admin!.from("scam_reports").insert([...])
--      (and the probe/dedupe reads can stay on the anon client, they only need SELECT).
--   2. Then apply this SQL to revoke public insert:
--          drop policy if exists "anyone_insert_scam_reports" on scam_reports;
--          drop policy if exists "Anyone can insert scam_reports"   on scam_reports;
--      (The auto-setup SETUP_SQL in the route also recreates
--       anyone_insert_scam_reports, so update that string in the route too, or the
--       policy will come back on the next cold start.)
-- Until that code change is made and approved, scam_reports insert stays as-is.

-- ----------------------------------------------------------------------------
-- Post-run verification (uncomment to confirm the new WITH CHECK is in place):
-- ----------------------------------------------------------------------------
-- select tablename, policyname, cmd, with_check
-- from pg_policies
-- where tablename in ('scam_investigations','news_checks') and cmd = 'INSERT';
