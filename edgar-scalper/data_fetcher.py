"""
EDGAR SCALPER · data fetcher

Yahoo Finance (gratis, no key, intraday up to 60d) is the data source.
Later: optional OANDA historical fetcher for consistency with execution.
"""
import yfinance as yf
import pandas as pd


def fetch_candles(yahoo_ticker: str, interval: str = "15m", period: str = "7d") -> pd.DataFrame:
    """Return OHLCV DataFrame indexed by UTC timestamps.

    yfinance intraday limits:
      - 1m:    7d lookback max
      - 5m:   60d
      - 15m:  60d
      - 30m:  60d
      - 60m: 730d
    """
    df = yf.download(
        yahoo_ticker,
        interval=interval,
        period=period,
        progress=False,
        auto_adjust=False,
        threads=False,
    )
    if df is None or df.empty:
        raise RuntimeError(f"no data for {yahoo_ticker}")

    # yfinance returns multi-index columns when multiple tickers; squeeze if needed
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df = df.rename(columns=str.lower)
    needed = {"open", "high", "low", "close", "volume"}
    missing = needed - set(df.columns)
    if missing:
        raise RuntimeError(f"missing cols {missing} for {yahoo_ticker}")

    df = df[["open", "high", "low", "close", "volume"]].dropna()
    df.index = pd.to_datetime(df.index, utc=True)
    return df


def fetch_universe(universe: list[dict], interval: str, period: str) -> dict[str, pd.DataFrame]:
    """Fetch candles for every symbol in the universe. Returns {symbol: df}."""
    out = {}
    for u in universe:
        try:
            out[u["symbol"]] = fetch_candles(u["yahoo"], interval, period)
        except Exception as e:
            print(f"[data_fetcher] {u['symbol']} failed: {e}")
    return out
