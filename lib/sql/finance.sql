-- FINANCE OVERVIEW — Supabase schema
-- 2 tables:
--   finance_manual_entries: cash, crypto, misc assets that have no API source
--   finance_snapshots: daily NAV snapshot per bucket, for the 90d equity trend

CREATE TABLE IF NOT EXISTS finance_manual_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  bucket text NOT NULL,         -- 'liquid' | 'investments' | 'physical' | 'other'
  label text NOT NULL,          -- 'Wise EUR', 'Mandiri IDR', 'Hardware Wallet BTC'
  amount_eur numeric NOT NULL,  -- always stored in EUR for simplicity
  note text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fin_manual_owner_idx ON finance_manual_entries(owner);
CREATE INDEX IF NOT EXISTS fin_manual_bucket_idx ON finance_manual_entries(bucket);

ALTER TABLE finance_manual_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_manual_read_own" ON finance_manual_entries;
CREATE POLICY "fin_manual_read_own" ON finance_manual_entries
  FOR SELECT TO authenticated USING (owner = auth.uid());

DROP POLICY IF EXISTS "fin_manual_write_own" ON finance_manual_entries;
CREATE POLICY "fin_manual_write_own" ON finance_manual_entries
  FOR INSERT TO authenticated WITH CHECK (owner = auth.uid());

DROP POLICY IF EXISTS "fin_manual_update_own" ON finance_manual_entries;
CREATE POLICY "fin_manual_update_own" ON finance_manual_entries
  FOR UPDATE TO authenticated USING (owner = auth.uid());

DROP POLICY IF EXISTS "fin_manual_delete_own" ON finance_manual_entries;
CREATE POLICY "fin_manual_delete_own" ON finance_manual_entries
  FOR DELETE TO authenticated USING (owner = auth.uid());

-- ─── SNAPSHOTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_snapshots (
  id bigserial PRIMARY KEY,
  owner uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  ts timestamptz NOT NULL DEFAULT now(),
  total_eur numeric NOT NULL,
  liquid_eur numeric DEFAULT 0,
  investments_eur numeric DEFAULT 0,
  physical_eur numeric DEFAULT 0,
  other_eur numeric DEFAULT 0,
  breakdown jsonb
);

CREATE INDEX IF NOT EXISTS fin_snap_owner_ts_idx ON finance_snapshots(owner, ts DESC);

ALTER TABLE finance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_snap_read_own" ON finance_snapshots;
CREATE POLICY "fin_snap_read_own" ON finance_snapshots
  FOR SELECT TO authenticated USING (owner = auth.uid());

DROP POLICY IF EXISTS "fin_snap_insert_own" ON finance_snapshots;
CREATE POLICY "fin_snap_insert_own" ON finance_snapshots
  FOR INSERT TO authenticated WITH CHECK (owner = auth.uid());
