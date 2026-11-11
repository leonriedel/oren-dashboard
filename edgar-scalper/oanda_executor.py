"""
EDGAR SCALPER · OANDA executor (LIVE)

Only used when MODE=live and OANDA creds are set. Mirrors paper_executor
API so scheduler.py can swap one for the other transparently.

Kept as a stub now — wire fully once OANDA account is verified and
the API token lands in .env. Then flip MODE=live.
"""
import config
import journal

try:
    from oandapyV20 import API
    from oandapyV20.endpoints.orders import OrderCreate
    from oandapyV20.endpoints.positions import OpenPositions
    from oandapyV20.endpoints.pricing import PricingInfo
    OANDA_AVAILABLE = True
except Exception:
    OANDA_AVAILABLE = False


def _client():
    if not OANDA_AVAILABLE:
        raise RuntimeError("oandapyV20 not installed")
    if not config.OANDA_TOKEN:
        raise RuntimeError("OANDA_API_TOKEN not set")
    return API(access_token=config.OANDA_TOKEN, environment=config.OANDA_ENVIRONMENT)


def _sym_to_oanda(symbol: str) -> str | None:
    for u in config.UNIVERSE:
        if u["symbol"] == symbol:
            return u["oanda"]
    return None


def open_from_signal(sig_row_id: str, sig_dict: dict, nav: float = 10_000.0) -> str | None:
    """Create a market order with SL/TP attached, then log to journal."""
    oanda_sym = _sym_to_oanda(sig_dict["symbol"])
    if not oanda_sym:
        journal.log_error(f"no OANDA mapping for {sig_dict['symbol']}")
        return None

    # Risk-based sizing (units for OANDA, positive=buy, negative=sell)
    entry = sig_dict["price"]
    sl    = sig_dict["sl"]
    risk_amt = nav * (config.RISK_PER_TRADE_PCT / 100.0)
    distance = abs(entry - sl) or 1e-9
    size = max(1, int(risk_amt / distance))
    units = size if sig_dict["side"] == "LONG" else -size

    order = {
        "order": {
            "instrument":   oanda_sym,
            "units":        str(units),
            "type":         "MARKET",
            "timeInForce":  "FOK",
            "positionFill": "DEFAULT",
            "stopLossOnFill":   {"price": f"{sig_dict['sl']:.5f}"},
            "takeProfitOnFill": {"price": f"{sig_dict['tp']:.5f}"},
        }
    }
    try:
        r = _client().request(OrderCreate(accountID=config.OANDA_ACCOUNT, data=order))
        # OANDA returns orderFillTransaction on immediate fill
        fill = r.get("orderFillTransaction") or {}
        actual_price = float(fill.get("price", entry))
        trade_id = journal.open_trade(sig_row_id, {**sig_dict, "price": actual_price},
                                      size=abs(units), dry_run=False)
        return trade_id
    except Exception as e:
        journal.log_error(f"OANDA order failed: {e}")
        return None


def check_exits(current_prices: dict[str, float]) -> list[dict]:
    """OANDA closes positions server-side when SL/TP hit — we only reconcile."""
    # Minimal: poll OANDA open positions, reconcile with our journal.
    # Left as TODO until we actually run live.
    return []
