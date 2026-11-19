"""
EDGAR SWING · main loop

  ~/edgar-venv/bin/python run_swing.py          # runs forever (every 15 min)
  ~/edgar-venv/bin/python run_swing.py --once   # one full cycle now (for testing)

Needs IB Gateway running and logged in with the Edgar user.
"""
from __future__ import annotations
import sys
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import swing_config as cfg
import journal
from ibkr_swing import Broker, load_state, save_state, reconcile, daily_cycle, snapshot

NY = ZoneInfo("America/New_York")


def in_window(now: datetime) -> bool:
    if now.weekday() >= 5:
        return False
    t = (now.hour, now.minute)
    return cfg.RUN_AFTER_ET <= t <= cfg.RUN_BEFORE_ET


def tick(b: Broker, force: bool = False) -> None:
    state = load_state()
    b.connect()
    mode = "ibkr-swing" if cfg.LIVE else "ibkr-swing-dry"
    journal.heartbeat(mode=mode, universe=cfg.UNIVERSE, version=cfg.VERSION, last_scan=datetime.utcnow().isoformat())
    reconcile(b, state)
    now = datetime.now(NY)
    today = now.date().isoformat()
    if force or (in_window(now) and state.get("last_cycle") != today):
        print(f"\n[edgar] ═══ daily cycle {today} ═══")
        daily_cycle(b, state)
        snapshot(b)
        state["last_cycle"] = today
    save_state(state)


def main() -> None:
    print(f"[edgar] SWING {cfg.VERSION} · account {cfg.IBKR_ACCOUNT or '?'} · {'LIVE' if cfg.LIVE else 'DRY-RUN'} · universe {', '.join(cfg.UNIVERSE)}")
    b = Broker()
    if "--once" in sys.argv:
        tick(b, force=True)
        return
    while True:
        try:
            tick(b)
        except Exception as e:
            print(f"[edgar] error: {e}")
            try:
                journal.log_error(f"swing: {e}")
            except Exception:
                pass
            try:
                b.ib.disconnect()
            except Exception:
                pass
        b.ib.sleep(cfg.LOOP_MINUTES * 60) if b.ib.isConnected() else time.sleep(cfg.LOOP_MINUTES * 60)


if __name__ == "__main__":
    main()
