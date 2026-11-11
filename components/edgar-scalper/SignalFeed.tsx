'use client'
import { useEffect, useState } from 'react'

type Signal = {
  id: string
  ts: string
  symbol: string
  timeframe: string
  side: 'LONG' | 'SHORT'
  confidence: number
  price: number
  sl: number | null
  tp: number | null
  reasons: string[] | null
  acted: boolean
  dry_run: boolean
}

export default function SignalFeed() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const r = await fetch('/api/edgar/scalper/signals?limit=50').then(r => r.json()).catch(() => ({}))
      setSignals(r.signals || [])
      setLoading(false)
    }
    load()
    const id = setInterval(load, 30_000)
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
          ▸ SIGNAL FEED
        </span>
        <span style={{ fontSize: 9, letterSpacing: 2, color: 'rgba(0,255,65,0.5)' }}>
          {signals.length} · last 50
        </span>
      </div>

      <div style={{ maxHeight: 360, overflow: 'auto', padding: '2px 0' }}>
        {loading && (
          <div style={{ padding: 20, textAlign: 'center', color: 'rgba(0,255,65,0.4)', fontSize: 10 }}>
            waiting for signals…
          </div>
        )}
        {!loading && signals.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'rgba(0,255,65,0.4)', fontSize: 10 }}>
            no signals yet · bot may not be running
          </div>
        )}
        {signals.map(s => <SignalRow key={s.id} s={s} />)}
      </div>
    </div>
  )
}

function SignalRow({ s }: { s: Signal }) {
  const t = new Date(s.ts).toLocaleTimeString('en-US', { hour12: false })
  const long = s.side === 'LONG'
  const col = long ? '#00ff41' : '#ff5555'
  const confPct = (s.confidence * 100).toFixed(0)
  const reasons = Array.isArray(s.reasons) ? s.reasons.join(' + ') : ''

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '70px 70px 50px 1fr 50px 40px',
      gap: 8, alignItems: 'center',
      padding: '5px 12px',
      borderBottom: '1px solid rgba(0,255,65,0.06)',
      fontSize: 10,
    }}>
      <span style={{ color: 'rgba(0,255,65,0.55)' }}>{t}</span>
      <span style={{ color: '#a0ffa0', fontWeight: 700 }}>{s.symbol}</span>
      <span style={{ color: col, fontWeight: 700 }}>{s.side}</span>
      <span style={{ color: 'rgba(224,255,224,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        @ {s.price.toFixed(s.symbol.startsWith('XAU') ? 2 : 5)} · {reasons}
      </span>
      <span style={{ textAlign: 'right', color: col }}>{confPct}%</span>
      <span style={{ textAlign: 'right', fontSize: 8, color: s.acted ? '#00ff41' : 'rgba(0,255,65,0.3)' }}>
        {s.acted ? '✓' : s.dry_run ? 'SIM' : '—'}
      </span>
    </div>
  )
}
