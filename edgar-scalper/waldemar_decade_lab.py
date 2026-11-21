"""
WALDEMAR · DECADE LAB — short patterns over 14 years incl. the bear markets (2015/16, 2018, 2020, 2022)
and Edgar + Waldemar as a team.

  docker compose run --rm --no-deps edgar python waldemar_decade_lab.py          # $10,000
  docker compose run --rm --no-deps edgar python waldemar_decade_lab.py 25000

Data: Yahoo daily bars (free), cached in deploy/state. Universe: index ETFs + ~60 large US stocks
(today's winners AND losers like INTC, BA, PFE, NKE, PYPL — less survivorship than the 30 Edgar names).
Costs: CFD spread + overnight funding on shorts, IBKR-like costs on Edgar longs.
"""
from __future__ import annotations
import os
import pickle
import sys
from datetime import date

import numpy as np
import pandas as pd

import waldemar_short_lab as W     # prep(), short pattern definitions, costs

CAPITAL = float(sys.argv[1]) if len(sys.argv) > 1 else 10000.0
START = "2011-01-01"
CACHE = os.path.join(W.STATE_DIR, "waldemar_decade_cache.pkl")
INDEXES = ["SPY", "QQQ", "IWM", "DIA"]
STOCKS = sorted(set(W.STOCKS + [
    "INTC", "BA", "PFE", "NKE", "DIS", "PYPL", "MMM", "VZ", "T", "F", "GM", "KHC", "CVS", "WBD", "BAC", "C", "WFC",
    "KO", "PEP", "MCD", "SBUX", "TGT", "WMT", "HD", "LOW", "UNH", "JNJ", "MRK", "ABBV", "CSCO", "IBM", "QCOM",
    "TXN", "ADBE", "CRM", "BABA", "SNAP", "ZM", "ROKU", "ETSY",
]))
MAX_POS = 5
EDGAR_COMM = 0.0015       # Edgar long round trip (commission + slippage) ≈ 0.15 %


def load() -> dict:
    if os.path.exists(CACHE):
        with open(CACHE, "rb") as f:
            c = pickle.load(f)
        if c.get("day") == date.today().isoformat():
            return c
    import yfinance as yf
    print(f"downloading {len(STOCKS) + len(INDEXES)} tickers from Yahoo since {START} …")
    raw = yf.download(STOCKS + INDEXES, start=START, auto_adjust=True, group_by="ticker", progress=False, threads=True)
    data = {}
    for t in STOCKS + INDEXES:
        try:
            df = raw[t].rename(columns=str.lower)[["open", "high", "low", "close", "volume"]].dropna()
            if len(df) > 300:
                df.index = pd.to_datetime(df.index).tz_localize(None)
                data[t] = df
        except Exception:
            pass
    print(f"  got {len(data)} tickers")
    c = {"day": date.today().isoformat(), "data": data}
    with open(CACHE, "wb") as f:
        pickle.dump(c, f)
    return c


# ─── the three short patterns that survived the 2-year lab, plus a combined "Waldemar mix" ───
P = W.DAILY
SHORTS = {
    "Failed rally at MA50": P["Failed rally at MA50 (lower high)"],
    "RSI2 > 90 in downtrend": P["RSI2 > 90 in downtrend (Connors short)"],
    "Bearish engulfing in downtrend": P["Bearish engulfing in downtrend"],
    "Bollinger fade (mirror Edgar)": P["Bollinger fade in downtrend (mirror Edgar)"],
    "WALDEMAR MIX (any of the first 3)": dict(
        entry=lambda d: (P["Failed rally at MA50 (lower high)"]["entry"](d) | P["RSI2 > 90 in downtrend (Connors short)"]["entry"](d)
                         | P["Bearish engulfing in downtrend"]["entry"](d)),
        rank=lambda d: -d["rsi14"],
        exit=lambda r, e, n: r["close"] < r["ma10"] or r["close"] > e + 2 * r["atr"] or n >= 15),
}
EDGAR = dict(  # live Edgar Bounce: uptrend + close below lower band → exit close > MA10 or 12 days
    entry=lambda d: (d["close"] > d["ma200"]) & (d["close"] < d["bb_lo"]),
    rank=lambda d: (d["close"] - d["bb_lo"]) / d["close"],
    exit=lambda r, e, n: r["close"] > r["ma10"] or n >= 12)


def sim(data: dict, spec: dict, capital: float, dates: list, side: str, cost: dict, mult: float = 1.0, allow=None) -> tuple[pd.Series, list]:
    """side = 'short' or 'long'. allow(day) → False blocks NEW entries that day (regime filter)."""
    sig = {s: spec["entry"](d).fillna(False) for s, d in data.items()}
    rnk = {s: spec["rank"](d) for s, d in data.items()}
    closes = {s: d["close"] for s, d in data.items()}
    realized, pos, trades, curve = 0.0, {}, [], []
    sgn = -1 if side == "short" else 1
    for i, day in enumerate(dates[:-1]):
        nxt = dates[i + 1]
        for s in list(pos):
            d = data[s]
            if day not in d.index:
                continue
            p = pos[s]; p["n"] += 1
            if spec["exit"](d.loc[day], p["entry"], p["n"]) and nxt in d.index:
                px = d.loc[nxt, "open"]
                ret = sgn * (px - p["entry"]) / p["entry"] - cost[s] * mult - (W.FUND_DAY * mult * p["n"] if side == "short" else 0)
                realized += p["notional"] * ret
                trades.append({"sym": s, "day": p["day"], "ret": ret})
                del pos[s]
        unreal = 0.0
        for s, p in pos.items():
            c = closes[s]
            last = c.iloc[c.index.searchsorted(day, side="right") - 1]
            unreal += p["notional"] * sgn * (last - p["entry"]) / p["entry"]
        equity = capital + realized + unreal
        curve.append(equity)
        if allow is not None and not allow(day):
            continue
        slots = MAX_POS - len(pos)
        if slots <= 0:
            continue
        cands = [(rnk[s].get(day, np.inf), s) for s in data if s not in pos and bool(sig[s].get(day, False)) and nxt in data[s].index]
        for _, s in sorted(cands)[:slots]:
            pos[s] = {"entry": data[s].loc[nxt, "open"], "notional": max(equity, 0) / MAX_POS, "n": 0, "day": nxt}
    return pd.Series(curve, index=dates[:len(curve)]), trades


def row(name: str, eq: pd.Series, tr: list, eq2: pd.Series, capital: float) -> str:
    r = [t["ret"] for t in tr]
    w, l = sum(x for x in r if x > 0), -sum(x for x in r if x < 0)
    yrs = (eq.index[-1] - eq.index[0]).days / 365.25
    tot = eq.iloc[-1] / capital - 1
    cagr = (eq.iloc[-1] / capital) ** (1 / yrs) - 1 if eq.iloc[-1] > 0 else -1
    half = len(eq) // 2
    h1, h2 = eq.iloc[half - 1] / eq.iloc[0] - 1, eq.iloc[-1] / eq.iloc[half] - 1
    pf = w / l if l else 0
    ok = "✓" if h1 > 0 and h2 > 0 and eq2.iloc[-1] > capital and pf > 1.2 else " "
    return (f"{name:40} {tot * 100:+8.1f}% {cagr * 100:+6.1f}% {(eq / eq.cummax() - 1).min() * 100:6.1f}% {h1 * 100:+7.1f}% {h2 * 100:+7.1f}% "
            f"{(eq2.iloc[-1] / capital - 1) * 100:+7.1f}% {len(r):6d} {(np.mean([x > 0 for x in r]) * 100 if r else 0):4.0f}% {(np.mean(r) * 100 if r else 0):+6.2f}% {pf:5.2f} {ok}")


def yearly(series: dict) -> None:
    years = sorted({d.year for s in series.values() for d in s.index})
    print(f"\n{'year':>6} " + " ".join(f"{k:>14}" for k in series))
    for y in years:
        cells = []
        for s in series.values():
            ys = s[s.index.year == y]
            prev = s[s.index.year < y]
            base = prev.iloc[-1] if len(prev) else ys.iloc[0]
            cells.append(f"{(ys.iloc[-1] / base - 1) * 100:+13.1f}%" if len(ys) else f"{'':>14}")
        print(f"{y:>6} " + " ".join(cells))


def main():
    c = load()
    raw = c["data"]
    if "SPY" not in raw:
        sys.exit("no SPY data")
    data = {s: W.prep(df) for s, df in raw.items()}
    spy = data["SPY"]
    dates = [d for d in spy.index if not pd.isna(spy.loc[d, "ma200"])]
    stocks = {s: d for s, d in data.items() if s in STOCKS}
    idx = {s: d for s, d in data.items() if s in INDEXES}
    allu = {**stocks, **idx}
    cost_s = {s: (W.INDEX_COST if s in INDEXES else W.STOCK_COST) for s in allu}
    cost_l = {s: EDGAR_COMM for s in allu}
    bear = lambda day: spy["close"].get(day, np.nan) < spy["ma200"].get(day, np.nan)
    spy_tot = spy.loc[dates[-1], "close"] / spy.loc[dates[0], "close"] - 1
    print(f"\nWALDEMAR · DECADE LAB · {str(dates[0])[:10]} → {str(dates[-1])[:10]} · {len(stocks)} stocks + {len(idx)} indexes · ${CAPITAL:,.0f} · max {MAX_POS} positions")
    print(f"S&P 500 buy & hold: {spy_tot * 100:+.1f}%   ·   market in downtrend (SPY < MA200) on {np.mean([bear(d) for d in dates]) * 100:.0f}% of days\n")
    hdr = f"{'strategy':40} {'total':>9} {'CAGR':>7} {'maxDD':>7} {'1st½':>8} {'2nd½':>8} {'2×cost':>8} {'trades':>6} {'win':>5} {'avg':>7} {'PF':>5}"

    print("1 · SHORT PATTERNS · stocks + indexes"); print(hdr); print("─" * len(hdr))
    results = {}
    for name, spec in SHORTS.items():
        for label, allow in (("", None), (" · only when SPY<MA200", bear)):
            eq, tr = sim(allu, spec, CAPITAL, dates, "short", cost_s, 1.0, allow)
            eq2, _ = sim(allu, spec, CAPITAL, dates, "short", cost_s, 2.0, allow)
            results[name + label] = eq
            print(row(name + label, eq, tr, eq2, CAPITAL))

    print("\n2 · SHORT PATTERNS · indexes only (US500 / US100 / US2000 / US30 CFDs)"); print(hdr); print("─" * len(hdr))
    cost_i = {s: W.INDEX_COST for s in idx}
    for name in ("RSI2 > 90 in downtrend", "Failed rally at MA50", "WALDEMAR MIX (any of the first 3)"):
        eq, tr = sim(idx, SHORTS[name], CAPITAL, dates, "short", cost_i)
        eq2, _ = sim(idx, SHORTS[name], CAPITAL, dates, "short", cost_i, 2.0)
        print(row(name, eq, tr, eq2, CAPITAL))

    print("\n3 · EDGAR + WALDEMAR AS A TEAM"); print(hdr); print("─" * len(hdr))
    e_eq, e_tr = sim(allu, EDGAR, CAPITAL, dates, "long", cost_l)
    e_eq2, _ = sim(allu, EDGAR, CAPITAL, dates, "long", cost_l, 2.0)
    print(row("Edgar alone (100%)", e_eq, e_tr, e_eq2, CAPITAL))
    best_short = max((k for k in results), key=lambda k: results[k].iloc[-1])
    w_spec_name = best_short.replace(" · only when SPY<MA200", "")
    w_allow = bear if "only when" in best_short else None
    e_half, e_tr_h = sim(allu, EDGAR, CAPITAL * 0.7, dates, "long", cost_l)
    w_half, w_tr_h = sim(allu, SHORTS[w_spec_name], CAPITAL * 0.3, dates, "short", cost_s, 1.0, w_allow)
    team = e_half + w_half
    e_half2, _ = sim(allu, EDGAR, CAPITAL * 0.7, dates, "long", cost_l, 2.0)
    w_half2, _ = sim(allu, SHORTS[w_spec_name], CAPITAL * 0.3, dates, "short", cost_s, 2.0, w_allow)
    print(row(f"Team 70/30 (Waldemar = {best_short[:22]}…)", team, e_tr_h + w_tr_h, e_half2 + w_half2, CAPITAL))
    spy_eq = spy.loc[dates[:len(team)], "close"] / spy.loc[dates[0], "close"] * CAPITAL
    print(f"{'S&P 500 buy & hold':40} {spy_tot * 100:+8.1f}%         {(spy_eq / spy_eq.cummax() - 1).min() * 100:6.1f}%")

    print("\n4 · YEAR BY YEAR")
    yearly({"S&P 500": spy_eq, "Edgar": e_eq, "Waldemar": results[best_short], "Team 70/30": team})
    print("\n✓ = profitable in both halves, still profitable with 2× costs, PF > 1.2.  Team = 70% capital Edgar + 30% Waldemar, run side by side.")


if __name__ == "__main__":
    main()
