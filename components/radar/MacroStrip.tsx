'use client'
import { useEffect, useState } from 'react'

type MacroItem = {
  symbol: string
  label: string
  type: string
  price: number
  changePct: number
  hint?: string
}

export default function MacroStrip() {
  const [items, setItems] = useState<MacroItem[]>([])
  const [live, setLive] = useState(false)

  useEffect(() => {
    let abort = false
    const load = async () => {
      try {
        const r = await fetch('/api/radar/macro', { cache: 'no-store' })
        const d = await r.json()
        if (abort) return
        if (d.macro?.length) { setItems(d.macro); setLive(true) }
      } catch {}
    }
    load()
    const id = setInterval(load, 60 * 1000)
    return () => { abort = true; clearInterval(id) }
  }, [])

  if (!items.length) {
    return (
      <div style={{ border: '1px dashed rgba(0,255,65,0.2)', padding: '8px 12px', fontSize: 9, letterSpacing: 2, color: 'rgba(0,255,65,0.4)', fontFamily: '"Space Mono", monospace' }}>
        MACRO · waiting for data · set FINNHUB_API_KEY
      </div>
    )
  }

  return (
    <div style={{
      border: '1px solid rgba(0,255,65,0.22)',
      background: 'rgba(0,10,5,0.78)',
      padding: '0',
      fontFamily: '"Space Mono", monospace',
      position: 'relative',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '4px 10px', borderBottom: '1px solid rgba(0,255,65,0.15)',
        fontSize: 8, letterSpacing: 2, color: '#60ff80', background: 'rgba(0,255,65,0.06)',
      }}>
        <span>▸ MACRO · INDEXES · RATES · COMMODITIES · CRYPTO</span>
        <span>{live ? 'LIVE' : 'MOCK'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 0 }}>
        {items.map(m => <MacroCell key={m.symbol} m={m} />)}
      </div>
    </div>
  )
}

function MacroCell({ m }: { m: MacroItem }) {
  const up = m.changePct >= 0
  const color = up ? '#00ff41' : '#ff5555'
  const price = m.price > 1000 ? m.price.toLocaleString('en-US', { maximumFractionDigits: 0 })
              : m.price > 10 ? m.price.toFixed(2)
              : m.price.toFixed(4)
  return (
    <div style={{
      padding: '8px 10px',
      borderRight: '1px solid rgba(0,255,65,0.1)',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ fontSize: 8, letterSpacing: 1.5, color: 'rgba(0,255,65,0.55)' }}>
        {m.label} · {m.symbol}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div style={{ fontSize: 13, color: '#e0ffe0', fontWeight: 700 }}>${price}</div>
        <div style={{ fontSize: 10, color, fontWeight: 700 }}>{up ? '+' : ''}{m.changePct.toFixed(2)}%</div>
      </div>
    </div>
  )
}
