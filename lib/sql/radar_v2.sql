-- RADAR AI v2 · run once in Supabase SQL editor
-- All tables are written/read only by the server (service role) → RLS on, no client policies.

create table if not exists radar_snap (          -- one row per US trading day: all liquid stocks, compact
  day date primary key,
  trading boolean default true,
  data jsonb,                                     -- { "SYM": [o,h,l,c,v], ... }
  created_at timestamptz default now()
);

create table if not exists radar_profiles (      -- FMP fundamentals cache
  symbol text primary key,
  profile jsonb,
  growth numeric,                                 -- yoy revenue growth (0.45 = +45%)
  profile_at timestamptz,
  growth_at timestamptz
);

create table if not exists radar_scans (         -- one scan per trading day
  day date primary key,
  result jsonb,
  created_at timestamptz default now()
);

create table if not exists radar_picks (         -- track record
  day date not null,
  symbol text not null,
  rank int,
  score int,
  price numeric,
  verdict text,
  primary key (day, symbol)
);

create table if not exists radar_watch (
  symbol text primary key,
  note text,
  added_price numeric,
  added_at timestamptz default now()
);

alter table radar_snap enable row level security;
alter table radar_profiles enable row level security;
alter table radar_scans enable row level security;
alter table radar_picks enable row level security;
alter table radar_watch enable row level security;
