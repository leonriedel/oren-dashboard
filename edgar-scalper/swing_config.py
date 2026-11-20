"""
EDGAR BOUNCE · config  (long-only Bollinger-bounce trading on a separate IBKR account)

.env on the OREN Mac:
  POLYGON_API_KEY        Massive/Polygon key (daily bars for signals)
  IBKR_ACCOUNT           the NEW Edgar account id, e.g. U1234567  (safety check: must match the gateway login)
  IBKR_HOST              default 127.0.0.1
  IBKR_PORT              IB Gateway live = 4001 (paper = 4002)
  IBKR_CLIENT_ID         default 17
  EDGAR_LIVE             "true" to send real orders; anything else = dry run (logs what it WOULD do)
  EDGAR_BUDGET_EUR       optional hard cap on capital Edgar may use (default: whole Edgar account)
  EDGAR_MAX_OPEN         max positions at once (default 5; use 3 for accounts under ~$2,000)
"""
from __future__ import annotations
import os
from dotenv import load_dotenv

load_dotenv()

VERSION = "bounce-1.0"

POLYGON_KEY  = os.getenv("POLYGON_API_KEY") or os.getenv("MASSIVE_API_KEY") or ""
IBKR_ACCOUNT = os.getenv("IBKR_ACCOUNT", "").strip()
IBKR_HOST    = os.getenv("IBKR_HOST", "127.0.0.1")
IBKR_PORT    = int(os.getenv("IBKR_PORT", "4001"))
IBKR_CLIENT  = int(os.getenv("IBKR_CLIENT_ID", "17"))
LIVE         = os.getenv("EDGAR_LIVE", "false").lower() == "true"
BUDGET_EUR   = float(os.getenv("EDGAR_BUDGET_EUR", "0") or 0)

# ─── universe: liquid US stocks (whitelist — Edgar trades NOTHING else) ───
# EU retail clients cannot buy US-domiciled ETFs at IBKR (PRIIPs/KID rule) → single stocks.
# Same 30 names the strategy was stress-tested on (bounce_stress.py).
UNIVERSE = [
    "NEM", "AEM", "WPM", "FCX", "XOM", "CCJ",
    "NVDA", "AMD", "AVGO", "TSM", "MSFT", "AMZN", "META", "GOOGL",
    "AAPL", "NFLX", "ORCL", "PLTR", "UBER", "SHOP", "CRWD", "ANET", "MU", "LRCX", "VRT",
    "CAT", "GE", "JPM", "LLY", "COST",
]
MARKET   = "SPY"   # only for the dashboard / reference (the bounce strategy tested best WITHOUT a market filter)

# ─── strategy: Bollinger bounce in uptrend (see bounce_strategy.py) ───
BB_N           = 20
BB_K           = 2.0       # lower band = MA20 − 2σ
EXIT_MA        = 10        # sell when close > MA10
MAX_HOLD       = 12        # …or after 12 trading days
STOP_ATR       = 3.0       # disaster stop (GTC at IBKR) = signal close − 3×ATR
ENTRY_GAP_MAX  = 0.03      # limit-on-open: skip if the stock opens > 3% above the signal close

# ─── risk (hard limits) ───
MAX_OPEN         = int(os.getenv("EDGAR_MAX_OPEN", "5"))   # equal slots: each position ≈ 1/MAX_OPEN of Edgar capital (small account → 3)
MAX_NEW_PER_DAY  = 5
MAX_DRAWDOWN_HALT = 0.20   # Edgar stops opening trades if his capital is 20% below its high-water mark

# legacy (old swing strategy / swing_backtest.py)
MA_FAST, MA_MID, MA_SLOW = 20, 50, 200
ATR_N, BREAKOUT_LOOKBACK, TARGET_R, TRAIL_ATR, ENTRY_SLIPPAGE = 14, 20, 2.0, 0.5, 0.004
RISK_PER_TRADE, MAX_POSITION_PCT, MAX_DAILY_LOSS = 0.01, 0.35, 0.04

# ─── schedule (New York time) ───
RUN_AFTER_ET   = (16, 20)   # daily cycle after US close
RUN_BEFORE_ET  = (19, 30)
LOOP_MINUTES   = 15
ORDER_REF      = "EDGAR"
