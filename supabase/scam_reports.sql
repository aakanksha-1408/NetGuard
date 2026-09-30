-- Run this in the Supabase SQL editor to create the scam_reports table.
-- This table stores scam-related news articles classified from the live
-- Google News RSS feed used by the Articles module.

create table if not exists scam_reports (
  id uuid primary key default gen_random_uuid(),
  article_link text not null unique,
  title text not null,
  source text not null default 'Google News',
  published_at timestamptz,
  category text not null,
  platform text not null default 'Unknown',
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  created_at timestamptz not null default now()
);

-- Index for fast duplicate checks
create index if not exists idx_scam_reports_article_link
  on scam_reports (article_link);

-- Index for aggregation queries
create index if not exists idx_scam_reports_category_platform
  on scam_reports (category, platform);

-- Enable RLS
alter table scam_reports enable row level security;

-- Allow anyone to read scam reports (public heatmap data)
create policy "Anyone can read scam_reports"
  on scam_reports for select
  using (true);

-- NO public INSERT policy. New reports are written by the API route using the
-- service_role (admin) client, which bypasses RLS. Dropping anon insert prevents
-- the public heatmap from being poisoned. See supabase/rls_hardening_part3.sql.
