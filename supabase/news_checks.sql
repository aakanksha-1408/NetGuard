-- Run this in the Supabase SQL editor to create the news_checks table.
-- Stores user news/post fact-checking history for the News Check mode.

create table if not exists news_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  input_text text not null,
  verdict text not null default 'unverifiable',
  confidence text not null default 'low',
  red_flags jsonb not null default '[]'::jsonb,
  reasoning text not null default '',
  suggestion text not null default '',
  created_at timestamptz not null default now()
);

-- Index for user history lookups
create index if not exists idx_news_checks_user
  on news_checks (user_id, created_at desc);

-- Enable RLS
alter table news_checks enable row level security;

-- Policies are canonicalised in supabase/rls_hardening_part2.sql and
-- supabase/rls_hardening_part3.sql. End state:
--   INSERT: authenticated only, own rows (with check auth.uid() = user_id).
--           Anonymous (user_id IS NULL) rows are no longer created — ScamChatbot
--           persists history only for signed-in users.
--   SELECT: owner only (using auth.uid() = user_id).
--   The old "Anyone can read anonymous ..." and "Anyone can insert ..." policies
--   have been removed (see part3).
--   service_role (admin) bypasses all of the above.
