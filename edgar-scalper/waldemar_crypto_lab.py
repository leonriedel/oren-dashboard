"""
WALDEMAR · CRYPTO LAB — long AND short on crypto (BTC, ETH, SOL, XRP, BNB), daily, since 2017

  docker compose run --rm --no-deps edgar python waldemar_crypto_lab.py          # $10,000
  docker compose run --rm --no-deps edgar python waldemar_crypto_lab.py 25000

Capital as an equal-weight team: each coin gets 1/N of the capital and its own position (long, short or flat).
Signal at the daily close (UTC) → trade at the next open. Costs (Capital.com crypto CFDs, conservative):
  spread 0.20 % per round trip + overnight funding 0.05 % per day held (long or short).
Every row gets the robustness test: ✓ = profitable in both halves, still profitable with 2× costs, PF > 1.2.
"""
from __future__ import annotations
import os
import pickle
import sys
from datetime import date

import numpy as np
import pandas as pd

import waldemar_short_lab as W

CAPITAL = float(sys.argv[1]) if len(sys.argv) > 1 else 10000.0
COINS = ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "BNB-USD"]
START = "2017-01-01"
SPREAD = 0.0020
FUND = 0.0005
CACHE = os.path.join(W.STATE_DIR, "waldemar_crypto_cache.pkl")


def load() -> dict:
    if os.path.exists(CACHE):
        with open(CACHE, "rb") as f:
            c = pickle.load(f)
        if c.get("day") == date.today().isoformat():
            return c["data"]
    import yfinance as yf
    print(f"downloading {', '.join(COINS)} from Yahoo …")
    raw = yf.download(COINS, start=START, auto_adjust=True, group_by="ticker", progress=False, threads=True)
    data = {}
    for t in COINS:
        try:
            df = raw[t].rename(columns=str.lower)[["open", "high", "low", "close", "volume"]].dropna()
            df.index = pd.to_datetime(df.index).tz_localize(None)
            if len(df) > 400:
                data[t] = df
        except Exception:
            pass
    print(f"  got {len(data)} coins")
    with open(CACHE, "wb") as f:
        pickle.dump({"day": date.today().isoformat(), "data": data}, f)
    return data


def prep(df: pd.DataFrame) -> pd.DataFrame:
    d = W.prep(df)
    h, l = df["high"], df["low"]
    d["hh20"], d["ll10"] = h.shift(1).rolling(20).max(), l.shift(1).rolling(10).min()
    d["ll20"], d["hh10"] = l.shift(1).rolling(20).min(), h.shift(1).rolling(10).max()
    return d


# state functions: given today's row and current state (+1 long, -1 short, 0 flat) → desired state
STRATS = {
    "LONG · trend (above MA200)":          lambda r, s: 1 if r["close"] > r["ma200"] else 0,
    "LONG · golden cross (MA50 > MA200)":  lambda r, s: 1 if r["ma50"] > r["ma200"] else 0,
    "LONG · trend fast (above MA50)":      lambda r, s: 1 if r["close"] > r["ma50"] else 0,
    "LONG · Donchian 20/10 breakout":      lambda r, s: 1 if r["close"] > r["hh20"] else (0 if r["close"] < r["ll10"] else s if s == 1 else 0),
    "LONG · dip buy in uptrend (RSI2<10)": lambda r, s: 1 if (r["close"] > r["ma200"] and r["rsi2"] < 10) else (0 if (s == 1 and r["close"] > r["ma5"]) else s if s == 1 else 0),
    "SHORT · downtrend (below MA200)":     lambda r, s: -1 if r["close"] < r["ma200"] else 0,
    "SHORT · death cross (MA50 < MA200)":  lambda r, s: -1 if r["ma50"] < r["ma200"] else 0,
    "SHORT · Donchian 20/10 breakdown":    lambda r, s: -1 if (r["close"] < r["ll20"] and r["close"] < r["ma200"]) else (0 if r["close"] > r["hh10"] else s if s == -1 else 0),
    "SHORT · rally fade in downtrend (RSI2>90)": lambda r, s: -1 if (r["close"] < r["ma200"] and r["rsi2"] > 90) else (0 if (s == -1 and r["close"] < r["ma5"]) else s if s == -1 else 0),
    "LONG/SHORT · trend MA200 (always in)": lambda r, s: 1 if r["close"] > r["ma200"] else -1,
    "LONG/SHORT · MA50 above/below MA200":  lambda r, s: 1 if r["ma50"] > r["ma200"] else -1,
}


def sim_coin(d: pd.DataFrame, fn, capital: float, mult: float = 1.0):
    rows = d.to_dict("records")
    o, idx = d["open"].values, d.index
    eq, state, entry, n, cash, trades = [], 0, 0.0, 0, capital, []
    for i in range(len(d) - 1):
        r = rows[i]
        if any(pd.isna(r[k]) for k in ("ma200", "ma50", "rsi2", "hh20", "ll20")):
            eq.append(cash); continue
        # mark to market at today's close
        val = cash * (1 + state * (r["close"] - entry) / entry) * (1 - FUND * mult) ** n if state else cash
        eq.append(val)
        want = fn(r, state)
        if want != state:
            px = o[i + 1]
            if state:
                ret = (1 + state * (px - entry) / entry) * (1 - FUND * mult) ** n * (1 - SPREAD * mult) - 1
                cash *= (1 + ret)
                trades.append({"ret": ret, "ts": idx[i]})
            state, entry, n = want, px, 0
        elif state:
            n += 1
    return pd.Series(eq, index=idx[:len(eq)]), trades


def run(data: dict, fn, capital: float, mult: float = 1.0):
    per = capital / len(data)
    curves, trades = [], []
    for d in data.values():
        eq, tr = sim_coin(d, fn, per, mult)
        curves.append(eq); trades += tr
    allidx = sorted(set().union(*[c.index for c in curves]))
    team = sum(c.reindex(allidx).ffill().fillna(per) for c in curves)
    return team, trades


def row(name, eq, tr, eq2, capital):
    r = [t["ret"] for t in tr]
    w, l = sum(x for x in r if x > 0), -sum(x for x in r if x < 0)
    yrs = (eq.index[-1] - eq.index[0]).days / 365.25
    tot = eq.iloc[-1] / capital - 1
    cagr = (eq.iloc[-1] / capital) ** (1 / yrs) - 1 if eq.iloc[-1] > 0 else -1
    half = len(eq) // 2
    h1, h2 = eq.iloc[half - 1] / eq.iloc[0] - 1, eq.iloc[-1] / eq.iloc[half] - 1
    pf = w / l if l else 0
    ok = "✓" if h1 > 0 and h2 > 0 and eq2.iloc[-1] > capital and pf > 1.2 else " "
    return (f"{name:42} {tot * 100:+9.0f}% {cagr * 100:+6.1f}% {(eq / eq.cummax() - 1).min() * 100:6.1f}% {h1 * 100:+8.0f}% {h2 * 100:+8.0f}% "
            f"{(eq2.iloc[-1] / capital - 1) * 100:+8.0f}% {len(r):6d} {(np.mean([x > 0 for x in r]) * 100 if r else 0):4.0f}% {pf:5.2f} {ok}")


def yearly(series: dict):
    years = sorted({d.year for s in series.values() for d in s.index})
    print(f"\n{'year':>6} " + " ".join(f"{k[:16]:>17}" for k in series))
    for y in years:
        cells = []
        for s in series.values():
            ys, prev = s[s.index.year == y], s[s.index.year < y]
            base = prev.iloc[-1] if len(prev) else (ys.iloc[0] if len(ys) else np.nan)
            cells.append(f"{(ys.iloc[-1] / base - 1) * 100:+16.0f}%" if len(ys) else f"{'':>17}")
        print(f"{y:>6} " + " ".join(cells))


def main():
    raw = load()
    if not raw:
        sys.exit("no crypto data")
    data = {k: prep(v) for k, v in raw.items()}
    print(f"\nWALDEMAR · CRYPTO LAB · {', '.join(k.replace('-USD', '') for k in data)} · daily since {START} · ${CAPITAL:,.0f} split equally")
    print(f"costs: spread {SPREAD * 100:.2f}% per round trip + funding {FUND * 100:.3f}%/day while in a position\n")
    hdr = f"{'strategy':42} {'total':>10} {'CAGR':>7} {'maxDD':>7} {'1st½':>9} {'2nd½':>9} {'2×cost':>9} {'trades':>6} {'win':>5} {'PF':>5}"
    print(hdr); print("─" * len(hdr))
    hold = run(data, lambda r, s: 1, CAPITAL)[0]
    curves = {}
    res = []
    for name, fn in STRATS.items():
        eq, tr = run(data, fn, CAPITAL)
        eq2, _ = run(data, fn, CAPITAL, 2.0)
        curves[name] = eq
        res.append((eq.iloc[-1], name, row(name, eq, tr, eq2, CAPITAL)))
    for _, _, line in sorted(res, reverse=True):
        print(line)
    print("─" * len(hdr))
    print(row("BUY & HOLD (as CFD, pays funding every day)", hold, [], hold, CAPITAL))

    print("\nPER COIN · total return of the 3 best strategies")
    best = [n for _, n, _ in sorted(res, reverse=True)[:3]]
    print(f"{'coin':>8} " + " ".join(f"{b[:28]:>30}" for b in best))
    for coin, d in data.items():
        cells = []
        for b in best:
            eq, _ = sim_coin(d, STRATS[b], 1000.0)
            cells.append(f"{(eq.iloc[-1] / 1000 - 1) * 100:+29.0f}%")
        print(f"{coin.replace('-USD', ''):>8} " + " ".join(cells))

    best_long = max((n for n in curves if n.startswith("LONG ·")), key=lambda n: curves[n].iloc[-1])
    best_short = max((n for n in curves if n.startswith("SHORT ·")), key=lambda n: curves[n].iloc[-1])
    best_ls = max((n for n in curves if n.startswith("LONG/SHORT")), key=lambda n: curves[n].iloc[-1])
    print("\nYEAR BY YEAR")
    yearly({"Crypto hold": hold, "best long": curves[best_long], "best short": curves[best_short], "best long/short": curves[best_ls]})
    print(f"\nbest long = {best_long} · best short = {best_short} · best long/short = {best_ls}")
    print("✓ = profitable in both halves, still profitable with 2× costs, PF > 1.2.  Coins that start later (SOL 2020) join when their data begins.")


if __name__ == "__main__":
    main()
