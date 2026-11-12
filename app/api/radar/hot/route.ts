import { NextResponse } from 'next/server'

// RADAR AI · HOT PICKS
// Pulls fresh market data (movers + news) and asks Claude Haiku to
// generate 5 actionable, concrete, time-sensitive picks with
// Entry / SL / TP / setup / thesis.
//
// Cost: ~$0.003 per call, refresh every 10 min on frontend → ~$0.45/day.

const FINNHUB_KEY   = process.env.FINNHUB_API_KEY || ''
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

// Expanded universe — 150+ liquid tickers across themes
const UNIVERSE = [
  // Mega-caps
  'NVDA','TSLA','AAPL','MSFT','GOOGL','META','AMZN','NFLX','AMD','ORCL',
  'AVGO','QCOM','CRM','ADBE','COST','WMT','PEP','KO','MCD','HD',
  // AI / Semis
  'PLTR','SNOW','SMCI','ANET','ASML','TSM','MU','MRVL','NOW','CRWD',
  'ZS','PANW','ARM','DELL','HPE','CSCO','INTC','TXN','LRCX','AMAT',
  // Fintech / Crypto proxies
  'HOOD','SOFI','COIN','MSTR','V','MA','SQ','PYPL','AFRM','UPST',
  // Growth / Consumer
  'SHOP','UBER','ABNB','DASH','SPOT','DIS','RBLX','SNAP','PINS','RDDT',
  // Energy / Clean
  'XOM','CVX','OXY','COP','ENPH','FSLR','SEDG','NEE','PLUG','BE',
  // Biotech / Pharma
  'LLY','NVO','PFE','MRK','ABBV','UNH','BMY','GILD','AMGN','REGN',
  'MRNA','BNTX','VRTX',
  // Defense / Industrial
  'LMT','RTX','GE','BA','CAT','DE','HON','MMM',
  // Niche / Speculative (Leon's vibe)
  'IONQ','RKLB','TEM','ASTS','RGTI','NBIS','ACHR','LUNR','GRAB',
  'JOBY','SOUN','BBAI','HIMS','OKLO','SMR','VLD',
  // ETFs for context
  'SPY','QQQ','IWM','DIA','GLD','SLV','USO','TLT','UUP','VIX','VXX',
  // Sector ETFs
  'XLK','XLF','XLE','XLV','XLI','XLY','XLP','XLU','XLB','XLRE','XLC',
]

type Quote = { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number }

async function fetchQuotes() {
  const batched = await Promise.all(
    UNIVERSE.map(async sym => {
      try {
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`,
          { next: { revalidate: 60 } })
        if (!r.ok) return null
        const q: Quote = await r.json()
        if (!q.c) return null
        const rangePct = q.h && q.l ? ((q.h - q.l) / q.l) * 100 : 0
        const momentum = Math.abs(q.dp) * 2
        const breakout = q.c > q.pc && q.c >= q.h - 0.2 * (q.h - q.l) ? 15 : 0
        const breakdown = q.c < q.pc && q.c <= q.l + 0.2 * (q.h - q.l) ? 15 : 0
        const score = Math.min(100, Math.round(momentum + rangePct + breakout + breakdown))
        return {
          symbol: sym, price: q.c, changePct: q.dp, change: q.d,
          high: q.h, low: q.l, prevClose: q.pc, rangePct: Number(rangePct.toFixed(2)),
          score, breakout: breakout > 0, breakdown: breakdown > 0,
        }
      } catch { return null }
    })
  )
  return batched.filter(Boolean) as any[]
}

async function fetchNews() {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_KEY}`,
      { next: { revalidate: 300 } })
    if (!r.ok) return []
    const j = await r.json()
    return (j || []).slice(0, 30).map((n: any) => ({
      headline: n.headline, source: n.source, datetime: n.datetime, related: n.related,
    }))
  } catch { return [] }
}

async function askClaude(topMovers: any[], news: any[]) {
  const prompt = `You are a sharp market analyst. Based on the DATA below, pick the **5 hottest, most actionable trading opportunities RIGHT NOW**.

Rules:
- Only pick tickers with clear setup (breakout, pullback, reversal, momentum, squeeze, oversold-bounce).
- Give concrete numbers: entry, stop-loss, take-profit (based on price action, 2:1 R:R minimum).
- Mix directions: some LONG, some SHORT if data suggests it.
- Be DECISIVE and SPECIFIC. No wishy-washy "could" / "might" / "may". State the thesis with conviction.
- Reference news context if relevant.
- Flag risk level (LOW/MED/HIGH).

Return STRICT JSON, no markdown, no code fence. Format:
{
  "picks": [
    {
      "symbol": "AAPL",
      "side": "LONG" | "SHORT",
      "setup": "BREAKOUT" | "PULLBACK" | "REVERSAL" | "MOMENTUM" | "SQUEEZE" | "OVERSOLD-BOUNCE",
      "entry": 142.50,
      "sl": 139.80,
      "tp": 148.00,
      "rr": 2.0,
      "risk": "LOW" | "MED" | "HIGH",
      "confidence": 0.75,
      "thesis": "Two-sentence thesis. Be specific and sharp."
    }
  ]
}

DATA — Top movers by score (last 24h):
${JSON.stringify(topMovers.slice(0, 25), null, 2)}

DATA — Recent market news:
${JSON.stringify(news.slice(0, 15), null, 2)}

Return the JSON now.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}: ${await res.text()}`)
  const j = await res.json()
  const text: string = j?.content?.[0]?.text || ''
  // Strip possible code fences
  const clean = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(clean)
  } catch {
    // Try to pull JSON block
    const m = clean.match(/\{[\s\S]*\}/)
    return m ? JSON.parse(m[0]) : { picks: [] }
  }
}

export async function GET() {
  try {
    if (!FINNHUB_KEY) {
      return NextResponse.json({ picks: [], error: 'FINNHUB_API_KEY not set' }, { status: 200 })
    }
    if (!ANTHROPIC_KEY) {
      return NextResponse.json({ picks: [], error: 'ANTHROPIC_API_KEY not set' }, { status: 200 })
    }

    const [quotes, news] = await Promise.all([fetchQuotes(), fetchNews()])
    const topMovers = quotes
      .filter(q => Math.abs(q.changePct) >= 1)   // filter noise
      .sort((a, b) => b.score - a.score)

    if (topMovers.length === 0) {
      return NextResponse.json({ picks: [], updatedAt: new Date().toISOString(), note: 'market quiet' })
    }

    const ai = await askClaude(topMovers, news)
    return NextResponse.json({
      picks: ai.picks || [],
      updatedAt: new Date().toISOString(),
      sourceCount: { quotes: quotes.length, movers: topMovers.length, news: news.length },
    })
  } catch (e) {
    return NextResponse.json({ picks: [], error: String(e) }, { status: 200 })
  }
}
