"""
EDGAR · STRATEGY LAB — field study of strategy families on the same daily data (long-only, IBKR costs)

  ~/edgar-venv/bin/python strategy_lab.py            # capital 5000 USD
  ~/edgar-venv/bin/python strategy_lab.py 10000

Uses .bars_cache.pkl from swing_tune.py (downloads it if missing, ~7 min once).
Signals at the close → orders at the next open. Costs: $0.35/order minimum (IBKR tiered) + 0.05% slippage per side.
Every strategy is also scored on the first vs second half of the test period (consistency check).
"""
from __future__ import annotations
import sys

import numpy as np
import pandas as pd

import swing_tune

COMM_MIN, COMM_PER_SHARE, SLIP = 0.35, 0.0035, 0.0005
MAX_POS = 5


# ─── indicators ───
def rsi(c: pd.Series, n: int) -> pd.Series:
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def prep(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    c = d["close"]
    for n in (5, 10, 20, 50, 200):
        d[f"ma{n}"] = c.rolling(n).mean()
    sd = c.rolling(20).std(ddof=0)
    d["bb_lo"], d["bb_hi"] = d["ma20"] - 2 * sd, d["ma20"] + 2 * sd
    d["rsi2"], d["rsi14"] = rsi(c, 2), rsi(c, 14)
    pc = c.shift(1)
    tr = pd.concat([d["high"] - d["low"], (d["high"] - pc).abs(), (d["low"] - pc).abs()], axis=1).max(axis=1)
    d["atr"] = tr.rolling(14).mean()
    d["hh55"], d["ll20"] = c.shift(1).rolling(55).max(), c.shift(1).rolling(20).min()
    d["hh20"] = c.shift(1).rolling(20).max()
    d["ret1"] = c.pct_change()
    d["down3"] = (c < pc) & (pc < c.shift(2)) & (c.shift(2) < c.shift(3))
    return d


# ─── strategy definitions: entry(d) → bool Series, rank(d) → priority (lower = better), exit(d, i, entry_px, days) → bool ───
STRATS = {
    "RSI2 mean reversion (Connors)": dict(
        entry=lambda d: (d["close"] > d["ma200"]) & (d["rsi2"] < 10),
        rank=lambda d: d["rsi2"],
        exit=lambda r, e, n: r["close"] > r["ma5"] or n >= 10,
    ),
    "Bollinger bounce in uptrend": dict(
        entry=lambda d: (d["close"] > d["ma200"]) & (d["close"] < d["bb_lo"]),
        rank=lambda d: (d["close"] - d["bb_lo"]) / d["close"],
        exit=lambda r, e, n: r["close"] > r["ma20"] or n >= 12,
    ),
    "3 down days in uptrend": dict(
        entry=lambda d: (d["close"] > d["ma200"]) & d["down3"],
        rank=lambda d: d["rsi2"],
        exit=lambda r, e, n: r["close"] > r["ma5"] or n >= 8,
    ),
    "Pullback to MA20 (Edgar Swing-like)": dict(
        entry=lambda d: (d["close"] > d["ma50"]) & (d["ma50"] > d["ma200"]) & (d["low"] <= d["ma20"] * 1.015) & (d["close"] > d["high"].shift(1)) & d["rsi14"].between(40, 65),
        rank=lambda d: -d["rsi14"],
        exit=lambda r, e, n: r["close"] < r["ma20"] - 0.5 * r["atr"] or r["close"] < e - 2 * r["atr"] or n >= 40,
    ),
    "20-day breakout": dict(
        entry=lambda d: (d["close"] > d["hh20"]) & (d["close"] > d["ma200"]),
        rank=lambda d: -(d["close"] / d["ma200"]),
        exit=lambda r, e, n: r["close"] < r["ma20"] or n >= 40,
    ),
    "Donchian 55/20 trend (Turtle)": dict(
        entry=lambda d: (d["close"] > d["hh55"]) & (d["close"] > d["ma200"]),
        rank=lambda d: -(d["close"] / d["ma50"]),
        exit=lambda r, e, n: r["close"] < r["ll20"],
    ),
}


def commission(shares: int) -> float:
    return max(COMM_MIN, shares * COMM_PER_SHARE)


def simulate(data: dict, spy: pd.DataFrame, spec: dict, capital: float, market_filter: bool, dates: list):
    sig = {s: spec["entry"](d).fillna(False) for s, d in data.items()}
    rnk = {s: spec["rank"](d) for s, d in data.items()}
    cash, pos, trades, curve = capital, {}, [], []
    for i, day in enumerate(dates[:-1]):
        nxt = dates[i + 1]
        # exits decided at today's close → executed next open
        for s in list(pos):
            d = data[s]
            if day not in d.index:
                continue
            p = pos[s]
            p["n"] += 1
            if spec["exit"](d.loc[day], p["entry"], p["n"]) and nxt in d.index:
                px = d.loc[nxt, "open"] * (1 - SLIP)
                cash += p["sh"] * px - commission(p["sh"])
                trades.append({"sym": s, "in": p["day"], "out": nxt, "ret": px / p["entry"] - 1, "pnl": p["sh"] * (px - p["entry"]) - p["cost"] - commission(p["sh"])})
                del pos[s]
        equity = cash + sum(p["sh"] * data[s].loc[:day, "close"].iloc[-1] for s, p in pos.items())
        curve.append((day, equity))
        if market_filter and not (spy.loc[day, "close"] > spy.loc[day, "ma200"]):
            continue
        slots = MAX_POS - len(pos)
        if slots <= 0:
            continue
        cands = [(rnk[s].get(day, np.inf), s) for s in data if s not in pos and day in sig[s].index and bool(sig[s].get(day, False)) and nxt in data[s].index]
        for _, s in sorted(cands)[:slots]:
            px = data[s].loc[nxt, "open"] * (1 + SLIP)
            alloc = min(cash, equity / MAX_POS)
            sh = int(alloc // px)
            if sh < 1:
                continue
            c = commission(sh)
            cash -= sh * px + c
            pos[s] = {"sh": sh, "entry": px, "day": nxt, "n": 0, "cost": c}
    eq = pd.Series([e for _, e in curve], index=[d for d, _ in curve])
    return eq, trades


def momentum_rotation(data: dict, spy: pd.DataFrame, capital: float, dates: list, top: int = 3):
    cash, pos, curve, trades, last_month = capital, {}, [], [], None
    for i, day in enumerate(dates[:-1]):
        nxt = dates[i + 1]
        equity = cash + sum(sh * data[s].loc[:day, "close"].iloc[-1] for s, sh in pos.items())
        curve.append((day, equity))
        if day.month == last_month:
            continue
        last_month = day.month
        risk_on = spy.loc[day, "close"] > spy.loc[day, "ma200"]
        scores = []
        for s, d in data.items():
            h = d.loc[:day]
            if len(h) < 130 or h["close"].iloc[-1] < h["ma200"].iloc[-1]:
                continue
            scores.append((h["close"].iloc[-6] / h["close"].iloc[-127] - 1, s))
        want = [s for _, s in sorted(scores, reverse=True)[:top]] if risk_on else []
        for s in list(pos):
            if s not in want and nxt in data[s].index:
                px = data[s].loc[nxt, "open"] * (1 - SLIP); sh = pos.pop(s)
                cash += sh * px - commission(sh); trades.append({"sym": s, "ret": 0, "pnl": 0})
        for s in want:
            if s in pos or nxt not in data[s].index:
                continue
            px = data[s].loc[nxt, "open"] * (1 + SLIP)
            sh = int(min(cash, equity / top) // px)
            if sh >= 1:
                cash -= sh * px + commission(sh); pos[s] = sh; trades.append({"sym": s, "ret": 0, "pnl": 0})
    return pd.Series([e for _, e in curve], index=[d for d, _ in curve]), trades


def stats(eq: pd.Series, trades: list, capital: float):
    tot = eq.iloc[-1] / capital - 1
    dd = (eq / eq.cummax() - 1).min()
    half = len(eq) // 2
    h1 = eq.iloc[half - 1] / eq.iloc[0] - 1
    h2 = eq.iloc[-1] / eq.iloc[half] - 1
    rets = [t["ret"] for t in trades if t.get("ret")]
    pnl = [t["pnl"] for t in trades if "pnl" in t and t["pnl"]]
    wins, losses = sum(p for p in pnl if p > 0), -sum(p for p in pnl if p < 0)
    return dict(ret=tot, dd=dd, h1=h1, h2=h2, n=len(trades), win=(np.mean([r > 0 for r in rets]) if rets else np.nan),
                avg=(np.mean(rets) if rets else np.nan), pf=(wins / losses if losses else np.nan))


def main():
    capital = float(sys.argv[1]) if len(sys.argv) > 1 else 5000.0
    bars = swing_tune.load()
    spy = prep(bars["SPY"])
    data = {s: prep(df) for s, df in bars.items() if s != "SPY"}
    dates = [d for d in spy.index if not pd.isna(spy.loc[d, "ma200"])]
    spy_ret = spy.loc[dates[-1], "close"] / spy.loc[dates[0], "close"] - 1
    spy_eq = spy.loc[dates, "close"]
    spy_dd = (spy_eq / spy_eq.cummax() - 1).min()
    half = len(dates) // 2
    print(f"\nSTRATEGY LAB · {len(data)} stocks · {str(dates[0])[:10]} → {str(dates[-1])[:10]} ({len(dates)} days) · capital ${capital:,.0f} · max {MAX_POS} positions")
    print(f"S&P 500 buy & hold: {spy_ret * 100:+.1f}%  (max DD {spy_dd * 100:.1f}%, 1st half {(spy_eq.iloc[half - 1] / spy_eq.iloc[0] - 1) * 100:+.1f}%, 2nd half {(spy_eq.iloc[-1] / spy_eq.iloc[half] - 1) * 100:+.1f}%)\n")
    hdr = f"{'strategy':40} {'filter':>6} {'return':>8} {'maxDD':>7} {'1st½':>7} {'2nd½':>7} {'trades':>7} {'win':>5} {'avg/trade':>9} {'PF':>5}"
    print(hdr); print("─" * len(hdr))
    rows = []
    for name, spec in STRATS.items():
        for mf in (False, True):
            eq, tr = simulate(data, spy, spec, capital, mf, dates)
            rows.append((name, "SPY" if mf else "—", stats(eq, tr, capital)))
    for top in (3, 5):
        eq, tr = momentum_rotation(data, spy, capital, dates, top)
        rows.append((f"Momentum rotation top {top} (monthly)", "SPY", stats(eq, tr, capital)))
    rows.sort(key=lambda r: r[2]["ret"], reverse=True)
    for name, f, s in rows:
        flag = " ✓" if s["ret"] > spy_ret and s["h1"] > 0 and s["h2"] > 0 else ""
        print(f"{name:40} {f:>6} {s['ret'] * 100:+7.1f}% {s['dd'] * 100:6.1f}% {s['h1'] * 100:+6.1f}% {s['h2'] * 100:+6.1f}% {s['n']:7d} "
              f"{(s['win'] * 100 if s['win'] == s['win'] else 0):4.0f}% {(s['avg'] * 100 if s['avg'] == s['avg'] else 0):+8.2f}% {(s['pf'] if s['pf'] == s['pf'] else 0):5.2f}{flag}")
    print("\n✓ = beat S&P 500 AND profitable in both halves.  PF = profit factor (gross wins / gross losses, >1.3 is interesting).")
    print("Caveat: ~14 months of data, 30 stocks, survivorship bias (today's winners). Treat as a filter, not a promise.")


if __name__ == "__main__":
    main()
