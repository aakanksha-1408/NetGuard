-- Run this in the Supabase SQL editor to create the scam_investigations table.
-- Stores user investigation history for the Scam Investigator feature.

create table if not exists scam_investigations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  message text not null,
  risk_score integer not null default 0,
  scam_type text not null default 'Unknown',
  risk_band text not null default 'Very Low Risk',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Index for user history lookups
create index if not exists idx_scam_investigations_user
  on scam_investigations (user_id, created_at desc);

-- Enable RLS
alter table scam_investigations enable row level security;

-- Policies are canonicalised in supabase/rls_hardening_part2.sql and
-- supabase/rls_hardening_part3.sql. End state:
--   INSERT: authenticated only, own rows (with check auth.uid() = user_id).
--           Anonymous (user_id IS NULL) rows are no longer created — ScamChatbot
--           persists history only for signed-in users.
--   SELECT: owner only (using auth.uid() = user_id).
--   The old "Anyone can read anonymous ..." and "Anyone can insert ..." policies
--   have been removed (see part3).
--   service_role (admin) bypasses all of the above.
