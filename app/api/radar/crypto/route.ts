import { NextResponse } from 'next/server'

// CoinGecko free tier — no key required, ~10-50 calls/min polite use.
// Markets endpoint already returns % changes.
const IDS = [
  'bitcoin','ethereum','solana','bittensor','sui','aptos',
  'dogecoin','arbitrum','avalanche-2','render-token',
  'near','polkadot','chainlink','uniswap','aave','ondo-finance',
  'filecoin','injective-protocol','sei-network','kaspa',
]

const SYMBOL_OVERRIDE: Record<string, string> = {
  'bittensor': 'TAO',
  'avalanche-2': 'AVAX',
  'render-token': 'RNDR',
  'injective-protocol': 'INJ',
  'sei-network': 'SEI',
}

export async function GET() {
  try {
    const url = new URL('https://api.coingecko.com/api/v3/coins/markets')
    url.searchParams.set('vs_currency', 'usd')
    url.searchParams.set('ids', IDS.join(','))
    url.searchParams.set('order', 'price_change_percentage_24h_desc')
    url.searchParams.set('per_page', '20')
    url.searchParams.set('sparkline', 'false')
    url.searchParams.set('price_change_percentage', '24h')

    const res = await fetch(url.toString(), {
      next: { revalidate: 60 },
      headers: { 'Accept': 'application/json' }
    })
    if (!res.ok) {
      return NextResponse.json({ tickers: [], error: `CoinGecko ${res.status}`, source: 'coingecko' }, { status: 200 })
    }
    const data = await res.json()

    const tickers = (data || []).map((c: any) => ({
      symbol: SYMBOL_OVERRIDE[c.id] || c.symbol.toUpperCase(),
      name: c.name,
      price: c.current_price,
      changePct: c.price_change_percentage_24h ?? 0,
      change: c.price_change_24h ?? 0,
      heat: Math.min(99, Math.round(Math.abs(c.price_change_percentage_24h || 0) * 5 + 40)),
      marketCap: c.market_cap,
      volume: c.total_volume,
    })).sort((a: any, b: any) => b.heat - a.heat).slice(0, 8)

    return NextResponse.json({ tickers, source: 'coingecko', updatedAt: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json({ tickers: [], error: String(error) }, { status: 200 })
  }
}
