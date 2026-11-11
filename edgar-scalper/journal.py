"""
EDGAR SCALPER · Supabase journal

Bot uses the service-role key, so RLS is bypassed from this side.
Dashboard reads through the same tables via Next.js API routes.
"""
from datetime import datetime, timezone
from supabase import create_client, Client

import config


def client() -> Client:
    if not config.SUPABASE_URL or not config.SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing")
    return create_client(config.SUPABASE_URL, config.SUPABASE_KEY)


def log_signal(sig_dict: dict, dry_run: bool = True) -> str | None:
    """Insert into edgar_signals. Returns the row id or None on failure."""
    row = {
        "ts":         sig_dict["ts"],
        "symbol":     sig_dict["symbol"],
        "timeframe":  sig_dict["timeframe"],
        "side":       sig_dict["side"],
        "confidence": sig_dict["confidence"],
        "price":      sig_dict["price"],
        "sl":         sig_dict["sl"],
        "tp":         sig_dict["tp"],
        "reasons":    sig_dict["reasons"],
        "dry_run":    dry_run,
        "acted":      False,
    }
    try:
        res = client().table("edgar_signals").insert(row).execute()
        return res.data[0]["id"] if res.data else None
    except Exception as e:
        print(f"[journal.log_signal] {e}")
        return None


def open_trade(sig_row_id: str, sig_dict: dict, size: float, dry_run: bool = True) -> str | None:
    row = {
        "opened_at": datetime.now(timezone.utc).isoformat(),
        "symbol":    sig_dict["symbol"],
        "side":      sig_dict["side"],
        "size":      size,
        "entry":     sig_dict["price"],
        "sl":        sig_dict["sl"],
        "tp":        sig_dict["tp"],
        "signal_id": sig_row_id,
        "dry_run":   dry_run,
        "broker":    "paper" if dry_run else "oanda-practice",
    }
    try:
        res = client().table("edgar_trades").insert(row).execute()
        trade_id = res.data[0]["id"] if res.data else None
        if trade_id:
            client().table("edgar_signals").update({"acted": True, "trade_id": trade_id}).eq("id", sig_row_id).execute()
        return trade_id
    except Exception as e:
        print(f"[journal.open_trade] {e}")
        return None


def close_trade(trade_id: str, exit_price: float, exit_reason: str,
                pnl: float, pnl_pct: float) -> None:
    try:
        client().table("edgar_trades").update({
            "closed_at":   datetime.now(timezone.utc).isoformat(),
            "exit":        exit_price,
            "exit_reason": exit_reason,
            "pnl":         pnl,
            "pnl_pct":     pnl_pct,
        }).eq("id", trade_id).execute()
    except Exception as e:
        print(f"[journal.close_trade] {e}")


def heartbeat(mode: str, universe: list[str], version: str,
              last_scan: str | None = None) -> None:
    row = {
        "id":               1,
        "last_heartbeat":   datetime.now(timezone.utc).isoformat(),
        "mode":             mode,
        "universe":         universe,
        "version":          version,
    }
    if last_scan:
        row["last_signal_scan"] = last_scan
    try:
        client().table("edgar_bot_status").upsert(row, on_conflict="id").execute()
    except Exception as e:
        print(f"[journal.heartbeat] {e}")


def log_error(msg: str) -> None:
    try:
        client().table("edgar_bot_status").update({
            "last_error":    msg[:500],
            "last_error_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", 1).execute()
    except Exception as e:
        print(f"[journal.log_error] {e}")


def snapshot_equity(nav: float, cash: float, unrealized: float,
                    open_positions: int, dry_run: bool = True) -> None:
    try:
        client().table("edgar_equity").insert({
            "ts":              datetime.now(timezone.utc).isoformat(),
            "nav":             nav,
            "cash":            cash,
            "unrealized":      unrealized,
            "open_positions":  open_positions,
            "dry_run":         dry_run,
        }).execute()
    except Exception as e:
        print(f"[journal.snapshot_equity] {e}")


def open_positions() -> list[dict]:
    try:
        res = client().table("edgar_trades").select("*").is_("closed_at", "null").execute()
        return res.data or []
    except Exception as e:
        print(f"[journal.open_positions] {e}")
        return []


def last_signal_ts(symbol: str) -> str | None:
    try:
        res = client().table("edgar_signals").select("ts").eq("symbol", symbol).order("ts", desc=True).limit(1).execute()
        return res.data[0]["ts"] if res.data else None
    except Exception as e:
        print(f"[journal.last_signal_ts] {e}")
        return None
