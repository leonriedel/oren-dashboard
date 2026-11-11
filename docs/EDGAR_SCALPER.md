# EDGAR SCALPER — Setup

## Was drin ist

```
edgar-bundle/
├── lib/sql/edgar_scalper.sql           ← Supabase schema (4 tables + RLS)
├── app/api/edgar/scalper/
│   ├── status/route.ts                 ← Bot heartbeat
│   ├── signals/route.ts                ← Signal feed
│   ├── positions/route.ts              ← Open positions
│   ├── equity/route.ts                 ← Equity curve points
│   └── trades/route.ts                 ← Trade journal + stats
├── app/edgar-scalper/page.tsx          ← Matrix-styled dashboard page
├── components/edgar-scalper/
│   ├── BotStatus.tsx                   ← Alive/offline, mode, heartbeat
│   ├── EquityStrip.tsx                 ← NAV, Daily P&L, Win Rate, PF
│   ├── OpenPositions.tsx               ← Live positions
│   ├── SignalFeed.tsx                  ← Scrolling signal log
│   ├── EquityCurve.tsx                 ← SVG equity line, 7d
│   └── TradeJournal.tsx                ← Last 20 closed trades
├── edgar-scalper/                      ← Python bot (standalone, VPS-ready)
│   ├── requirements.txt
│   ├── config.py                       ← Universe, strategy params
│   ├── data_fetcher.py                 ← Yahoo Finance
│   ├── indicators.py                   ← BB + RSI + MACD + ATR (pure numpy)
│   ├── signal_engine.py                ← Scan logic + confidence
│   ├── journal.py                      ← Supabase writes (service-role)
│   ├── paper_executor.py               ← Dry-run trades
│   ├── oanda_executor.py               ← Live trades (stubbed until OANDA)
│   ├── scheduler.py                    ← Main loop (every 5m)
│   ├── backtest.py                     ← Historical sim + stats
│   ├── Dockerfile
│   └── .env.example
└── scripts/install.sh                  ← Copies everything into your repo
```

---

## Install

```bash
cd ~/Downloads/oren-dashboard
bash /path/to/edgar-bundle/scripts/install.sh
```

The script:
- copies all Next.js files into the right paths
- copies the Python bot into `edgar-scalper/`
- installs `@supabase/supabase-js` if missing

---

## Then do these 5 things:

### 1) Supabase schema

In Supabase SQL Editor → paste **`lib/sql/edgar_scalper.sql`** → Run.

Verifies: 4 tables created (`edgar_signals`, `edgar_trades`, `edgar_equity`, `edgar_bot_status`), 1 row in `edgar_bot_status`.

### 2) Vercel env vars

Add in Vercel → Settings → Environment Variables:

| Name | Value | Where to get it |
|------|-------|-----------------|
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Supabase → Project Settings → API → **service_role** key |

(The Next.js API routes use the service-role key so they can bypass RLS and read everything. Don't expose this key in `NEXT_PUBLIC_`.)

### 3) Dashboard patch — add the EDGAR SCALPER module

Open `app/dashboard/page.tsx`. Find the modules grid. Add a new module card for Edgar Scalper, admin-only, like you did for RADAR AI:

```tsx
// in the modules grid, next to RADAR AI (module 03)
{role === 'admin' ? (
  <a href="/edgar-scalper" style={moduleCardStyle}>
    <div>09</div>
    <div>EDGAR SCALPER</div>
    <div>XAU + FX trend scalper · paper mode</div>
  </a>
) : (
  <div style={{ ...moduleCardStyle, opacity: 0.3, cursor: 'not-allowed' }}>
    <div>09 🔒</div>
    <div>EDGAR SCALPER</div>
  </div>
)}
```

(Match whatever style/layout your existing module cards use — this is just the pattern.)

### 4) Commit + push

```bash
git add -A
git commit -m "edgar-scalper: dashboard page + API + python bot (paper mode)"
git push
```

Vercel auto-deploys. Within ~2 min the `/edgar-scalper` page is live, showing "BOT OFFLINE" (correct — the Python bot isn't running yet).

### 5) Start the Python bot (choose one path)

**Locally on your Mac** (while you're developing):

```bash
cd edgar-scalper
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
python scheduler.py
```

Within 1 minute `/edgar-scalper` goes "BOT LIVE". Signals start landing when markets move.

**On a VPS** (for 24/7 — do this once OANDA account is verified and you flip to live):

```bash
# on the VPS
docker build -t edgar-scalper .
docker run -d --name edgar --env-file .env --restart unless-stopped edgar-scalper
```

---

## Testing the strategy (before trusting a single trade)

```bash
cd edgar-scalper
source .venv/bin/activate
python backtest.py --days 60
# or just gold:
python backtest.py "XAU/USD" --days 60
```

Outputs per-symbol and combined stats. You want to see:
- **win_rate** ≥ 0.45
- **profit_factor** ≥ 1.4
- **max_dd** not catastrophic

If stats are bad, we tune `config.py` (BB/RSI/MACD params, SL/TP ratio) **before** going live.

---

## Going live later (when OANDA is verified)

1. Set in `.env`:
   ```
   MODE=live
   OANDA_API_TOKEN=<token>
   OANDA_ACCOUNT_ID=<account>
   OANDA_ENVIRONMENT=practice
   ```
2. Restart container.
3. Signals now hit `oanda_executor.py` → real orders with SL/TP attached.

Start with `OANDA_ENVIRONMENT=practice` for 2-3 weeks. Only then flip to `live`.

---

## Safety

- All trades written to Supabase first → audit trail
- Max positions, daily loss stop, per-trade risk cap in `config.py`
- Mikha locked out by RLS + role check on dashboard page
- Service-role key only in Vercel + VPS `.env`, never in repo
