'use client'
import { useEffect, useState } from 'react'

type Trade = {
  id: string
  opened_at: string
  closed_at: string
  symbol: string
  side: string
  size: number
  entry: number
  exit: number
  pnl: number
  pnl_pct: number
  exit_reason: string
  dry_run: boolean
}

export default function TradeJournal() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const r = await fetch('/api/edgar/scalper/trades?limit=20').then(r => r.json()).catch(() => ({}))
      setTrades(r.trades || [])
      setLoading(false)
    }
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      background: 'rgba(0, 10, 5, 0.78)',
      border: '1px solid rgba(0, 255, 65, 0.28)',
      borderRadius: 2,
      fontFamily: '"Space Mono", monospace',
      color: '#00ff41',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(0, 255, 65, 0.28)',
        background: 'rgba(0, 255, 65, 0.08)',
      }}>
        <span style={{ fontSize: 10, letterSpacing: 2.5, color: '#80ff80', fontWeight: 700 }}>
          ▸ JOURNAL · LAST 20
        </span>
      </div>
      <div style={{ maxHeight: 320, overflow: 'auto' }}>
        {loading && <div style={{ padding: 20, textAlign: 'center', fontSize: 10, color: 'rgba(0,255,65,0.4)' }}>loading…</div>}
        {!loading && trades.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 10, color: 'rgba(0,255,65,0.4)' }}>no closed trades yet</div>
        )}
        {trades.map(t => {
          const up = (t.pnl || 0) >= 0
          const col = up ? '#00ff41' : '#ff5555'
          const closed = new Date(t.closed_at).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
          return (
            <div key={t.id} style={{
              display: 'grid',
              gridTemplateColumns: '90px 70px 50px 1fr 70px 50px',
              gap: 6, padding: '5px 12px',
              borderBottom: '1px solid rgba(0,255,65,0.06)',
              fontSize: 10, alignItems: 'center',
            }}>
              <span style={{ color: 'rgba(0,255,65,0.55)', fontSize: 9 }}>{closed}</span>
              <span style={{ color: '#a0ffa0', fontWeight: 700 }}>{t.symbol}</span>
              <span style={{ color: t.side === 'LONG' ? '#00ff41' : '#ff5555' }}>{t.side}</span>
              <span style={{ color: 'rgba(224,255,224,0.65)', fontSize: 9 }}>
                {t.entry.toFixed(5)} → {t.exit.toFixed(5)} · {t.exit_reason}
              </span>
              <span style={{ textAlign: 'right', color: col, fontWeight: 700 }}>
                {up ? '+' : ''}${(t.pnl || 0).toFixed(2)}
              </span>
              <span style={{ textAlign: 'right', color: col, fontSize: 9 }}>
                {up ? '+' : ''}{(t.pnl_pct || 0).toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
