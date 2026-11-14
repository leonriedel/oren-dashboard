-- SECONDBRAIN v2 · run once in Supabase SQL editor

-- Priorities: manual order (drag & drop)
alter table priorities add column if not exists sort_order int default 0;

-- One row per user per local day: habit check-ins, evening review, OREN briefing
create table if not exists brain_days (
  user_id uuid references auth.users(id) on delete cascade not null,
  day date not null,
  nn_done text[] default '{}',
  review_good text,
  review_bad text,
  review_tomorrow text,
  briefing jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, day)
);
alter table brain_days enable row level security;
drop policy if exists "Users own brain_days" on brain_days;
create policy "Users own brain_days" on brain_days for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
