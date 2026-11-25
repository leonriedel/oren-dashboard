"""
WALDEMAR · PLUS LAB — (A) can Waldemar get more robust?  (B) does a short-term crypto bot (1h / 4h, long & short) work?

  docker compose run --rm waldemar python waldemar_plus_lab.py

A · DAILY, BTC + ETH 50/50, real coins on Bitvavo (no shorting possible there)
    current Waldemar (MA50) vs. multi-trend ensemble (MA20/50/100/200, partial positions)
    vs. volatility-targeted sizing, each with taker fees (0.25 %) and maker fees (0.15 %) per side.
B · INTRADAY 1h and 4h, BTC + ETH, ~2 years of Bitvavo candles
    long-only on real coins (Bitvavo fees) and long/short as CFD (0.10 % spread per side + funding 0.05 %/day).

Execution model: signal on a bar's close → position held from that close to the next.
✓ = profitable in both halves AND still profitable with 2× costs.
"""
from __future__ import annotations
import os
import pickle
import time
from datetime import date

import numpy as np
import pandas as pd

import waldemar_crypto_lab as C
import waldemar_short_lab as W

CACHE = os.path.join(W.STATE_DIR, "waldemar_plus_cache.pkl")
PAIRS = {"BTC": "BTC/EUR", "ETH": "ETH/EUR"}
TAKER, MAKER = 0.0025, 0.0015          # Bitvavo, per side
CFD_SPREAD, CFD_FUND_DAY = 0.0010, 0.0005


# ═══ data ═══
def bitvavo_candles(pair: str, tf: str, days: int) -> pd.DataFrame:
    import ccxt
    ex = ccxt.bitvavo({"enableRateLimit": True})
    ms = {"1h": 3_600_000, "4h": 14_400_000}[tf]
    since = int((time.time() - days * 86400) * 1000)
    rows = []
    while True:
        batch = ex.fetch_ohlcv(pair, tf, since=since, limit=1440)
        if not batch:
            break
        rows += batch
        nxt = batch[-1][0] + ms
        if nxt >= time.time() * 1000 - ms or len(batch) < 2:
            break
        since = nxt
    df = pd.DataFrame(rows, columns=["t", "open", "high", "low", "close", "volume"]).drop_duplicates("t")
    df.index = pd.to_datetime(df["t"], unit="ms", utc=True)
    return df[["open", "high", "low", "close", "volume"]].sort_index()


def load() -> dict:
    if os.path.exists(CACHE):
        with open(CACHE, "rb") as f:
            c = pickle.load(f)
        if c.get("day") == date.today().isoformat():
            return c
    print("loading data (Yahoo daily since 2017, Bitvavo 1h/4h ~2 years) …")
    daily = C.load()
    c = {"day": date.today().isoformat(), "daily": {k: daily[f"{k}-USD"] for k in PAIRS if f"{k}-USD" in daily}, "intra": {}}
    for tf in ("4h", "1h"):
        for k, p in PAIRS.items():
            try:
                c["intra"][(k, tf)] = bitvavo_candles(p, tf, 730)
                print(f"  {k} {tf}: {len(c['intra'][(k, tf)]):,} bars")
            except Exception as e:
                print(f"  {k} {tf}: {e}")
    with open(CACHE, "wb") as f:
        pickle.dump(c, f)
    return c


# ═══ vectorised backtest ═══
def run(close: pd.Series, pos: pd.Series, fee_side: float, fund_day: float = 0.0, bars_per_day: float = 1.0, mult: float = 1.0) -> pd.Series:
    """pos ∈ [-1, 1] decided at each bar's close, held to the next close. Returns the equity curve (start 1.0)."""
    ret = close.pct_change().fillna(0)
    held = pos.shift(1).fillna(0)
    turnover = pos.diff().abs().fillna(pos.abs())
    cost = turnover * fee_side * mult + held.abs() * fund_day * mult / bars_per_day
    return (1 + held * ret - cost.shift(1).fillna(0)).cumprod()


def team(curves: list[pd.Series]) -> pd.Series:
    df = pd.concat(curves, axis=1).dropna()
    return df.div(df.iloc[0]).mean(axis=1)


def stats(eq: pd.Series, eq2: pd.Series, pos_list: list[pd.Series], bars_per_year: float) -> str:
    yrs = len(eq) / bars_per_year
    cagr = eq.iloc[-1] ** (1 / yrs) - 1 if eq.iloc[-1] > 0 else -1
    dd = (eq / eq.cummax() - 1).min()
    half = len(eq) // 2
    h1, h2 = eq.iloc[half - 1] / eq.iloc[0] - 1, eq.iloc[-1] / eq.iloc[half] - 1
    c2 = eq2.iloc[-1] / eq2.iloc[0] - 1
    trades = sum(p.diff().abs().gt(0).sum() for p in pos_list) / max(yrs, 1e-9) / len(pos_list)
    expo = np.mean([p.abs().mean() for p in pos_list])
    ok = "✓" if h1 > 0 and h2 > 0 and c2 > 0 else " "
    return (f"{eq.iloc[-1] - 1:+9.0%} {cagr:+7.1%} {dd:7.1%} {h1:+8.0%} {h2:+8.0%} {c2:+8.0%} {trades:7.0f} {expo:6.0%}  {ok}")


HDR = f"{'variant':52} {'total':>9} {'CAGR':>7} {'maxDD':>7} {'1st½':>8} {'2nd½':>8} {'2×cost':>8} {'trd/yr':>7} {'expo':>6}"


# ═══ A · daily robustness ═══
def ma_pos(c: pd.Series, n: int) -> pd.Series:
    return (c > c.rolling(n).mean()).astype(float).where(c.rolling(n).mean().notna(), 0.0)


def ensemble_pos(c: pd.Series) -> pd.Series:
    return sum(ma_pos(c, n) for n in (20, 50, 100, 200)) / 4


def vol_target(c: pd.Series, pos: pd.Series, target: float, per_year: float) -> pd.Series:
    vol = c.pct_change().rolling(30).std() * np.sqrt(per_year)
    scale = (target / vol).clip(upper=1.0).fillna(0)
    return (pos * scale).round(2)     # rounded to avoid tiny daily rebalancing


def part_a(c: dict):
    closes = {k: df["close"] for k, df in c["daily"].items()}
    print(f"\n═══ A · DAILY · BTC + ETH 50/50 · real coins (Bitvavo) · since {min(s.index[0] for s in closes.values()).date()}")
    print(HDR); print("─" * len(HDR))
    variants = {
        "Waldemar today (MA50)": lambda s: ma_pos(s, 50),
        "Ensemble MA20/50/100/200 (partial positions)": ensemble_pos,
        "MA50 + volatility target 60 %": lambda s: vol_target(s, ma_pos(s, 50), 0.60, 365),
        "Ensemble + volatility target 60 %": lambda s: vol_target(s, ensemble_pos(s), 0.60, 365),
        "Ensemble + volatility target 40 %": lambda s: vol_target(s, ensemble_pos(s), 0.40, 365),
    }
    for name, fn in variants.items():
        for fee_name, fee in (("taker", TAKER), ("maker", MAKER)):
            pos = {k: fn(s) for k, s in closes.items()}
            eq = team([run(closes[k], pos[k], fee) for k in closes])
            eq2 = team([run(closes[k], pos[k], fee, mult=2.0) for k in closes])
            print(f"{name + ' · ' + fee_name:52} " + stats(eq, eq2, list(pos.values()), 365))
    hold = team([run(s, pd.Series(1.0, index=s.index), TAKER) for s in closes.values()])
    print(f"{'buy & hold BTC+ETH':52} " + stats(hold, hold, [pd.Series(1.0, index=closes['BTC'].index)], 365))


# ═══ B · intraday ═══
def ema(s, n):
    return s.ewm(span=n, adjust=False).mean()


def intraday_rules(df: pd.DataFrame, short: bool) -> dict:
    c = df["close"]
    lo = 0 if not short else -1
    hh, ll = df["high"].shift(1).rolling(48).max(), df["low"].shift(1).rolling(48).min()
    rsi2 = C.W.rsi(c, 2)
    rules = {
        "EMA 20/50 trend": np.where(ema(c, 20) > ema(c, 50), 1, lo),
        "EMA 50/200 trend": np.where(ema(c, 50) > ema(c, 200), 1, lo),
        "48-bar breakout (Donchian)": None,
        "RSI2 mean reversion in trend": None,
    }
    # Donchian: enter on breakout, exit on opposite 24-bar channel
    pos, p = [], 0
    h24, l24 = df["high"].shift(1).rolling(24).max().values, df["low"].shift(1).rolling(24).min().values
    for i, x in enumerate(c.values):
        if x > hh.values[i]:
            p = 1
        elif short and x < ll.values[i]:
            p = -1
        elif p == 1 and x < l24[i]:
            p = 0
        elif p == -1 and x > h24[i]:
            p = 0
        pos.append(p)
    rules["48-bar breakout (Donchian)"] = np.array(pos)
    # RSI2: buy dips above EMA200, (short spikes below EMA200), exit when RSI2 normalises
    pos, p = [], 0
    e200 = ema(c, 200).values
    r = rsi2.values
    for i, x in enumerate(c.values):
        if p == 0 and x > e200[i] and r[i] < 10:
            p = 1
        elif p == 0 and short and x < e200[i] and r[i] > 90:
            p = -1
        elif p == 1 and r[i] > 60:
            p = 0
        elif p == -1 and r[i] < 40:
            p = 0
        pos.append(p)
    rules["RSI2 mean reversion in trend"] = np.array(pos)
    return {k: pd.Series(v, index=df.index).astype(float) for k, v in rules.items()}


def part_b(c: dict):
    for tf, per_day in (("4h", 6), ("1h", 24)):
        data = {k: c["intra"].get((k, tf)) for k in PAIRS}
        data = {k: v for k, v in data.items() if v is not None and len(v) > 500}
        if not data:
            print(f"\n{tf}: no data"); continue
        start = min(v.index[0] for v in data.values()).date()
        print(f"\n═══ B · {tf.upper()} · BTC + ETH 50/50 · since {start}")
        print(HDR); print("─" * len(HDR))
        for mode, short, fee, fund in (("long-only · real coins · taker", False, TAKER, 0.0),
                                       ("long-only · real coins · maker", False, MAKER, 0.0),
                                       ("long/short · CFD", True, CFD_SPREAD, CFD_FUND_DAY)):
            rules = {k: intraday_rules(df, short) for k, df in data.items()}
            for rname in next(iter(rules.values())):
                pos = {k: rules[k][rname] for k in data}
                eq = team([run(data[k]["close"], pos[k], fee, fund, per_day) for k in data])
                eq2 = team([run(data[k]["close"], pos[k], fee, fund, per_day, 2.0) for k in data])
                print(f"{rname + ' · ' + mode:52} " + stats(eq, eq2, list(pos.values()), 365 * per_day))
        hold = team([run(df["close"], pd.Series(1.0, index=df.index), TAKER) for df in data.values()])
        print(f"{'buy & hold BTC+ETH (same period)':52} " + stats(hold, hold, [pd.Series(1.0, index=next(iter(data.values())).index)], 365 * per_day))
        daily = {k: df["close"].resample("1D").last().dropna() for k, df in data.items()}
        pos = {k: ma_pos(s, 50) for k, s in daily.items()}
        wq = team([run(daily[k], pos[k], TAKER) for k in daily])
        print(f"{'Waldemar today (daily MA50) · same period':52} " + stats(wq, wq, list(pos.values()), 365))


def main():
    c = load()
    part_a(c)
    part_b(c)
    print("\n✓ = profitable in both halves and with 2× costs.  trd/yr = position changes per coin per year.  expo = average share invested.")
    print("Bitvavo is spot only — the long/short rows would need a CFD broker (e.g. Capital.com).")


if __name__ == "__main__":
    main()
