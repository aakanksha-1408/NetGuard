-- Run this in the Supabase SQL editor if the link_checks table doesn't exist yet.

create table if not exists link_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  input_text text not null,
  risk_level text not null check (risk_level in ('safe', 'suspicious', 'fraud')),
  safe_to_post boolean not null default true,
  flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- RLS policies are managed in supabase/rls_hardening.sql (idempotent, canonical).
-- This file only defines the table. See rls_hardening.sql for link_checks:
--   public insert (user_id may be null), owner-only select/update/delete (RLS enabled).
