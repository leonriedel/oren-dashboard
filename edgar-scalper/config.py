"""
EDGAR SCALPER · config

Env vars (set in .env or VPS environment):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  MODE                    paper | live  (default: paper)
  OANDA_API_TOKEN         (only for live)
  OANDA_ACCOUNT_ID        (only for live)
  OANDA_ENVIRONMENT       practice | live  (default: practice)
"""
import os
from dotenv import load_dotenv

load_dotenv()

VERSION = "0.1.0"

MODE = os.getenv("MODE", "paper").lower()  # paper | live

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""

OANDA_TOKEN       = os.getenv("OANDA_API_TOKEN", "")
OANDA_ACCOUNT     = os.getenv("OANDA_ACCOUNT_ID", "")
OANDA_ENVIRONMENT = os.getenv("OANDA_ENVIRONMENT", "practice")

# ─── trading universe ────────────────────────────────────────────
# Yahoo-Finance tickers (for data), OANDA names (for execution)
UNIVERSE = [
    {"symbol": "XAU/USD", "yahoo": "GC=F",    "oanda": "XAU_USD"},
    {"symbol": "EUR/USD", "yahoo": "EURUSD=X","oanda": "EUR_USD"},
    {"symbol": "GBP/USD", "yahoo": "GBPUSD=X","oanda": "GBP_USD"},
    {"symbol": "USD/JPY", "yahoo": "JPY=X",   "oanda": "USD_JPY"},
]

# ─── strategy params ─────────────────────────────────────────────
TIMEFRAME = "15m"          # yfinance interval
LOOKBACK  = "7d"           # lookback period for candles

BB_PERIOD = 20
BB_STD    = 2.0

RSI_PERIOD    = 14
RSI_OVERSOLD  = 30
RSI_OVERBOUGHT = 70

MACD_FAST   = 12
MACD_SLOW   = 26
MACD_SIGNAL = 9

ATR_PERIOD  = 14
SL_ATR_MULT = 1.5    # stop = entry ± ATR*1.5
TP_ATR_MULT = 2.5    # take  = entry ± ATR*2.5    → 1.67 : 1 R:R

MIN_CONFIDENCE = 0.6  # ignore anything below this
COOLDOWN_MIN   = 30   # min minutes between same-symbol signals

# ─── risk mgmt ───────────────────────────────────────────────────
RISK_PER_TRADE_PCT  = 1.0     # % of NAV risked per trade
MAX_OPEN_POSITIONS  = 4
MAX_DAILY_LOSS_PCT  = 3.0     # stop trading for the day if hit

# ─── scheduling ──────────────────────────────────────────────────
SCAN_EVERY_MIN     = 5
HEARTBEAT_EVERY_SEC = 60
EQUITY_EVERY_MIN   = 60
