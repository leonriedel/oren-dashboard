"""
EDGAR · BOLLINGER BOUNCE — stress test (is the edge real or luck?)

  ~/edgar-venv/bin/python bounce_stress.py 5000

1) parameter sensitivity: band width, exit rule, max hold, number of slots → a real edge survives small changes
2) universe: original 14 vs the 16 added later, and WITHOUT the 5 biggest profit contributors (survivorship check)
3) costs: triple slippage
"""
from __future__ import annotations
import sys
from collections import defaultdict

import strategy_lab as lab
import swing_tune


def spec(k=2.0, exit_ma="ma20", hold=12):
    def entry(d):
        sd = d["close"].rolling(20).std(ddof=0)
        return (d["close"] > d["ma200"]) & (d["close"] < d["ma20"] - k * sd)
    return dict(
        entry=entry,
        rank=lambda d: (d["close"] - d["bb_lo"]) / d["close"],
        exit=lambda r, e, n: r["close"] > r[exit_ma] or n >= hold,
    )


def run(label, data, spy, dates, capital, sp, slots=5, slip=0.0005):
    lab.MAX_POS, lab.SLIP = slots, slip
    eq, tr = lab.simulate(data, spy, sp, capital, False, dates)
    s = lab.stats(eq, tr, capital)
    ok = "✓" if s["h1"] > 0 and s["h2"] > 0 and s["pf"] == s["pf"] and s["pf"] > 1.2 else " "
    print(f"{label:46} {s['ret'] * 100:+7.1f}% {s['dd'] * 100:6.1f}% {s['h1'] * 100:+6.1f}% {s['h2'] * 100:+6.1f}% {s['n']:6d} {s['win'] * 100 if s['win'] == s['win'] else 0:4.0f}% {s['pf'] if s['pf'] == s['pf'] else 0:5.2f} {ok}")
    return tr


def main():
    capital = float(sys.argv[1]) if len(sys.argv) > 1 else 5000.0
    bars = swing_tune.load()
    spy = lab.prep(bars["SPY"])
    data = {s: lab.prep(df) for s, df in bars.items() if s != "SPY"}
    dates = [d for d in spy.index if spy.loc[d, "ma200"] == spy.loc[d, "ma200"]]
    print(f"\nBOLLINGER BOUNCE · STRESS TEST · ${capital:,.0f} · {str(dates[0])[:10]} → {str(dates[-1])[:10]}")
    hdr = f"{'variant':46} {'return':>8} {'maxDD':>7} {'1st½':>7} {'2nd½':>7} {'trades':>6} {'win':>5} {'PF':>5}"

    print("\n1 · PARAMETERS (baseline = 2.0σ, exit MA20, max 12 days, 5 slots)\n" + hdr + "\n" + "─" * len(hdr))
    base = run("baseline", data, spy, dates, capital, spec())
    for k in (1.5, 2.5):
        run(f"band {k}σ", data, spy, dates, capital, spec(k=k))
    for ex in ("ma10", "ma5"):
        run(f"exit above {ex.upper()}", data, spy, dates, capital, spec(exit_ma=ex))
    for h in (6, 20):
        run(f"max hold {h} days", data, spy, dates, capital, spec(hold=h))
    for sl in (3, 8):
        run(f"{sl} slots", data, spy, dates, capital, spec(), slots=sl)

    print("\n2 · UNIVERSE (survivorship check)\n" + hdr + "\n" + "─" * len(hdr))
    pnl = defaultdict(float)
    for t in base:
        pnl[t["sym"]] += t["pnl"]
    top5 = [s for s, _ in sorted(pnl.items(), key=lambda x: -x[1])[:5]]
    run("original 14 only", {s: data[s] for s in swing_tune.BASE14 if s in data}, spy, dates, capital, spec())
    run("added 16 only", {s: data[s] for s in swing_tune.EXTRA if s in data}, spy, dates, capital, spec())
    run(f"without top 5 ({', '.join(top5)})", {s: d for s, d in data.items() if s not in top5}, spy, dates, capital, spec())

    print("\n3 · COSTS\n" + hdr + "\n" + "─" * len(hdr))
    run("slippage 0.15% per side (3×)", data, spy, dates, capital, spec(), slip=0.0015)

    print("\nprofit by stock (baseline):  " + "  ".join(f"{s} {v:+.0f}" for s, v in sorted(pnl.items(), key=lambda x: -x[1])))
    print("\n✓ = profitable in both halves and PF > 1.2.  Robust = most rows ✓, especially 'without top 5' and '3× slippage'.")


if __name__ == "__main__":
    main()
