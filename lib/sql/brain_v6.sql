-- SECONDBRAIN v6 · topics + day planning (run once in Supabase SQL editor)
create table if not exists brain_topics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  priority int default 2,              -- 1 = high, 2 = normal, 3 = low
  status text default 'active',        -- active | paused
  created_at timestamptz default now(),
  unique (user_id, name)
);
alter table brain_topics enable row level security;
drop policy if exists "Users own brain_topics" on brain_topics;
create policy "Users own brain_topics" on brain_topics for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table brain_days add column if not exists focus_topics text[] default '{}';
alter table brain_days add column if not exists plan jsonb;
alter table brain_notes add column if not exists board_day date;
