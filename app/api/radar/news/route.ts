import { NextResponse } from 'next/server'

// Finnhub general market news (free tier, no symbol param needed)
const KEY = process.env.FINNHUB_API_KEY || ''

export async function GET() {
  try {
    if (!KEY) {
      return NextResponse.json({ news: [], error: 'FINNHUB_API_KEY not set' }, { status: 200 })
    }
    const res = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${KEY}`, {
      next: { revalidate: 120 }
    })
    if (!res.ok) {
      return NextResponse.json({ news: [], error: `Finnhub ${res.status}` }, { status: 200 })
    }
    const data = await res.json()
    const news = (data || []).slice(0, 40).map((n: any) => ({
      id: n.id,
      headline: n.headline,
      source: n.source,
      summary: n.summary,
      url: n.url,
      time: new Date(n.datetime * 1000).toISOString(),
      category: n.category,
      related: n.related,
    }))
    return NextResponse.json({ news, source: 'finnhub', updatedAt: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json({ news: [], error: String(error) }, { status: 200 })
  }
}
