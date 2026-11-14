"""Diagnose why so few trades. Zeigt Funnel: confluences → trades."""
from __future__ import annotations
import sys, pandas as pd
from dotenv import load_dotenv; load_dotenv()
import config, data_fetcher, indicators

sym = sys.argv[1] if len(sys.argv) > 1 else "XAU/USD"
days = int(sys.argv[2]) if len(sys.argv) > 2 else 60

df = data_fetcher.fetch_candles(sym, config.TIMEFRAME, f"{days}d")
a = indicators.annotate(df,
    bb_period=config.BB_PERIOD, bb_std=config.BB_STD,
    rsi_period=config.RSI_PERIOD,
    macd_fast=config.MACD_FAST, macd_slow=config.MACD_SLOW, macd_signal=config.MACD_SIGNAL,
    atr_period=config.ATR_PERIOD).dropna()
print(f"\n=== {sym} · {days}d · {len(a)} bars ===")

bb_lower_t = a['close'] <= a['bb_lower']
bb_upper_t = a['close'] >= a['bb_upper']
rsi_os = a['rsi'] <= config.RSI_OVERSOLD
rsi_ob = a['rsi'] >= config.RSI_OVERBOUGHT
long_bb_rsi = bb_lower_t & rsi_os
short_bb_rsi = bb_upper_t & rsi_ob

# 3-bar window MACD
hist_window_min = a['macd_hist'].rolling(3, min_periods=1).min().shift(1)
hist_window_max = a['macd_hist'].rolling(3, min_periods=1).max().shift(1)
long_full_3 = long_bb_rsi & (a['macd_hist'] > hist_window_min)
short_full_3 = short_bb_rsi & (a['macd_hist'] < hist_window_max)

# No MACD filter
print(f"NO MACD FILTER:        LONG {long_bb_rsi.sum():4d}  SHORT {short_bb_rsi.sum():4d}")
print(f"MACD 3-bar window:     LONG {long_full_3.sum():4d}  SHORT {short_full_3.sum():4d}")

# Simulate with cooldown 2 bars + 1 open position
def simulate(entries, prices, atr_values, sl_mult, tp_mult, cooldown_bars, side):
    trades = []; open_trade = None; last_entry = -1000
    for i, (is_entry, price, atr_v) in enumerate(zip(entries, prices, atr_values)):
        if open_trade:
            hit_tp = (side == "LONG" and price >= open_trade["tp"]) or (side == "SHORT" and price <= open_trade["tp"])
            hit_sl = (side == "LONG" and price <= open_trade["sl"]) or (side == "SHORT" and price >= open_trade["sl"])
            if hit_tp or hit_sl:
                trades.append({"side": side, "entry": open_trade["entry"], "exit": open_trade["tp"] if hit_tp else open_trade["sl"], "reason": "TP" if hit_tp else "SL"})
                open_trade = None
        if open_trade: continue
        if i - last_entry < cooldown_bars: continue
        if is_entry:
            if side == "LONG":
                open_trade = {"entry": price, "sl": price - sl_mult*atr_v, "tp": price + tp_mult*atr_v}
            else:
                open_trade = {"entry": price, "sl": price + sl_mult*atr_v, "tp": price - tp_mult*atr_v}
            last_entry = i
    return trades

close = a['close'].values
atr_v = a['atr'].values

for cfg_name, long_cond, short_cond in [
    ("NO_MACD",  long_bb_rsi.values,  short_bb_rsi.values),
    ("MACD_3bar", long_full_3.values, short_full_3.values),
]:
    L = simulate(long_cond, close, atr_v, config.SL_ATR_MULT, config.TP_ATR_MULT, 2, "LONG")
    S = simulate(short_cond, close, atr_v, config.SL_ATR_MULT, config.TP_ATR_MULT, 2, "SHORT")
    all_t = L + S
    wins = sum(1 for t in all_t if (t["exit"] > t["entry"]) == (t["side"] == "LONG"))
    print(f"  {cfg_name:12s} → {len(all_t):3d} trades  (L {len(L)}, S {len(S)})  wins={wins}")
