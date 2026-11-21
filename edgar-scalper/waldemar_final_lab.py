"""
WALDEMAR · FINAL LAB — the fair versions of the two winners, and the team with Edgar

  docker compose run --rm --no-deps edgar python waldemar_final_lab.py

A · CRYPTO TREND, fair: only BTC + ETH (no hindsight coin picking), trend lengths 20/50/100/200,
    as Capital.com CFD (spread + 0.05 %/day funding) and as real coins on an exchange (0.1 % fee per trade, no funding)
B · MOMENTUM ROTATION, fair: ~16 ETFs (sectors, gold, bonds, world) — no stock picking with hindsight
C · TEAM: Edgar (70 stocks + idx, idle cash in S&P ETF) + Waldemar candidates, year by year
"""
from __future__ import annotations
import os
import pickle
import sys
from datetime import date

import numpy as np
import pandas as pd

import waldemar_short_lab as W
import waldemar_decade_lab as D
import waldemar_crypto_lab as C
import edgar_decade_lab as E

CAPITAL = 10000.0
ETFS = ["SPY", "QQQ", "IWM", "XLK", "XLE", "XLF", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "GLD", "TLT", "EFA", "EEM"]
CACHE = os.path.join(W.STATE_DIR, "waldemar_final_cache.pkl")


def load_etfs() -> dict:
    if os.path.exists(CACHE):
        with open(CACHE, "rb") as f:
            c = pickle.load(f)
        if c.get("day") == date.today().isoformat():
            return c["data"]
    import yfinance as yf
    print("downloading ETFs from Yahoo …")
    raw = yf.download(ETFS, start="2010-01-01", auto_adjust=True, group_by="ticker", progress=False, threads=True)
    data = {}
    for t in ETFS:
        try:
            df = raw[t].rename(columns=str.lower)[["open", "high", "low", "close", "volume"]].dropna()
            df.index = pd.to_datetime(df.index).tz_localize(None)
            data[t] = df
        except Exception:
            pass
    with open(CACHE, "wb") as f:
        pickle.dump({"day": date.today().isoformat(), "data": data}, f)
    return data


# ─── A · crypto trend, fair ───
def trend_fn(n: int):
    col = f"ma{n}"
    return lambda r, s: 1 if r["close"] > r[col] else 0


def crypto_prep(df):
    d = C.prep(df)
    d["ma100"] = df["close"].rolling(100).mean()
    return d


def run_crypto(data, fn, spread, fund, mult=1.0):
    C.SPREAD, C.FUND = spread, fund
    return C.run(data, fn, CAPITAL, mult)


# ─── B · ETF momentum rotation ───
def etf_rotation(etfs: dict, top: int, lookback: int, dates: list, cost: float = 0.001, mult: float = 1.0, abs_filter: bool = True):
    closes = pd.DataFrame({k: v["close"] for k, v in etfs.items()}).reindex(dates).ffill()
    opens = pd.DataFrame({k: v["open"] for k, v in etfs.items()}).reindex(dates).ffill()
    eq, hold, cash, month, trades = [], {}, CAPITAL, None, []
    for i, day in enumerate(dates[:-1]):
        val = cash + sum(sh * closes.at[day, s] for s, sh in hold.items())
        eq.append(val)
        if day.month == month:
            continue
        month = day.month
        if i < lookback:
            continue
        mom = closes.iloc[i] / closes.iloc[i - lookback] - 1
        ma200 = closes.iloc[max(0, i - 200):i + 1].mean()
        ranked = [s for s in mom.sort_values(ascending=False).index if not np.isnan(mom[s])]
        if abs_filter:
            ranked = [s for s in ranked if mom[s] > 0 and closes.at[day, s] > ma200[s]]
        want = ranked[:top]
        nxt = dates[i + 1]
        for s in list(hold):
            if s not in want:
                px = opens.at[nxt, s]; sh = hold.pop(s)
                cash += sh * px * (1 - cost * mult / 2)
                trades.append({"ret": 0})
        total = cash + sum(sh * opens.at[nxt, s] for s, sh in hold.items())
        for s in want:
            if s not in hold and not np.isnan(opens.at[nxt, s]):
                alloc = total / top
                if alloc <= cash:
                    px = opens.at[nxt, s]
                    hold[s] = alloc * (1 - cost * mult / 2) / px
                    cash -= alloc
                    trades.append({"ret": 0})
    return pd.Series(eq, index=dates[:len(eq)]), trades


def line(name, eq, capital=CAPITAL, eq2=None):
    yrs = (eq.index[-1] - eq.index[0]).days / 365.25
    tot = eq.iloc[-1] / capital - 1
    cagr = (eq.iloc[-1] / capital) ** (1 / yrs) - 1 if eq.iloc[-1] > 0 else -1
    half = len(eq) // 2
    h1, h2 = eq.iloc[half - 1] / eq.iloc[0] - 1, eq.iloc[-1] / eq.iloc[half] - 1
    dd = (eq / eq.cummax() - 1).min()
    c2 = (eq2.iloc[-1] / capital - 1) if eq2 is not None else tot
    ok = "✓" if h1 > 0 and h2 > 0 and c2 > 0 else " "
    return f"{name:46} {tot * 100:+9.0f}% {cagr * 100:+6.1f}% {dd * 100:6.1f}% {h1 * 100:+8.0f}% {h2 * 100:+8.0f}% {c2 * 100:+8.0f}%  {ok}"


def main():
    hdr = f"{'variant':46} {'total':>10} {'CAGR':>7} {'maxDD':>7} {'1st½':>9} {'2nd½':>9} {'2×cost':>9}"

    # A
    craw = C.load()
    btc_eth = {k: crypto_prep(v) for k, v in craw.items() if k in ("BTC-USD", "ETH-USD")}
    print(f"\n═══ A · CRYPTO TREND · BTC + ETH only · 50/50 · since {C.START}")
    print(hdr); print("─" * len(hdr))
    crypto = {}
    for n in (20, 50, 100, 200):
        for label, spread, fund in (("CFD (Capital.com)", 0.0020, 0.0005), ("real coins (exchange)", 0.0020, 0.0)):
            eq, _ = run_crypto(btc_eth, trend_fn(n), spread, fund)
            eq2, _ = run_crypto(btc_eth, trend_fn(n), spread, fund, 2.0)
            crypto[f"BTC+ETH above MA{n} · {label}"] = eq
            print(line(f"above MA{n} · {label}", eq, eq2=eq2))
    hold, _ = run_crypto(btc_eth, lambda r, s: 1, 0.002, 0.0)
    print(line("buy & hold BTC+ETH (real coins)", hold))

    # B
    etfs = load_etfs()
    spy = etfs["SPY"]
    dates = [d for d in spy.index if d >= pd.Timestamp("2011-01-03")]
    print(f"\n═══ B · ETF MOMENTUM ROTATION · {len(etfs)} ETFs · monthly · since 2011")
    print(hdr); print("─" * len(hdr))
    rot = {}
    for top in (1, 2, 3):
        for lb in (63, 126, 252):
            eq, _ = etf_rotation(etfs, top, lb, dates)
            eq2, _ = etf_rotation(etfs, top, lb, dates, mult=2.0)
            rot[f"top {top} · {lb // 21}m momentum"] = eq
            print(line(f"top {top} · {lb // 21}-month momentum · trend filter", eq, eq2=eq2))
    spy_eq = spy.loc[dates, "close"] / spy.loc[dates[0], "close"] * CAPITAL
    print(line("S&P 500 buy & hold", spy_eq))

    # C
    c = D.load()
    data = {s: W.prep(df) for s, df in c["data"].items()}
    dspy = data["SPY"]
    ddates = [d for d in dspy.index if not pd.isna(dspy.loc[d, "ma200"])]
    allu = {s: d for s, d in data.items() if s in D.STOCKS or s in D.INDEXES}
    edgar, _, _ = E.sim_long(allu, D.EDGAR, CAPITAL, ddates, dspy, park=True)
    best_crypto = max((k for k in crypto if "real coins" in k), key=lambda k: crypto[k].iloc[-1] / max(-(crypto[k] / crypto[k].cummax() - 1).min(), 0.05))
    best_crypto_cfd = max((k for k in crypto if "CFD" in k), key=lambda k: crypto[k].iloc[-1] / max(-(crypto[k] / crypto[k].cummax() - 1).min(), 0.05))
    best_rot = max(rot, key=lambda k: rot[k].iloc[-1] / max(-(rot[k] / rot[k].cummax() - 1).min(), 0.05))

    def align(s):
        s = s.copy(); s.index = pd.to_datetime(s.index).normalize()
        return s[~s.index.duplicated()]
    cr_raw = align(crypto[best_crypto])
    ed = align(edgar)
    common = ed.index[ed.index >= cr_raw.index[0] + pd.Timedelta(days=200)]   # after the crypto MA warm-up
    ed = ed.reindex(common); ed = ed / ed.iloc[0] * CAPITAL
    cr = cr_raw.reindex(common).ffill().bfill()
    ro = align(rot[best_rot]).reindex(common).ffill().bfill()
    cr = cr / cr.iloc[0] * CAPITAL
    ro = ro / ro.iloc[0] * CAPITAL
    sp = align(spy_eq).reindex(common).ffill().bfill(); sp = sp / sp.iloc[0] * CAPITAL

    print(f"\n═══ C · TEAMS · Edgar = 70 stocks + idx, idle cash in S&P ETF · from {str(common[0])[:10]}")
    print(f"Waldemar crypto = {best_crypto} · Waldemar momentum = ETF rotation {best_rot}")
    print(hdr); print("─" * len(hdr))
    teams = {
        "Edgar alone": ed,
        "Edgar 80% + crypto 20%": ed * 0.8 + cr * 0.2,
        "Edgar 70% + crypto 30%": ed * 0.7 + cr * 0.3,
        "Edgar 70% + ETF momentum 30%": ed * 0.7 + ro * 0.3,
        "Edgar 60% + momentum 20% + crypto 20%": ed * 0.6 + ro * 0.2 + cr * 0.2,
        "S&P 500 buy & hold": sp,
    }
    for k, v in teams.items():
        print(line(k, v))
    print("\nYEAR BY YEAR")
    D.yearly({"S&P 500": sp, "Edgar": ed, "Crypto trend": cr, "ETF momentum": ro, "Team 60/20/20": teams["Edgar 60% + momentum 20% + crypto 20%"]})
    print(f"\nbest crypto as CFD: {best_crypto_cfd}")
    print("✓ = positive in both halves and with 2× costs. Teams are static splits (no rebalancing between bots).")


if __name__ == "__main__":
    main()
