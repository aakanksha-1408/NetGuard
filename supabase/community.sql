-- Run this in the Supabase SQL editor if the community table doesn't exist yet.
-- The app treats `id` as a number (articles/page.tsx Report.id: number and
-- delete .eq("id", reportId)), so id is a bigint identity here, not a uuid.
-- RLS policies live in supabase/rls_hardening.sql
-- (public select; authenticated-only insert as self; owner update/delete).

create table if not exists community (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  category text not null,
  platform text not null,
  description text not null,
  created_at timestamptz not null default now()
);
