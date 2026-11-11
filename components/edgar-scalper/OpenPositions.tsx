'use client'
import { useEffect, useState } from 'react'

type Trade = {
  id: string
  opened_at: string
  symbol: string
  side: string
  size: number
  entry: number
  sl: number | null
  tp: number | null
  dry_run: boolean
}

export default function OpenPositions() {
  const [positions, setPositions] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const r = await fetch('/api/edgar/scalper/positions').then(r => r.json()).catch(() => ({}))
      setPositions(r.positions || [])
      setLoading(false)
    }
    load()
    const id = setInterval(load, 15_000)
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
          ▸ OPEN POSITIONS
        </span>
        <span style={{ fontSize: 9, letterSpacing: 2, color: 'rgba(0,255,65,0.5)' }}>
          {positions.length}
        </span>
      </div>

      <div style={{ padding: '2px 0' }}>
        {loading && (
          <div style={{ padding: 16, textAlign: 'center', color: 'rgba(0,255,65,0.4)', fontSize: 10 }}>
            loading…
          </div>
        )}
        {!loading && positions.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: 'rgba(0,255,65,0.4)', fontSize: 10 }}>
            flat · no open positions
          </div>
        )}
        {positions.map(p => {
          const long = p.side === 'LONG'
          return (
            <div key={p.id} style={{
              display: 'grid',
              gridTemplateColumns: '80px 60px 70px 1fr 50px',
              gap: 8,
              padding: '6px 12px',
              borderBottom: '1px solid rgba(0,255,65,0.06)',
              fontSize: 10,
              alignItems: 'center',
            }}>
              <span style={{ color: '#a0ffa0', fontWeight: 700 }}>{p.symbol}</span>
              <span style={{ color: long ? '#00ff41' : '#ff5555', fontWeight: 700 }}>{p.side}</span>
              <span style={{ color: 'rgba(224,255,224,0.7)' }}>{p.size} u</span>
              <span style={{ color: 'rgba(0,255,65,0.6)', fontSize: 9 }}>
                E {p.entry.toFixed(5)} · SL {p.sl?.toFixed(5) || '—'} · TP {p.tp?.toFixed(5) || '—'}
              </span>
              <span style={{ textAlign: 'right', fontSize: 8, color: p.dry_run ? '#ffd080' : '#00ff41' }}>
                {p.dry_run ? 'SIM' : 'LIVE'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
