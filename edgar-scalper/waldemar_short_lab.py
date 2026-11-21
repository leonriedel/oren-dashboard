"""
WALDEMAR · SHORT LAB — which short strategies actually make money? (Capital.com CFDs, costs included)

  docker compose run --rm --no-deps edgar python waldemar_short_lab.py          # on the server
  docker compose run --rm --no-deps edgar python waldemar_short_lab.py 10000    # different capital

PART A · DAILY  — 30 stocks + index proxies (SPY=US500, QQQ=US100, IWM=US2000), 2 years
  10 short families, each traded as a portfolio (max 5 shorts, equal size), signal at close → fill next open.
PART B · HOURLY — Gold, EUR/USD, USD/JPY, 2 years, 5 short families, one position per market.

Costs: spread per round trip + overnight funding on shorts. Every row also gets the robustness test:
  ✓ = profitable in BOTH halves, still profitable with 2× costs, profit factor > 1.2.
Data is cached in deploy/state (first run ~12 min because of the free data plan, then seconds).
"""
from __future__ import annotations
import os
import pickle
import sys
import time
from datetime import date, timedelta

import numpy as np
import pandas as pd
import requests

KEY = os.getenv("POLYGON_API_KEY") or os.getenv("MASSIVE_API_KEY") or ""
CAPITAL = float(sys.argv[1]) if len(sys.argv) > 1 else 10000.0
STATE_DIR = os.path.dirname(os.getenv("EDGAR_STATE_FILE", "")) or os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(STATE_DIR, "waldemar_cache.pkl")

STOCKS = ["NEM", "AEM", "WPM", "FCX", "XOM", "CCJ", "NVDA", "AMD", "AVGO", "TSM", "MSFT", "AMZN", "META", "GOOGL",
          "AAPL", "NFLX", "ORCL", "PLTR", "UBER", "SHOP", "CRWD", "ANET", "MU", "LRCX", "VRT", "CAT", "GE", "JPM", "LLY", "COST"]
INDEXES = ["SPY", "QQQ", "IWM"]
FX = [("GOLD", "C:XAUUSD", 0.40), ("EUR/USD", "C:EURUSD", 0.00006), ("USD/JPY", "C:USDJPY", 0.007)]

STOCK_COST = 0.0012     # round trip spread on share CFDs ≈ 0.12 %
INDEX_COST = 0.0004     # index CFDs ≈ 0.04 %
FUND_DAY = 0.0001       # overnight funding on a short ≈ 0.01 % per night (conservative)
MAX_POS = 5


# ═══ data ═══
def get(url: str) -> dict:
    for _ in range(5):
        r = requests.get(url, timeout=30)
        if r.status_code == 429:
            time.sleep(20); continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError("rate limited")


def aggs(ticker: str, mult: int, span: str, days: int, chunk: int) -> pd.DataFrame:
    end, out = date.today(), []
    start = end - timedelta(days=days)
    while start < end:
        stop = min(start + timedelta(days=chunk), end)
        j = get(f"https://api.polygon.io/v2/aggs/ticker/{ticker}/range/{mult}/{span}/{start}/{stop}?adjusted=true&sort=asc&limit=50000&apiKey={KEY}")
        out += j.get("results") or []
        start = stop + timedelta(days=1)
        time.sleep(12.5)
    if not out:
        raise RuntimeError(f"no data for {ticker}")
    df = pd.DataFrame(out)
    df.index = pd.to_datetime(df["t"], unit="ms", utc=True)
    df = df.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close", "v": "volume"})
    df = df[["open", "high", "low", "close", "volume"]].sort_index()
    return df[~df.index.duplicated()]


def load() -> dict:
    if os.path.exists(CACHE):
        with open(CACHE, "rb") as f:
            c = pickle.load(f)
        if c.get("day") == date.today().isoformat():
            return c
    print(f"loading 2 years of data from Massive (free plan pacing, ~12 min, cached afterwards in {CACHE}) …")
    c = {"day": date.today().isoformat(), "daily": {}, "hourly": {}}
    for s in STOCKS + INDEXES:
        try:
            df = aggs(s, 1, "day", 730, 800)
            df.index = df.index.tz_convert("America/New_York").normalize().tz_localize(None)
            c["daily"][s] = df
            print(f"  {s}: {len(df)} days")
        except Exception as e:
            print(f"  {s}: {e}")
    for name, tick, _ in FX:
        try:
            c["hourly"][name] = aggs(tick, 1, "hour", 730, 180)
            print(f"  {name}: {len(c['hourly'][name])} hours")
        except Exception as e:
            print(f"  {name}: {e}")
    with open(CACHE, "wb") as f:
        pickle.dump(c, f)
    return c


# ═══ indicators ═══
def rsi(c: pd.Series, n: int) -> pd.Series:
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def prep(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    c, o, h, l = d["close"], d["open"], d["high"], d["low"]
    for n in (5, 10, 20, 50, 200):
        d[f"ma{n}"] = c.rolling(n).mean()
    sd = c.rolling(20).std(ddof=0)
    d["bb_hi"], d["bb_lo"] = d["ma20"] + 2 * sd, d["ma20"] - 2 * sd
    d["rsi2"], d["rsi14"] = rsi(c, 2), rsi(c, 14)
    pc = c.shift(1)
    tr = pd.concat([h - l, (h - pc).abs(), (l - pc).abs()], axis=1).max(axis=1)
    d["atr"] = tr.rolling(14).mean()
    d["hh20"], d["ll20"] = h.shift(1).rolling(20).max(), l.shift(1).rolling(20).min()
    d["up3"] = (c > pc) & (pc > c.shift(2)) & (c.shift(2) > c.shift(3))
    d["down_trend"] = (c < d["ma200"]) & (d["ma50"] < d["ma200"])
    d["engulf"] = (c < o) & (o >= pc) & (c <= o.shift(1)) & (pc > o.shift(1))       # bearish engulfing
    d["gap_fade"] = (o > pc * 1.02) & (c < o)                                       # gap up ≥2% that closes red
    d["bull_trap"] = (h.shift(1) > d["hh20"].shift(1)) & (c < d["hh20"].shift(1)) & (c < o)   # broke out yesterday, back below today
    d["ret126"] = c / c.shift(126) - 1
    return d


# ═══ PART A · daily short strategies ═══
DAILY = {
    "Bollinger fade in downtrend (mirror Edgar)": dict(
        entry=lambda d: d["down_trend"] & (d["close"] > d["bb_hi"]),
        rank=lambda d: -(d["close"] - d["bb_hi"]) / d["close"],
        exit=lambda r, e, n: r["close"] < r["ma10"] or n >= 12),
    "RSI2 > 90 in downtrend (Connors short)": dict(
        entry=lambda d: (d["close"] < d["ma200"]) & (d["rsi2"] > 90),
        rank=lambda d: -d["rsi2"],
        exit=lambda r, e, n: r["close"] < r["ma5"] or n >= 10),
    "3 up days in downtrend": dict(
        entry=lambda d: (d["close"] < d["ma200"]) & d["up3"],
        rank=lambda d: -d["rsi2"],
        exit=lambda r, e, n: r["close"] < r["ma5"] or n >= 8),
    "Failed rally at MA50 (lower high)": dict(
        entry=lambda d: d["down_trend"] & (d["high"] >= d["ma50"]) & (d["close"] < d["ma50"]) & (d["close"] < d["open"]),
        rank=lambda d: -d["rsi14"],
        exit=lambda r, e, n: r["close"] < r["ma20"] - r["atr"] or r["close"] > e + 2 * r["atr"] or n >= 20),
    "Bearish engulfing in downtrend": dict(
        entry=lambda d: d["down_trend"] & d["engulf"],
        rank=lambda d: -d["rsi14"],
        exit=lambda r, e, n: r["close"] < r["ma10"] or r["close"] > e + 2 * r["atr"] or n >= 10),
    "Bull trap (failed 20-day breakout)": dict(
        entry=lambda d: d["bull_trap"],
        rank=lambda d: -d["rsi14"],
        exit=lambda r, e, n: r["close"] < r["ma20"] or r["close"] > e + 2 * r["atr"] or n >= 10),
    "Gap-up fade (≥2% gap closing red)": dict(
        entry=lambda d: d["gap_fade"] & (d["close"] < d["ma50"]),
        rank=lambda d: -(d["open"] / d["close"].shift(1)),
        exit=lambda r, e, n: n >= 3),
    "Exhaustion: >3 ATR above MA20": dict(
        entry=lambda d: (d["close"] > d["ma20"] + 3 * d["atr"]) & (d["rsi14"] > 75),
        rank=lambda d: -(d["close"] - d["ma20"]) / d["atr"],
        exit=lambda r, e, n: r["close"] < r["ma10"] or r["close"] > e + 2 * r["atr"] or n >= 10),
    "20-day breakdown below MA200": dict(
        entry=lambda d: (d["close"] < d["ll20"]) & (d["close"] < d["ma200"]),
        rank=lambda d: d["close"] / d["ma200"],
        exit=lambda r, e, n: r["close"] > r["ma20"] or n >= 30),
}


def sim_daily(data: dict, spec: dict, capital: float, dates: list, cost: dict, mult: float = 1.0):
    sig = {s: spec["entry"](d).fillna(False) for s, d in data.items()}
    rnk = {s: spec["rank"](d) for s, d in data.items()}
    realized, pos, trades, curve = 0.0, {}, [], []
    for i, day in enumerate(dates[:-1]):
        nxt = dates[i + 1]
        for s in list(pos):
            d = data[s]
            if day not in d.index:
                continue
            p = pos[s]; p["n"] += 1
            if spec["exit"](d.loc[day], p["entry"], p["n"]) and nxt in d.index:
                px = d.loc[nxt, "open"]
                ret = (p["entry"] - px) / p["entry"] - cost[s] * mult - FUND_DAY * mult * p["n"]
                realized += p["notional"] * ret
                trades.append({"sym": s, "day": p["day"], "ret": ret})
                del pos[s]
        unreal = sum(p["notional"] * (p["entry"] - data[s].loc[:day, "close"].iloc[-1]) / p["entry"] for s, p in pos.items())
        equity = capital + realized + unreal
        curve.append(equity)
        slots = MAX_POS - len(pos)
        if slots <= 0:
            continue
        cands = [(rnk[s].get(day, np.inf), s) for s in data if s not in pos and day in sig[s].index and bool(sig[s].get(day, False)) and nxt in data[s].index]
        for _, s in sorted(cands)[:slots]:
            pos[s] = {"entry": data[s].loc[nxt, "open"], "notional": equity / MAX_POS, "n": 0, "day": nxt}
    return pd.Series(curve, index=dates[:len(curve)]), trades


def momentum_short(data: dict, capital: float, dates: list, cost: dict, mult: float = 1.0, top: int = 3):
    realized, pos, curve, trades, month = 0.0, {}, [], [], None
    for i, day in enumerate(dates[:-1]):
        nxt = dates[i + 1]
        unreal = sum(p["notional"] * (p["entry"] - data[s].loc[:day, "close"].iloc[-1]) / p["entry"] for s, p in pos.items())
        equity = capital + realized + unreal
        curve.append(equity)
        if day.month == month:
            continue
        month = day.month
        sc = []
        for s, d in data.items():
            h = d.loc[:day]
            if len(h) >= 130 and h["close"].iloc[-1] < h["ma200"].iloc[-1]:
                sc.append((h["ret126"].iloc[-1], s))
        want = [s for _, s in sorted(sc)[:top]]
        for s in list(pos):
            if s not in want and nxt in data[s].index:
                p = pos.pop(s); px = data[s].loc[nxt, "open"]
                days = max((nxt - p["day"]).days, 1)
                ret = (p["entry"] - px) / p["entry"] - cost[s] * mult - FUND_DAY * mult * days
                realized += p["notional"] * ret; trades.append({"sym": s, "day": p["day"], "ret": ret})
        for s in want:
            if s not in pos and nxt in data[s].index:
                pos[s] = {"entry": data[s].loc[nxt, "open"], "notional": equity / top, "day": nxt}
    return pd.Series(curve, index=dates[:len(curve)]), trades


def stats(eq: pd.Series, trades: list, capital: float) -> dict:
    half = len(eq) // 2
    r = [t["ret"] for t in trades]
    w, l = sum(x for x in r if x > 0), -sum(x for x in r if x < 0)
    return dict(ret=eq.iloc[-1] / capital - 1, dd=(eq / eq.cummax() - 1).min(), h1=eq.iloc[half - 1] / eq.iloc[0] - 1,
                h2=eq.iloc[-1] / eq.iloc[half] - 1, n=len(r), win=(np.mean([x > 0 for x in r]) if r else 0),
                avg=(np.mean(r) if r else 0), pf=(w / l if l else 0))


def part_a(c: dict):
    raw = c["daily"]
    if "SPY" not in raw:
        print("PART A skipped — no SPY data"); return
    universes = {
        "STOCKS": {s: prep(raw[s]) for s in STOCKS if s in raw},
        "INDEXES": {s: prep(raw[s]) for s in INDEXES if s in raw},
    }
    spy = prep(raw["SPY"])
    dates = [d for d in spy.index if not pd.isna(spy.loc[d, "ma200"])]
    spy_ret = spy.loc[dates[-1], "close"] / spy.loc[dates[0], "close"] - 1
    print(f"\n═══ PART A · DAILY SHORTS · {str(dates[0])[:10]} → {str(dates[-1])[:10]} ({len(dates)} days) · ${CAPITAL:,.0f} · max {MAX_POS} shorts")
    print(f"S&P 500 in this period: {spy_ret * 100:+.1f}% (a short strategy is fighting this headwind)\n")
    hdr = f"{'strategy':44} {'univ':>7} {'return':>8} {'maxDD':>7} {'1st½':>7} {'2nd½':>7} {'2×cost':>7} {'trades':>6} {'win':>5} {'avg':>7} {'PF':>5}"
    print(hdr); print("─" * len(hdr))
    rows = []
    for uname, data in universes.items():
        if not data:
            continue
        cost = {s: (INDEX_COST if s in INDEXES else STOCK_COST) for s in data}
        tests = [(n, lambda m, sp=sp, data=data, cost=cost: sim_daily(data, sp, CAPITAL, dates, cost, m)) for n, sp in DAILY.items()]
        if uname == "STOCKS":
            tests.append(("Momentum short: 3 weakest, monthly", lambda m, data=data, cost=cost: momentum_short(data, CAPITAL, dates, cost, m)))
        for name, fn in tests:
            eq, tr = fn(1.0)
            eq2, _ = fn(2.0)
            s = stats(eq, tr, CAPITAL)
            s["ret2"] = eq2.iloc[-1] / CAPITAL - 1
            rows.append((name, uname, s))
    rows.sort(key=lambda r: r[2]["ret"], reverse=True)
    for name, u, s in rows:
        ok = "✓" if s["h1"] > 0 and s["h2"] > 0 and s["ret2"] > 0 and s["pf"] > 1.2 else " "
        print(f"{name:44} {u:>7} {s['ret'] * 100:+7.1f}% {s['dd'] * 100:6.1f}% {s['h1'] * 100:+6.1f}% {s['h2'] * 100:+6.1f}% {s['ret2'] * 100:+6.1f}% "
              f"{s['n']:6d} {s['win'] * 100:4.0f}% {s['avg'] * 100:+6.2f}% {s['pf']:5.2f} {ok}")


# ═══ PART B · hourly short strategies (one position per market) ═══
HOURLY = {
    "BB upper fade, 1h downtrend": (lambda d: d["down_trend"] & (d["close"] > d["bb_hi"]), lambda r, e, n: r["close"] < r["ma20"] or r["close"] > e + 2 * r["atr"] or n >= 24),
    "RSI2 > 95 below MA200": (lambda d: (d["close"] < d["ma200"]) & (d["rsi2"] > 95), lambda r, e, n: r["close"] < r["ma5"] or r["close"] > e + 2 * r["atr"] or n >= 12),
    "Bull trap (failed 20h breakout)": (lambda d: d["bull_trap"], lambda r, e, n: r["close"] < r["ma20"] or r["close"] > e + 1.5 * r["atr"] or n >= 12),
    "Exhaustion >3 ATR above MA20": (lambda d: (d["close"] > d["ma20"] + 3 * d["atr"]) & (d["rsi14"] > 75), lambda r, e, n: r["close"] < r["ma10"] or r["close"] > e + 2 * r["atr"] or n >= 12),
    "Breakdown below 20h low, downtrend": (lambda d: d["down_trend"] & (d["close"] < d["ll20"]), lambda r, e, n: r["close"] > r["ma20"] or n >= 24),
}


def sim_hourly(d: pd.DataFrame, entry, exit_, spread: float, mult: float):
    sig = entry(d).fillna(False).values
    o, idx = d["open"].values, d.index
    rows = d.to_dict("records")
    trades, pos = [], None
    for i in range(len(d) - 1):
        if pos:
            pos["n"] += 1
            if exit_(rows[i], pos["entry"], pos["n"]):
                px = o[i + 1]
                nights = max((idx[i + 1] - pos["ts"]).days, 0)
                ret = (pos["entry"] - px - spread * mult) / pos["entry"] - FUND_DAY * mult * nights
                trades.append({"ts": pos["ts"], "ret": ret}); pos = None
            continue
        if sig[i]:
            pos = {"entry": o[i + 1], "ts": idx[i + 1], "n": 0}
    return trades


def part_b(c: dict):
    if not c["hourly"]:
        print("\nPART B skipped — no hourly data"); return
    print(f"\n═══ PART B · HOURLY SHORTS · Gold / EUR/USD / USD/JPY · 2 years · one position per market")
    print("returns = sum of per-trade % moves (≈ account % at 1× exposure per trade)\n")
    hdr = f"{'strategy':36} {'market':>8} {'trades':>6} {'win':>5} {'PF':>5} {'avg':>7} {'total':>8} {'1st½':>7} {'2nd½':>7} {'2×cost':>7}"
    print(hdr); print("─" * len(hdr))
    for name, (en, ex) in HOURLY.items():
        for mname, _, spread in FX:
            if mname not in c["hourly"]:
                continue
            d = prep(c["hourly"][mname])
            mid = d.index[0] + (d.index[-1] - d.index[0]) / 2
            t = sim_hourly(d, en, ex, spread, 1.0)
            t2 = sim_hourly(d, en, ex, spread, 2.0)
            if not t:
                print(f"{name:36} {mname:>8}  no trades"); continue
            r = [x["ret"] for x in t]
            w, l = sum(x for x in r if x > 0), -sum(x for x in r if x < 0)
            h1, h2 = sum(x["ret"] for x in t if x["ts"] < mid), sum(x["ret"] for x in t if x["ts"] >= mid)
            tot2 = sum(x["ret"] for x in t2)
            pf = w / l if l else 0
            ok = "✓" if h1 > 0 and h2 > 0 and tot2 > 0 and pf > 1.2 else " "
            print(f"{name:36} {mname:>8} {len(r):6d} {np.mean([x > 0 for x in r]) * 100:4.0f}% {pf:5.2f} {np.mean(r) * 100:+6.3f}% "
                  f"{sum(r) * 100:+7.1f}% {h1 * 100:+6.1f}% {h2 * 100:+6.1f}% {tot2 * 100:+6.1f}% {ok}")


def main():
    if not KEY:
        sys.exit("POLYGON_API_KEY missing")
    c = load()
    part_a(c)
    part_b(c)
    print("\n✓ = profitable in both halves, still profitable with 2× costs, PF > 1.2.")
    print("Note: the 30 stocks were picked because they went UP (survivorship) — that biases stock shorts DOWN; indexes are the fair test.")


if __name__ == "__main__":
    main()
