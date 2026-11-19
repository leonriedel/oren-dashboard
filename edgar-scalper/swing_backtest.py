"""
EDGAR SWING · backtest on ~2 years of daily data (same rules as live, incl. commissions)

  ~/edgar-venv/bin/python swing_backtest.py            # default capital 1000 USD
  ~/edgar-venv/bin/python swing_backtest.py 2000

Takes ~4 minutes (free data plan: 5 requests/min).
"""
from __future__ import annotations
import math
import sys

import pandas as pd

import swing_config as cfg
import swing_data
import swing_strategy as strat

COMMISSION = 0.35  # USD per order (IBKR Pro tiered minimum)


def run(capital0: float) -> None:
    bars = swing_data.universe_bars(cfg.UNIVERSE + [cfg.MARKET], days=730)
    spy = strat.enrich(bars[cfg.MARKET])
    dates = sorted(set().union(*[set(df.index) for df in bars.values()]))
    dates = [d for d in dates if d in spy.index][cfg.MA_SLOW + 5:]
    cash, open_pos, trades = capital0, {}, []
    equity_curve = []

    for i, d in enumerate(dates[:-1]):
        nxt = dates[i + 1]
        # manage open positions on day d
        for sym in list(open_pos):
            p = open_pos[sym]; df = bars[sym]
            if d not in df.index:
                continue
            row = df.loc[d]
            # stop hit?
            for leg in list(p["legs"]):
                if row["low"] <= leg["stop"]:
                    px = min(leg["stop"], row["open"])
                    cash += leg["qty"] * px - COMMISSION; p["realized"] += leg["qty"] * (px - p["entry"]) - COMMISSION; p["legs"].remove(leg)
                elif leg.get("target") and row["high"] >= leg["target"]:
                    px = max(leg["target"], row["open"])
                    cash += leg["qty"] * px - COMMISSION; p["realized"] += leg["qty"] * (px - p["entry"]) - COMMISSION; p["legs"].remove(leg)
            # trail the trailing leg
            hist = df.loc[:d]
            for leg in p["legs"]:
                if not leg.get("target"):
                    leg["stop"] = strat.trail_stop(hist, p["entry"], leg["stop"], p["risk"])
            if not p["legs"]:
                trades.append({"symbol": sym, "entry_date": p["date"], "exit_date": d, "pnl": p["realized"] - COMMISSION * p["entries"], "R": p["realized"] / (p["risk"] * p["qty"])})
                del open_pos[sym]

        # equity
        mtm = sum(sum(l["qty"] for l in p["legs"]) * bars[s].loc[:d]["close"].iloc[-1] for s, p in open_pos.items())
        equity_curve.append((d, cash + mtm))

        # new signals at close of d → filled next day if price ≤ limit
        spy_row = spy.loc[d]
        if not (spy_row["close"] > spy_row["ma200"]) or len(open_pos) >= cfg.MAX_OPEN:
            continue
        equity = cash + mtm
        new = 0
        for sym in cfg.UNIVERSE:
            if sym in open_pos or sym not in bars or new >= cfg.MAX_NEW_PER_DAY or len(open_pos) >= cfg.MAX_OPEN:
                continue
            df = bars[sym]
            if d not in df.index or nxt not in df.index:
                continue
            s = strat.scan(sym, df.loc[:d])
            if not s:
                continue
            o = df.loc[nxt]
            if o["low"] > s.limit:
                continue  # gapped above limit → no fill
            fill = min(s.limit, o["open"])
            qty = min(math.floor(equity * cfg.RISK_PER_TRADE / s.risk_per_share), math.floor(equity * cfg.MAX_POSITION_PCT / fill))
            if qty < 1 or qty * fill > cash:
                continue
            q_trail = qty // 2 if qty >= 2 else qty
            legs = [{"qty": q_trail, "stop": s.stop}]
            if qty - q_trail > 0:
                legs.append({"qty": qty - q_trail, "stop": s.stop, "target": s.target})
            cash -= qty * fill
            open_pos[sym] = {"entry": fill, "qty": qty, "risk": s.risk_per_share, "legs": legs, "realized": 0.0, "date": nxt, "entries": len(legs)}
            new += 1

    final = equity_curve[-1][1] if equity_curve else capital0
    eq = pd.Series([e for _, e in equity_curve])
    dd = ((eq / eq.cummax()) - 1).min() if len(eq) else 0
    spy_ret = spy.loc[dates[-1], "close"] / spy.loc[dates[0], "close"] - 1
    wins = [t for t in trades if t["pnl"] > 0]
    print("\n═════════ EDGAR SWING · BACKTEST ═════════")
    print(f"period          {dates[0]} → {dates[-1]}")
    print(f"start / end     ${capital0:,.0f} → ${final:,.0f}   ({(final / capital0 - 1) * 100:+.1f}%)")
    print(f"SPY same period {spy_ret * 100:+.1f}%")
    print(f"max drawdown    {dd * 100:.1f}%")
    print(f"trades          {len(trades)}   win rate {len(wins) / max(len(trades), 1) * 100:.0f}%   avg R {sum(t['R'] for t in trades) / max(len(trades), 1):+.2f}")
    for t in trades[-12:]:
        print(f"  {t['entry_date']} → {t['exit_date']}  {t['symbol']:5}  ${t['pnl']:+8.2f}  {t['R']:+.2f}R")


if __name__ == "__main__":
    run(float(sys.argv[1]) if len(sys.argv) > 1 else 1000.0)
