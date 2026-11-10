import { NextResponse } from 'next/server'

const KEY = process.env.FINNHUB_API_KEY || ''

// ETF proxies — Finnhub free tier doesn't give indices directly
const MACRO = [
  { symbol: 'SPY',  label: 'S&P 500',   type: 'index' },
  { symbol: 'QQQ',  label: 'NASDAQ',    type: 'index' },
  { symbol: 'DIA',  label: 'DOW',       type: 'index' },
  { symbol: 'UUP',  label: 'USD',       type: 'fx',    hint: 'Dollar ETF' },
  { symbol: 'TLT',  label: '20Y BOND',  type: 'rate',  hint: 'Long treasury proxy' },
  { symbol: 'VIXY', label: 'VIX',       type: 'vol',   hint: 'Volatility ETF' },
  { symbol: 'GLD',  label: 'GOLD',      type: 'commodity' },
  { symbol: 'USO',  label: 'OIL',       type: 'commodity' },
]

export async function GET() {
  try {
    if (!KEY) return NextResponse.json({ macro: [], error: 'FINNHUB_API_KEY not set' }, { status: 200 })

    const stockData = await Promise.all(MACRO.map(async m => {
      try {
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${m.symbol}&token=${KEY}`, { next: { revalidate: 120 } })
        if (!r.ok) return { ...m, price: 0, changePct: 0 }
        const q = await r.json()
        return { ...m, price: q.c || 0, changePct: q.dp || 0 }
      } catch { return { ...m, price: 0, changePct: 0 } }
    }))

    // Append BTC from CoinGecko (always-on reference)
    let btc: any = null
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true', { next: { revalidate: 60 } })
      const d = await r.json()
      if (d.bitcoin) btc = {
        symbol: 'BTC', label: 'BITCOIN', type: 'crypto',
        price: d.bitcoin.usd, changePct: d.bitcoin.usd_24h_change || 0,
      }
    } catch {}

    const macro = btc ? [...stockData, btc] : stockData
    return NextResponse.json({ macro, source: 'finnhub+coingecko', updatedAt: new Date().toISOString() })
  } catch (e) { return NextResponse.json({ macro: [], error: String(e) }, { status: 200 }) }
}
