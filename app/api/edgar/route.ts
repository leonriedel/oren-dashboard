import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET() {
  const sb = createClient(SUPABASE_URL, SUPABASE_SECRET)

  const [trades, signals, portfolio] = await Promise.all([
    sb.from('edgar_trades').select('*').order('created_at', { ascending: false }).limit(200),
    sb.from('edgar_signals').select('*').order('created_at', { ascending: false }).limit(50),
    sb.from('edgar_portfolio').select('*').order('created_at', { ascending: false }).limit(500),
  ])

  const allTrades = trades.data || []
  const openTrades = allTrades.filter(t => t.status === 'open')
  const closedTrades = allTrades.filter(t => t.status !== 'open')

  const snapshots = portfolio.data || []
  const latest = snapshots[0] || null

  // Daily / Weekly / Monthly P&L from snapshots
  const now = Date.now()
  const dayAgo = now - 24 * 60 * 60 * 1000
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000

  const findSnapshotBefore = (cutoff: number) => {
    return snapshots.find(s => new Date(s.created_at).getTime() <= cutoff) || null
  }

  const dailyBase = findSnapshotBefore(dayAgo)
  const weeklyBase = findSnapshotBefore(weekAgo)
  const monthlyBase = findSnapshotBefore(monthAgo)

  const currentValue = latest?.portfolio_value || 0
  const dailyPnL = dailyBase ? currentValue - Number(dailyBase.portfolio_value) : 0
  const weeklyPnL = weeklyBase ? currentValue - Number(weeklyBase.portfolio_value) : 0
  const monthlyPnL = monthlyBase ? currentValue - Number(monthlyBase.portfolio_value) : 0

  const dailyPct = dailyBase ? (dailyPnL / Number(dailyBase.portfolio_value)) * 100 : 0
  const weeklyPct = weeklyBase ? (weeklyPnL / Number(weeklyBase.portfolio_value)) * 100 : 0
  const monthlyPct = monthlyBase ? (monthlyPnL / Number(monthlyBase.portfolio_value)) * 100 : 0

  return NextResponse.json({
    latest,
    openTrades,
    closedTrades,
    trades: allTrades,
    signals: signals.data || [],
    snapshots,
    pnl: {
      daily: { value: dailyPnL, pct: dailyPct },
      weekly: { value: weeklyPnL, pct: weeklyPct },
      monthly: { value: monthlyPnL, pct: monthlyPct },
      total: latest?.total_pnl || 0,
    },
  })
}
