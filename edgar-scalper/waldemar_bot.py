"""
WALDEMAR · crypto trend bot (long-only, real coins, daily)

Rule (winner of waldemar_final_lab.py): for BTC and ETH — hold the coin while its daily close is above its
50-day moving average, otherwise hold euros. Checked once a day after the daily candle closes (00:00 UTC).
Each coin gets half of Waldemar's capital.

  docker compose up -d waldemar               # runs forever on the server
  docker compose run --rm waldemar python waldemar_bot.py --once     # one cycle now (test)

.env (server):
  WALDEMAR_EXCHANGE     bitvavo (default) | kraken
  WALDEMAR_API_KEY      API key  → create it with TRADE + VIEW rights only, NEVER withdrawal rights
  WALDEMAR_API_SECRET   API secret
  WALDEMAR_LIVE         "true" = real orders, anything else = dry run (logs what it would do)
  WALDEMAR_BUDGET_EUR   optional cap on the capital Waldemar may use (default: whole account)
  WALDEMAR_MA           moving average length (default 50)
"""
from __future__ import annotations
import json
import os
import sys
import time
from datetime import datetime, timezone

import ccxt

EXCHANGE = os.getenv("WALDEMAR_EXCHANGE", "bitvavo").lower()
KEY, SECRET = os.getenv("WALDEMAR_API_KEY", ""), os.getenv("WALDEMAR_API_SECRET", "")
LIVE = os.getenv("WALDEMAR_LIVE", "false").lower() == "true"
BUDGET = float(os.getenv("WALDEMAR_BUDGET_EUR", "0") or 0)
MA = int(os.getenv("WALDEMAR_MA", "50"))
PAIRS = ["BTC/EUR", "ETH/EUR"]
MIN_ORDER_EUR = 10.0
REBALANCE_BAND = 0.15          # only top up a held coin if it is >15 % below its target (avoids tiny trades)
RUN_AFTER_UTC = (0, 10)        # daily cycle after 00:10 UTC (= 08:10 Bali)
STATE_DIR = os.path.dirname(os.getenv("EDGAR_STATE_FILE", "")) or os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(STATE_DIR, "waldemar_state.json")


def log(msg: str) -> None:
    print(f"[waldemar {datetime.now(timezone.utc):%Y-%m-%d %H:%M}Z] {msg}", flush=True)


def load_state() -> dict:
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {"last_cycle": None, "history": []}


def save_state(s: dict) -> None:
    s["history"] = s.get("history", [])[-400:]
    with open(STATE_FILE, "w") as f:
        json.dump(s, f, indent=2)


def exchange():
    cls = getattr(ccxt, EXCHANGE)
    ex = cls({"apiKey": KEY, "secret": SECRET, "enableRateLimit": True})
    ex.load_markets()
    return ex


def signal(ex, pair: str) -> tuple[bool, float, float]:
    """(above_ma, last_close, ma) on CLOSED daily candles only."""
    candles = ex.fetch_ohlcv(pair, "1d", limit=MA + 30)
    today = datetime.now(timezone.utc).date()
    closed = [c for c in candles if datetime.fromtimestamp(c[0] / 1000, timezone.utc).date() < today]
    if len(closed) < MA:
        raise RuntimeError(f"{pair}: only {len(closed)} closed daily candles")
    closes = [c[4] for c in closed]
    ma = sum(closes[-MA:]) / MA
    return closes[-1] > ma, closes[-1], ma


def cycle(ex, state: dict) -> None:
    bal = ex.fetch_balance()
    prices = {p: ex.fetch_ticker(p)["last"] for p in PAIRS}
    eur = float(bal.get("EUR", {}).get("free") or 0)
    coins = {p: float(bal.get(p.split("/")[0], {}).get("total") or 0) for p in PAIRS}
    equity = eur + sum(coins[p] * prices[p] for p in PAIRS)
    capital = min(equity, BUDGET) if BUDGET > 0 else equity
    target = capital / len(PAIRS)
    log(f"{'LIVE' if LIVE else 'DRY-RUN'} · {EXCHANGE} · equity €{equity:,.2f} · capital used €{capital:,.2f} · €{eur:,.2f} free")
    record = {"ts": datetime.now(timezone.utc).isoformat(), "equity": round(equity, 2), "pairs": {}}

    for p in PAIRS:
        base = p.split("/")[0]
        up, close, ma = signal(ex, p)
        value = coins[p] * prices[p]
        state_txt = f"{p}: close {close:,.2f} {'>' if up else '≤'} MA{MA} {ma:,.2f} → {'HOLD COIN' if up else 'HOLD EUR'} · holding €{value:,.2f}"
        action = "none"
        if up and value < target * (1 - REBALANCE_BAND):
            spend = min(target - value, eur * 0.995)
            if spend >= MIN_ORDER_EUR:
                amount = float(ex.amount_to_precision(p, spend / prices[p]))
                action = f"BUY {amount} {base} (≈€{spend:,.2f})"
                if LIVE and amount > 0:
                    ex.create_order(p, "market", "buy", amount)
                    eur -= spend
        elif not up and value >= MIN_ORDER_EUR:
            free = float(bal.get(base, {}).get("free") or 0)
            amount = float(ex.amount_to_precision(p, free))
            action = f"SELL {amount} {base} (≈€{amount * prices[p]:,.2f})"
            if LIVE and amount > 0:
                ex.create_order(p, "market", "sell", amount)
        log(f"{state_txt} · {action}")
        record["pairs"][p] = {"close": close, "ma": ma, "up": up, "value": round(value, 2), "action": action}
    state.setdefault("history", []).append(record)


def due(state: dict) -> bool:
    now = datetime.now(timezone.utc)
    return (now.hour, now.minute) >= RUN_AFTER_UTC and state.get("last_cycle") != now.date().isoformat()


def main() -> None:
    log(f"start · exchange {EXCHANGE} · pairs {', '.join(PAIRS)} · MA{MA} · {'LIVE' if LIVE else 'DRY-RUN'}"
        + (f" · budget €{BUDGET:,.0f}" if BUDGET else ""))
    if not KEY or not SECRET:
        log("WALDEMAR_API_KEY / WALDEMAR_API_SECRET missing in .env"); sys.exit(1)
    once = "--once" in sys.argv
    while True:
        state = load_state()
        try:
            if once or due(state):
                ex = exchange()
                cycle(ex, state)
                state["last_cycle"] = datetime.now(timezone.utc).date().isoformat()
                save_state(state)
        except Exception as e:
            log(f"error: {e}")
        if once:
            return
        time.sleep(15 * 60)


if __name__ == "__main__":
    main()
