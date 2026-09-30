-- QR Code Scam Scanner — scan history
-- Stores decoded QR code results for authenticated users

create table if not exists qr_scans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete set null,
  content_type text not null,
  raw_content text not null,
  result jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_qr_scans_user
  on qr_scans(user_id, created_at desc);

alter table qr_scans enable row level security;

-- Anyone can insert (anon users too)
create policy "Anyone can insert qr_scans"
  on qr_scans for insert
  with check (true);

-- Users can read their own scans
create policy "Users can read own qr_scans"
  on qr_scans for select
  using (auth.uid() = user_id);
