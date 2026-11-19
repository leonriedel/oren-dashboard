import { NextResponse } from 'next/server'
import {
  db, requireAdmin, loadHistory, computeFactors, getFundamentals, finalScore, companyNews, nextEarnings, regime, pool, ANTHROPIC_KEY,
} from '@/lib/radar/engine'

// RADAR · daily scan. GET → today's scan (computes once per trading day). POST → force recompute.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) { return run(req, false) }
export async function POST(req: Request) { return run(req, true) }

async function run(req: Request, force: boolean) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const supa = db()
  const h = await loadHistory(supa)
  if (h.days.length < 55) return NextResponse.json({ notReady: true, tradingDays: h.days.length })
  const day = h.days[h.days.length - 1]

  if (!force) {
    const { data } = await supa.from('radar_scans').select('result').eq('day', day).maybeSingle()
    if (data?.result) return NextResponse.json(data.result)
  }

  const factors = computeFactors(h)
  const reg = regime(h, factors)

  // technical pre-rank → fundamentals for the best 60
  const pre = [...factors].sort((a, b) => b.tech - a.tech).slice(0, 60)
  const growthFor = new Set(pre.slice(0, 35).map(f => f.symbol))
  const fund = await getFundamentals(supa, pre.map(f => f.symbol), growthFor)

  const ranked = pre
    .map(f => {
      const row = fund.get(f.symbol); const p = row?.profile || null
      return { f, p, growth: row?.growth ?? null, score: finalScore(f, p?.mktCap ?? null, row?.growth ?? null) }
    })
    .filter(x => !x.p || (!x.p.isEtf && !x.p.isFund))
    .filter(x => !x.p?.mktCap || x.p.mktCap <= 20e9)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)

  // news + earnings for the top 12, then one AI pass for the briefs
  const top = ranked.slice(0, 12)
  const extra = new Map<string, { news: any[]; earnings: string | null }>()
  await pool(top.map(x => async () => { extra.set(x.f.symbol, { news: await companyNews(x.f.symbol), earnings: await nextEarnings(x.f.symbol) }) }), 4)

  let briefs: Record<string, any> = {}
  if (ANTHROPIC_KEY && top.length) {
    const payload = top.map(x => ({
      symbol: x.f.symbol, name: x.p?.name, sector: x.p?.sector, industry: x.p?.industry, mktCapB: x.p?.mktCap ? +(x.p.mktCap / 1e9).toFixed(2) : null,
      about: x.p?.description?.slice(0, 280), revenueGrowthYoY: x.growth != null ? +(x.growth * 100).toFixed(0) + '%' : null,
      ret1m: pct(x.f.r21), ret3m: pct(x.f.r63), ret6m: x.f.r126 != null ? pct(x.f.r126) : null, rsPercentile: x.f.rs,
      fromHigh60: pct(x.f.distHigh), volumeVs50d: +x.f.volRatio.toFixed(2), extended: x.f.extended, nextEarnings: extra.get(x.f.symbol)?.earnings,
      headlines: (extra.get(x.f.symbol)?.news || []).slice(0, 4).map((n: any) => n.headline),
    }))
    const prompt = `You are a skeptical equity research analyst screening US small/mid caps with momentum. Market regime: ${reg.label} (SPY 1m ${pct(reg.spyR21)}, ${Math.round(reg.breadth * 100)}% of stocks above 50-day MA).
For each stock write a brief for a private investor. Be honest and specific, use the headlines/business facts, never invent numbers, no price targets, no hype.
verdict rules: "BUY-ZONE" only if trend strong, not extended, and a real catalyst/fundamental story exists; "WAIT-PULLBACK" if strong but extended or right before earnings; "WATCH" if promising but unproven; "AVOID" if the move looks like hype/dilution/one-off news.
Return ONLY JSON: {"briefs":[{"symbol":"...","thesis":"2 sentences: what the company does and why the stock is moving","catalyst":"concrete upcoming/recent catalyst or 'none visible'","risks":"1-2 key risks","verdict":"BUY-ZONE|WAIT-PULLBACK|WATCH|AVOID"}]}

DATA:
${JSON.stringify(payload)}`
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 3000, messages: [{ role: 'user', content: prompt }] }),
      })
      const j = await r.json()
      const m = String(j?.content?.[0]?.text || '').match(/\{[\s\S]*\}/)
      if (m) for (const b of JSON.parse(m[0]).briefs || []) briefs[b.symbol] = b
    } catch { briefs = {} }
  }

  const result = {
    day, generatedAt: new Date().toISOString(), regime: reg, universe: factors.length,
    picks: ranked.map((x, i) => ({
      rank: i + 1, symbol: x.f.symbol, score: x.score, price: x.f.price, chg1: x.f.chg1,
      name: x.p?.name || null, sector: x.p?.sector || null, industry: x.p?.industry || null, mktCap: x.p?.mktCap || null, country: x.p?.country || null,
      description: x.p?.description || null, website: x.p?.website || null, growth: x.growth,
      factors: {
        rs: x.f.rs, r5: x.f.r5, r21: x.f.r21, r63: x.f.r63, r126: x.f.r126, r252: x.f.r252, distHigh: x.f.distHigh, volRatio: x.f.volRatio,
        tight: x.f.tight, atrPct: x.f.atrPct, dollarVol: x.f.dollarVol, aboveMa20: x.f.price > x.f.ma20, ma20AboveMa50: x.f.ma20 > x.f.ma50, extended: x.f.extended,
      },
      levels: { ma20: x.f.ma20, ma50: x.f.ma50, low10: x.f.low10, atr14: x.f.atr14, high60: x.f.high60 },
      closes: x.f.closes,
      brief: briefs[x.f.symbol] || null,
      news: extra.get(x.f.symbol)?.news || [],
      earnings: extra.get(x.f.symbol)?.earnings || null,
    })),
  }

  await supa.from('radar_scans').upsert({ day, result })
  await supa.from('radar_picks').upsert(result.picks.slice(0, 10).map(p => ({ day, symbol: p.symbol, rank: p.rank, score: p.score, price: p.price, verdict: p.brief?.verdict || null })))
  return NextResponse.json(result)
}

const pct = (x: number | null | undefined) => x == null || !isFinite(x) ? null : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
