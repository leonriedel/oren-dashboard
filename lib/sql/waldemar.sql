-- WALDEMAR · crypto trend bot reporting (run once in the Supabase SQL editor)
-- Written by the bot with the service-role key; read by /api/waldemar (admin only). No public access.
create table if not exists waldemar_status (
  id int primary key default 1,
  ts timestamptz default now(),
  live boolean default false,
  exchange text,
  ma int,
  budget numeric,
  equity numeric,
  eur numeric,
  net_deposits numeric,
  last_cycle date,
  pairs jsonb default '{}'
);
create table if not exists waldemar_daily (
  day date primary key,
  ts timestamptz default now(),
  equity numeric,
  eur numeric,
  crypto numeric,
  net_deposits numeric,
  btc numeric,
  eth numeric
);
create table if not exists waldemar_trades (
  id bigserial primary key,
  ts timestamptz default now(),
  pair text,
  side text,
  amount numeric,
  price numeric,
  value_eur numeric,
  fee_eur numeric,
  order_id text,
  reason text,
  live boolean default true
);
alter table waldemar_status enable row level security;
alter table waldemar_daily enable row level security;
alter table waldemar_trades enable row level security;

-- read access for the dashboard: signed-in admins may read Waldemar's tables (the bot writes with the service key)
drop policy if exists "admins read waldemar_status" on waldemar_status;
create policy "admins read waldemar_status" on waldemar_status for select to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
drop policy if exists "admins read waldemar_daily" on waldemar_daily;
create policy "admins read waldemar_daily" on waldemar_daily for select to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
drop policy if exists "admins read waldemar_trades" on waldemar_trades;
create policy "admins read waldemar_trades" on waldemar_trades for select to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
