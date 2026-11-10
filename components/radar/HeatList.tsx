'use client'
import { useEffect, useState } from 'react'
import { HOT_TICKERS, HotTicker } from '@/lib/radar/mockData'

export default function HeatList({ title, tickers: initial, variant = 'default' }: {
  title: string
  tickers?: HotTicker[]
  variant?: 'default' | 'niche' | 'crypto'
}) {
  const [tickers, setTickers] = useState<HotTicker[]>(initial || HOT_TICKERS)

  // Subtle live-jitter of prices/heat to feel alive
  useEffect(() => {
    const id = setInterval(() => {
      setTickers(prev => prev.map(t => {
        const jitter = (Math.random() - 0.5) * 0.3
        const heatJitter = (Math.random() - 0.5) * 2
        return {
          ...t,
          price: +(t.price * (1 + jitter / 100)).toFixed(2),
          changePct: +(t.changePct + jitter).toFixed(2),
          heat: Math.max(30, Math.min(100, Math.round(t.heat + heatJitter))),
        }
      }))
    }, 2500)
    return () => clearInterval(id)
  }, [])

  const badge = variant === 'niche' ? 'NICHE' : variant === 'crypto' ? 'CRYPTO' : 'TOP 10'

  return (
    <div style={{
      background: 'rgba(0, 10, 5, 0.78)',
      border: '1px solid rgba(0, 255, 65, 0.28)',
      borderRadius: 2,
      fontFamily: '"Space Mono", monospace',
      fontSize: 11,
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
        <span style={{ fontSize: 10, letterSpacing: 2.5, color: '#80ff80', fontWeight: 700 }}>▸ {title}</span>
        <span style={{
          fontSize: 8, letterSpacing: 2, padding: '2px 8px',
          background: 'rgba(0, 255, 65, 0.15)', border: '1px solid rgba(0, 255, 65, 0.4)',
          color: '#a0ffa0', borderRadius: 2,
        }}>{badge}</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {tickers.map((t, i) => (
          <TickerRow key={t.symbol} ticker={t} rank={i + 1} />
        ))}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '6px 12px', borderTop: '1px solid rgba(0, 255, 65, 0.2)',
        fontSize: 8, letterSpacing: 2, color: 'rgba(0, 255, 65, 0.5)',
        background: 'rgba(0, 255, 65, 0.03)',
      }}>
        <span>◉ HEAT PULSE</span>
        <span>SYNC {new Date().toLocaleTimeString('en-US', { hour12: false })}</span>
      </div>
    </div>
  )
}

function TickerRow({ ticker: t, rank }: { ticker: HotTicker; rank: number }) {
  const up = t.changePct >= 0
  const price = t.price > 1000 ? t.price.toLocaleString('en-US', { maximumFractionDigits: 0 }) : t.price.toFixed(2)
  const heatColor = t.heat > 90 ? '#ff4444' : t.heat > 80 ? '#ffaa00' : t.heat > 70 ? '#00ff41' : '#60ff80'
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 60px 1fr 70px 50px',
      gap: 8, alignItems: 'center',
      padding: '6px 12px',
      borderBottom: '1px solid rgba(0, 255, 65, 0.06)',
    }}>
      <span style={{ color: 'rgba(0, 255, 65, 0.45)', fontSize: 10 }}>
        {String(rank).padStart(2, '0')}
      </span>
      <span style={{ color: '#a0ffa0', fontWeight: 700, fontSize: 12, letterSpacing: 0.5 }}>
        {t.symbol}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#e0ffe0', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.note || t.name}
        </div>
      </div>
      <span style={{ color: up ? '#00ff41' : '#ff5555', textAlign: 'right', fontSize: 11, fontWeight: 700 }}>
        {up ? '+' : ''}{t.changePct.toFixed(1)}%
      </span>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          display: 'inline-block',
          fontSize: 9, letterSpacing: 1, padding: '1px 5px', borderRadius: 2,
          background: `${heatColor}22`, color: heatColor, border: `1px solid ${heatColor}66`,
          fontWeight: 700,
        }}>
          {t.heat}
        </div>
      </div>
    </div>
  )
}
