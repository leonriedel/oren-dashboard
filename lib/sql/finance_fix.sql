-- FINANCE SCHEMA — FIX
-- Drops NOT NULL on owner (service-role inserts have null auth.uid())
-- and switches RLS to admin-only based on user_metadata.role.

ALTER TABLE finance_manual_entries ALTER COLUMN owner DROP NOT NULL;
ALTER TABLE finance_snapshots      ALTER COLUMN owner DROP NOT NULL;

-- Rebuild policies: allow any authenticated user with role='admin' to r/w everything
DROP POLICY IF EXISTS "fin_manual_read_own"    ON finance_manual_entries;
DROP POLICY IF EXISTS "fin_manual_write_own"   ON finance_manual_entries;
DROP POLICY IF EXISTS "fin_manual_update_own"  ON finance_manual_entries;
DROP POLICY IF EXISTS "fin_manual_delete_own"  ON finance_manual_entries;

CREATE POLICY "fin_manual_admin_all" ON finance_manual_entries
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "fin_snap_read_own"   ON finance_snapshots;
DROP POLICY IF EXISTS "fin_snap_insert_own" ON finance_snapshots;

CREATE POLICY "fin_snap_admin_all" ON finance_snapshots
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
