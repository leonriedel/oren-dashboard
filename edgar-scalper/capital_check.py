"""
EDGAR · Capital.com connection check (no orders placed)

Run:  python capital_check.py
Shows: login OK, account balance, and for each universe symbol the epic,
market status, min deal size and latest candles.
"""
from __future__ import annotations
import config  # loads .env
import capital_client as cap
import capital_data_fetcher as cdf
import capital_executor as ce

print(f"→ Capital.com {cap.env().upper()}  ({cap.BASE})")
info = cap.login()
print(f"✓ login ok · client {info.get('clientId', '?')} · ccy {info.get('currencyIsoCode', '?')}")
print(f"✓ NAV {ce.account_nav():.2f}")

for u in config.UNIVERSE:
    epic = u.get("capital")
    try:
        m = cap.get(f"/api/v1/markets/{epic}")
        snap, rules = m.get("snapshot", {}), m.get("dealingRules", {})
        print(f"\n{u['symbol']:8} epic={epic:8} status={snap.get('marketStatus')} bid={snap.get('bid')} ask={snap.get('offer')} "
              f"min={(rules.get('minDealSize') or {}).get('value')} ccy={(m.get('instrument') or {}).get('currency')}")
        df = cdf.fetch_candles(epic, config.TIMEFRAME, "2d")
        print(f"   {len(df)} candles · last close {df['close'].iloc[-1]:.5f} @ {df.index[-1]}")
    except Exception as e:
        print(f"\n{u['symbol']:8} epic={epic} ✗ {e}")
        try:
            found = cap.get("/api/v1/markets", searchTerm=u["symbol"].split("/")[0]).get("markets", [])[:5]
            print("   candidates:", [(x.get("epic"), x.get("instrumentName")) for x in found])
        except Exception:
            pass

print("\nDone — no orders were placed.")
