"""
EDGAR SCALPER · paper executor

Opens paper trades in Supabase. Later on each scan iteration, checks if
any open paper trade has hit its SL or TP and closes it.
No real orders. No external broker calls.
"""
from datetime import datetime, timezone
import pandas as pd

import config
import journal


def open_from_signal(sig_row_id: str, sig_dict: dict, nav: float = 10_000.0) -> str | None:
    """Size by fixed-risk model: size = (nav * risk%) / (entry - sl distance)."""
    entry = sig_dict["price"]
    sl    = sig_dict["sl"]
    risk_amount = nav * (config.RISK_PER_TRADE_PCT / 100.0)
    distance = abs(entry - sl) or 1e-9
    size = max(1.0, round(risk_amount / distance, 2))
    return journal.open_trade(sig_row_id, sig_dict, size=size, dry_run=True)


def check_exits(current_prices: dict[str, float]) -> list[dict]:
    """Walk open paper trades and close any that hit SL/TP given current prices."""
    closed = []
    for t in journal.open_positions():
        if not t.get("dry_run"):
            continue
        price = current_prices.get(t["symbol"])
        if price is None:
            continue

        hit_tp = (t["side"] == "LONG"  and price >= t["tp"]) or \
                 (t["side"] == "SHORT" and price <= t["tp"])
        hit_sl = (t["side"] == "LONG"  and price <= t["sl"]) or \
                 (t["side"] == "SHORT" and price >= t["sl"])

        if not (hit_tp or hit_sl):
            continue

        exit_reason = "TP" if hit_tp else "SL"
        pnl = (price - t["entry"]) * t["size"] if t["side"] == "LONG" \
              else (t["entry"] - price) * t["size"]
        pnl_pct = (pnl / (t["entry"] * t["size"])) * 100 if t["entry"] else 0

        journal.close_trade(t["id"], exit_price=price, exit_reason=exit_reason,
                            pnl=pnl, pnl_pct=pnl_pct)
        closed.append({**t, "exit": price, "pnl": pnl, "exit_reason": exit_reason})

    return closed
