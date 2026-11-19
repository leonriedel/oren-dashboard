"""
EDGAR SWING · config  (long-only daily swing trading on a separate IBKR account)

.env on the OREN Mac:
  POLYGON_API_KEY        Massive/Polygon key (daily bars for signals)
  IBKR_ACCOUNT           the NEW Edgar account id, e.g. U1234567  (safety check: must match the gateway login)
  IBKR_HOST              default 127.0.0.1
  IBKR_PORT              IB Gateway live = 4001 (paper = 4002)
  IBKR_CLIENT_ID         default 17
  EDGAR_LIVE             "true" to send real orders; anything else = dry run (logs what it WOULD do)
  EDGAR_BUDGET_EUR       optional hard cap on capital Edgar may use (default: whole Edgar account)
"""
from __future__ import annotations
import os
from dotenv import load_dotenv

load_dotenv()

VERSION = "swing-1.0"

POLYGON_KEY  = os.getenv("POLYGON_API_KEY") or os.getenv("MASSIVE_API_KEY") or ""
IBKR_ACCOUNT = os.getenv("IBKR_ACCOUNT", "").strip()
IBKR_HOST    = os.getenv("IBKR_HOST", "127.0.0.1")
IBKR_PORT    = int(os.getenv("IBKR_PORT", "4001"))
IBKR_CLIENT  = int(os.getenv("IBKR_CLIENT_ID", "17"))
LIVE         = os.getenv("EDGAR_LIVE", "false").lower() == "true"
BUDGET_EUR   = float(os.getenv("EDGAR_BUDGET_EUR", "0") or 0)

# ─── universe: liquid US stocks (whitelist — Edgar trades NOTHING else) ───
# EU retail clients cannot buy US-domiciled ETFs at IBKR (PRIIPs/KID rule) → single stocks covering the same themes.
UNIVERSE = [
    "NEM", "AEM", "WPM",                       # gold
    "FCX", "XOM", "CCJ",                       # copper, energy, uranium
    "NVDA", "AMD", "AVGO", "TSM",              # semiconductors
    "MSFT", "AMZN", "META", "GOOGL",           # mega-cap tech
]
MARKET   = "SPY"   # market filter

# ─── strategy ───
MA_FAST, MA_MID, MA_SLOW = 20, 50, 200
ATR_N            = 14
BREAKOUT_LOOKBACK = 20
STOP_ATR         = 2.0      # stop = min(10-day low, entry - 2×ATR)
TARGET_R         = 2.0      # first half exits at +2R, rest trails
TRAIL_ATR        = 0.5      # trail stop = MA20 - 0.5×ATR once trade is +1R
ENTRY_SLIPPAGE   = 0.004    # limit = close × 1.004 (no chasing big gaps)

# ─── risk (hard limits) ───
RISK_PER_TRADE   = 0.01     # 1% of Edgar capital per trade
MAX_POSITION_PCT = 0.35     # max 35% of Edgar capital in one position
MAX_OPEN         = 3
MAX_NEW_PER_DAY  = 2
MAX_DAILY_LOSS   = 0.04     # stop opening new trades if Edgar is down 4% today

# ─── schedule (New York time) ───
RUN_AFTER_ET   = (16, 20)   # daily cycle after US close
RUN_BEFORE_ET  = (19, 30)
LOOP_MINUTES   = 15
ORDER_REF      = "EDGAR"
