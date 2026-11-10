'use client'
import { useEffect, useState } from 'react'
import { HOT_TICKERS, HotTicker, NICHE_PICKS, CRYPTO_HEAT } from '@/lib/radar/mockData'

export default function HeatList({ title, source, variant = 'default' }: {
  title: string
  source: 'stocks' | 'niche' | 'crypto'
  variant?: 'default' | 'niche' | 'crypto'
}) {
  const fallback = source === 'crypto' ? CRYPTO_HEAT : source === 'niche' ? NICHE_PICKS : HOT_TICKERS
  const [tickers, setTickers] = useState<HotTicker[]>(fallback)
  const [live, setLive] = useState(false)
  const [updated, setUpdated] = useState<Date | null>(null)

  useEffect(() => {
    let abort = false

    const load = async () => {
      try {
        const endpoint = source === 'crypto' ? '/api/radar/crypto' : '/api/radar/movers'
        const r = await fetch(endpoint, { cache: 'no-store' })
        const d = await r.json()
        if (abort) return

        let incoming: any[] = []
        if (source === 'crypto') incoming = d.tickers || []
        else if (source === 'niche') incoming = d.niche || []
        else incoming = d.tickers || []

        if (incoming.length > 0) {
          const mapped: HotTicker[] = incoming.map((t: any) => ({
            symbol: t.symbol,
            name: t.name || t.symbol,
            price: t.price,
            changePct: t.changePct,
            volume: t.volume ? formatVol(t.volume) : '—',
            heat: t.heat,
            category: source === 'crypto' ? 'crypto' : source === 'niche' ? 'micro' : 'stock',
            note: t.note,
          }))
          setTickers(mapped)
          setLive(true)
          setUpdated(new Date())
        }
      } catch {
        if (!abort) setLive(false)
      }
    }

    load()
    const id = setInterval(load, 60 * 1000)
    return () => { abort = true; clearInterval(id) }
  }, [source])

  // Subtle jitter between refreshes so the panel feels alive
  useEffect(() => {
    const id = setInterval(() => {
      setTickers(prev => prev.map(t => {
        const j = (Math.random() - 0.5) * 0.15
        return { ...t, price: +(t.price * (1 + j / 100)).toFixed(t.price > 100 ? 2 : 4) }
      }))
    }, 3000)
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
          background: live ? 'rgba(0, 255, 65, 0.15)' : 'rgba(255, 170, 0, 0.15)',
          border: live ? '1px solid rgba(0, 255, 65, 0.4)' : '1px solid rgba(255, 170, 0, 0.4)',
          color: live ? '#a0ffa0' : '#ffd080',
          borderRadius: 2,
        }}>{live ? badge : 'MOCK'}</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {tickers.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'rgba(0,255,65,0.4)' }}>
            waiting for data…
          </div>
        ) : tickers.map((t, i) => (
          <TickerRow key={t.symbol + i} ticker={t} rank={i + 1} />
        ))}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '6px 12px', borderTop: '1px solid rgba(0, 255, 65, 0.2)',
        fontSize: 8, letterSpacing: 2, color: 'rgba(0, 255, 65, 0.5)',
        background: 'rgba(0, 255, 65, 0.03)',
      }}>
        <span>◉ HEAT PULSE</span>
        <span>{updated ? 'SYNC ' + updated.toLocaleTimeString('en-US', { hour12: false }) : '—'}</span>
      </div>
    </div>
  )
}

function TickerRow({ ticker: t, rank }: { ticker: HotTicker; rank: number }) {
  const up = t.changePct >= 0
  const price = t.price > 1000 ? t.price.toLocaleString('en-US', { maximumFractionDigits: 0 })
              : t.price > 1 ? t.price.toFixed(2)
              : t.price.toFixed(4)
  const heatColor = t.heat > 90 ? '#ff4444' : t.heat > 80 ? '#ffaa00' : t.heat > 70 ? '#00ff41' : '#60ff80'
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 62px 1fr 68px 44px',
      gap: 8, alignItems: 'center',
      padding: '6px 12px',
      borderBottom: '1px solid rgba(0, 255, 65, 0.06)',
    }}>
      <span style={{ color: 'rgba(0, 255, 65, 0.45)', fontSize: 10 }}>{String(rank).padStart(2, '0')}</span>
      <span style={{ color: '#a0ffa0', fontWeight: 700, fontSize: 12, letterSpacing: 0.5 }}>{t.symbol}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#e0ffe0', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          ${price}
        </div>
      </div>
      <span style={{ color: up ? '#00ff41' : '#ff5555', textAlign: 'right', fontSize: 11, fontWeight: 700 }}>
        {up ? '+' : ''}{t.changePct.toFixed(2)}%
      </span>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          display: 'inline-block',
          fontSize: 9, letterSpacing: 1, padding: '1px 5px', borderRadius: 2,
          background: `${heatColor}22`, color: heatColor, border: `1px solid ${heatColor}66`,
          fontWeight: 700,
        }}>{t.heat}</div>
      </div>
    </div>
  )
}

function formatVol(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n)
}
