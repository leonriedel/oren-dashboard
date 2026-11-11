"""
EDGAR SCALPER · indicators

Pure-numpy implementations so we don't depend on TA-Lib's native build.
Returns the indicator values as columns appended to the input DataFrame.
"""
import numpy as np
import pandas as pd


def bollinger(close: pd.Series, period: int = 20, std: float = 2.0) -> pd.DataFrame:
    mid = close.rolling(period).mean()
    sd  = close.rolling(period).std(ddof=0)
    upper = mid + std * sd
    lower = mid - std * sd
    return pd.DataFrame({"bb_mid": mid, "bb_upper": upper, "bb_lower": lower})


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain  = delta.clip(lower=0.0)
    loss  = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1/period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    hist = macd_line - signal_line
    return pd.DataFrame({"macd": macd_line, "macd_signal": signal_line, "macd_hist": hist})


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df["high"], df["low"], df["close"]
    prev_close = close.shift(1)
    tr = pd.concat([
        (high - low).abs(),
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1/period, adjust=False).mean()


def annotate(df: pd.DataFrame,
             bb_period: int, bb_std: float,
             rsi_period: int,
             macd_fast: int, macd_slow: int, macd_signal: int,
             atr_period: int) -> pd.DataFrame:
    """Add all indicator columns to df in one go."""
    out = df.copy()
    bb = bollinger(out["close"], bb_period, bb_std)
    out = pd.concat([out, bb], axis=1)
    out["rsi"] = rsi(out["close"], rsi_period)
    m = macd(out["close"], macd_fast, macd_slow, macd_signal)
    out = pd.concat([out, m], axis=1)
    out["atr"] = atr(out, atr_period)
    return out
