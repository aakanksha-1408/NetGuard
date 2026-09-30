-- ============================================================================
-- NetGuard RLS hardening — PART 3
-- Ships together with the code changes made in this same review:
--   * src/app/api/scam-reports/route.ts  -> scam_reports writes now use the
--     service_role (admin) client, so the public/anon INSERT policy is no longer
--     needed and is dropped here.
--   * src/components/ScamChatbot.tsx     -> investigation / fact-check history is
--     only persisted for signed-in users, so anonymous (user_id IS NULL) rows are
--     no longer created and the "anyone can read anonymous" SELECT policies are
--     dropped here.
--
-- Idempotent: safe to re-run. Run the WHOLE file in the Supabase SQL Editor.
-- Order relative to other scripts: run rls_hardening.sql (part 1) and
-- rls_hardening_part2.sql (part 2) first, then THIS file. They do not conflict.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- scam_reports — remove PUBLIC/ANON INSERT. Keep public READ (heatmap/articles).
-- ----------------------------------------------------------------------------
-- Inserts now go through the admin (service_role) key which BYPASSES RLS, so the
-- table needs no INSERT policy. With no INSERT policy present, anon/authenticated
-- direct writes are denied by default — the heatmap can no longer be poisoned.
alter table scam_reports enable row level security;

-- Drop every variant of the public insert policy that may exist today:
--   * "anyone_insert_scam_reports"    (created by the route's SETUP_SQL)
--   * "Anyone can insert scam_reports" (created by supabase/scam_reports.sql)
drop policy if exists "anyone_insert_scam_reports"    on scam_reports;
drop policy if exists "Anyone can insert scam_reports" on scam_reports;

-- The public READ policy is intentionally kept (public heatmap data). Shown here
-- only so this file is self-contained and re-runnable; re-creating it is harmless.
drop policy if exists "anyone_read_scam_reports"      on scam_reports;
drop policy if exists "Anyone can read scam_reports"  on scam_reports;
create policy "anyone_read_scam_reports" on scam_reports for select
  to anon, authenticated using (true);

-- ----------------------------------------------------------------------------
-- scam_investigations — drop the anonymous-read SELECT policy.
-- ----------------------------------------------------------------------------
-- After this change a row with user_id IS NULL is readable by NOBODY (no policy
-- covers it -> default deny). This locks out any pre-existing anonymous rows too:
-- dropping the policy does not delete them, it just makes them unreadable via the
-- anon/authenticated roles. (The service_role admin key can still see them if you
-- ever need to clean up.) Owner-scoped SELECT stays in place.
alter table scam_investigations enable row level security;

drop policy if exists "Anyone can read anonymous scam_investigations" on scam_investigations;

-- Re-assert the owner-read and the self-scoped insert from part 2 so this file is
-- a complete, correct end-state for the table even if run on its own.
drop policy if exists "Users can read own scam_investigations" on scam_investigations;
drop policy if exists "si_owner_select" on scam_investigations;
create policy "si_owner_select" on scam_investigations for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "Anyone can insert scam_investigations" on scam_investigations;
drop policy if exists "si_scoped_insert" on scam_investigations;
create policy "si_scoped_insert" on scam_investigations for insert
  to authenticated with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- news_checks — same treatment as scam_investigations.
-- ----------------------------------------------------------------------------
alter table news_checks enable row level security;

drop policy if exists "Anyone can read anonymous news_checks" on news_checks;

drop policy if exists "Users can read own news_checks" on news_checks;
drop policy if exists "nc_owner_select" on news_checks;
create policy "nc_owner_select" on news_checks for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "Anyone can insert news_checks" on news_checks;
drop policy if exists "nc_scoped_insert" on news_checks;
create policy "nc_scoped_insert" on news_checks for insert
  to authenticated with check (auth.uid() = user_id);

-- NOTE: because anonymous history is no longer created, the insert policies above
-- are now narrowed to `to authenticated` with `auth.uid() = user_id` (no more
-- `user_id is null` branch). This is safe because ScamChatbot only inserts when a
-- signed-in user exists.

-- ----------------------------------------------------------------------------
-- Post-run verification (uncomment to run):
-- ----------------------------------------------------------------------------
-- select tablename, policyname, cmd, qual, with_check
-- from pg_policies
-- where tablename in ('scam_reports','scam_investigations','news_checks')
-- order by tablename, cmd;
