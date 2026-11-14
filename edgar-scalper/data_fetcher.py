"""
EDGAR SCALPER · data fetcher

Twelve Data (free tier: 800 credits/day, 8 req/min) is the primary source.
Later: optional OANDA historical fetcher once execution is live.

Symbol format matches our universe ('XAU/USD', 'EUR/USD', …) — Twelve Data
accepts the same strings directly.
"""
from __future__ import annotations
import os
import time
import pandas as pd
import requests

API_BASE = "https://api.twelvedata.com"
API_KEY  = os.getenv("TWELVEDATA_API_KEY", "")

# Map our timeframe names → Twelve Data intervals
_TF_MAP = {
    "1m":  "1min",
    "5m":  "5min",
    "15m": "15min",
    "30m": "30min",
    "1h":  "1h",
    "4h":  "4h",
    "1d":  "1day",
    # allow pass-through
    "1min": "1min", "5min": "5min", "15min": "15min", "30min": "30min",
}


def _td_interval(iv: str) -> str:
    return _TF_MAP.get(iv, iv)


def _td_outputsize(period: str, interval: str) -> int:
    """Rough bar count for Twelve Data from a period string + interval."""
    # period is like '7d', '30d', '60d', or '1y' etc.
    period = period.strip().lower()
    unit = period[-1]
    num = int(period[:-1]) if period[:-1].isdigit() else 7
    per_day = {
        "1min": 1440, "5min": 288, "15min": 96, "30min": 48,
        "1h": 24, "4h": 6, "1day": 1,
    }.get(_td_interval(interval), 96)
    if unit == "d":
        return min(num * per_day, 5000)
    if unit == "w":
        return min(num * 7 * per_day, 5000)
    if unit == "y":
        return min(num * 252 * per_day, 5000)
    return 500


def fetch_candles(symbol: str, interval: str = "15m", period: str = "7d") -> pd.DataFrame:
    """Return OHLCV DataFrame indexed by UTC timestamps for a symbol like 'XAU/USD'."""
    if not API_KEY:
        raise RuntimeError("TWELVEDATA_API_KEY not set")

    params = {
        "symbol":     symbol,
        "interval":   _td_interval(interval),
        "outputsize": _td_outputsize(period, interval),
        "format":     "JSON",
        "timezone":   "UTC",
        "apikey":     API_KEY,
    }
    for attempt in range(3):
        r = requests.get(f"{API_BASE}/time_series", params=params, timeout=15)
        if r.status_code == 429:
            time.sleep(8)
            continue
        break

    if r.status_code != 200:
        raise RuntimeError(f"TwelveData HTTP {r.status_code} for {symbol}: {r.text[:200]}")

    data = r.json()
    if data.get("status") == "error":
        raise RuntimeError(f"TwelveData error for {symbol}: {data.get('message', data)}")

    values = data.get("values")
    if not values:
        raise RuntimeError(f"no values for {symbol}: {data}")

    df = pd.DataFrame(values)
    df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
    df = df.set_index("datetime").sort_index()

    # TD returns strings — cast numerics
    for col in ("open", "high", "low", "close"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    if "volume" in df.columns:
        df["volume"] = pd.to_numeric(df["volume"], errors="coerce").fillna(0)
    else:
        df["volume"] = 0.0

    df = df[["open", "high", "low", "close", "volume"]].dropna()
    if df.empty:
        raise RuntimeError(f"no usable bars for {symbol}")
    return df


def fetch_universe(universe: list[dict], interval: str, period: str) -> dict[str, pd.DataFrame]:
    """Fetch candles for every symbol in the universe. Throttles to respect free-tier rate limits."""
    out: dict[str, pd.DataFrame] = {}
    for i, u in enumerate(universe):
        try:
            # Free tier: 8 req/min — space out to one every ~8s (safer on bursts)
            if i > 0:
                time.sleep(8)
            out[u["symbol"]] = fetch_candles(u["symbol"], interval, period)
            print(f"[data_fetcher] {u['symbol']} · {len(out[u['symbol']])} bars")
        except Exception as e:
            print(f"[data_fetcher] {u['symbol']} failed: {e}")
    return out
