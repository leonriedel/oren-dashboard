"""
EDGAR SCALPER · Bybit data fetcher

Public kline endpoint — no API key needed. 24/7, no rate-limit stress.
Uses pybit's HTTP client for linear USDT perpetuals.
"""
from __future__ import annotations
import time
import pandas as pd
from pybit.unified_trading import HTTP

# Public endpoint — no auth needed for kline data
_session = HTTP(testnet=False)

# Map our timeframe names → Bybit intervals (as strings)
_TF_MAP = {
    "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
    "1h": "60", "2h": "120", "4h": "240", "6h": "360", "1d": "D",
}


def _bybit_interval(iv: str) -> str:
    return _TF_MAP.get(iv, "15")


def _max_bars(period: str, interval: str) -> int:
    period = period.strip().lower()
    unit = period[-1]
    num = int(period[:-1]) if period[:-1].isdigit() else 7
    per_day = {"1": 1440, "3": 480, "5": 288, "15": 96, "30": 48,
               "60": 24, "120": 12, "240": 6, "D": 1}.get(_bybit_interval(interval), 96)
    if unit == "d":
        return min(num * per_day, 1000)
    if unit == "w":
        return min(num * 7 * per_day, 1000)
    return 500


def fetch_candles(symbol: str, interval: str = "15m", period: str = "7d") -> pd.DataFrame:
    """Return OHLCV DataFrame indexed by UTC timestamps.

    For >1000 bars (Bybit's per-call cap), we paginate backwards using the `end` timestamp.
    """
    want = _max_bars(period, interval)
    iv = _bybit_interval(interval)
    all_rows: list[list] = []
    end_ms: int | None = None

    for _ in range(10):  # safety: max 10 pages → 10,000 bars
        req = dict(category="linear", symbol=symbol, interval=iv, limit=min(1000, want - len(all_rows)))
        if end_ms is not None:
            req["end"] = end_ms

        resp = _session.get_kline(**req)
        if resp.get("retCode") != 0:
            raise RuntimeError(f"Bybit error for {symbol}: {resp.get('retMsg')}")

        rows = resp.get("result", {}).get("list", []) or []
        if not rows:
            break
        all_rows.extend(rows)
        if len(all_rows) >= want:
            break
        # Bybit returns newest first; next page before oldest
        oldest_ts = int(rows[-1][0])
        end_ms = oldest_ts - 1
        time.sleep(0.1)

    if not all_rows:
        raise RuntimeError(f"no candles for {symbol}")

    # Bybit kline row: [start, open, high, low, close, volume, turnover]
    df = pd.DataFrame(all_rows, columns=["start", "open", "high", "low", "close", "volume", "turnover"])
    df["start"] = pd.to_datetime(df["start"].astype("int64"), unit="ms", utc=True)
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["open", "high", "low", "close"])
    df = df.set_index("start").sort_index()
    df = df[["open", "high", "low", "close", "volume"]]
    return df


def fetch_universe(universe: list[dict], interval: str, period: str) -> dict[str, pd.DataFrame]:
    out: dict[str, pd.DataFrame] = {}
    for u in universe:
        sym = u.get("bybit") or u["symbol"]
        try:
            out[u["symbol"]] = fetch_candles(sym, interval, period)
            print(f"[bybit] {u['symbol']} ({sym}) · {len(out[u['symbol']])} bars")
        except Exception as e:
            print(f"[bybit] {u['symbol']} failed: {e}")
    return out
