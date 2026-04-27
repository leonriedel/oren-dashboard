-- Run this in Supabase → SQL Editor

-- Enable RLS
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;

-- PRIORITIES
create table if not exists priorities (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  text text not null,
  done boolean default false,
  created_at timestamptz default now()
);
alter table priorities enable row level security;
create policy "Users own priorities" on priorities for all using (auth.uid() = user_id);

-- GOALS
create table if not exists goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  text text not null,
  done boolean default false,
  created_at timestamptz default now()
);
alter table goals enable row level security;
create policy "Users own goals" on goals for all using (auth.uid() = user_id);

-- NON NEGOTIABLES
create table if not exists non_negotiables (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  emoji text not null,
  label text not null,
  done boolean default false,
  sort_order int default 0
);
alter table non_negotiables enable row level security;
create policy "Users own nn" on non_negotiables for all using (auth.uid() = user_id);

-- FINANCE TRANSACTIONS
create table if not exists transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('income', 'expense')),
  category text,
  description text not null,
  amount numeric not null,
  date date default current_date,
  created_at timestamptz default now()
);
alter table transactions enable row level security;
create policy "Users own transactions" on transactions for all using (auth.uid() = user_id);

-- FINANCE SNAPSHOT (wealth overview)
create table if not exists finance_snapshot (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  biz_assets numeric default 0,
  priv_liquidity numeric default 0,
  avail_cash numeric default 0,
  updated_at timestamptz default now()
);
alter table finance_snapshot enable row level security;
create policy "Users own snapshot" on finance_snapshot for all using (auth.uid() = user_id);

-- INVESTMENTS
create table if not exists investments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  category text not null check (category in ('stocks','crypto','realestate','startups','other')),
  name text not null,
  invested numeric not null,
  current_value numeric not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table investments enable row level security;
create policy "Users own investments" on investments for all using (auth.uid() = user_id);

-- THINKSPACE
create table if not exists thinkspace (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('idea','strategy','decision','future')),
  text text not null,
  created_at timestamptz default now()
);
alter table thinkspace enable row level security;
create policy "Users own thinkspace" on thinkspace for all using (auth.uid() = user_id);

-- SPORT — TRAINING
create table if not exists training (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  day text not null,
  exercise text not null,
  created_at timestamptz default now()
);
alter table training enable row level security;
create policy "Users own training" on training for all using (auth.uid() = user_id);

-- SPORT — FOOD NOTES
create table if not exists food_notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  text text not null,
  created_at timestamptz default now()
);
alter table food_notes enable row level security;
create policy "Users own food_notes" on food_notes for all using (auth.uid() = user_id);

-- SOCIAL — CONTENT
create table if not exists content_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  text text not null,
  done boolean default false,
  pipeline_status text default 'idea' check (pipeline_status in ('idea','progress','ready','posted')),
  is_today boolean default false,
  created_at timestamptz default now()
);
alter table content_items enable row level security;
create policy "Users own content" on content_items for all using (auth.uid() = user_id);

-- SOCIAL — BRAIN DUMP
create table if not exists brain_dump (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  text text not null,
  created_at timestamptz default now()
);
alter table brain_dump enable row level security;
create policy "Users own brain_dump" on brain_dump for all using (auth.uid() = user_id);

-- SOCIAL — WEEKLY TARGETS
create table if not exists weekly_targets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  reels int default 0,
  posts int default 0,
  week_start date default current_date
);
alter table weekly_targets enable row level security;
create policy "Users own weekly_targets" on weekly_targets for all using (auth.uid() = user_id);

-- CHAT HISTORY
create table if not exists chat_messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now()
);
alter table chat_messages enable row level security;
create policy "Users own chat" on chat_messages for all using (auth.uid() = user_id);
