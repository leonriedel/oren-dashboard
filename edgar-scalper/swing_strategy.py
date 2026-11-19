"""
EDGAR SWING · strategy (long-only, daily bars)

Market filter : SPY above its 200-day MA.
Trend filter  : close > MA50 > MA200.
Setup PULLBACK: low came within 1.5% of MA20 in the last 3 days, today closes above yesterday's high, RSI 40–65.
Setup BREAKOUT: close > highest close of the prior 20 days, volatility contracted before (ATR10/ATR50 < 0.95),
                volume ≥ 1.3× its 20-day average, not more than 8% above MA20.
Exit          : stop = min(10-day low, entry − 2×ATR); half at +2R; rest trails MA20 − 0.5×ATR once +1R.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
import numpy as np
import pandas as pd

import swing_config as cfg


def _rsi(c: pd.Series, n: int = 14) -> pd.Series:
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def enrich(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    c = df["close"]
    df["ma20"] = c.rolling(cfg.MA_FAST).mean()
    df["ma50"] = c.rolling(cfg.MA_MID).mean()
    df["ma200"] = c.rolling(cfg.MA_SLOW).mean()
    pc = c.shift(1)
    tr = pd.concat([df["high"] - df["low"], (df["high"] - pc).abs(), (df["low"] - pc).abs()], axis=1).max(axis=1)
    df["atr"] = tr.rolling(cfg.ATR_N).mean()
    df["atr10"] = tr.rolling(10).mean()
    df["atr50"] = tr.rolling(50).mean()
    df["rsi"] = _rsi(c)
    df["hh20"] = c.shift(1).rolling(cfg.BREAKOUT_LOOKBACK).max()
    df["low10"] = df["low"].rolling(10).min()
    df["vol20"] = df["volume"].rolling(20).mean()
    return df


@dataclass
class Signal:
    symbol: str
    setup: str
    close: float
    limit: float
    stop: float
    target: float
    risk_per_share: float
    atr: float
    reasons: list

    def to_dict(self):
        return asdict(self)


def market_ok(spy: pd.DataFrame) -> bool:
    e = enrich(spy).iloc[-1]
    return bool(e["close"] > e["ma200"])


def scan(symbol: str, df: pd.DataFrame) -> Signal | None:
    if len(df) < cfg.MA_SLOW + 5:
        return None
    e = enrich(df)
    t, y = e.iloc[-1], e.iloc[-2]
    if any(pd.isna(t[k]) for k in ("ma20", "ma50", "ma200", "atr", "rsi", "hh20")):
        return None
    if not (t["close"] > t["ma50"] > t["ma200"]):
        return None

    reasons: list = [f"trend: close {t['close']:.2f} > MA50 {t['ma50']:.2f} > MA200 {t['ma200']:.2f}"]
    setup = None
    near_ma20 = (e["low"].iloc[-3:] <= e["ma20"].iloc[-3:] * 1.015).any()
    if near_ma20 and t["close"] > y["high"] and 40 <= t["rsi"] <= 65:
        setup = "PULLBACK"
        reasons.append(f"pullback to MA20 and resumed (RSI {t['rsi']:.0f})")
    elif t["close"] > t["hh20"] and t["atr10"] / t["atr50"] < 0.95 and t["volume"] >= 1.3 * t["vol20"] and t["close"] <= t["ma20"] * 1.08:
        setup = "BREAKOUT"
        reasons.append(f"20-day breakout on {t['volume'] / t['vol20']:.1f}× volume after tight base")
    if not setup:
        return None

    limit = round(float(t["close"]) * (1 + cfg.ENTRY_SLIPPAGE), 2)
    stop = round(float(min(t["low10"], limit - cfg.STOP_ATR * t["atr"])), 2)
    rps = limit - stop
    if rps <= 0 or rps / limit > 0.15:
        return None
    target = round(limit + cfg.TARGET_R * rps, 2)
    reasons.append(f"stop {stop} (−{rps / limit * 100:.1f}%), target {target} (+{cfg.TARGET_R:.0f}R)")
    return Signal(symbol, setup, float(t["close"]), limit, stop, target, round(rps, 2), round(float(t["atr"]), 3), reasons)


def trail_stop(df: pd.DataFrame, entry: float, current_stop: float, initial_risk: float) -> float:
    """New stop for the trailing half: only ever moves up, starts once trade is +1R."""
    e = enrich(df).iloc[-1]
    if e["close"] < entry + initial_risk:
        return current_stop
    candidate = round(float(e["ma20"] - cfg.TRAIL_ATR * e["atr"]), 2)
    return max(current_stop, candidate, round(entry, 2))  # at least breakeven once +1R
