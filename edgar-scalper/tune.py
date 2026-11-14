"""Tune SL/TP ratios on real data. BB+RSI only (no MACD filter)."""
from __future__ import annotations
import sys, pandas as pd
from dotenv import load_dotenv; load_dotenv()
import config, data_fetcher, indicators

def simulate(a, sl_mult, tp_mult, cooldown):
    bb_lower = a['close'] <= a['bb_lower']
    bb_upper = a['close'] >= a['bb_upper']
    rsi_os = a['rsi'] <= config.RSI_OVERSOLD
    rsi_ob = a['rsi'] >= config.RSI_OVERBOUGHT
    long_sig = (bb_lower & rsi_os).values
    short_sig = (bb_upper & rsi_ob).values
    high = a['high'].values; low = a['low'].values; close = a['close'].values; atr = a['atr'].values
    trades = []
    open_t = None; last_entry = -1000

    for i in range(len(a)):
        if open_t:
            # intrabar check with high/low
            if open_t['side'] == 'LONG':
                hit_tp = high[i] >= open_t['tp']
                hit_sl = low[i]  <= open_t['sl']
            else:
                hit_tp = low[i]  <= open_t['tp']
                hit_sl = high[i] >= open_t['sl']
            if hit_tp or hit_sl:
                exit_p = open_t['tp'] if hit_tp else open_t['sl']
                pnl = (exit_p - open_t['entry']) if open_t['side']=='LONG' else (open_t['entry'] - exit_p)
                trades.append({'side': open_t['side'], 'pnl': pnl})
                open_t = None
        if open_t: continue
        if i - last_entry < cooldown: continue

        if long_sig[i]:
            open_t = {'side':'LONG','entry':close[i],'sl':close[i]-sl_mult*atr[i],'tp':close[i]+tp_mult*atr[i]}
            last_entry = i
        elif short_sig[i]:
            open_t = {'side':'SHORT','entry':close[i],'sl':close[i]+sl_mult*atr[i],'tp':close[i]-tp_mult*atr[i]}
            last_entry = i

    if not trades: return {'n':0,'win_rate':0,'pf':0,'total':0}
    wins = [t['pnl'] for t in trades if t['pnl']>0]
    losses = [t['pnl'] for t in trades if t['pnl']<0]
    total = sum(t['pnl'] for t in trades)
    pf = abs(sum(wins)/sum(losses)) if losses else float('inf')
    return {'n':len(trades), 'win_rate':round(len(wins)/len(trades),3), 'pf':round(pf,2), 'total':round(total,5)}

sym = sys.argv[1] if len(sys.argv) > 1 else "XAU/USD"
days = int(sys.argv[2]) if len(sys.argv) > 2 else 60

df = data_fetcher.fetch_candles(sym, config.TIMEFRAME, f"{days}d")
a = indicators.annotate(df,
    bb_period=config.BB_PERIOD, bb_std=config.BB_STD,
    rsi_period=config.RSI_PERIOD,
    macd_fast=config.MACD_FAST, macd_slow=config.MACD_SLOW, macd_signal=config.MACD_SIGNAL,
    atr_period=config.ATR_PERIOD).dropna()

print(f"\n=== {sym} · {days}d · {len(a)} bars ===")
print(f"{'SL':>5} {'TP':>5} {'R:R':>5} | {'n':>4} {'WR':>6} {'PF':>7} {'TOTAL':>10}")
print("-" * 55)
for sl in (1.0, 1.5, 2.0):
    for tp in (1.5, 2.0, 2.5, 3.0, 4.0):
        r = simulate(a, sl, tp, cooldown=2)
        rr = round(tp/sl, 2)
        flag = " ✓" if r['n'] > 30 and r['win_rate'] * (1+rr) > 1 else ""
        print(f"{sl:>5} {tp:>5} {rr:>5} | {r['n']:>4} {r['win_rate']:>6} {r['pf']:>7} {r['total']:>10}{flag}")
