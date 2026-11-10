import { NextResponse } from 'next/server'

const KEY = process.env.FINNHUB_API_KEY || ''

// SPDR Sector ETFs — complete S&P 500 sector map
const SECTORS = [
  { symbol: 'XLK',  name: 'Technology',          color: '#5dade2' },
  { symbol: 'XLC',  name: 'Communication',       color: '#af7ac5' },
  { symbol: 'XLY',  name: 'Consumer Disc.',      color: '#f1948a' },
  { symbol: 'XLP',  name: 'Consumer Staples',    color: '#f5b041' },
  { symbol: 'XLE',  name: 'Energy',              color: '#ec7063' },
  { symbol: 'XLF',  name: 'Financials',          color: '#58d68d' },
  { symbol: 'XLV',  name: 'Healthcare',          color: '#48c9b0' },
  { symbol: 'XLI',  name: 'Industrials',         color: '#dc7633' },
  { symbol: 'XLB',  name: 'Materials',           color: '#bdc3c7' },
  { symbol: 'XLU',  name: 'Utilities',           color: '#7fb3d5' },
  { symbol: 'XLRE', name: 'Real Estate',         color: '#c39bd3' },
]

export async function GET() {
  try {
    if (!KEY) return NextResponse.json({ sectors: [], error: 'FINNHUB_API_KEY not set' }, { status: 200 })
    const data = await Promise.all(SECTORS.map(async s => {
      try {
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${s.symbol}&token=${KEY}`, { next: { revalidate: 120 } })
        if (!r.ok) return { ...s, price: 0, changePct: 0 }
        const q = await r.json()
        return { ...s, price: q.c || 0, changePct: q.dp || 0, change: q.d || 0 }
      } catch { return { ...s, price: 0, changePct: 0 } }
    }))
    return NextResponse.json({ sectors: data, source: 'finnhub', updatedAt: new Date().toISOString() })
  } catch (e) { return NextResponse.json({ sectors: [], error: String(e) }, { status: 200 }) }
}
