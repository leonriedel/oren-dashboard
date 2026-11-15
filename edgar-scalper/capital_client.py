"""
EDGAR SCALPER · Capital.com REST client

Env (.env):
  CAPITAL_API_KEY       API key from Settings → API integrations
  CAPITAL_IDENTIFIER    your Capital.com login e-mail
  CAPITAL_PASSWORD      the custom password you set FOR THE API KEY
  CAPITAL_ENV           demo | live   (default: demo)

Session tokens (CST + X-SECURITY-TOKEN) expire after 10 min of inactivity →
the client re-authenticates automatically on 401.
"""
from __future__ import annotations
import os
import time
import requests

_ENV = os.getenv("CAPITAL_ENV", "demo").lower()
BASE = "https://api-capital.backend-capital.com" if _ENV == "live" else "https://demo-api-capital.backend-capital.com"

_API_KEY = os.getenv("CAPITAL_API_KEY", "")
_IDENT   = os.getenv("CAPITAL_IDENTIFIER", "")
_PASS    = os.getenv("CAPITAL_PASSWORD", "")

_tokens: dict[str, str] = {}
_last_call = 0.0


def env() -> str:
    return _ENV


def login() -> dict:
    if not (_API_KEY and _IDENT and _PASS):
        raise RuntimeError("CAPITAL_API_KEY / CAPITAL_IDENTIFIER / CAPITAL_PASSWORD missing in .env")
    r = requests.post(f"{BASE}/api/v1/session",
                      headers={"X-CAP-API-KEY": _API_KEY, "Content-Type": "application/json"},
                      json={"identifier": _IDENT, "password": _PASS, "encryptedPassword": False},
                      timeout=15)
    if r.status_code != 200:
        raise RuntimeError(f"Capital login failed {r.status_code}: {r.text[:300]}")
    _tokens["CST"] = r.headers.get("CST", "")
    _tokens["X-SECURITY-TOKEN"] = r.headers.get("X-SECURITY-TOKEN", "")
    return r.json()


def request(method: str, path: str, params: dict | None = None, body: dict | None = None, _retry: bool = True) -> dict:
    global _last_call
    if not _tokens:
        login()
    # respect 10 req/s and 1 order / 0.1s
    wait = 0.12 - (time.time() - _last_call)
    if wait > 0:
        time.sleep(wait)
    _last_call = time.time()
    headers = {"X-SECURITY-TOKEN": _tokens.get("X-SECURITY-TOKEN", ""), "CST": _tokens.get("CST", ""), "Content-Type": "application/json"}
    r = requests.request(method, f"{BASE}{path}", headers=headers, params=params, json=body, timeout=20)
    if r.status_code in (401, 403) and _retry:
        _tokens.clear()
        login()
        return request(method, path, params, body, _retry=False)
    if r.status_code >= 400:
        raise RuntimeError(f"Capital {method} {path} → {r.status_code}: {r.text[:300]}")
    return r.json() if r.text else {}


def get(path: str, **params) -> dict:
    return request("GET", path, params=params or None)


def post(path: str, body: dict) -> dict:
    return request("POST", path, body=body)


def delete(path: str) -> dict:
    return request("DELETE", path)


def ping() -> None:
    try:
        get("/api/v1/ping")
    except Exception:
        pass
