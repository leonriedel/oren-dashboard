"""
EDGAR SCALPER · Bybit live executor

Mirrors paper_executor.py API so scheduler.py can swap one for the other.

Flow:
  open_from_signal(sig_id, sig_dict, nav) → places a market order with attached
    SL + TP on Bybit USDT-perpetual, logs to Supabase.
  check_exits(current_prices) → polls Bybit open positions, reconciles with
    our Supabase journal; closes any trades that Bybit shows as closed.

Risk controls honored from config.py:
  RISK_PER_TRADE_PCT, MAX_OPEN_POSITIONS, MAX_DAILY_LOSS_PCT
"""
from __future__ import annotations
import os
from datetime import datetime, timezone, timedelta
from pybit.unified_trading import HTTP

import config
import journal

_API_KEY    = os.getenv("BYBIT_API_KEY", "")
_API_SECRET = os.getenv("BYBIT_API_SECRET", "")
_TESTNET    = os.getenv("BYBIT_TESTNET", "false").lower() == "true"

_session: HTTP | None = None


def client() -> HTTP:
    global _session
    if _session is None:
        if not _API_KEY or not _API_SECRET:
            raise RuntimeError("BYBIT_API_KEY / BYBIT_API_SECRET missing")
        _session = HTTP(testnet=_TESTNET, api_key=_API_KEY, api_secret=_API_SECRET)
    return _session


def _sym_to_bybit(symbol: str) -> str | None:
    for u in config.UNIVERSE:
        if u["symbol"] == symbol:
            return u.get("bybit") or u["symbol"]
    return None


def _instrument_info(bybit_sym: str) -> dict:
    """Cache-less call; small response. Needed for min qty + step."""
    r = client().get_instruments_info(category="linear", symbol=bybit_sym)
    if r.get("retCode") != 0:
        raise RuntimeError(f"instruments_info failed: {r.get('retMsg')}")
    items = r.get("result", {}).get("list") or []
    if not items:
        raise RuntimeError(f"instrument {bybit_sym} not found on Bybit linear")
    return items[0]


def _round_qty(qty: float, step: float, min_qty: float) -> float:
    q = max(min_qty, qty)
    # floor to step
    n = int(q / step)
    out = n * step
    if out < min_qty:
        out = min_qty
    return round(out, 8)


def _wallet_nav_usdt() -> float:
    """Unified Trading Account total equity in USDT."""
    try:
        r = client().get_wallet_balance(accountType="UNIFIED", coin="USDT")
        if r.get("retCode") != 0:
            return 0.0
        lst = r.get("result", {}).get("list") or []
        if not lst:
            return 0.0
        return float(lst[0].get("totalEquity") or 0)
    except Exception as e:
        print(f"[bybit] wallet balance: {e}")
        return 0.0


def _daily_loss_guard(nav: float) -> bool:
    """Returns True if we hit daily loss stop → caller should SKIP new entries."""
    try:
        sup = journal.client()
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        closed = sup.table("edgar_trades").select("pnl").gt("closed_at", since).execute().data or []
        today_pnl = sum((t.get("pnl") or 0) for t in closed)
        max_loss = -(nav * config.MAX_DAILY_LOSS_PCT / 100.0)
        if today_pnl <= max_loss:
            print(f"[bybit] daily loss stop hit: {today_pnl:.2f} ≤ {max_loss:.2f} → no new entries")
            return True
    except Exception as e:
        print(f"[bybit] daily_loss_guard: {e}")
    return False


def open_from_signal(sig_row_id: str, sig_dict: dict, nav: float = None) -> str | None:
    """Open a market order on Bybit with SL+TP attached, log trade to Supabase."""
    bybit_sym = _sym_to_bybit(sig_dict["symbol"])
    if not bybit_sym:
        journal.log_error(f"no Bybit mapping for {sig_dict['symbol']}")
        return None

    # Get live NAV from Bybit wallet (overrides the passed nav)
    live_nav = _wallet_nav_usdt() or nav or 500.0

    # Daily loss guard
    if _daily_loss_guard(live_nav):
        return None

    # Max open positions guard
    opens = journal.open_positions()
    live_opens = [t for t in opens if not t.get("dry_run")]
    if len(live_opens) >= config.MAX_OPEN_POSITIONS:
        print(f"[bybit] max open positions ({config.MAX_OPEN_POSITIONS}) reached")
        return None

    # Instrument info
    try:
        info = _instrument_info(bybit_sym)
    except Exception as e:
        journal.log_error(f"instrument_info {bybit_sym}: {e}")
        return None

    price_filter = info.get("priceFilter", {})
    lot_filter   = info.get("lotSizeFilter", {})
    tick_size    = float(price_filter.get("tickSize", "0.01"))
    qty_step     = float(lot_filter.get("qtyStep", "0.001"))
    min_qty      = float(lot_filter.get("minOrderQty", "0.001"))

    # Risk-based sizing
    entry = float(sig_dict["price"])
    sl    = float(sig_dict["sl"])
    distance = abs(entry - sl) or 1e-9
    risk_amt = live_nav * (config.RISK_PER_TRADE_PCT / 100.0)
    raw_qty = risk_amt / distance
    qty = _round_qty(raw_qty, qty_step, min_qty)

    # Round SL/TP to tick
    def _tickround(p: float) -> str:
        n = round(p / tick_size)
        return f"{n * tick_size:.10f}".rstrip('0').rstrip('.')

    side = "Buy" if sig_dict["side"] == "LONG" else "Sell"

    try:
        r = client().place_order(
            category="linear",
            symbol=bybit_sym,
            side=side,
            orderType="Market",
            qty=str(qty),
            takeProfit=_tickround(float(sig_dict["tp"])),
            stopLoss=_tickround(float(sig_dict["sl"])),
            tpTriggerBy="MarkPrice",
            slTriggerBy="MarkPrice",
            tpslMode="Full",
            positionIdx=0,
            reduceOnly=False,
        )
    except Exception as e:
        journal.log_error(f"bybit place_order {bybit_sym}: {e}")
        return None

    if r.get("retCode") != 0:
        journal.log_error(f"bybit order rejected {bybit_sym}: {r.get('retMsg')} / {r.get('retExtInfo')}")
        return None

    actual_price = entry  # market order: we log signal price; fill reconciled later

    trade_id = journal.open_trade(
        sig_row_id,
        {**sig_dict, "price": actual_price},
        size=qty,
        dry_run=False,
    )
    print(f"[bybit] LIVE order placed: {bybit_sym} {side} qty={qty} @ ~{entry} SL={sl} TP={sig_dict['tp']}")
    return trade_id


def check_exits(current_prices: dict[str, float]) -> list[dict]:
    """Reconcile: ask Bybit for open positions, close journal entries no longer open there."""
    try:
        r = client().get_positions(category="linear", settleCoin="USDT")
        if r.get("retCode") != 0:
            print(f"[bybit] get_positions: {r.get('retMsg')}")
            return []
        bybit_open = {p["symbol"] for p in r.get("result", {}).get("list") or [] if float(p.get("size", 0)) > 0}
    except Exception as e:
        print(f"[bybit] get_positions exception: {e}")
        return []

    closed = []
    for t in journal.open_positions():
        if t.get("dry_run"):
            continue
        bybit_sym = _sym_to_bybit(t["symbol"])
        if not bybit_sym:
            continue
        if bybit_sym in bybit_open:
            continue  # still open on Bybit

        # Position was closed on Bybit — find last trade history to get exit price + pnl
        try:
            hist = client().get_closed_pnl(category="linear", symbol=bybit_sym, limit=5)
            items = hist.get("result", {}).get("list") or []
            if not items:
                # fall back to current price
                exit_price = current_prices.get(t["symbol"]) or t["entry"]
                pnl = (exit_price - t["entry"]) * t["size"] if t["side"] == "LONG" else (t["entry"] - exit_price) * t["size"]
                exit_reason = "UNKNOWN"
            else:
                last = items[0]
                exit_price = float(last.get("avgExitPrice") or t["entry"])
                pnl = float(last.get("closedPnl") or 0)
                exit_reason = "TP" if pnl > 0 else "SL"

            pnl_pct = (pnl / (t["entry"] * t["size"])) * 100 if t["entry"] else 0
            journal.close_trade(t["id"], exit_price=exit_price, exit_reason=exit_reason,
                                pnl=pnl, pnl_pct=pnl_pct)
            closed.append({**t, "exit": exit_price, "pnl": pnl, "exit_reason": exit_reason})
            print(f"[bybit] reconciled CLOSE {t['symbol']} {t['side']} → {exit_reason} · pnl ${pnl:.2f}")
        except Exception as e:
            print(f"[bybit] reconcile {t['symbol']}: {e}")

    return closed
