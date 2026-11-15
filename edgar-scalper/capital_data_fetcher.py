"""
EDGAR SCALPER · Capital.com candle fetcher (mid prices)

Replaces Twelve Data when MODE=capital → no extra API, no daily credit limit.
"""
from __future__ import annotations
import pandas as pd

import capital_client as cap

_RES = {"1m": "MINUTE", "5m": "MINUTE_5", "15m": "MINUTE_15", "30m": "MINUTE_30", "1h": "HOUR", "4h": "HOUR_4", "1d": "DAY"}
_PER_DAY = {"MINUTE": 1440, "MINUTE_5": 288, "MINUTE_15": 96, "MINUTE_30": 48, "HOUR": 24, "HOUR_4": 6, "DAY": 1}


def _bars(period: str, res: str) -> int:
    period = period.strip().lower()
    num = int(period[:-1]) if period[:-1].isdigit() else 7
    days = num * 7 if period.endswith("w") else num
    return max(50, min(days * _PER_DAY.get(res, 96), 1000))


def _mid(p: dict | None) -> float | None:
    if not p:
        return None
    b, a = p.get("bid"), p.get("ask")
    if b is None and a is None:
        return None
    if b is None:
        return float(a)
    if a is None:
        return float(b)
    return (float(b) + float(a)) / 2


def fetch_candles(epic: str, interval: str = "15m", period: str = "7d") -> pd.DataFrame:
    res = _RES.get(interval, "MINUTE_15")
    data = cap.get(f"/api/v1/prices/{epic}", resolution=res, max=_bars(period, res))
    rows = []
    for p in data.get("prices", []):
        o, h, l, c = _mid(p.get("openPrice")), _mid(p.get("highPrice")), _mid(p.get("lowPrice")), _mid(p.get("closePrice"))
        if None in (o, h, l, c):
            continue
        ts = p.get("snapshotTimeUTC") or p.get("snapshotTime")
        rows.append({"ts": ts, "open": o, "high": h, "low": l, "close": c, "volume": float(p.get("lastTradedVolume") or 0)})
    if not rows:
        raise RuntimeError(f"no candles for {epic}")
    df = pd.DataFrame(rows)
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    return df.set_index("ts").sort_index()[["open", "high", "low", "close", "volume"]]


def fetch_universe(universe: list[dict], interval: str, period: str) -> dict[str, pd.DataFrame]:
    out: dict[str, pd.DataFrame] = {}
    for u in universe:
        epic = u.get("capital") or u["symbol"].replace("/", "")
        try:
            out[u["symbol"]] = fetch_candles(epic, interval, period)
            print(f"[capital] {u['symbol']} ({epic}) · {len(out[u['symbol']])} bars")
        except Exception as e:
            print(f"[capital] {u['symbol']} failed: {e}")
    return out
