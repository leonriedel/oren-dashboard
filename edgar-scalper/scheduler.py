"""
EDGAR SCALPER · scheduler (main process)

Loops every SCAN_EVERY_MIN:
  1. Heartbeat
  2. Fetch candles for every universe symbol
  3. Run signal engine on each
  4. Honour cooldown per symbol
  5. If signal confident enough, open paper/live trade
  6. Check open trades against latest price → close if SL/TP hit
  7. Every EQUITY_EVERY_MIN: snapshot NAV

Run: `python scheduler.py`
"""
import time
from datetime import datetime, timezone, timedelta

import config
import data_fetcher
import signal_engine
import journal
import paper_executor
import oanda_executor


EXECUTOR = oanda_executor if config.MODE == "live" else paper_executor


def within_cooldown(symbol: str) -> bool:
    last = journal.last_signal_ts(symbol)
    if not last:
        return False
    try:
        last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
    except Exception:
        return False
    return datetime.now(timezone.utc) - last_dt < timedelta(minutes=config.COOLDOWN_MIN)


def tick(state: dict) -> None:
    now = datetime.now(timezone.utc)
    print(f"\n[edgar] tick {now.isoformat()}  mode={config.MODE}")

    # 1. heartbeat
    journal.heartbeat(
        mode=config.MODE,
        universe=[u["symbol"] for u in config.UNIVERSE],
        version=config.VERSION,
        last_scan=now.isoformat(),
    )

    # 2. fetch candles
    try:
        candles = data_fetcher.fetch_universe(config.UNIVERSE, config.TIMEFRAME, config.LOOKBACK)
    except Exception as e:
        print(f"[edgar] fetch failed: {e}")
        journal.log_error(f"fetch: {e}")
        return

    # 3. derive current price per symbol
    current_prices = {
        sym: float(df["close"].iloc[-1]) for sym, df in candles.items()
    }

    # 4. check exits first (free up risk budget before entering)
    closed = EXECUTOR.check_exits(current_prices)
    for c in closed:
        print(f"[edgar] CLOSED {c['symbol']} {c['side']} → {c['exit_reason']} · pnl ${c.get('pnl',0):.2f}")

    # 5. scan for new signals
    open_cnt = len(journal.open_positions())
    for u in config.UNIVERSE:
        if open_cnt >= config.MAX_OPEN_POSITIONS:
            print(f"[edgar] max positions ({config.MAX_OPEN_POSITIONS}) — skipping further scans")
            break
        sym = u["symbol"]
        df = candles.get(sym)
        if df is None or df.empty:
            continue
        if within_cooldown(sym):
            continue

        sig = signal_engine.scan(sym, config.TIMEFRAME, df)
        if not sig:
            continue

        sig_dict = signal_engine.signal_to_dict(sig)
        print(f"[edgar] SIGNAL {sym} {sig.side} conf={sig.confidence} @ {sig.price}")

        sig_id = journal.log_signal(sig_dict, dry_run=(config.MODE != "live"))
        if not sig_id:
            continue

        # attempt open
        trade_id = EXECUTOR.open_from_signal(sig_id, sig_dict, nav=state.get("nav", 10_000.0))
        if trade_id:
            open_cnt += 1

    # 6. periodic equity snapshot
    if (now - state["last_equity_at"]) >= timedelta(minutes=config.EQUITY_EVERY_MIN):
        _snapshot_equity(state, current_prices)
        state["last_equity_at"] = now


def _snapshot_equity(state: dict, current_prices: dict[str, float]) -> None:
    """Rough NAV: starting cash + sum(closed pnl) + sum(open unrealized)."""
    starting = state.get("starting_nav", 10_000.0)
    # closed pnl total
    sup = journal.client()
    try:
        closed = sup.table("edgar_trades").select("pnl").not_.is_("closed_at", "null").execute().data or []
        closed_pnl = sum((t.get("pnl") or 0) for t in closed)
    except Exception:
        closed_pnl = 0.0

    opens = journal.open_positions()
    unreal = 0.0
    for t in opens:
        p = current_prices.get(t["symbol"])
        if p is None:
            continue
        if t["side"] == "LONG":
            unreal += (p - t["entry"]) * t["size"]
        else:
            unreal += (t["entry"] - p) * t["size"]

    nav = starting + closed_pnl + unreal
    state["nav"] = nav
    journal.snapshot_equity(nav=nav, cash=starting + closed_pnl,
                            unrealized=unreal, open_positions=len(opens),
                            dry_run=(config.MODE != "live"))
    print(f"[edgar] equity snapshot · NAV ${nav:.2f} · unreal ${unreal:.2f} · opens {len(opens)}")


def main():
    print(f"[edgar] starting · version {config.VERSION} · mode {config.MODE}")
    state = {
        "starting_nav":   10_000.0,
        "nav":            10_000.0,
        "last_equity_at": datetime.now(timezone.utc) - timedelta(hours=1),
    }
    # initial heartbeat + equity so dashboard lights up
    journal.heartbeat(config.MODE, [u["symbol"] for u in config.UNIVERSE], config.VERSION)
    journal.snapshot_equity(nav=state["nav"], cash=state["nav"], unrealized=0, open_positions=0,
                            dry_run=(config.MODE != "live"))

    while True:
        try:
            tick(state)
        except Exception as e:
            print(f"[edgar] tick error: {e}")
            journal.log_error(str(e))

        time.sleep(config.SCAN_EVERY_MIN * 60)


if __name__ == "__main__":
    main()
