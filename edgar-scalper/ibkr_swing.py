"""
EDGAR SWING · IBKR execution + bookkeeping

Safety rails
  • Connects to IB Gateway with the dedicated Edgar username; refuses to run unless IBKR_ACCOUNT is one of the
    gateway's managed accounts. Every order and every query is pinned to IBKR_ACCOUNT.
  • Only trades the whitelist in swing_config.UNIVERSE, only BUY-to-open / SELL-to-close.
  • Never touches a position it did not open (tracked in edgar_state.json + orderRef "EDGAR").
  • EDGAR_LIVE != "true" → read-only connection, logs what it would do.
  • Stops/targets are bracket orders held at IBKR (they work even if the Mac is off).
"""
from __future__ import annotations
import json
import math
import os
from datetime import datetime, timezone, timedelta

from ib_insync import IB, Stock, LimitOrder, StopOrder

import swing_config as cfg
import swing_data
import swing_strategy as strat
import journal

STATE_FILE = os.path.join(os.path.dirname(__file__), "edgar_state.json")


# ─── local state (entries, initial risk, processed fills) ───
def load_state() -> dict:
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {"positions": {}, "fills": [], "last_cycle": None, "new_today": {}}


def save_state(s: dict) -> None:
    s["fills"] = s.get("fills", [])[-500:]
    with open(STATE_FILE, "w") as f:
        json.dump(s, f, indent=2, default=str)


class Broker:
    def __init__(self) -> None:
        self.ib = IB()
        self.acct = cfg.IBKR_ACCOUNT

    # ─── connection ───
    def connect(self) -> None:
        if self.ib.isConnected():
            return
        if not self.acct:
            raise RuntimeError("IBKR_ACCOUNT missing in .env (the NEW Edgar account id, e.g. U1234567)")
        self.ib.connect(cfg.IBKR_HOST, cfg.IBKR_PORT, clientId=cfg.IBKR_CLIENT, readonly=not cfg.LIVE, timeout=15)
        accts = self.ib.managedAccounts()
        if self.acct not in accts:
            self.ib.disconnect()
            raise RuntimeError(f"Gateway login does not manage {self.acct} (sees {accts}). Log into IB Gateway with the Edgar user.")
        if len(accts) > 1:
            print(f"[ibkr] ⚠ gateway sees several accounts {accts} — Edgar only ever uses {self.acct}")
        print(f"[ibkr] connected · account {self.acct} · {'LIVE' if cfg.LIVE else 'DRY-RUN (read-only)'}")

    # ─── account ───
    def capital_usd(self) -> float:
        vals = self.ib.accountValues(self.acct)
        nav_base = next((float(v.value) for v in vals if v.tag == "NetLiquidation" and v.currency not in ("", "USD")), None)
        nav_usd_direct = next((float(v.value) for v in vals if v.tag == "NetLiquidation" and v.currency == "USD"), None)
        usd_rate = next((float(v.value) for v in vals if v.tag == "ExchangeRate" and v.currency == "USD"), None)  # base per 1 USD
        if nav_usd_direct is not None:
            cap = nav_usd_direct
        elif nav_base is not None and usd_rate:
            cap = nav_base / usd_rate
        else:
            cap = 0.0
        if cfg.BUDGET_EUR > 0:
            eur_rate = next((float(v.value) for v in vals if v.tag == "ExchangeRate" and v.currency == "EUR"), None)
            budget_usd = cfg.BUDGET_EUR * ((eur_rate / usd_rate) if (eur_rate and usd_rate) else 1.08)
            cap = min(cap, budget_usd) if cap else budget_usd
        return cap

    def nav_base(self) -> float:
        vals = self.ib.accountValues(self.acct)
        return next((float(v.value) for v in vals if v.tag == "NetLiquidation" and v.currency not in ("",)), 0.0)

    def positions(self) -> dict[str, tuple[float, float]]:
        out = {}
        for p in self.ib.positions(self.acct):
            if p.contract.secType == "STK" and p.position:
                out[p.contract.symbol] = (float(p.position), float(p.avgCost))
        return out

    def edgar_orders(self):
        return [t for t in self.ib.openTrades() if t.order.account == self.acct and str(t.order.orderRef).startswith(cfg.ORDER_REF)]

    # ─── orders ───
    def _contract(self, symbol: str) -> Stock:
        c = Stock(symbol, "SMART", "USD")
        self.ib.qualifyContracts(c)
        return c

    def place_entry(self, sig: strat.Signal, qty: int) -> list[int]:
        c = self._contract(sig.symbol)
        ids: list[int] = []
        q_trail = qty // 2 if qty >= 2 else qty
        q_tp = qty - q_trail
        if q_tp > 0:
            bracket = self.ib.bracketOrder("BUY", q_tp, sig.limit, sig.target, sig.stop)
            for o in bracket:
                o.account = self.acct
                o.orderRef = f"{cfg.ORDER_REF}-TP"
                o.tif = "DAY" if o.action == "BUY" else "GTC"
            for o in bracket:
                self.ib.placeOrder(c, o)
            ids.append(bracket[0].orderId)
        parent = LimitOrder("BUY", q_trail, sig.limit, account=self.acct, orderRef=f"{cfg.ORDER_REF}-TRAIL", tif="DAY", transmit=False)
        parent.orderId = self.ib.client.getReqId()
        stop = StopOrder("SELL", q_trail, sig.stop, account=self.acct, orderRef=f"{cfg.ORDER_REF}-TRAIL", tif="GTC", parentId=parent.orderId, transmit=True)
        self.ib.placeOrder(c, parent)
        self.ib.placeOrder(c, stop)
        ids.append(parent.orderId)
        self.ib.sleep(2)
        return ids

    def raise_trail_stop(self, symbol: str, new_stop: float) -> bool:
        for t in self.edgar_orders():
            o = t.order
            if t.contract.symbol == symbol and o.orderType == "STP" and o.orderRef == f"{cfg.ORDER_REF}-TRAIL" and new_stop > (o.auxPrice or 0) + 0.01:
                o.auxPrice = round(new_stop, 2)
                self.ib.placeOrder(t.contract, o)
                return True
        return False


# ─── bookkeeping: positions/fills → OREN journal ───
def reconcile(b: Broker, state: dict) -> None:
    pos = b.positions()
    st_pos = state.setdefault("positions", {})
    seen = set(state.setdefault("fills", []))
    open_rows = {t["symbol"]: t for t in journal.open_positions() if (t.get("broker") or "").startswith("ibkr")}

    # new SELL fills (partial exits) → accumulate realized proceeds
    for f in b.ib.fills():
        e = f.execution
        if e.acctNumber != b.acct or e.execId in seen or not str(e.orderRef or "").startswith(cfg.ORDER_REF):
            continue
        seen.add(e.execId)
        sym = f.contract.symbol
        rec = st_pos.setdefault(sym, {})
        comm = float(f.commissionReport.commission or 0) if f.commissionReport else 0.0
        rec["commission"] = rec.get("commission", 0.0) + comm
        if e.side == "SLD":
            rec["sold_qty"] = rec.get("sold_qty", 0) + e.shares
            rec["sold_value"] = rec.get("sold_value", 0.0) + e.shares * e.price
    state["fills"] = list(seen)

    # opened
    for sym, (qty, avg) in pos.items():
        if sym not in cfg.UNIVERSE or qty <= 0:
            continue
        rec = st_pos.setdefault(sym, {})
        if sym not in open_rows and rec.get("signal_id"):
            sig = rec.get("signal", {})
            tid = journal.open_trade(rec["signal_id"], {**sig, "price": avg}, size=qty, dry_run=False, broker="ibkr", note=f"ibkr:{sym}")
            rec.update({"trade_id": tid, "entry": avg, "qty_open": qty})
            print(f"[edgar] OPENED {sym} {qty} @ {avg:.2f}")

    # closed (flat at IBKR, open in journal)
    for sym, row in open_rows.items():
        if sym in pos:
            continue
        rec = st_pos.get(sym, {})
        qty = float(row["size"])
        entry = float(row["entry"])
        sold_qty = rec.get("sold_qty", 0) or qty
        exit_px = (rec.get("sold_value", 0.0) / sold_qty) if rec.get("sold_value") else entry
        pnl = (exit_px - entry) * qty - rec.get("commission", 0.0)
        reason = "TP" if row.get("tp") and exit_px >= float(row["tp"]) * 0.995 else "STOP"
        journal.close_trade(row["id"], exit_price=exit_px, exit_reason=reason, pnl=pnl, pnl_pct=(exit_px / entry - 1) * 100)
        print(f"[edgar] CLOSED {sym} @ {exit_px:.2f} · pnl ${pnl:.2f}")
        st_pos.pop(sym, None)


# ─── the daily cycle ───
def daily_cycle(b: Broker, state: dict) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    bars = swing_data.universe_bars(cfg.UNIVERSE + [cfg.MARKET])
    spy = bars.get(cfg.MARKET)
    risk_on = spy is not None and strat.market_ok(spy)
    print(f"[edgar] market filter SPY>MA200: {'ON' if risk_on else 'OFF — no new entries'}")

    pos = b.positions()
    st_pos = state.setdefault("positions", {})

    # 1) trail stops on open positions
    for sym, (qty, avg) in pos.items():
        if sym not in cfg.UNIVERSE or sym not in bars:
            continue
        rec = st_pos.get(sym, {})
        risk = rec.get("risk_per_share") or (avg * 0.05)
        cur = rec.get("trail_stop") or rec.get("signal", {}).get("sl") or 0
        new = strat.trail_stop(bars[sym], avg, float(cur), float(risk))
        if new > cur:
            ok = b.raise_trail_stop(sym, new) if cfg.LIVE else False
            print(f"[edgar] trail {sym}: {cur} → {new} {'(sent)' if ok else '(dry/no order)'}")
            if ok or not cfg.LIVE:
                rec["trail_stop"] = new

    # 2) new entries
    if not risk_on:
        return
    pending = {t.contract.symbol for t in b.edgar_orders() if t.order.action == "BUY"}
    held = set(pos) | pending
    slots = cfg.MAX_OPEN - len([s for s in held if s in cfg.UNIVERSE])
    new_today = state.setdefault("new_today", {}).get(today, 0)
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    try:
        closed = journal.client().table("edgar_trades").select("pnl").eq("broker", "ibkr").gt("closed_at", since).execute().data or []
        day_pnl = sum((r.get("pnl") or 0) for r in closed)
    except Exception:
        day_pnl = 0.0
    capital = b.capital_usd()
    if capital <= 0:
        journal.log_error("Edgar capital is 0 — fund the Edgar account")
        return
    if day_pnl <= -cfg.MAX_DAILY_LOSS * capital:
        print("[edgar] daily loss limit reached — no new entries")
        return

    signals = []
    for sym in cfg.UNIVERSE:
        if sym in held or sym not in bars:
            continue
        s = strat.scan(sym, bars[sym])
        if s:
            signals.append(s)
    signals.sort(key=lambda s: 0 if s.setup == "PULLBACK" else 1)

    for s in signals:
        if slots <= 0 or new_today >= cfg.MAX_NEW_PER_DAY:
            break
        qty = math.floor(capital * cfg.RISK_PER_TRADE / s.risk_per_share)
        qty = min(qty, math.floor(capital * cfg.MAX_POSITION_PCT / s.limit))
        if qty < 1:
            print(f"[edgar] {s.symbol}: position too small for capital ${capital:.0f} — skip")
            continue
        sig_dict = {
            "ts": datetime.now(timezone.utc).isoformat(), "symbol": s.symbol, "timeframe": "1d", "side": "LONG",
            "confidence": 0.75 if s.setup == "PULLBACK" else 0.7, "price": s.limit, "sl": s.stop, "tp": s.target,
            "reasons": [s.setup] + s.reasons,
        }
        sig_id = journal.log_signal(sig_dict, dry_run=not cfg.LIVE)
        print(f"[edgar] SIGNAL {s.symbol} {s.setup} qty={qty} limit={s.limit} stop={s.stop} target={s.target}")
        st_pos[s.symbol] = {"signal_id": sig_id, "signal": sig_dict, "risk_per_share": s.risk_per_share, "trail_stop": s.stop, "date": today}
        if cfg.LIVE:
            try:
                b.place_entry(s, qty)
                print(f"[edgar] → orders sent for {s.symbol}")
            except Exception as e:
                journal.log_error(f"order {s.symbol}: {e}")
                continue
        slots -= 1
        new_today += 1
    state["new_today"] = {today: new_today}


def snapshot(b: Broker) -> None:
    try:
        pos = b.positions()
        nav = b.nav_base()
        journal.snapshot_equity(nav=nav, cash=nav, unrealized=0, open_positions=len([s for s in pos if s in cfg.UNIVERSE]), dry_run=not cfg.LIVE)
    except Exception as e:
        print(f"[edgar] snapshot: {e}")
