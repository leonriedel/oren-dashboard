-- EDGAR SCALPER — Supabase schema
-- 4 tables: signals (every detected setup), trades (what was executed/papered),
-- equity (hourly NAV snapshots), bot_status (heartbeat + errors)
-- All admin-only via RLS (owner must be Leon's auth.uid).

-- 1. SIGNALS
CREATE TABLE IF NOT EXISTS edgar_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  symbol text NOT NULL,                 -- 'XAU/USD', 'EUR/USD', 'GBP/USD'…
  timeframe text NOT NULL,              -- 'M5', 'M15', 'H1'
  side text NOT NULL,                   -- 'LONG' | 'SHORT'
  confidence numeric NOT NULL,          -- 0.0 .. 1.0
  price numeric NOT NULL,
  sl numeric,                           -- stop-loss price
  tp numeric,                           -- take-profit price
  reasons jsonb,                        -- ['BB_lower','RSI_28','MACD_bull_cross']
  acted boolean DEFAULT false,          -- was a trade placed on this signal
  trade_id uuid,                        -- fk once executed
  dry_run boolean DEFAULT true,         -- false once we go live
  note text
);
CREATE INDEX IF NOT EXISTS edgar_signals_ts_idx ON edgar_signals(ts DESC);
CREATE INDEX IF NOT EXISTS edgar_signals_symbol_idx ON edgar_signals(symbol);

-- 2. TRADES
CREATE TABLE IF NOT EXISTS edgar_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  symbol text NOT NULL,
  side text NOT NULL,
  size numeric NOT NULL,                -- units / lots
  entry numeric NOT NULL,
  sl numeric,
  tp numeric,
  exit numeric,
  exit_reason text,                     -- 'TP' | 'SL' | 'MANUAL' | 'TIMEOUT'
  pnl numeric,                          -- in account currency
  pnl_pct numeric,
  commission numeric DEFAULT 0,
  signal_id uuid REFERENCES edgar_signals(id),
  dry_run boolean DEFAULT true,
  broker text DEFAULT 'oanda-practice',
  note text
);
CREATE INDEX IF NOT EXISTS edgar_trades_opened_idx ON edgar_trades(opened_at DESC);
CREATE INDEX IF NOT EXISTS edgar_trades_status_idx ON edgar_trades(closed_at) WHERE closed_at IS NULL;

-- 3. EQUITY SNAPSHOTS (hourly)
CREATE TABLE IF NOT EXISTS edgar_equity (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  nav numeric NOT NULL,
  cash numeric,
  unrealized numeric,
  open_positions int DEFAULT 0,
  dry_run boolean DEFAULT true
);
CREATE INDEX IF NOT EXISTS edgar_equity_ts_idx ON edgar_equity(ts DESC);

-- 4. BOT STATUS (single-row kind heartbeat)
CREATE TABLE IF NOT EXISTS edgar_bot_status (
  id int PRIMARY KEY DEFAULT 1,
  last_heartbeat timestamptz,
  last_signal_scan timestamptz,
  last_error text,
  last_error_at timestamptz,
  mode text DEFAULT 'paper',             -- 'paper' | 'live'
  universe text[] DEFAULT ARRAY['XAU_USD','EUR_USD','GBP_USD','USD_JPY']::text[],
  version text,
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO edgar_bot_status (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- RLS: admin (Leon) only
ALTER TABLE edgar_signals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE edgar_trades     ENABLE ROW LEVEL SECURITY;
ALTER TABLE edgar_equity     ENABLE ROW LEVEL SECURITY;
ALTER TABLE edgar_bot_status ENABLE ROW LEVEL SECURITY;

-- Admin-only read (Mikha locked out). Use user_metadata.role = 'admin' check.
-- The Python bot uses the service-role key, bypassing RLS entirely.
DROP POLICY IF EXISTS "edgar_signals_admin_read" ON edgar_signals;
CREATE POLICY "edgar_signals_admin_read" ON edgar_signals
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "edgar_trades_admin_read" ON edgar_trades;
CREATE POLICY "edgar_trades_admin_read" ON edgar_trades
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "edgar_equity_admin_read" ON edgar_equity;
CREATE POLICY "edgar_equity_admin_read" ON edgar_equity
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "edgar_bot_status_admin_read" ON edgar_bot_status;
CREATE POLICY "edgar_bot_status_admin_read" ON edgar_bot_status
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
