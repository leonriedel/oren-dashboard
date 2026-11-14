'use client'
import { useEffect, useState } from 'react'

type Point = {
  ts: string
  total_eur: number
  liquid_eur: number
  investments_eur: number
  physical_eur: number
  other_eur: number
}

export default function EquityTrend({ currentTotal }: { currentTotal: number }) {
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/finance/snapshots?days=90')
      .then(r => r.json())
      .then(d => setPoints(d.snapshots || []))
      .finally(() => setLoading(false))
  }, [])

  const augmented = points.length > 0
    ? [...points, { ...points[points.length - 1], total_eur: currentTotal, ts: new Date().toISOString() }]
    : []

  const values = augmented.map(p => p.total_eur)
  const max = Math.max(...values, 0)
  const min = Math.min(...values, max)
  const range = max - min || 1
  const W = 800
  const H = 180

  const first = augmented[0]
  const last = augmented[augmented.length - 1]
  const delta = last && first ? last.total_eur - first.total_eur : 0
  const deltaPct = first?.total_eur ? (delta / first.total_eur) * 100 : 0
  const up = delta >= 0

  return (
    <div style={{
      background: 'rgba(0,10,25,0.5)',
      border: '1px solid rgba(80,180,255,0.12)',
      borderRadius: 4,
      fontFamily: 'Space Mono, monospace',
    }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid rgba(80,180,255,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(80,180,255,0.04)',
      }}>
        <span style={{ fontSize: 10, letterSpacing: 3, color: '#7ea6d5', fontWeight: 700 }}>
          ▸ EQUITY TREND · 90D
        </span>
        <span style={{ fontSize: 10, color: 'rgba(126,166,213,0.6)' }}>
          {augmented.length} snapshots
        </span>
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(126,166,213,0.5)', fontSize: 10 }}>
            loading snapshots…
          </div>
        ) : augmented.length < 2 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(126,166,213,0.5)', fontSize: 10 }}>
            noch nicht genug snapshots · sammelt sich täglich an
          </div>
        ) : (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
              <defs>
                <linearGradient id="grad1" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={up ? '#34d399' : '#f87171'} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={up ? '#34d399' : '#f87171'} stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* area fill */}
              <polygon
                fill="url(#grad1)"
                points={
                  augmented.map((p, i) => {
                    const x = (i / (augmented.length - 1)) * W
                    const y = H - ((p.total_eur - min) / range) * (H - 10) - 5
                    return `${x},${y}`
                  }).join(' ') + ` ${W},${H} 0,${H}`
                }
              />

              {/* line */}
              <polyline
                fill="none"
                stroke={up ? '#34d399' : '#f87171'}
                strokeWidth={1.8}
                points={augmented.map((p, i) => {
                  const x = (i / (augmented.length - 1)) * W
                  const y = H - ((p.total_eur - min) / range) * (H - 10) - 5
                  return `${x},${y}`
                }).join(' ')}
              />

              {/* min/max labels */}
              <text x={6} y={14} fill="rgba(126,166,213,0.55)" fontSize={10}>
                €{max.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </text>
              <text x={6} y={H - 6} fill="rgba(126,166,213,0.55)" fontSize={10}>
                €{min.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </text>
            </svg>

            <div style={{
              marginTop: 10,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 11,
            }}>
              <span style={{ color: 'rgba(126,166,213,0.6)' }}>
                {first && new Date(first.ts).toLocaleDateString()}
              </span>
              <span style={{ color: up ? '#34d399' : '#f87171', fontWeight: 700 }}>
                {up ? '+' : ''}€{delta.toLocaleString('en-US', { maximumFractionDigits: 0 })} · {up ? '+' : ''}{deltaPct.toFixed(2)}%
              </span>
              <span style={{ color: 'rgba(126,166,213,0.6)' }}>
                {last && new Date(last.ts).toLocaleDateString()}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
