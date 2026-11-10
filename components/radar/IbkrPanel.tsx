'use client'
import { useEffect, useState } from 'react'

type Position = {
  symbol: string
  description: string
  assetCategory: string
  currency: string
  position: number
  markPrice: number
  positionValue: number
  costBasis: number
  unrealizedPnl: number
  percentOfNAV: number
}

type AccountSummary = {
  date: string
  cash: number
  stock: number
  options: number
  total: number
  currency: string
} | null

export default function IbkrPanel() {
  const [positions, setPositions] = useState<Position[]>([])
  const [account, setAccount] = useState<AccountSummary>(null)
  const [unrealizedTotal, setUnrealizedTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [updated, setUpdated] = useState<Date | null>(null)

  useEffect(() => {
    let abort = false
    const load = async () => {
      try {
        const r = await fetch('/api/ibkr/flex', { cache: 'no-store' })
        const d = await r.json()
        if (abort) return
        if (d.error) setError(d.error)
        else setError(null)
        setPositions(d.positions || [])
        setAccount(d.account || null)
        setUnrealizedTotal(d.unrealizedTotal || 0)
        setUpdated(new Date())
      } catch (e) {
        if (!abort) setError(String(e))
      } finally {
        if (!abort) setLoading(false)
      }
    }
    load()
    // Refresh hourly (Flex Query has rate limits — do not hammer)
    const id = setInterval(load, 60 * 60 * 1000)
    return () => { abort = true; clearInterval(id) }
  }, [])

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
  const totalValue = account?.total || positions.reduce((s, p) => s + p.positionValue, 0)
  const pnlColor = unrealizedTotal >= 0 ? '#00ff41' : '#ff5555'

  return (
    <div style={{
      background: 'rgba(0, 10, 5, 0.78)',
      border: '1px solid rgba(0, 255, 65, 0.28)',
      borderRadius: 2,
      fontFamily: '"Space Mono", monospace',
      color: '#00ff41',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(0, 255, 65, 0.28)',
        background: 'rgba(0, 255, 65, 0.08)',
      }}>
        <span style={{ fontSize: 10, letterSpacing: 2.5, color: '#80ff80', fontWeight: 700 }}>
          ▸ IBKR PORTFOLIO
        </span>
        <span style={{
          fontSize: 8, letterSpacing: 2, padding: '2px 8px',
          background: error ? 'rgba(255, 170, 0, 0.15)' : positions.length ? 'rgba(0, 255, 65, 0.15)' : 'rgba(128,128,128,0.15)',
          border: error ? '1px solid rgba(255, 170, 0, 0.4)' : positions.length ? '1px solid rgba(0, 255, 65, 0.4)' : '1px solid rgba(128,128,128,0.4)',
          color: error ? '#ffd080' : positions.length ? '#a0ffa0' : '#aaa',
        }}>{error ? 'SETUP NEEDED' : positions.length ? 'FLEX LIVE' : loading ? 'LOADING' : 'EMPTY'}</span>
      </div>

      {error ? (
        <div style={{ padding: 14, fontSize: 10, lineHeight: 1.6, color: '#ffd080' }}>
          ⚠ {error}
          <div style={{ marginTop: 8, color: 'rgba(0,255,65,0.55)', fontSize: 9 }}>
            Set IBKR_FLEX_TOKEN + IBKR_FLEX_QUERY_ID in Vercel env, then redeploy.
          </div>
        </div>
      ) : loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'rgba(0,255,65,0.4)', fontSize: 10 }}>
          fetching from IBKR Flex Web Service…
        </div>
      ) : positions.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'rgba(0,255,65,0.4)', fontSize: 10 }}>
          no open positions
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            borderBottom: '1px solid rgba(0,255,65,0.15)',
          }}>
            <Cell label="NAV" value={`$${fmt(totalValue)}`} />
            <Cell label="POSITIONS" value={String(positions.length).padStart(2, '0')} />
            <Cell label="UNREALIZED" value={`${unrealizedTotal >= 0 ? '+' : ''}$${fmt(unrealizedTotal)}`} color={pnlColor} />
          </div>

          {/* Position rows */}
          <div style={{ padding: '4px 0', maxHeight: 280, overflow: 'auto' }}>
            {positions
              .sort((a, b) => Math.abs(b.positionValue) - Math.abs(a.positionValue))
              .map(p => <PositionRow key={p.symbol + p.assetCategory} p={p} />)}
          </div>
        </>
      )}

      <div style={{
        padding: '4px 12px', borderTop: '1px solid rgba(0, 255, 65, 0.15)',
        fontSize: 8, letterSpacing: 2, color: 'rgba(0, 255, 65, 0.5)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>▸ FLEX WEB SERVICE</span>
        <span>{updated ? 'SYNC ' + updated.toLocaleTimeString('en-US', { hour12: false }) : '—'}</span>
      </div>
    </div>
  )
}

function Cell({ label, value, color = '#e0ffe0' }: any) {
  return (
    <div style={{ padding: '7px 10px', borderRight: '1px solid rgba(0,255,65,0.1)' }}>
      <div style={{ fontSize: 8, letterSpacing: 1.5, color: 'rgba(0,255,65,0.55)' }}>{label}</div>
      <div style={{ fontSize: 13, color, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function PositionRow({ p }: { p: Position }) {
  const pnlPct = p.costBasis ? (p.unrealizedPnl / Math.abs(p.costBasis)) * 100 : 0
  const up = p.unrealizedPnl >= 0
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '60px 1fr 80px 70px 60px',
      gap: 8, alignItems: 'center',
      padding: '5px 12px',
      borderBottom: '1px solid rgba(0,255,65,0.06)',
      fontSize: 10,
    }}>
      <span style={{ color: '#a0ffa0', fontWeight: 700, fontSize: 11, letterSpacing: 0.5 }}>{p.symbol}</span>
      <span style={{ color: 'rgba(224,255,224,0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {p.position} @ ${p.markPrice.toFixed(2)}
      </span>
      <span style={{ textAlign: 'right', color: '#e0ffe0' }}>${fmt(p.positionValue)}</span>
      <span style={{ textAlign: 'right', color: up ? '#00ff41' : '#ff5555', fontWeight: 700 }}>
        {up ? '+' : ''}${fmt(p.unrealizedPnl)}
      </span>
      <span style={{ textAlign: 'right', color: up ? '#00ff41' : '#ff5555', fontSize: 9 }}>
        {up ? '+' : ''}{pnlPct.toFixed(1)}%
      </span>
    </div>
  )
}
