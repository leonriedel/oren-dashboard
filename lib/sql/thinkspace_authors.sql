-- ThinkSpace · track who last edited (for Mikha's pink M marker)
alter table workspace_blocks add column if not exists updated_by uuid references auth.users(id);
alter table workspace_boards add column if not exists updated_by uuid references auth.users(id);
