'use client'
import { useEffect, useState } from 'react'

type Status = {
  alive: boolean
  lastHeartbeat: string | null
  lastSignalScan: string | null
  lastError: string | null
  mode: 'paper' | 'live'
  universe: string[]
  version: string
}

export default function BotStatus() {
  const [s, setS] = useState<Status | null>(null)

  useEffect(() => {
    const load = async () => {
      const r = await fetch('/api/edgar/scalper/status').then(r => r.json()).catch(() => null)
      setS(r)
    }
    load()
    const id = setInterval(load, 15_000)
    return () => clearInterval(id)
  }, [])

  const col = s?.alive ? '#00ff41' : '#ff5555'
  const lastHb = s?.lastHeartbeat ? new Date(s.lastHeartbeat).toLocaleTimeString('en-US', { hour12: false }) : '—'
  const since = s?.lastHeartbeat ? Math.floor((Date.now() - new Date(s.lastHeartbeat).getTime()) / 1000) : null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      background: 'rgba(0, 10, 5, 0.78)',
      border: '1px solid rgba(0, 255, 65, 0.28)',
      padding: '8px 14px',
      fontFamily: '"Space Mono", monospace',
      fontSize: 10, color: '#a0ffa0',
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 10px',
        background: `${col}22`, border: `1px solid ${col}66`,
        color: col, fontWeight: 700, letterSpacing: 2,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: col, boxShadow: `0 0 6px ${col}` }} />
        {s?.alive ? 'BOT LIVE' : 'BOT OFFLINE'}
      </span>
      <span style={{ letterSpacing: 2 }}>MODE · {(s?.mode || 'paper').toUpperCase()}</span>
      <span style={{ letterSpacing: 2 }}>HB · {lastHb}{since !== null ? ` (${since}s)` : ''}</span>
      <span style={{ letterSpacing: 2, color: 'rgba(0,255,65,0.6)' }}>
        UNIVERSE · {(s?.universe || []).join(' · ') || '—'}
      </span>
      {s?.lastError && (
        <span style={{ marginLeft: 'auto', color: '#ff8080', fontSize: 9 }}>⚠ {s.lastError.slice(0, 60)}</span>
      )}
    </div>
  )
}
