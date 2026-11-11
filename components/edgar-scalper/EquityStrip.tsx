'use client'
import { useEffect, useState } from 'react'

type Stats = {
  totalPnl: number
  winRate: number
  wins: number
  losses: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  count: number
} | null

type EquityPoint = { ts: string; nav: number; unrealized: number }

export default function EquityStrip() {
  const [stats, setStats] = useState<Stats>(null)
  const [equity, setEquity] = useState<EquityPoint[]>([])

  useEffect(() => {
    const load = async () => {
      const [t, e] = await Promise.all([
        fetch('/api/edgar/scalper/trades?limit=100').then(r => r.json()).catch(() => ({})),
        fetch('/api/edgar/scalper/equity?days=1').then(r => r.json()).catch(() => ({})),
      ])
      setStats(t.stats || null)
      setEquity(e.equity || [])
    }
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  const nav = equity.length ? equity[equity.length - 1].nav : 0
  const navStart = equity.length ? equity[0].nav : 0
  const dayPnl = nav - navStart
  const dayPct = navStart ? (dayPnl / navStart) * 100 : 0

  const Cell = ({ label, value, color }: any) => (
    <div style={{ padding: '10px 14px', borderRight: '1px solid rgba(0,255,65,0.1)', flex: 1 }}>
      <div style={{ fontSize: 8, letterSpacing: 2, color: 'rgba(0,255,65,0.55)' }}>{label}</div>
      <div style={{ fontSize: 15, color: color || '#e0ffe0', fontWeight: 700, marginTop: 3 }}>{value}</div>
    </div>
  )

  return (
    <div style={{
      display: 'flex',
      background: 'rgba(0, 10, 5, 0.78)',
      border: '1px solid rgba(0, 255, 65, 0.28)',
      borderRadius: 2,
      fontFamily: '"Space Mono", monospace',
    }}>
      <Cell label="NAV" value={`$${(nav || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
      <Cell
        label="DAILY P&L"
        value={`${dayPnl >= 0 ? '+' : ''}$${dayPnl.toFixed(0)} · ${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(2)}%`}
        color={dayPnl >= 0 ? '#00ff41' : '#ff5555'}
      />
      <Cell
        label="WIN RATE"
        value={stats ? `${(stats.winRate * 100).toFixed(1)}%` : '—'}
      />
      <Cell
        label="PROFIT FACTOR"
        value={stats && stats.profitFactor ? stats.profitFactor.toFixed(2) : '—'}
        color={(stats?.profitFactor || 0) >= 1.5 ? '#00ff41' : (stats?.profitFactor || 0) >= 1 ? '#e0ffe0' : '#ff5555'}
      />
      <Cell label="TRADES" value={stats ? String(stats.count) : '—'} />
    </div>
  )
}
