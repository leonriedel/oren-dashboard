"""
EDGAR BOUNCE · IBKR execution + bookkeeping

Daily cycle (after the US close, with that day's final bars):
  1) exits   — every Edgar position with close > MA10 or held ≥ MAX_HOLD days → its disaster stop is cancelled and a
               SELL market-on-open order is queued for tomorrow's open
  2) entries — stocks in an uptrend that closed below their lower Bollinger band, deepest first, into free slots →
               BUY limit-on-open (skipped if it gaps up > ENTRY_GAP_MAX) with a GTC disaster stop attached

Safety rails
  • Connects with the dedicated Edgar username; refuses to run unless IBKR_ACCOUNT is one of the gateway's managed
    accounts. Every order and query is pinned to IBKR_ACCOUNT.
  • Only trades swing_config.UNIVERSE, only BUY-to-open / SELL-to-close, never sells more than it holds.
  • Never trades on stale data: if today's bar isn't in yet, the cycle retries 15 minutes later.
  • EDGAR_LIVE != "true" → read-only connection, logs what it would do.
  • Halts new entries if Edgar's capital falls MAX_DRAWDOWN_HALT below its high-water mark.
"""
from __future__ import annotations
import json
import math
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ib_insync import IB, Stock, LimitOrder, MarketOrder, StopOrder

import swing_config as cfg
import swing_data
import bounce_strategy as strat
import journal

STATE_FILE = os.path.join(os.path.dirname(__file__), "edgar_state.json")
NY = ZoneInfo("America/New_York")


def ny_today() -> str:
    return datetime.now(NY).date().isoformat()


def last_session() -> str:
    """Most recent completed US trading day (weekdays; before 16:15 ET → previous weekday)."""
    now = datetime.now(NY)
    d = now.date()
    if now.weekday() < 5 and (now.hour, now.minute) < (16, 15):
        d -= timedelta(days=1)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d.isoformat()


# ─── local state ───
def load_state() -> dict:
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {"positions": {}, "fills": [], "last_cycle": None}


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
            raise RuntimeError("IBKR_ACCOUNT missing in .env (the Edgar account id, e.g. U1234567)")
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
        nav_usd = next((float(v.value) for v in vals if v.tag == "NetLiquidation" and v.currency == "USD"), None)
        usd_rate = next((float(v.value) for v in vals if v.tag == "ExchangeRate" and v.currency == "USD"), None)
        cap = nav_usd if nav_usd is not None else (nav_base / usd_rate if (nav_base is not None and usd_rate) else 0.0)
        if cfg.BUDGET_EUR > 0:
            eur_rate = next((float(v.value) for v in vals if v.tag == "ExchangeRate" and v.currency == "EUR"), None)
            budget_usd = cfg.BUDGET_EUR * ((eur_rate / usd_rate) if (eur_rate and usd_rate) else 1.08)
            cap = min(cap, budget_usd) if cap else budget_usd
        return cap

    def cash_usd(self) -> float:
        """Buying power for new entries, in USD (cash account → settled + available funds)."""
        vals = self.ib.accountValues(self.acct)
        rate = next((float(v.value) for v in vals if v.tag == "ExchangeRate" and v.currency == "USD"), None)
        base = next((float(v.value) for v in vals if v.tag == "AvailableFunds" and v.currency not in ("", "USD")), None)
        if base is not None and rate:
            return base / rate
        return next((float(v.value) for v in vals if v.tag == "AvailableFunds" and v.currency == "USD"), 0.0)

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

    def place_entry(self, sig: strat.Signal, qty: int) -> int:
        """BUY limit-on-open + GTC disaster stop (child, activates when the buy fills)."""
        c = self._contract(sig.symbol)
        parent = LimitOrder("BUY", qty, sig.limit, account=self.acct, orderRef=f"{cfg.ORDER_REF}-IN", tif="OPG", transmit=False)
        parent.orderId = self.ib.client.getReqId()
        stop = StopOrder("SELL", qty, sig.stop, account=self.acct, orderRef=f"{cfg.ORDER_REF}-STOP", tif="GTC",
                         parentId=parent.orderId, transmit=True)
        self.ib.placeOrder(c, parent)
        self.ib.placeOrder(c, stop)
        self.ib.sleep(2)
        return parent.orderId

    def place_exit(self, symbol: str, qty: int) -> None:
        """Cancel Edgar's stop for this symbol, then SELL market-on-open."""
        for t in self.edgar_orders():
            if t.contract.symbol == symbol and t.order.action == "SELL" and t.order.orderType in ("STP", "STP LMT"):
                self.ib.cancelOrder(t.order)
        self.ib.sleep(1)
        o = MarketOrder("SELL", qty, account=self.acct, orderRef=f"{cfg.ORDER_REF}-OUT", tif="OPG")
        self.ib.placeOrder(self._contract(symbol), o)
        self.ib.sleep(2)


# ─── bookkeeping: positions/fills → OREN journal ───
def reconcile(b: Broker, state: dict) -> None:
    pos = b.positions()
    st_pos = state.setdefault("positions", {})
    seen = set(state.setdefault("fills", []))
    open_rows = {t["symbol"]: t for t in journal.open_positions() if (t.get("broker") or "").startswith("ibkr")}

    for f in b.ib.fills():
        e = f.execution
        if e.acctNumber != b.acct or e.execId in seen or not str(e.orderRef or "").startswith(cfg.ORDER_REF):
            continue
        seen.add(e.execId)
        rec = st_pos.setdefault(f.contract.symbol, {})
        rec["commission"] = rec.get("commission", 0.0) + (float(f.commissionReport.commission or 0) if f.commissionReport else 0.0)
        if e.side == "BOT":
            try:
                rec["entry_date"] = e.time.astimezone(NY).date().isoformat()
            except Exception:
                rec["entry_date"] = ny_today()
        if e.side == "SLD":
            rec["sold_qty"] = rec.get("sold_qty", 0) + e.shares
            rec["sold_value"] = rec.get("sold_value", 0.0) + e.shares * e.price
            if str(e.orderRef).endswith("STOP"):
                rec["exit_reason"] = "STOP"
    state["fills"] = list(seen)

    for sym, (qty, avg) in pos.items():
        if sym not in cfg.UNIVERSE or qty <= 0:
            continue
        rec = st_pos.setdefault(sym, {})
        rec.setdefault("entry_date", ny_today())  # fallback if the fill happened while Edgar was offline
        if sym not in open_rows and rec.get("signal_id"):
            sig = rec.get("signal", {})
            tid = journal.open_trade(rec["signal_id"], {**sig, "price": avg}, size=qty, dry_run=False, broker="ibkr", note=f"ibkr:{sym}")
            rec.update({"trade_id": tid, "entry": avg, "qty_open": qty})
            print(f"[edgar] OPENED {sym} {qty} @ {avg:.2f}")

    for sym, row in open_rows.items():
        if sym in pos:
            continue
        rec = st_pos.get(sym, {})
        qty, entry = float(row["size"]), float(row["entry"])
        sold_qty = rec.get("sold_qty", 0) or qty
        exit_px = (rec.get("sold_value", 0.0) / sold_qty) if rec.get("sold_value") else entry
        pnl = (exit_px - entry) * qty - rec.get("commission", 0.0)
        journal.close_trade(row["id"], exit_price=exit_px, exit_reason=rec.get("exit_reason", "EXIT"), pnl=pnl, pnl_pct=(exit_px / entry - 1) * 100)
        print(f"[edgar] CLOSED {sym} @ {exit_px:.2f} · pnl ${pnl:.2f}")
        st_pos.pop(sym, None)


# ─── the daily cycle ───
def daily_cycle(b: Broker, state: dict) -> bool:
    """Returns True when the cycle ran on the last session's final data (False → retry next loop)."""
    today = last_session()
    bars = swing_data.universe_bars(cfg.UNIVERSE)
    fresh = [s for s, df in bars.items() if str(df.index[-1]) == today]
    if len(fresh) < 0.8 * len(cfg.UNIVERSE):
        print(f"[edgar] bars for {today} not in yet ({len(fresh)}/{len(cfg.UNIVERSE)}) — retry next loop")
        return False
    bars = {s: bars[s] for s in fresh}

    pos = b.positions()
    st_pos = state.setdefault("positions", {})
    orders = b.edgar_orders()
    pending_buy = {t.contract.symbol for t in orders if t.order.action == "BUY"}
    pending_sell = {t.contract.symbol for t in orders if t.order.action == "SELL" and t.order.orderType == "MKT"}

    # forget entries that never filled (opened above the limit)
    for sym in list(st_pos):
        r = st_pos[sym]
        if sym not in pos and sym not in pending_buy and r.get("date") and r.get("date") != today and not r.get("trade_id"):
            print(f"[edgar] {sym}: entry from {r.get('date')} did not fill — dropped")
            st_pos.pop(sym)

    # 1) exits
    exiting = set()
    for sym, (qty, avg) in pos.items():
        if sym not in cfg.UNIVERSE or sym not in bars or qty <= 0 or sym in pending_sell:
            continue
        rec = st_pos.setdefault(sym, {})
        go, why = strat.should_exit(bars[sym], rec.get("entry_date", today))
        print(f"[edgar] {sym}: {'EXIT → ' if go else ''}{why}")
        if go:
            rec["exit_reason"] = "TIME" if why.startswith("time") else "MA10"
            exiting.add(sym)
            if cfg.LIVE:
                try:
                    b.place_exit(sym, int(qty))
                    print(f"[edgar] → SELL {int(qty)} {sym} at tomorrow's open")
                except Exception as e:
                    journal.log_error(f"exit {sym}: {e}")

    # 2) entries
    capital = b.capital_usd()
    if capital <= 0:
        journal.log_error("Edgar capital is 0 — fund the Edgar account")
        return True
    hwm = max(state.get("hwm", 0.0), capital)
    state["hwm"] = hwm
    if capital < hwm * (1 - cfg.MAX_DRAWDOWN_HALT):
        msg = f"drawdown halt: capital ${capital:,.0f} is {(1 - capital / hwm) * 100:.0f}% below its high ${hwm:,.0f} — no new entries"
        print(f"[edgar] {msg}")
        journal.log_error(msg)
        return True

    held = (set(s for s in pos if s in cfg.UNIVERSE) | pending_buy) - exiting
    slots = max(0, min(cfg.MAX_OPEN - len(held), cfg.MAX_NEW_PER_DAY))
    blocked = held | exiting
    signals = sorted((sig for sig in (strat.scan(sym, df) for sym, df in bars.items() if sym not in blocked) if sig), key=lambda s: s.depth)
    print(f"[edgar] {len(signals)} setup(s) today: {', '.join(s.symbol for s in signals) or '—'} · {slots} free slot(s) · capital ${capital:,.0f}")
    cash = b.cash_usd()
    for s in signals[:slots]:
        qty = math.floor(min(capital / cfg.MAX_OPEN, cash) / s.limit)
        if qty < 1:
            print(f"[edgar] {s.symbol}: not enough cash for 1 share — skip")
            continue
        cash -= qty * s.limit
        sig_dict = {
            "ts": datetime.utcnow().isoformat(), "symbol": s.symbol, "timeframe": "1d", "side": "LONG",
            "confidence": 0.7, "price": s.close, "sl": s.stop, "tp": None, "reasons": ["BB-BOUNCE"] + s.reasons,
        }
        sig_id = journal.log_signal(sig_dict, dry_run=not cfg.LIVE)
        print(f"[edgar] SIGNAL {s.symbol} qty={qty} close={s.close} limit-on-open={s.limit} stop={s.stop}")
        st_pos[s.symbol] = {"signal_id": sig_id, "signal": sig_dict, "date": today}
        if cfg.LIVE:
            try:
                b.place_entry(s, qty)
                print(f"[edgar] → BUY {qty} {s.symbol} at tomorrow's open (limit {s.limit})")
            except Exception as e:
                journal.log_error(f"order {s.symbol}: {e}")
                st_pos.pop(s.symbol, None)
    return True


def snapshot(b: Broker) -> None:
    try:
        pos = b.positions()
        nav = b.nav_base()
        journal.snapshot_equity(nav=nav, cash=nav, unrealized=0, open_positions=len([s for s in pos if s in cfg.UNIVERSE]), dry_run=not cfg.LIVE)
    except Exception as e:
        print(f"[edgar] snapshot: {e}")
