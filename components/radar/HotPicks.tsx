'use client'
import { useEffect, useState } from 'react'

type Pick = {
  symbol: string
  side: 'LONG' | 'SHORT'
  setup: string
  entry: number
  sl: number
  tp: number
  rr: number
  risk: 'LOW' | 'MED' | 'HIGH'
  confidence: number
  thesis: string
}

export default function HotPicks() {
  const [picks, setPicks] = useState<Pick[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updated, setUpdated] = useState<Date | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/radar/hot', { cache: 'no-store' })
        const d = await r.json()
        if (d.error) setError(d.error)
        else setError(null)
        setPicks(d.picks || [])
        setUpdated(new Date())
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 10 * 60 * 1000)  // every 10 min
    return () => clearInterval(id)
  }, [])

  const riskColor = (r: string) =>
    r === 'LOW' ? '#00ff41' : r === 'MED' ? '#e0e050' : '#ff8030'

  return (
    <div style={{
      background: 'rgba(0, 10, 5, 0.85)',
      border: '1px solid rgba(0, 255, 65, 0.4)',
      borderRadius: 2,
      fontFamily: '"Space Mono", monospace',
      color: '#00ff41',
      boxShadow: '0 0 20px rgba(0,255,65,0.15)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid rgba(0, 255, 65, 0.4)',
        background: 'linear-gradient(90deg, rgba(0,255,65,0.12), rgba(0,255,65,0.03))',
      }}>
        <span style={{ fontSize: 11, letterSpacing: 3, color: '#80ff80', fontWeight: 700 }}>
          ▸ HOT NOW · AI PICKS
        </span>
        <span style={{
          fontSize: 8, letterSpacing: 2, padding: '2px 8px',
          background: error ? 'rgba(255,170,0,0.15)' : picks.length ? 'rgba(0,255,65,0.15)' : 'rgba(128,128,128,0.15)',
          border: error ? '1px solid rgba(255,170,0,0.4)' : picks.length ? '1px solid rgba(0,255,65,0.4)' : '1px solid rgba(128,128,128,0.4)',
          color: error ? '#ffd080' : picks.length ? '#a0ffa0' : '#aaa',
        }}>
          {error ? 'ERR' : picks.length ? 'LIVE' : loading ? 'SCANNING' : 'QUIET'}
        </span>
      </div>

      {error && (
        <div style={{ padding: 14, color: '#ffd080', fontSize: 10 }}>⚠ {error}</div>
      )}

      {loading && !error && (
        <div style={{ padding: 20, textAlign: 'center', color: 'rgba(0,255,65,0.5)', fontSize: 10 }}>
          Claude analysiert Movers + News · ca. 10s
        </div>
      )}

      {!loading && !error && picks.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: 'rgba(0,255,65,0.5)', fontSize: 10 }}>
          Markt gerade zu ruhig — keine heißen Setups
        </div>
      )}

      <div>
        {picks.map((p, i) => (
          <div key={p.symbol + i} style={{
            padding: '12px 14px',
            borderBottom: '1px solid rgba(0,255,65,0.1)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 180px',
            gap: 12,
          }}>
            {/* Left: symbol + setup + thesis */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <span style={{
                  color: '#a0ffa0', fontWeight: 700, fontSize: 14, letterSpacing: 1,
                }}>{p.symbol}</span>
                <span style={{
                  padding: '1px 6px', fontSize: 8, letterSpacing: 1.5,
                  background: p.side === 'LONG' ? 'rgba(0,255,65,0.2)' : 'rgba(255,85,85,0.2)',
                  color: p.side === 'LONG' ? '#00ff41' : '#ff5555',
                  border: `1px solid ${p.side === 'LONG' ? 'rgba(0,255,65,0.5)' : 'rgba(255,85,85,0.5)'}`,
                }}>{p.side}</span>
                <span style={{
                  padding: '1px 6px', fontSize: 8, letterSpacing: 1.5,
                  background: 'rgba(100,200,255,0.1)', color: '#80c8ff',
                  border: '1px solid rgba(100,200,255,0.4)',
                }}>{p.setup}</span>
                <span style={{
                  padding: '1px 6px', fontSize: 8, letterSpacing: 1.5,
                  color: riskColor(p.risk),
                  border: `1px solid ${riskColor(p.risk)}66`,
                }}>{p.risk}</span>
                <span style={{ fontSize: 9, color: 'rgba(0,255,65,0.55)', marginLeft: 'auto' }}>
                  conf {(p.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div style={{
                fontSize: 11, lineHeight: 1.45, color: 'rgba(224,255,224,0.82)',
              }}>{p.thesis}</div>
            </div>

            {/* Right: trade plan */}
            <div style={{
              fontSize: 10, fontFamily: '"Space Mono", monospace',
              background: 'rgba(0,255,65,0.04)',
              border: '1px solid rgba(0,255,65,0.1)',
              padding: '8px 10px',
            }}>
              <Row k="ENTRY" v={p.entry.toFixed(2)} color="#e0ffe0" />
              <Row k="SL"    v={p.sl.toFixed(2)}    color="#ff8080" />
              <Row k="TP"    v={p.tp.toFixed(2)}    color="#80ff80" />
              <Row k="R:R"   v={`1:${p.rr.toFixed(1)}`} color="#a0ffa0" bold />
            </div>
          </div>
        ))}
      </div>

      <div style={{
        padding: '6px 14px', borderTop: '1px solid rgba(0,255,65,0.15)',
        fontSize: 8, letterSpacing: 2, color: 'rgba(0,255,65,0.5)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>▸ CLAUDE HAIKU · 10m REFRESH</span>
        <span>{updated ? 'SYNC ' + updated.toLocaleTimeString('en-US', { hour12: false }) : '—'}</span>
      </div>
    </div>
  )
}

function Row({ k, v, color, bold }: any) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ color: 'rgba(0,255,65,0.55)', letterSpacing: 1.5 }}>{k}</span>
      <span style={{ color, fontWeight: bold ? 700 : 400 }}>{v}</span>
    </div>
  )
}
