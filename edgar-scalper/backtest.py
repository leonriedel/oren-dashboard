"""
EDGAR SCALPER · simple backtester

Walks the historical candles for each symbol and simulates what the
live signal engine would have done. Produces a CSV + headline stats:
  n_trades, win_rate, avg_win, avg_loss, profit_factor, max_dd.

Run: `python backtest.py [symbol1,symbol2,...] [--days 60]`

Does NOT touch Supabase. Pure historical sim.
"""
import sys
from datetime import datetime
import pandas as pd

import config
import data_fetcher
import indicators


def _args():
    syms = None
    days = 60
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == "--days" and i + 1 < len(args):
            days = int(args[i + 1])
        elif a.startswith("--days="):
            days = int(a.split("=", 1)[1])
        elif not a.startswith("--") and syms is None:
            syms = a.split(",")
    return syms, days


def _simulate_symbol(df: pd.DataFrame, symbol: str) -> list[dict]:
    enriched = indicators.annotate(
        df,
        bb_period=config.BB_PERIOD, bb_std=config.BB_STD,
        rsi_period=config.RSI_PERIOD,
        macd_fast=config.MACD_FAST, macd_slow=config.MACD_SLOW, macd_signal=config.MACD_SIGNAL,
        atr_period=config.ATR_PERIOD,
    ).dropna()

    trades: list[dict] = []
    open_trade = None
    last_entry_ts = None

    for i in range(1, len(enriched)):
        bar = enriched.iloc[i]
        prev = enriched.iloc[i - 1]
        ts = enriched.index[i]

        if open_trade:
            hit_tp = (open_trade["side"] == "LONG"  and bar["high"] >= open_trade["tp"]) or \
                     (open_trade["side"] == "SHORT" and bar["low"]  <= open_trade["tp"])
            hit_sl = (open_trade["side"] == "LONG"  and bar["low"]  <= open_trade["sl"]) or \
                     (open_trade["side"] == "SHORT" and bar["high"] >= open_trade["sl"])

            if hit_tp or hit_sl:
                exit_price = open_trade["tp"] if hit_tp else open_trade["sl"]
                pnl = (exit_price - open_trade["entry"]) if open_trade["side"] == "LONG" \
                      else (open_trade["entry"] - exit_price)
                trades.append({
                    **open_trade,
                    "exit_ts": ts.isoformat(),
                    "exit": exit_price,
                    "exit_reason": "TP" if hit_tp else "SL",
                    "pnl": round(pnl, 5),
                })
                open_trade = None

        if open_trade:
            continue

        if last_entry_ts is not None and (ts - last_entry_ts).total_seconds() < 2 * 15 * 60:
            continue

        price = float(bar["close"])
        atr_v = float(bar["atr"])

        if (bar["close"] <= bar["bb_lower"]
                and bar["rsi"] <= config.RSI_OVERSOLD
                and bar["macd_hist"] > prev["macd_hist"]):
            open_trade = {
                "symbol": symbol, "side": "LONG",
                "entry_ts": ts.isoformat(), "entry": price,
                "sl": price - config.SL_ATR_MULT * atr_v,
                "tp": price + config.TP_ATR_MULT * atr_v,
            }
            last_entry_ts = ts
        elif (bar["close"] >= bar["bb_upper"]
                and bar["rsi"] >= config.RSI_OVERBOUGHT
                and bar["macd_hist"] < prev["macd_hist"]):
            open_trade = {
                "symbol": symbol, "side": "SHORT",
                "entry_ts": ts.isoformat(), "entry": price,
                "sl": price + config.SL_ATR_MULT * atr_v,
                "tp": price - config.TP_ATR_MULT * atr_v,
            }
            last_entry_ts = ts

    return trades


def summarize(trades: list[dict]) -> dict:
    if not trades:
        return {"n": 0}
    wins = [t for t in trades if t["pnl"] > 0]
    losses = [t for t in trades if t["pnl"] < 0]
    total = sum(t["pnl"] for t in trades)
    avg_win = sum(t["pnl"] for t in wins) / len(wins) if wins else 0
    avg_loss = sum(t["pnl"] for t in losses) / len(losses) if losses else 0
    pf = abs((avg_win * len(wins)) / (avg_loss * len(losses))) if losses else float("inf")
    eq = [0.0]
    for t in trades:
        eq.append(eq[-1] + t["pnl"])
    peak = eq[0]
    max_dd = 0.0
    for v in eq:
        peak = max(peak, v)
        max_dd = min(max_dd, v - peak)
    return {
        "n": len(trades),
        "win_rate": round(len(wins) / len(trades), 3),
        "total_pnl": round(total, 5),
        "avg_win":   round(avg_win, 5),
        "avg_loss":  round(avg_loss, 5),
        "profit_factor": round(pf, 2) if pf != float("inf") else "inf",
        "max_dd": round(max_dd, 5),
    }


def main():
    syms, days = _args()
    period = f"{days}d"
    universe = [u for u in config.UNIVERSE if syms is None or u["symbol"] in syms]

    all_trades: list[dict] = []
    for u in universe:
        print(f"\n=== {u['symbol']} ===")
        try:
            df = data_fetcher.fetch_candles(u["yahoo"], config.TIMEFRAME, period)
        except Exception as e:
            print(f"  fetch failed: {e}")
            continue
        trades = _simulate_symbol(df, u["symbol"])
        stats = summarize(trades)
        print(f"  {stats}")
        all_trades.extend(trades)

    print("\n=== COMBINED ===")
    print(summarize(all_trades))

    if all_trades:
        out = f"backtest_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
        pd.DataFrame(all_trades).to_csv(out, index=False)
        print(f"  trades -> {out}")


if __name__ == "__main__":
    main()
