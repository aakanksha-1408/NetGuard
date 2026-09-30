-- ============================================================================
-- NetGuard RLS hardening — Security Advisor CRITICAL remediation
-- Run this whole file in the Supabase SQL Editor (it is idempotent: safe to
-- re-run). It enables Row Level Security on the 4 flagged public tables and
-- applies per-table policies inferred from how each table is used in the app.
--
-- Access patterns (verified against the live schemas + src/ usage):
--   chatbot_checks : has user_id; not read anywhere in app. public insert, owner read/update/delete.
--   link_checks    : has user_id (nullable); LinkChecker inserts (anon allowed) + reads own. public insert, owner read/update/delete.
--   quiz_results   : NO user_id; quiz page only inserts, never reads. public insert only; all other ops denied.
--   community      : has user_id; articles page reads publicly, report page inserts when logged in, delete is owner-only. public read, auth-only insert (own id), owner update/delete.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- chatbot_checks
-- ----------------------------------------------------------------------------
alter table chatbot_checks enable row level security;

drop policy if exists "cc_public_insert"   on chatbot_checks;
drop policy if exists "cc_owner_select"    on chatbot_checks;
drop policy if exists "cc_owner_update"    on chatbot_checks;
drop policy if exists "cc_owner_delete"    on chatbot_checks;

create policy "cc_public_insert" on chatbot_checks for insert
  to anon, authenticated with check (true);

create policy "cc_owner_select" on chatbot_checks for select
  to anon, authenticated using (auth.uid() = user_id);

create policy "cc_owner_update" on chatbot_checks for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cc_owner_delete" on chatbot_checks for delete
  to authenticated using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- link_checks
-- ----------------------------------------------------------------------------
alter table link_checks enable row level security;

drop policy if exists "lc_public_insert" on link_checks;
drop policy if exists "lc_owner_select"  on link_checks;
drop policy if exists "lc_owner_update"  on link_checks;
drop policy if exists "lc_owner_delete"  on link_checks;

-- Insert must stay public: LinkChecker writes rows with user_id = null for
-- logged-out visitors (see LinkChecker.tsx:181 `user_id: currentUser?.id ?? null`).
create policy "lc_public_insert" on link_checks for insert
  to anon, authenticated with check (true);

create policy "lc_owner_select" on link_checks for select
  to anon, authenticated using (auth.uid() = user_id);

create policy "lc_owner_update" on link_checks for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "lc_owner_delete" on link_checks for delete
  to authenticated using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- quiz_results  (NOTE: this table has NO user_id column)
-- ----------------------------------------------------------------------------
alter table quiz_results enable row level security;

drop policy if exists "qr_public_insert" on quiz_results;

-- Only INSERT is needed; the app never reads/updates/deletes quiz_results, so
-- SELECT/UPDATE/DELETE are intentionally left with NO policy (denied by default).
create policy "qr_public_insert" on quiz_results for insert
  to anon, authenticated with check (true);

-- If you later add a leaderboard, add ONE of these deliberately:
--   public read (anyone sees all scores):
--     create policy "qr_public_select" on quiz_results for select
--       to anon, authenticated using (true);
--   ...but a truly owner-only model is impossible until a user_id column exists.

-- ----------------------------------------------------------------------------
-- community
-- ----------------------------------------------------------------------------
alter table community enable row level security;

drop policy if exists "cm_public_select"  on community;
drop policy if exists "cm_authed_insert"  on community;
drop policy if exists "cm_owner_update"   on community;
drop policy if exists "cm_owner_delete"   on community;

-- Public read: the /articles community wall loads for signed-out visitors too
-- (articles/page.tsx loadReports() runs unconditionally).
create policy "cm_public_select" on community for select
  to anon, authenticated using (true);

-- Insert only when authenticated, and only as yourself: report/page.tsx is
-- gated behind login and sets user_id = user.id.
create policy "cm_authed_insert" on community for insert
  to authenticated with check (auth.uid() = user_id);

create policy "cm_owner_update" on community for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cm_owner_delete" on community for delete
  to authenticated using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Sanity check (returns each table + whether RLS is now enabled). Optional.
-- ----------------------------------------------------------------------------
select relname, relrowsecurity
from pg_class
where relname in ('chatbot_checks','quiz_results','community','link_checks')
order by relname;
