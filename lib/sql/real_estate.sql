-- Real Estate Projects
-- Shared across all authenticated users (Leon + Mikha collaborate on same data)

CREATE TABLE IF NOT EXISTS real_estate_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'concept',
  location text,
  invested numeric DEFAULT 0,
  current_value numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE real_estate_projects ENABLE ROW LEVEL SECURITY;

-- Any signed-in user may read
DROP POLICY IF EXISTS "re_read" ON real_estate_projects;
CREATE POLICY "re_read" ON real_estate_projects
  FOR SELECT TO authenticated USING (true);

-- Any signed-in user may insert (created_by auto-filled from auth.uid())
DROP POLICY IF EXISTS "re_insert" ON real_estate_projects;
CREATE POLICY "re_insert" ON real_estate_projects
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Any signed-in user may update
DROP POLICY IF EXISTS "re_update" ON real_estate_projects;
CREATE POLICY "re_update" ON real_estate_projects
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Any signed-in user may delete
DROP POLICY IF EXISTS "re_delete" ON real_estate_projects;
CREATE POLICY "re_delete" ON real_estate_projects
  FOR DELETE TO authenticated USING (true);
