"""
EDGAR BOUNCE · strategy (long-only, daily bars) — the winner of strategy_lab.py / bounce_stress.py

Entry : close > MA200 (stock in an uptrend) AND close < lower Bollinger band (MA20 − 2σ)  → buy at next open
        ranked by how deep below the band it closed (deepest first), max MAX_OPEN positions, equal size.
Exit  : close > MA10  OR  held MAX_HOLD trading days  → sell at next open
Safety: GTC disaster stop at signal close − STOP_ATR × ATR(14), held at IBKR.
"""
from __future__ import annotations
from dataclasses import dataclass

import numpy as np
import pandas as pd

import swing_config as cfg


def enrich(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    c = d["close"]
    d["ma10"] = c.rolling(cfg.EXIT_MA).mean()
    d["ma20"] = c.rolling(cfg.BB_N).mean()
    d["ma200"] = c.rolling(200).mean()
    sd = c.rolling(cfg.BB_N).std(ddof=0)
    d["bb_lo"] = d["ma20"] - cfg.BB_K * sd
    pc = c.shift(1)
    tr = pd.concat([d["high"] - d["low"], (d["high"] - pc).abs(), (d["low"] - pc).abs()], axis=1).max(axis=1)
    d["atr"] = tr.rolling(14).mean()
    return d


@dataclass
class Signal:
    symbol: str
    close: float
    bb_lo: float
    depth: float          # (close − lower band) / close, negative = below band; lower = better
    limit: float          # limit-on-open: don't buy if it gaps up more than ENTRY_GAP_MAX
    stop: float
    reasons: list


def scan(symbol: str, df: pd.DataFrame) -> Signal | None:
    if len(df) < 205:
        return None
    t = enrich(df).iloc[-1]
    if any(pd.isna(t[k]) for k in ("ma200", "bb_lo", "atr")):
        return None
    if not (t["close"] > t["ma200"] and t["close"] < t["bb_lo"]):
        return None
    close = round(float(t["close"]), 2)
    depth = (close - float(t["bb_lo"])) / close
    stop = round(close - cfg.STOP_ATR * float(t["atr"]), 2)
    limit = round(close * (1 + cfg.ENTRY_GAP_MAX), 2)
    reasons = [
        f"uptrend: close {close:.2f} > MA200 {t['ma200']:.2f}",
        f"closed {abs(depth) * 100:.1f}% below lower Bollinger band ({t['bb_lo']:.2f})",
        f"exit when close > MA10 or after {cfg.MAX_HOLD} days · disaster stop {stop}",
    ]
    return Signal(symbol, close, float(t["bb_lo"]), depth, limit, stop, reasons)


def should_exit(df: pd.DataFrame, entry_date: str) -> tuple[bool, str]:
    """Called after the close. Returns (exit?, reason)."""
    e = enrich(df)
    t = e.iloc[-1]
    held = int((pd.Index([str(x) for x in e.index]) >= str(entry_date)).sum())  # trading days incl. entry day (= backtest)
    if t["close"] > t["ma10"]:
        return True, f"close {t['close']:.2f} > MA10 {t['ma10']:.2f}"
    if held >= cfg.MAX_HOLD:
        return True, f"time exit after {held} days"
    return False, f"hold (day {held}, close {t['close']:.2f} ≤ MA10 {t['ma10']:.2f})"
