-- SECONDBRAIN v4 · daily loop (run once in Supabase SQL editor)
alter table brain_notes add column if not exists status text default 'inbox';   -- inbox | active | reference | done | archived
alter table brain_notes add column if not exists project text;
alter table brain_notes add column if not exists due date;
alter table brain_notes add column if not exists next_action text;
alter table brain_notes add column if not exists suggestion text;                -- today | project | reference | drop
alter table brain_notes add column if not exists seen_at timestamptz;

-- everything captured before v4 is already filed
update brain_notes set status = 'active' where status = 'inbox' and created_at < now();

create index if not exists brain_notes_status_idx on brain_notes(user_id, status);
