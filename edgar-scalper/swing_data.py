"""EDGAR SWING · daily bars from Massive/Polygon (free plan: 5 requests/min → we pace at 13s)."""
from __future__ import annotations
import time
from datetime import date, timedelta
import pandas as pd
import requests

import swing_config as cfg

_last_call = 0.0


def daily_bars(symbol: str, days: int = 420) -> pd.DataFrame:
    global _last_call
    wait = 13 - (time.time() - _last_call)
    if wait > 0:
        time.sleep(wait)
    end = date.today()
    start = end - timedelta(days=days)
    url = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/range/1/day/{start}/{end}"
    for attempt in range(3):
        _last_call = time.time()
        r = requests.get(url, params={"adjusted": "true", "sort": "asc", "limit": 5000, "apiKey": cfg.POLYGON_KEY}, timeout=20)
        if r.status_code == 429:
            time.sleep(61)
            continue
        r.raise_for_status()
        rows = r.json().get("results") or []
        if not rows:
            raise RuntimeError(f"no bars for {symbol}")
        df = pd.DataFrame(rows).rename(columns={"o": "open", "h": "high", "l": "low", "c": "close", "v": "volume"})
        df["date"] = pd.to_datetime(df["t"], unit="ms").dt.date
        return df.set_index("date")[["open", "high", "low", "close", "volume"]]
    raise RuntimeError(f"rate limited fetching {symbol}")


def universe_bars(symbols: list[str], days: int = 420) -> dict[str, pd.DataFrame]:
    out: dict[str, pd.DataFrame] = {}
    for s in symbols:
        try:
            out[s] = daily_bars(s, days)
            print(f"[data] {s}: {len(out[s])} days, last {out[s].index[-1]}")
        except Exception as e:
            print(f"[data] {s} failed: {e}")
    return out
