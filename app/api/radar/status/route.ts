import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    finnhubConfigured: !!process.env.FINNHUB_API_KEY,
    sources: {
      crypto:  { live: true,  provider: 'CoinGecko' },
      stocks:  { live: !!process.env.FINNHUB_API_KEY, provider: 'Finnhub' },
      news:    { live: !!process.env.FINNHUB_API_KEY, provider: 'Finnhub' },
      macro:   { live: !!process.env.FINNHUB_API_KEY, provider: 'Finnhub + CoinGecko' },
      sectors: { live: !!process.env.FINNHUB_API_KEY, provider: 'Finnhub SPDR ETFs' },
    }
  })
}
