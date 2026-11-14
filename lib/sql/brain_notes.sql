-- SECONDBRAIN · knowledge store (run once in Supabase SQL editor)
create table if not exists brain_notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null default 'note',          -- idea | note | link | task | goal | person | quote
  title text not null,
  body text,
  url text,
  summary text,
  tags text[] default '{}',
  related uuid[] default '{}',
  pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists brain_notes_user_idx on brain_notes(user_id, created_at desc);
alter table brain_notes enable row level security;
drop policy if exists "Users own brain_notes" on brain_notes;
create policy "Users own brain_notes" on brain_notes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
