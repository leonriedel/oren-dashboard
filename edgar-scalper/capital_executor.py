"""
EDGAR SCALPER · Capital.com executor (demo or live, set by CAPITAL_ENV)

Same interface as paper_executor / bybit_executor:
  open_from_signal(sig_row_id, sig_dict, nav) → market order with SL + TP attached
  check_exits(current_prices)                → reconcile positions closed by Capital (SL/TP hit)
  account_nav()                              → balance + unrealised P&L in account currency

Risk controls from config.py: RISK_PER_TRADE_PCT, MAX_OPEN_POSITIONS, MAX_DAILY_LOSS_PCT.
Broker deal id is stored in edgar_trades.note as "capital:<dealId>".
"""
from __future__ import annotations
import math
from datetime import datetime, timezone, timedelta

import config
import journal
import capital_client as cap

_market_cache: dict[str, dict] = {}


def _epic(symbol: str) -> str | None:
    for u in config.UNIVERSE:
        if u["symbol"] == symbol:
            return u.get("capital") or symbol.replace("/", "")
    return None


def _market(epic: str) -> dict:
    if epic not in _market_cache:
        _market_cache[epic] = cap.get(f"/api/v1/markets/{epic}")
    return _market_cache[epic]


def _account() -> dict:
    accs = cap.get("/api/v1/accounts").get("accounts", [])
    if not accs:
        return {}
    return next((a for a in accs if a.get("preferred")), accs[0])


def account_nav() -> float:
    try:
        a = _account()
        b = a.get("balance", {})
        return float(b.get("balance", 0)) + float(b.get("profitLoss", 0))
    except Exception as e:
        print(f"[capital] account_nav: {e}")
        return 0.0


def _account_ccy() -> str:
    try:
        return _account().get("currency", "EUR")
    except Exception:
        return "EUR"


def _fx(from_ccy: str, to_ccy: str) -> float:
    """Rate to convert an amount in from_ccy into to_ccy, via Capital snapshots."""
    if from_ccy == to_ccy:
        return 1.0
    for epic, invert in ((f"{from_ccy}{to_ccy}", False), (f"{to_ccy}{from_ccy}", True)):
        try:
            snap = cap.get(f"/api/v1/markets/{epic}").get("snapshot", {})
            mid = (float(snap["bid"]) + float(snap["offer"])) / 2
            return 1 / mid if invert else mid
        except Exception:
            continue
    # cross via USD
    if from_ccy != "USD" and to_ccy != "USD":
        return _fx(from_ccy, "USD") * _fx("USD", to_ccy)
    raise RuntimeError(f"no FX rate {from_ccy}->{to_ccy}")


def _daily_loss_hit(nav: float) -> bool:
    try:
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        rows = journal.client().table("edgar_trades").select("pnl").like("note", "capital:%").gt("closed_at", since).execute().data or []
        pnl = sum((r.get("pnl") or 0) for r in rows)
        if pnl <= -(nav * config.MAX_DAILY_LOSS_PCT / 100):
            print(f"[capital] daily loss stop hit ({pnl:.2f}) → no new entries")
            return True
    except Exception as e:
        print(f"[capital] daily loss check: {e}")
    return False


def _deal_id(trade: dict) -> str | None:
    note = trade.get("note") or ""
    return note.split("capital:", 1)[1] if note.startswith("capital:") else None


def open_from_signal(sig_row_id: str, sig_dict: dict, nav: float | None = None) -> str | None:
    epic = _epic(sig_dict["symbol"])
    if not epic:
        journal.log_error(f"no Capital epic for {sig_dict['symbol']}")
        return None

    live_nav = account_nav() or nav or 500.0
    if _daily_loss_hit(live_nav):
        return None
    mine = [t for t in journal.open_positions() if (t.get("note") or "").startswith("capital:")]
    if len(mine) >= config.MAX_OPEN_POSITIONS:
        print(f"[capital] max open positions reached ({config.MAX_OPEN_POSITIONS})")
        return None

    try:
        m = _market(epic)
    except Exception as e:
        journal.log_error(f"capital market {epic}: {e}")
        return None
    status = (m.get("snapshot", {}).get("marketStatus") or "").upper()
    if status and status != "TRADEABLE":
        print(f"[capital] {epic} not tradeable ({status}) — skip")
        return None

    rules = m.get("dealingRules", {})
    min_size = float((rules.get("minDealSize") or {}).get("value") or 0.01)
    step = float((rules.get("minSizeIncrement") or {}).get("value") or min_size)
    quote_ccy = (m.get("instrument", {}) or {}).get("currency") or "USD"

    entry, sl, tp = float(sig_dict["price"]), float(sig_dict["sl"]), float(sig_dict["tp"])
    distance = abs(entry - sl) or 1e-9
    try:
        risk_acct = live_nav * config.RISK_PER_TRADE_PCT / 100
        risk_quote = risk_acct * _fx(_account_ccy(), quote_ccy)
    except Exception as e:
        journal.log_error(f"capital fx: {e}")
        return None
    raw = risk_quote / distance
    size = math.floor(raw / step) * step
    if size < min_size:
        # min size would exceed planned risk → only allow if it stays below 2× risk
        if min_size * distance > 2 * risk_quote:
            print(f"[capital] {epic}: min size {min_size} too risky for NAV {live_nav:.0f} — skip")
            return None
        size = min_size
    size = round(size, 6)

    body = {
        "epic": epic,
        "direction": "BUY" if sig_dict["side"] == "LONG" else "SELL",
        "size": size,
        "guaranteedStop": False,
        "stopLevel": round(sl, 5),
        "profitLevel": round(tp, 5),
    }
    try:
        ref = cap.post("/api/v1/positions", body).get("dealReference")
        conf = cap.get(f"/api/v1/confirms/{ref}") if ref else {}
    except Exception as e:
        journal.log_error(f"capital order {epic}: {e}")
        return None
    if (conf.get("dealStatus") or "").upper() != "ACCEPTED":
        journal.log_error(f"capital order rejected {epic}: {conf.get('reason') or conf}")
        return None

    deal_id = (conf.get("affectedDeals") or [{}])[0].get("dealId") or conf.get("dealId")
    fill = float(conf.get("level") or entry)
    trade_id = journal.open_trade(sig_row_id, {**sig_dict, "price": fill}, size=size,
                                  dry_run=(cap.env() != "live"),
                                  broker=f"capital-{cap.env()}", note=f"capital:{deal_id}")
    print(f"[capital] {cap.env().upper()} {body['direction']} {epic} size={size} @ {fill} SL={sl} TP={tp} deal={deal_id}")
    return trade_id


def check_exits(current_prices: dict[str, float]) -> list[dict]:
    try:
        pos = cap.get("/api/v1/positions").get("positions", [])
    except Exception as e:
        print(f"[capital] positions: {e}")
        return []
    open_ids = {p.get("position", {}).get("dealId") for p in pos}

    closed = []
    for t in journal.open_positions():
        did = _deal_id(t)
        if not did or did in open_ids:
            continue
        # closed at broker → work out exit + P&L
        price = current_prices.get(t["symbol"]) or t["entry"]
        tp, sl = t.get("tp"), t.get("sl")
        if tp is not None and sl is not None:
            exit_reason = "TP" if abs(price - tp) < abs(price - sl) else "SL"
            exit_price = float(tp if exit_reason == "TP" else sl)
        else:
            exit_reason, exit_price = "MANUAL", float(price)
        size = float(t["size"])
        pnl_quote = (exit_price - t["entry"]) * size if t["side"] == "LONG" else (t["entry"] - exit_price) * size
        pnl = pnl_quote
        try:
            epic = _epic(t["symbol"]) or ""
            quote_ccy = (_market(epic).get("instrument", {}) or {}).get("currency") or "USD"
            pnl = pnl_quote * _fx(quote_ccy, _account_ccy())
        except Exception:
            pass
        # prefer the broker's own figure if the transaction history has it
        try:
            since = (datetime.fromisoformat(str(t["opened_at"]).replace("Z", "+00:00")) - timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%S")
            tx = cap.get("/api/v1/history/transactions", **{"from": since, "type": "TRADE"}).get("transactions", [])
            hits = [x for x in tx if did in str(x.get("reference", "")) or did in str(x.get("note", ""))]
            if hits:
                pnl = sum(float(x.get("size") or 0) for x in hits)
        except Exception:
            pass
        pnl_pct = (pnl / (t["entry"] * size)) * 100 if t["entry"] else 0
        journal.close_trade(t["id"], exit_price=exit_price, exit_reason=exit_reason, pnl=pnl, pnl_pct=pnl_pct)
        closed.append({**t, "exit": exit_price, "pnl": pnl, "exit_reason": exit_reason})
    return closed
