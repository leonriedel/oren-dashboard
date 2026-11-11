"""
EDGAR SCALPER · signal engine

Mean-reversion scalper with trend-confirmation guard.

LONG entry (all must be true on the last closed candle):
  - close ≤ bb_lower  (price at or below lower band)
  - RSI  ≤ 30         (oversold)
  - macd_hist turned up vs previous bar (momentum inflection)

SHORT entry (mirror):
  - close ≥ bb_upper
  - RSI  ≥ 70
  - macd_hist turned down

Confidence = scaled combination of how deep RSI, how far outside BB,
and how strong the histogram inflection is.

SL / TP are ATR-based: ±ATR*SL_MULT / ±ATR*TP_MULT
"""
from dataclasses import dataclass, asdict
from typing import Literal
import pandas as pd

import config
import indicators


@dataclass
class Signal:
    symbol: str
    timeframe: str
    side: Literal["LONG", "SHORT"]
    price: float
    sl: float
    tp: float
    confidence: float
    reasons: list[str]
    ts: pd.Timestamp


def _conf_long(row_last, row_prev) -> float:
    rsi_c  = max(0.0, (config.RSI_OVERSOLD - row_last["rsi"]) / config.RSI_OVERSOLD)  # 0..1
    bb_rng = row_last["bb_upper"] - row_last["bb_lower"]
    bb_c   = max(0.0, (row_last["bb_lower"] - row_last["close"]) / bb_rng) if bb_rng else 0.0
    bb_c   = min(bb_c, 1.0)
    hist_up = row_last["macd_hist"] > row_prev["macd_hist"]
    hist_c  = 1.0 if hist_up else 0.0
    return round(0.4 * rsi_c + 0.3 * bb_c + 0.3 * hist_c + 0.3, 3)  # +0.3 base for all 3 true


def _conf_short(row_last, row_prev) -> float:
    rsi_c  = max(0.0, (row_last["rsi"] - config.RSI_OVERBOUGHT) / (100 - config.RSI_OVERBOUGHT))
    bb_rng = row_last["bb_upper"] - row_last["bb_lower"]
    bb_c   = max(0.0, (row_last["close"] - row_last["bb_upper"]) / bb_rng) if bb_rng else 0.0
    bb_c   = min(bb_c, 1.0)
    hist_dn = row_last["macd_hist"] < row_prev["macd_hist"]
    hist_c  = 1.0 if hist_dn else 0.0
    return round(0.4 * rsi_c + 0.3 * bb_c + 0.3 * hist_c + 0.3, 3)


def scan(symbol: str, timeframe: str, df: pd.DataFrame) -> Signal | None:
    """Analyze the most recent closed bar; return a Signal or None."""
    annotated = indicators.annotate(
        df,
        bb_period=config.BB_PERIOD, bb_std=config.BB_STD,
        rsi_period=config.RSI_PERIOD,
        macd_fast=config.MACD_FAST, macd_slow=config.MACD_SLOW, macd_signal=config.MACD_SIGNAL,
        atr_period=config.ATR_PERIOD,
    ).dropna()

    if len(annotated) < 2:
        return None

    last = annotated.iloc[-1]
    prev = annotated.iloc[-2]
    price = float(last["close"])
    atr_v = float(last["atr"])
    ts    = annotated.index[-1]

    # LONG check
    if (last["close"] <= last["bb_lower"]
            and last["rsi"] <= config.RSI_OVERSOLD
            and last["macd_hist"] > prev["macd_hist"]):
        conf = _conf_long(last, prev)
        if conf >= config.MIN_CONFIDENCE:
            reasons = [
                f"BB_lower({last['bb_lower']:.5f})",
                f"RSI_{last['rsi']:.1f}",
                "MACD_hist_up",
            ]
            return Signal(
                symbol=symbol,
                timeframe=timeframe,
                side="LONG",
                price=price,
                sl=price - config.SL_ATR_MULT * atr_v,
                tp=price + config.TP_ATR_MULT * atr_v,
                confidence=conf,
                reasons=reasons,
                ts=ts,
            )

    # SHORT check
    if (last["close"] >= last["bb_upper"]
            and last["rsi"] >= config.RSI_OVERBOUGHT
            and last["macd_hist"] < prev["macd_hist"]):
        conf = _conf_short(last, prev)
        if conf >= config.MIN_CONFIDENCE:
            reasons = [
                f"BB_upper({last['bb_upper']:.5f})",
                f"RSI_{last['rsi']:.1f}",
                "MACD_hist_down",
            ]
            return Signal(
                symbol=symbol,
                timeframe=timeframe,
                side="SHORT",
                price=price,
                sl=price + config.SL_ATR_MULT * atr_v,
                tp=price - config.TP_ATR_MULT * atr_v,
                confidence=conf,
                reasons=reasons,
                ts=ts,
            )

    return None


def signal_to_dict(s: Signal) -> dict:
    d = asdict(s)
    d["ts"] = s.ts.isoformat()
    return d
