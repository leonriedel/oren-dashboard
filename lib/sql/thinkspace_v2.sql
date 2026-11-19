-- ThinkSpace v2 · sections, toggles, links, images, details (run once in Supabase SQL editor)
alter table workspace_blocks add column if not exists parent_id uuid references workspace_blocks(id) on delete cascade;
alter table workspace_blocks add column if not exists props jsonb default '{}';
alter table workspace_blocks add column if not exists updated_by uuid references auth.users(id);
alter table workspace_boards add column if not exists updated_by uuid references auth.users(id);
create index if not exists workspace_blocks_parent_idx on workspace_blocks(parent_id);

-- private image storage for boards (signed URLs, signed-in users only)
insert into storage.buckets (id, name, public) values ('thinkspace', 'thinkspace', false)
  on conflict (id) do nothing;
drop policy if exists "thinkspace read" on storage.objects;
create policy "thinkspace read" on storage.objects for select to authenticated using (bucket_id = 'thinkspace');
drop policy if exists "thinkspace upload" on storage.objects;
create policy "thinkspace upload" on storage.objects for insert to authenticated with check (bucket_id = 'thinkspace');
drop policy if exists "thinkspace delete" on storage.objects;
create policy "thinkspace delete" on storage.objects for delete to authenticated using (bucket_id = 'thinkspace');
