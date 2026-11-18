-- SECONDBRAIN v5 · MIND conversation (run once in Supabase SQL editor)
create table if not exists brain_mind (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null,                 -- 'me' | 'oren'
  content text not null,
  intent text,                        -- capture | ask | reflect
  note_id uuid,                       -- note filed from this message
  cited uuid[] default '{}',
  created_at timestamptz default now()
);
create index if not exists brain_mind_user_idx on brain_mind(user_id, created_at desc);
alter table brain_mind enable row level security;
drop policy if exists "Users own brain_mind" on brain_mind;
create policy "Users own brain_mind" on brain_mind for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
