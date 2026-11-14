'use client'

type Props = {
  total: number
  monthly: number
  yearly: number
  loading?: boolean
}

export default function NetWorthHero({ total, monthly, yearly, loading }: Props) {
  const fmt = (n: number) => '€' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  const sign = (n: number) => n > 0 ? '+' : ''
  const pct = (n: number, base: number) => base ? ((n / base) * 100).toFixed(2) + '%' : '0.00%'
  const col = (n: number) => n > 0 ? '#34d399' : n < 0 ? '#f87171' : '#d8e9ff'

  return (
    <div style={{
      padding: '20px 24px',
      background: 'linear-gradient(135deg, rgba(80,180,255,0.06) 0%, rgba(80,180,255,0.02) 100%)',
      border: '1px solid rgba(80,180,255,0.2)',
      borderLeft: '3px solid #5db8ff',
      borderRadius: 4,
      fontFamily: 'DM Sans, system-ui, sans-serif',
    }}>
      <div style={{
        fontSize: 10, letterSpacing: 4, color: '#7ea6d5',
        fontFamily: 'Space Mono, monospace', marginBottom: 6,
      }}>
        ▸ TOTAL NETWORTH
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)',
        gap: 24, alignItems: 'baseline',
      }}>
        <div>
          <div style={{
            fontSize: 46, fontWeight: 300, color: '#d8e9ff', letterSpacing: -0.5,
            lineHeight: 1,
          }}>
            {loading ? '—' : fmt(total)}
          </div>
          <div style={{
            fontSize: 10, color: 'rgba(126,166,213,0.6)', letterSpacing: 2, marginTop: 6,
            fontFamily: 'Space Mono, monospace',
          }}>
            CURRENT VALUE · ALL ASSETS
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, letterSpacing: 3, color: 'rgba(126,166,213,0.6)', fontFamily: 'Space Mono, monospace', marginBottom: 4 }}>
            MONTHLY RETURN
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: col(monthly), fontFamily: 'Space Mono, monospace' }}>
            {sign(monthly)}€{Math.abs(monthly).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 10, color: col(monthly), fontFamily: 'Space Mono, monospace', marginTop: 2 }}>
            {sign(monthly)}{pct(monthly, total)}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, letterSpacing: 3, color: 'rgba(126,166,213,0.6)', fontFamily: 'Space Mono, monospace', marginBottom: 4 }}>
            YEARLY RETURN
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: col(yearly), fontFamily: 'Space Mono, monospace' }}>
            {sign(yearly)}€{Math.abs(yearly).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 10, color: col(yearly), fontFamily: 'Space Mono, monospace', marginTop: 2 }}>
            {sign(yearly)}{pct(yearly, total)}
          </div>
        </div>
      </div>
    </div>
  )
}
