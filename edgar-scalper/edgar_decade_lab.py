"""
EDGAR · DECADE LAB — make Edgar stronger, and find a second LONG strategy ("Waldemar") that earns at other times

  docker compose run --rm --no-deps edgar python edgar_decade_lab.py          # $10,000
  docker compose run --rm --no-deps edgar python edgar_decade_lab.py 25000

Uses the same 14-year Yahoo cache as waldemar_decade_lab.py (2011 → today, ~70 stocks + 4 index ETFs).
  1 · Edgar variants: universe 30 vs 70, market filter, idle cash parked in an S&P 500 ETF
  2 · candidate second strategies (long): momentum rotation, trend breakout, RSI2, Donchian on indexes
  3 · teams Edgar + Waldemar, year by year
"""
from __future__ import annotations
import sys

import numpy as np
import pandas as pd

import waldemar_short_lab as W
import waldemar_decade_lab as D

CAPITAL = float(sys.argv[1]) if len(sys.argv) > 1 else 10000.0
COMM = D.EDGAR_COMM
ETF_COST = 0.0002   # cost per unit of turnover in the parked ETF (UCITS S&P 500, e.g. CSPX/VUAA)


def sim_long(data: dict, spec: dict, capital: float, dates: list, spy: pd.DataFrame, slots: int = 5, park: bool = False,
             allow=None, mult: float = 1.0, monthly_rotation: int = 0):
    """Long simulator. park=True → cash not used by positions sits in SPY (rebalanced daily).
    monthly_rotation=N → instead of signals, hold the N strongest stocks (6-month momentum, above MA200), rebalance monthly."""
    sig = {s: spec["entry"](d).fillna(False) for s, d in data.items()} if spec else {}
    rnk = {s: spec["rank"](d) for s, d in data.items()} if spec else {}
    closes = {s: d["close"] for s, d in data.items()}
    spy_ret = spy["close"].pct_change().fillna(0)
    realized, park_pnl, pos, trades, curve, expo = 0.0, 0.0, {}, [], [], []
    idle_prev, month = 0.0, None

    def last_close(s, day):
        c = closes[s]
        return c.iloc[c.index.searchsorted(day, side="right") - 1]

    for i, day in enumerate(dates[:-1]):
        nxt = dates[i + 1]
        if park:
            park_pnl += idle_prev * spy_ret.get(day, 0.0)
        # exits
        if monthly_rotation:
            exit_now = set()
            if day.month != month:
                month = day.month
                sc = []
                for s, d in data.items():
                    h = d.loc[:day]
                    if len(h) >= 200 and h["close"].iloc[-1] > h["ma200"].iloc[-1] and (allow is None or allow(day)):
                        sc.append((h["ret126"].iloc[-1], s))
                want = [s for _, s in sorted(sc, reverse=True)[:monthly_rotation]]
                exit_now = {s for s in pos if s not in want}
                pending_in = [s for s in want if s not in pos]
            else:
                pending_in = []
        else:
            exit_now = set()
            for s, p in pos.items():
                d = data[s]
                if day in d.index:
                    p["n"] += 1
                    if spec["exit"](d.loc[day], p["entry"], p["n"]):
                        exit_now.add(s)
        for s in list(exit_now):
            if nxt in data[s].index:
                p = pos.pop(s); px = data[s].loc[nxt, "open"]
                ret = (px - p["entry"]) / p["entry"] - COMM * mult
                realized += p["notional"] * ret
                trades.append({"sym": s, "day": p["day"], "ret": ret})
        invested = sum(p["notional"] * last_close(s, day) / p["entry"] for s, p in pos.items())
        cost_basis = sum(p["notional"] for p in pos.values())
        equity = capital + realized + park_pnl + (invested - cost_basis)
        curve.append(equity)
        expo.append(cost_basis / equity if equity > 0 else 0)
        # entries
        n_slots = monthly_rotation or slots
        if monthly_rotation:
            new = pending_in[: max(n_slots - len(pos), 0)]
        else:
            new = []
            if allow is None or allow(day):
                free = n_slots - len(pos)
                if free > 0:
                    cands = [(rnk[s].get(day, np.inf), s) for s in data if s not in pos and bool(sig[s].get(day, False)) and nxt in data[s].index]
                    new = [s for _, s in sorted(cands)[:free]]
        for s in new:
            if nxt in data[s].index:
                pos[s] = {"entry": data[s].loc[nxt, "open"], "notional": max(equity, 0) / n_slots, "n": 0, "day": nxt}
        new_basis = sum(p["notional"] for p in pos.values())
        idle_now = max(equity - new_basis, 0) if park else 0.0
        if park:
            park_pnl -= abs(idle_now - idle_prev) * ETF_COST * mult
        idle_prev = idle_now
    return pd.Series(curve, index=dates[:len(curve)]), trades, float(np.mean(expo)) if expo else 0.0


CANDIDATES = {
    "RSI2 < 10 in uptrend (Connors long)": dict(
        entry=lambda d: (d["close"] > d["ma200"]) & (d["rsi2"] < 10),
        rank=lambda d: d["rsi2"],
        exit=lambda r, e, n: r["close"] > r["ma5"] or n >= 10),
    "20-day breakout, trend (exit < MA20)": dict(
        entry=lambda d: (d["close"] > d["hh20"]) & (d["close"] > d["ma200"]) & (d["ma50"] > d["ma200"]),
        rank=lambda d: -(d["close"] / d["ma200"]),
        exit=lambda r, e, n: r["close"] < r["ma20"] or n >= 60),
    "Pullback to MA20 in strong trend": dict(
        entry=lambda d: (d["close"] > d["ma50"]) & (d["ma50"] > d["ma200"]) & (d["low"] <= d["ma20"]) & (d["close"] > d["ma20"]),
        rank=lambda d: -d["ret126"],
        exit=lambda r, e, n: r["close"] < r["ma50"] or r["close"] > e + 4 * r["atr"] or n >= 30),
}


def row(name, eq, tr, eq2, capital, expo=None):
    return D.row(name, eq, tr, eq2, capital) + (f"  expo {expo * 100:3.0f}%" if expo is not None else "")


def main():
    c = D.load()
    raw = c["data"]
    data = {s: W.prep(df) for s, df in raw.items()}
    spy = data["SPY"]
    dates = [d for d in spy.index if not pd.isna(spy.loc[d, "ma200"])]
    stocks70 = {s: d for s, d in data.items() if s in D.STOCKS}
    stocks30 = {s: d for s, d in data.items() if s in W.STOCKS}
    allu = {s: d for s, d in data.items() if s in D.STOCKS or s in D.INDEXES}
    bull = lambda day: spy["close"].get(day, np.nan) > spy["ma200"].get(day, np.nan)
    spy_eq = spy.loc[dates, "close"] / spy.loc[dates[0], "close"] * CAPITAL
    spy_tot = spy_eq.iloc[-1] / CAPITAL - 1
    yrs = (dates[-1] - dates[0]).days / 365.25
    print(f"\nEDGAR · DECADE LAB · {str(dates[0])[:10]} → {str(dates[-1])[:10]} · ${CAPITAL:,.0f}")
    print(f"S&P 500 buy & hold: {spy_tot * 100:+.1f}%  ·  CAGR {((1 + spy_tot) ** (1 / yrs) - 1) * 100:+.1f}%  ·  maxDD {(spy_eq / spy_eq.cummax() - 1).min() * 100:.1f}%\n")
    hdr = f"{'variant':40} {'total':>9} {'CAGR':>7} {'maxDD':>7} {'1st½':>8} {'2nd½':>8} {'2×cost':>8} {'trades':>6} {'win':>5} {'avg':>7} {'PF':>5}"

    print("1 · EDGAR VARIANTS"); print(hdr); print("─" * len(hdr))
    E = D.EDGAR
    variants = [
        ("Edgar · 30 stocks (live today)", stocks30, {}),
        ("Edgar · 70 stocks", stocks70, {}),
        ("Edgar · 70 stocks + indexes", allu, {}),
        ("Edgar · 70+idx · only when SPY>MA200", allu, {"allow": bull}),
        ("Edgar · 70+idx · 8 slots", allu, {"slots": 8}),
        ("Edgar · 30 stocks · idle cash in S&P ETF", stocks30, {"park": True}),
        ("Edgar · 70+idx · idle cash in S&P ETF", allu, {"park": True}),
        ("Edgar · 70+idx · 8 slots · idle in ETF", allu, {"park": True, "slots": 8}),
    ]
    curves = {}
    for name, u, kw in variants:
        eq, tr, ex = sim_long(u, E, CAPITAL, dates, spy, **kw)
        eq2, _, _ = sim_long(u, E, CAPITAL, dates, spy, mult=2.0, **kw)
        curves[name] = eq
        print(row(name, eq, tr, eq2, CAPITAL, ex))

    print("\n2 · SECOND STRATEGY CANDIDATES (long, 70 stocks + indexes)"); print(hdr); print("─" * len(hdr))
    second = {}
    for name, spec in CANDIDATES.items():
        eq, tr, ex = sim_long(allu, spec, CAPITAL, dates, spy)
        eq2, _, _ = sim_long(allu, spec, CAPITAL, dates, spy, mult=2.0)
        second[name] = eq
        print(row(name, eq, tr, eq2, CAPITAL, ex))
    for top in (3, 5):
        name = f"Momentum rotation top {top} (monthly, SPY filter)"
        eq, tr, ex = sim_long(stocks70, None, CAPITAL, dates, spy, monthly_rotation=top, allow=bull)
        eq2, _, _ = sim_long(stocks70, None, CAPITAL, dates, spy, monthly_rotation=top, allow=bull, mult=2.0)
        second[name] = eq
        print(row(name, eq, tr, eq2, CAPITAL, ex))

    print("\n3 · TEAMS (50% Edgar 70+idx + 50% second strategy) · correlation of daily returns")
    print(hdr); print("─" * len(hdr))
    e_base = curves["Edgar · 70 stocks + indexes"]
    e_ret = e_base.pct_change().fillna(0)
    teams = {}
    for name, eq in second.items():
        team = e_base * 0.5 + eq * 0.5
        corr = e_ret.corr(eq.pct_change().fillna(0))
        teams[name] = team
        print(row(f"Edgar + {name[:30]}", team, [], team, CAPITAL) + f"  corr {corr:+.2f}")

    best_edgar = max(curves, key=lambda k: curves[k].iloc[-1] / max(-(curves[k] / curves[k].cummax() - 1).min(), 0.05))
    best_team = max(teams, key=lambda k: teams[k].iloc[-1] / max(-(teams[k] / teams[k].cummax() - 1).min(), 0.05))
    print(f"\nbest Edgar variant (return per drawdown): {best_edgar}")
    print(f"best team (return per drawdown):          Edgar + {best_team}")

    print("\n4 · YEAR BY YEAR")
    D.yearly({"S&P 500": spy_eq, "Edgar live": curves["Edgar · 30 stocks (live today)"], "Edgar best": curves[best_edgar],
              "2nd strat": second[best_team], "Team": teams[best_team]})
    print("\n✓ = profitable in both halves, still profitable with 2× costs, PF > 1.2 (teams show '–' for trades/PF).  expo = average share of capital in Edgar positions.")


if __name__ == "__main__":
    main()
