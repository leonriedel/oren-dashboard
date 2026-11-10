'use client'
import { useEffect, useState } from 'react'

type Sector = {
  symbol: string
  name: string
  color: string
  price: number
  changePct: number
}

export default function SectorHeat() {
  const [sectors, setSectors] = useState<Sector[]>([])
  const [live, setLive] = useState(false)
  const [updated, setUpdated] = useState<Date | null>(null)

  useEffect(() => {
    let abort = false
    const load = async () => {
      try {
        const r = await fetch('/api/radar/sectors', { cache: 'no-store' })
        const d = await r.json()
        if (abort) return
        if (d.sectors?.length) { setSectors(d.sectors); setLive(true); setUpdated(new Date()) }
      } catch {}
    }
    load()
    const id = setInterval(load, 90 * 1000)
    return () => { abort = true; clearInterval(id) }
  }, [])

  return (
    <div style={{
      background: 'rgba(0, 10, 5, 0.78)',
      border: '1px solid rgba(0, 255, 65, 0.28)',
      borderRadius: 2,
      fontFamily: '"Space Mono", monospace',
      color: '#00ff41',
      display: 'flex', flexDirection: 'column',
      height: '100%',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(0, 255, 65, 0.28)',
        background: 'rgba(0, 255, 65, 0.08)',
      }}>
        <span style={{ fontSize: 10, letterSpacing: 2.5, color: '#80ff80', fontWeight: 700 }}>▸ SECTOR HEATMAP · S&P 500</span>
        <span style={{
          fontSize: 8, letterSpacing: 2, padding: '2px 8px',
          background: live ? 'rgba(0, 255, 65, 0.15)' : 'rgba(255, 170, 0, 0.15)',
          border: live ? '1px solid rgba(0, 255, 65, 0.4)' : '1px solid rgba(255, 170, 0, 0.4)',
          color: live ? '#a0ffa0' : '#ffd080',
        }}>{live ? 'SPDR LIVE' : 'WAIT'}</span>
      </div>

      <div style={{
        flex: 1, padding: 8,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
        gap: 4, minHeight: 170,
      }}>
        {sectors.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'rgba(0,255,65,0.4)', fontSize: 10, padding: 20 }}>
            fetching sector ETFs…
          </div>
        ) : sectors.map(s => <SectorTile key={s.symbol} s={s} />)}
      </div>

      <div style={{
        padding: '4px 12px', borderTop: '1px solid rgba(0, 255, 65, 0.15)',
        fontSize: 8, letterSpacing: 2, color: 'rgba(0, 255, 65, 0.5)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>XLK XLC XLY XLP XLE XLF XLV XLI XLB XLU XLRE</span>
        <span>{updated ? 'SYNC ' + updated.toLocaleTimeString('en-US', { hour12: false }) : '—'}</span>
      </div>
    </div>
  )
}

function SectorTile({ s }: { s: Sector }) {
  const up = s.changePct >= 0
  // Heat intensity 0..1 based on |%|, cap at ~4%
  const intensity = Math.min(1, Math.abs(s.changePct) / 4)
  const bg = up
    ? `rgba(0, 255, 65, ${0.08 + intensity * 0.25})`
    : `rgba(255, 85, 85, ${0.08 + intensity * 0.25})`
  const border = up
    ? `rgba(0, 255, 65, ${0.3 + intensity * 0.4})`
    : `rgba(255, 85, 85, ${0.3 + intensity * 0.4})`
  const color = up ? '#00ff41' : '#ff6060'
  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      padding: '8px 10px',
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      <div style={{ fontSize: 9, letterSpacing: 1.5, color: 'rgba(224, 255, 224, 0.75)' }}>
        {s.symbol}
      </div>
      <div style={{ fontSize: 9, color: 'rgba(160, 255, 160, 0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {s.name}
      </div>
      <div style={{ fontSize: 13, color, fontWeight: 700 }}>
        {up ? '+' : ''}{s.changePct.toFixed(2)}%
      </div>
    </div>
  )
}
