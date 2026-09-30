-- Run this in the Supabase SQL editor if the chatbot_checks table doesn't exist yet.

create table if not exists chatbot_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  message text not null,
  verdict text not null check (verdict in ('low', 'medium', 'high')),
  created_at timestamptz not null default now()
);

-- RLS policies are managed in supabase/rls_hardening.sql (idempotent, canonical).
-- This file only defines the table. See rls_hardening.sql for chatbot_checks:
--   public insert, owner-only select/update/delete (RLS enabled).
