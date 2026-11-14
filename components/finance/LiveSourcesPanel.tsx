'use client'

type Props = {
  sources: {
    total: number
    ibkr: { total_eur: number; dailyPnl_eur: number; positions: number; currency: string; available: boolean }
    edgar: { nav_eur: number; dry_run: boolean; available: boolean }
    realEstate: { total_eur: number; projects: number }
  } | null
  grandTotal: number
}

export default function LiveSourcesPanel({ sources, grandTotal }: Props) {
  if (!sources) return null
  const fmt = (n: number) => '€' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  const sign = (n: number) => n >= 0 ? '+' : ''
  const col = (n: number) => n >= 0 ? '#34d399' : '#f87171'
  const pct = (n: number) => grandTotal ? ((n / grandTotal) * 100).toFixed(1) : '0.0'

  const rows = [
    {
      key: 'ibkr',
      label: 'IBKR PORTFOLIO',
      value: sources.ibkr.total_eur,
      sub: sources.ibkr.available
        ? `${sources.ibkr.positions} positions · ${sources.ibkr.currency}`
        : 'offline',
      daily: sources.ibkr.dailyPnl_eur,
      available: sources.ibkr.available,
      color: '#5db8ff',
    },
    {
      key: 'edgar',
      label: 'EDGAR SCALPER',
      value: sources.edgar.nav_eur,
      sub: sources.edgar.available
        ? (sources.edgar.dry_run ? 'paper mode' : 'live trading')
        : 'offline',
      daily: 0,
      available: sources.edgar.available,
      color: '#34d399',
    },
    {
      key: 'realEstate',
      label: 'REAL ESTATE',
      value: sources.realEstate.total_eur,
      sub: `${sources.realEstate.projects} projects`,
      daily: 0,
      available: sources.realEstate.projects > 0,
      color: '#c9a961',
    },
  ]

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
          ▸ LIVE SOURCES · AUTO-PULL
        </span>
        <span style={{ fontSize: 10, color: 'rgba(126,166,213,0.6)' }}>
          Total: {fmt(sources.total)} · {pct(sources.total)}% of NAV
        </span>
      </div>

      <div style={{ padding: '2px 0' }}>
        {rows.map(r => (
          <div key={r.key} style={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr 110px 100px 60px',
            gap: 12, alignItems: 'center',
            padding: '10px 14px',
            borderBottom: '1px solid rgba(80,180,255,0.04)',
            fontSize: 11,
            opacity: r.available ? 1 : 0.4,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: r.available ? r.color : 'rgba(126,166,213,0.3)',
                boxShadow: r.available ? `0 0 4px ${r.color}` : 'none',
              }} />
              <span style={{ color: r.color, fontWeight: 700, letterSpacing: 1.5, fontSize: 10 }}>
                {r.label}
              </span>
            </span>
            <span style={{ color: 'rgba(126,166,213,0.7)', fontSize: 10 }}>{r.sub}</span>
            <span style={{ textAlign: 'right', color: '#d8e9ff', fontWeight: 700 }}>
              {fmt(r.value)}
            </span>
            <span style={{ textAlign: 'right', color: col(r.daily), fontSize: 10 }}>
              {r.daily !== 0 ? `${sign(r.daily)}€${Math.abs(r.daily).toFixed(0)} today` : ''}
            </span>
            <span style={{ textAlign: 'right', color: 'rgba(126,166,213,0.55)', fontSize: 10 }}>
              {pct(r.value)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
