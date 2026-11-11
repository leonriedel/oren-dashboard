'use client'
import { useEffect, useState } from 'react'

type Point = { ts: string; nav: number }

export default function EquityCurve() {
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const r = await fetch('/api/edgar/scalper/equity?days=7').then(r => r.json()).catch(() => ({}))
      setPoints((r.equity || []).map((e: any) => ({ ts: e.ts, nav: e.nav })))
      setLoading(false)
    }
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  const max = Math.max(...points.map(p => p.nav), 0)
  const min = Math.min(...points.map(p => p.nav), max)
  const range = max - min || 1
  const W = 600
  const H = 120

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
          ▸ EQUITY CURVE · 7D
        </span>
        <span style={{ fontSize: 9, letterSpacing: 2, color: 'rgba(0,255,65,0.5)' }}>
          {points.length} snapshots
        </span>
      </div>

      <div style={{ padding: 12 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'rgba(0,255,65,0.4)', fontSize: 10, padding: 20 }}>loading…</div>
        ) : points.length < 2 ? (
          <div style={{ textAlign: 'center', color: 'rgba(0,255,65,0.4)', fontSize: 10, padding: 20 }}>
            not enough data yet · bot logs NAV hourly
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
            <polyline
              fill="none"
              stroke="#00ff41"
              strokeWidth={1.5}
              points={points.map((p, i) => {
                const x = (i / (points.length - 1)) * W
                const y = H - ((p.nav - min) / range) * H
                return `${x},${y}`
              }).join(' ')}
            />
            <text x={4} y={12} fill="rgba(0,255,65,0.6)" fontSize={9}>${max.toFixed(0)}</text>
            <text x={4} y={H - 4} fill="rgba(0,255,65,0.6)" fontSize={9}>${min.toFixed(0)}</text>
          </svg>
        )}
      </div>
    </div>
  )
}
