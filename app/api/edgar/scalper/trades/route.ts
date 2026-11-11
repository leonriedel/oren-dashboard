import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!

export async function GET(req: Request) {
  try {
    const u = new URL(req.url)
    const limit = Math.min(Number(u.searchParams.get('limit') || 20), 100)
    const supa = createClient(URL, KEY)

    // Closed trades (journal)
    const { data, error } = await supa
      .from('edgar_trades')
      .select('*')
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ trades: [], error: error.message, stats: null }, { status: 200 })
    }

    const trades = data || []

    // Quick stats
    const wins = trades.filter(t => (t.pnl || 0) > 0).length
    const losses = trades.filter(t => (t.pnl || 0) < 0).length
    const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0)
    const avgWin = wins ? trades.filter(t => (t.pnl || 0) > 0).reduce((s, t) => s + t.pnl, 0) / wins : 0
    const avgLoss = losses ? trades.filter(t => (t.pnl || 0) < 0).reduce((s, t) => s + t.pnl, 0) / losses : 0
    const winRate = trades.length ? wins / trades.length : 0
    const profitFactor = Math.abs(avgLoss) ? Math.abs((avgWin * wins) / (avgLoss * losses)) : 0

    return NextResponse.json({
      trades,
      stats: {
        totalPnl,
        winRate,
        wins,
        losses,
        avgWin,
        avgLoss,
        profitFactor,
        count: trades.length,
      },
    })
  } catch (e) {
    return NextResponse.json({ trades: [], error: String(e), stats: null }, { status: 200 })
  }
}
