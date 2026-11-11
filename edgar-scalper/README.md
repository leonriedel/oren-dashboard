# Edgar Scalper

Mean-reversion scalper on XAU + majors (EUR/USD, GBP/USD, USD/JPY).
Signals from Yahoo Finance candles; execution via OANDA practice/live (or paper to Supabase).

## Local dev

```bash
cd edgar-scalper
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # fill in Supabase keys
python scheduler.py     # starts the loop
```

## Backtest

```bash
python backtest.py --days 60                 # all symbols
python backtest.py "XAU/USD" --days 60       # just gold
```

## Deploy to VPS (Hetzner / DO / Fly)

```bash
docker build -t edgar-scalper .
docker run -d \
  --name edgar \
  --env-file .env \
  --restart unless-stopped \
  edgar-scalper
```

## Flow

```
scheduler ─→ fetch Yahoo candles (every 5m)
          ─→ check SL/TP on open paper trades → close hits
          ─→ signal_engine.scan() on each symbol
             ├ cooldown? skip
             ├ confidence < threshold? skip
             └ otherwise log signal + open paper/live trade
          ─→ every 60m: snapshot NAV → equity_curve
```

## Switch to live

1. OANDA practice/live account verified
2. API token + account id in `.env`
3. Flip `MODE=live`
4. Restart container

That's it — same code path, only `oanda_executor` replaces `paper_executor`.
