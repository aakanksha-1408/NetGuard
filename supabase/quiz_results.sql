-- Run this in the Supabase SQL editor if the quiz_results table doesn't exist yet.
-- NOTE: this table has NO user_id column, so owner-scoped access is not possible
-- until one is added. RLS policies live in supabase/rls_hardening.sql
-- (public insert only; select/update/delete intentionally denied).

create table if not exists quiz_results (
  id uuid primary key default gen_random_uuid(),
  score integer not null,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
