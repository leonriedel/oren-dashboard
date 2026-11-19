"""
EDGAR SWING · compare variants on the same data (downloads once, then cached in .bars_cache.pkl)

  ~/edgar-venv/bin/python swing_tune.py          # first run ~7 min (data), then seconds
"""
from __future__ import annotations
import contextlib
import io
import os
import pickle

import swing_config as cfg
import swing_data
import swing_backtest as bt

CACHE = os.path.join(os.path.dirname(__file__), ".bars_cache.pkl")
BASE14 = list(cfg.UNIVERSE)
EXTRA = ["AAPL", "NFLX", "ORCL", "PLTR", "UBER", "SHOP", "CRWD", "ANET", "MU", "LRCX", "VRT", "CAT", "GE", "JPM", "LLY", "COST"]
WIDE = BASE14 + EXTRA


def load():
    if os.path.exists(CACHE):
        with open(CACHE, "rb") as f:
            return pickle.load(f)
    bars = swing_data.universe_bars(WIDE + [cfg.MARKET], days=730)
    with open(CACHE, "wb") as f:
        pickle.dump(bars, f)
    return bars


VARIANTS = [
    ("current: 14 stocks · $1k · 1% risk · 2R", dict(UNIVERSE=BASE14), 1000),
    ("14 stocks · $2.5k", dict(UNIVERSE=BASE14), 2500),
    ("30 stocks · $1k", dict(UNIVERSE=WIDE), 1000),
    ("30 stocks · $2.5k", dict(UNIVERSE=WIDE), 2500),
    ("30 stocks · $2.5k · 1.5% risk", dict(UNIVERSE=WIDE, RISK_PER_TRADE=0.015), 2500),
    ("30 stocks · $2.5k · 1.5% · 4 pos", dict(UNIVERSE=WIDE, RISK_PER_TRADE=0.015, MAX_OPEN=4), 2500),
    ("30 stocks · $2.5k · 1.5% · target 3R", dict(UNIVERSE=WIDE, RISK_PER_TRADE=0.015, TARGET_R=3.0), 2500),
    ("30 stocks · $2.5k · 1.5% · 50% max pos", dict(UNIVERSE=WIDE, RISK_PER_TRADE=0.015, MAX_POSITION_PCT=0.5), 2500),
    ("30 stocks · $5k · 1.5% · 4 pos", dict(UNIVERSE=WIDE, RISK_PER_TRADE=0.015, MAX_OPEN=4), 5000),
]


def main():
    bars = load()
    original = {k: getattr(cfg, k) for k in ("UNIVERSE", "RISK_PER_TRADE", "MAX_OPEN", "TARGET_R", "MAX_POSITION_PCT")}
    swing_data.universe_bars = lambda syms, days=730: {s: bars[s] for s in syms if s in bars}
    print(f"\n{'variant':44} {'return':>8} {'SPY':>7} {'maxDD':>7} {'trades':>7} {'win':>5} {'avgR':>6}")
    print("─" * 90)
    for name, over, capital in VARIANTS:
        for k, v in original.items():
            setattr(cfg, k, v)
        for k, v in over.items():
            setattr(cfg, k, v)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            bt.run(capital)
        out = {l.split()[0]: l for l in buf.getvalue().splitlines() if l.strip()}
        def grab(key, idx):
            line = next((l for l in buf.getvalue().splitlines() if l.startswith(key)), "")
            return line
        ret = grab("start / end", 0).split("(")[-1].rstrip(")") if "(" in grab("start / end", 0) else "?"
        spy = grab("SPY same", 0).split()[-1]
        dd = grab("max drawdown", 0).split()[-1]
        tl = grab("trades", 0).split()
        trades = tl[1] if len(tl) > 1 else "?"
        win = tl[4] if len(tl) > 4 else "?"
        avgr = tl[7] if len(tl) > 7 else "?"
        print(f"{name:44} {ret:>8} {spy:>7} {dd:>7} {trades:>7} {win:>5} {avgr:>6}")
    for k, v in original.items():
        setattr(cfg, k, v)


if __name__ == "__main__":
    main()
