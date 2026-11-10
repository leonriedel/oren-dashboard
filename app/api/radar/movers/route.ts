import { NextResponse } from 'next/server'

// Finnhub free tier: 60 calls/min. Set FINNHUB_API_KEY in Vercel env.
// Docs: https://finnhub.io/docs/api
const KEY = process.env.FINNHUB_API_KEY || ''

// A curated universe of liquid US tickers we care about.
// Finnhub free tier does not give a single "top movers" endpoint for US stocks,
// so we fetch quotes for this list and compute gainers/losers ourselves.
const UNIVERSE = [
  // Mega / growth
  'NVDA','TSLA','PLTR','AMD','AAPL','MSFT','GOOGL','META','AMZN','NFLX',
  'ORCL','AVGO','QCOM','CRM','ADBE','SNOW','SHOP','UBER','ARM',
  // AI / semis
  'SMCI','ANET','ASML','TSM','MU','MRVL','NOW','CRWD','ZS','PANW',
  // Fintech / consumer
  'HOOD','SOFI','COIN','MSTR','V','MA','SQ','ABNB','DASH','SPOT',
  // Energy / clean
  'XOM','CVX','ENPH','FSLR',
  // Niche / micro mentioned by Leon's style
  'IONQ','RKLB','TEM','ASTS','RGTI','NBIS','ACHR','LUNR','GRAB',
]

type Quote = { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number }

export async function GET() {
  try {
    if (!KEY) {
      return NextResponse.json({ tickers: [], error: 'FINNHUB_API_KEY not set', source: 'none' }, { status: 200 })
    }

    // Parallel fetch (respect free-tier rate limit by batching if needed)
    const results = await Promise.all(
      UNIVERSE.map(async sym => {
        try {
          const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${KEY}`, {
            next: { revalidate: 60 }
          })
          if (!res.ok) return null
          const q: Quote = await res.json()
          if (!q.c || q.c === 0) return null
          return {
            symbol: sym,
            price: q.c,
            changePct: q.dp,
            change: q.d,
            high: q.h,
            low: q.l,
          }
        } catch { return null }
      })
    )

    const clean = results.filter(Boolean) as any[]

    // Compute a simple heat score:
    //   heat = abs(dp) weighted, plus bonus for tight-range breakouts
    const scored = clean.map(t => {
      const rangePct = t.high && t.low ? ((t.high - t.low) / t.low) * 100 : 0
      const heat = Math.min(99, Math.round(Math.abs(t.changePct) * 8 + rangePct * 2 + 30))
      return { ...t, heat }
    })

    // Sort by heat desc, top 10
    scored.sort((a, b) => b.heat - a.heat)
    const top10 = scored.slice(0, 10)

    // Niche picks = lower-liquidity symbols from our set
    const NICHE_SET = new Set(['IONQ','RKLB','TEM','ASTS','RGTI','NBIS','ACHR','LUNR','GRAB','SMCI','ANET','MSTR','COIN'])
    const niche = scored.filter(t => NICHE_SET.has(t.symbol)).slice(0, 6)

    return NextResponse.json({
      tickers: top10,
      niche,
      source: 'finnhub',
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({ tickers: [], error: String(error) }, { status: 200 })
  }
}
