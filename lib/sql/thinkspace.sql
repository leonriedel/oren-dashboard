-- ThinkSpace v2 — shared Notion-style boards
-- Both Leon and Mikha collaborate on the same boards.

-- (Optionally drop the old thinkspace table; uncomment only if you want to wipe old data)
-- DROP TABLE IF EXISTS thinkspace CASCADE;

CREATE TABLE IF NOT EXISTS workspace_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  emoji text DEFAULT '📋',
  color text DEFAULT '#80c0ff',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid REFERENCES workspace_boards(id) ON DELETE CASCADE,
  type text NOT NULL,  -- 'heading' | 'text' | 'todo'
  content text,
  done boolean DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE workspace_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wb_all" ON workspace_boards;
CREATE POLICY "wb_all" ON workspace_boards FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "wbl_all" ON workspace_blocks;
CREATE POLICY "wbl_all" ON workspace_blocks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Helpful index
CREATE INDEX IF NOT EXISTS workspace_blocks_board_position_idx ON workspace_blocks(board_id, position);
