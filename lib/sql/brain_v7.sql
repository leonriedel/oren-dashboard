-- SECONDBRAIN v7 · pages & subpages, weekly goals (run once in Supabase SQL editor)
-- Private to the owner: RLS = auth.uid(). Mikha (or anyone else) sees nothing.

create table if not exists brain_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid references brain_pages(id) on delete cascade,
  title text not null default 'Untitled',
  emoji text default '📄',
  color text default '#80c0ff',
  priority int,                         -- 1 | 2 | 3 | null
  status text default 'active',         -- active | someday | done | archived
  pinned boolean default false,
  position int default 0,
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists brain_pages_user_idx on brain_pages(user_id, parent_id);

create table if not exists brain_blocks (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references brain_pages(id) on delete cascade,
  parent_id uuid references brain_blocks(id) on delete cascade,
  type text not null,
  content text,
  done boolean default false,
  position int not null default 0,
  props jsonb default '{}',
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists brain_blocks_board_idx on brain_blocks(board_id, position);
create index if not exists brain_blocks_parent_idx on brain_blocks(parent_id);

create table if not exists brain_weeks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,             -- Monday
  goals jsonb default '[]',             -- [{id, text, done, page_id?}]
  note text,
  updated_at timestamptz default now(),
  primary key (user_id, week_start)
);

alter table brain_pages enable row level security;
alter table brain_blocks enable row level security;
alter table brain_weeks enable row level security;

drop policy if exists "own pages" on brain_pages;
create policy "own pages" on brain_pages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own blocks" on brain_blocks;
create policy "own blocks" on brain_blocks for all to authenticated
  using (exists (select 1 from brain_pages p where p.id = board_id and p.user_id = auth.uid()))
  with check (exists (select 1 from brain_pages p where p.id = board_id and p.user_id = auth.uid()));

drop policy if exists "own weeks" on brain_weeks;
create policy "own weeks" on brain_weeks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- private file storage (images / PDFs in pages): only the uploader can read
insert into storage.buckets (id, name, public) values ('brain', 'brain', false) on conflict (id) do nothing;
drop policy if exists "brain read" on storage.objects;
create policy "brain read" on storage.objects for select to authenticated using (bucket_id = 'brain' and owner = auth.uid());
drop policy if exists "brain upload" on storage.objects;
create policy "brain upload" on storage.objects for insert to authenticated with check (bucket_id = 'brain');
drop policy if exists "brain delete" on storage.objects;
create policy "brain delete" on storage.objects for delete to authenticated using (bucket_id = 'brain' and owner = auth.uid());
