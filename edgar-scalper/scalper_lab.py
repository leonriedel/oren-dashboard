"""
EDGAR · SCALPER LAB — honest re-test of the Capital.com scalper (and a short-only "Waldemar")

  docker compose run --rm --no-deps edgar python scalper_lab.py          # on the server (has the Massive key)
  ~/edgar-venv/bin/python scalper_lab.py                                  # or on the OREN Mac

Same signals as the live scalper (signal_engine/backtest.py): 15-min bars, Bollinger(20,2) + RSI(14) extremes,
stop 1.5×ATR, target 3×ATR. Differences vs the old backtest.py:
  • 1 year of data from Massive instead of ~2 months
  • spread charged on every trade (typical Capital.com spreads, and a 2× stress case)
  • if stop AND target fall inside the same 15-min bar we count the STOP (the old test counted the target)
  • results in R (1R = the stop distance) → with 1% risk per trade, +10R ≈ +10% on the account
  • long and short shown separately; first vs second half of the year
"""
from __future__ import annotations
import os
import sys
import time
from datetime import date, timedelta

import pandas as pd
import requests

import config
import indicators

KEY = os.getenv("POLYGON_API_KEY") or os.getenv("MASSIVE_API_KEY") or ""
MARKETS = [  # (name, massive ticker, typical Capital.com spread in price units)
    ("GOLD", "C:XAUUSD", 0.40),
    ("EUR/USD", "C:EURUSD", 0.00006),
    ("USD/JPY", "C:USDJPY", 0.007),
]
DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 365


def bars(ticker: str, days: int) -> pd.DataFrame:
    end = date.today()
    out = []
    start = end - timedelta(days=days)
    while start < end:
        stop = min(start + timedelta(days=120), end)
        url = f"https://api.polygon.io/v2/aggs/ticker/{ticker}/range/15/minute/{start}/{stop}?adjusted=true&sort=asc&limit=50000&apiKey={KEY}"
        for _ in range(4):
            r = requests.get(url, timeout=30)
            if r.status_code == 429:
                time.sleep(20); continue
            break
        r.raise_for_status()
        out += r.json().get("results") or []
        start = stop + timedelta(days=1)
        time.sleep(13)  # free plan: 5 requests / minute
    if not out:
        raise RuntimeError(f"no data for {ticker}")
    df = pd.DataFrame(out)
    df.index = pd.to_datetime(df["t"], unit="ms", utc=True)
    df = df.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close", "v": "volume"})
    return df[["open", "high", "low", "close", "volume"]].sort_index().loc[lambda x: ~x.index.duplicated()]


def simulate(df: pd.DataFrame, spread: float) -> list[dict]:
    e = indicators.annotate(df, bb_period=config.BB_PERIOD, bb_std=config.BB_STD, rsi_period=config.RSI_PERIOD,
                            macd_fast=config.MACD_FAST, macd_slow=config.MACD_SLOW, macd_signal=config.MACD_SIGNAL,
                            atr_period=config.ATR_PERIOD).dropna()
    trades, pos, last = [], None, None
    for ts, bar in e.iterrows():
        if pos:
            long = pos["side"] == "LONG"
            hit_sl = bar["low"] <= pos["sl"] if long else bar["high"] >= pos["sl"]
            hit_tp = bar["high"] >= pos["tp"] if long else bar["low"] <= pos["tp"]
            if hit_sl or hit_tp:
                px = pos["sl"] if hit_sl else pos["tp"]          # both in one bar → assume the stop came first
                move = (px - pos["entry"]) if long else (pos["entry"] - px)
                trades.append({"ts": pos["ts"], "side": pos["side"], "R": (move - spread) / pos["risk"], "R_2x": (move - 2 * spread) / pos["risk"]})
                pos = None
            continue
        if last is not None and (ts - last).total_seconds() < 2 * 15 * 60:
            continue
        price, atr = float(bar["close"]), float(bar["atr"])
        if atr <= 0:
            continue
        if bar["close"] <= bar["bb_lower"] and bar["rsi"] <= config.RSI_OVERSOLD:
            pos = {"ts": ts, "side": "LONG", "entry": price, "sl": price - config.SL_ATR_MULT * atr, "tp": price + config.TP_ATR_MULT * atr, "risk": config.SL_ATR_MULT * atr}
            last = ts
        elif bar["close"] >= bar["bb_upper"] and bar["rsi"] >= config.RSI_OVERBOUGHT:
            pos = {"ts": ts, "side": "SHORT", "entry": price, "sl": price + config.SL_ATR_MULT * atr, "tp": price - config.TP_ATR_MULT * atr, "risk": config.SL_ATR_MULT * atr}
            last = ts
    return trades


def line(label: str, t: list[dict], mid) -> str:
    if not t:
        return f"{label:28} no trades"
    r = [x["R"] for x in t]
    w, l = sum(x for x in r if x > 0), -sum(x for x in r if x < 0)
    h1 = sum(x["R"] for x in t if x["ts"] < mid)
    h2 = sum(x["R"] for x in t if x["ts"] >= mid)
    r2 = sum(x["R_2x"] for x in t)
    ok = "✓" if h1 > 0 and h2 > 0 and r2 > 0 and (w / l if l else 9) > 1.2 else " "
    return (f"{label:28} {len(t):5d} {sum(1 for x in r if x > 0) / len(r) * 100:4.0f}% {(w / l if l else 0):5.2f} "
            f"{sum(r) / len(r):+6.3f} {sum(r):+8.1f} {h1:+7.1f} {h2:+7.1f} {r2:+8.1f}  {ok}")


def main():
    if not KEY:
        sys.exit("POLYGON_API_KEY missing in .env")
    print(f"\nSCALPER LAB · 15-min · BB({config.BB_PERIOD},{config.BB_STD}) + RSI({config.RSI_PERIOD}) {config.RSI_OVERSOLD}/{config.RSI_OVERBOUGHT} · "
          f"stop {config.SL_ATR_MULT}×ATR · target {config.TP_ATR_MULT}×ATR · last {DAYS} days · loading data (~1 min)…")
    hdr = f"{'market / side':28} {'trades':>5} {'win':>5} {'PF':>5} {'avg R':>6} {'total R':>8} {'1st½':>7} {'2nd½':>7} {'2×spread':>8}"
    rows, allt = [], []
    for name, tick, spread in MARKETS:
        try:
            df = bars(tick, DAYS)
        except Exception as e:
            rows.append(f"{name:28} data error: {e}")
            continue
        t = simulate(df, spread)
        mid = df.index[0] + (df.index[-1] - df.index[0]) / 2
        for x in t:
            x["mid"] = mid
        allt += t
        rows.append(f"{name}  ({len(df):,} bars, {str(df.index[0])[:10]} → {str(df.index[-1])[:10]}, spread {spread})")
        rows.append(line("  both directions", t, mid))
        rows.append(line("  LONG only", [x for x in t if x["side"] == "LONG"], mid))
        rows.append(line("  SHORT only (Waldemar)", [x for x in t if x["side"] == "SHORT"], mid))
    print("\n" + hdr + "\n" + "─" * len(hdr))
    for r in rows:
        print(r)
    if allt:
        mid = allt[0]["mid"]
        print("─" * len(hdr))
        print(line("ALL MARKETS", allt, mid))
        print(line("ALL · SHORT only", [x for x in allt if x["side"] == "SHORT"], mid))
    print("\nR = multiples of the stop distance after spread. With 1% risk per trade: total R ≈ % gain/loss on the account.")
    print("✓ = positive in both halves, still positive at 2× spread, PF > 1.2. Not included: slippage on stops, overnight funding.")


if __name__ == "__main__":
    main()
