'use client'

type Props = {
  total: number
  prev?: number
  loading?: boolean
}

export default function NetWorthHero({ total, prev, loading }: Props) {
  const delta = prev !== undefined ? total - prev : 0
  const deltaPct = prev ? (delta / prev) * 100 : 0
  const up = delta >= 0

  const fmt = (n: number) => '€' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  return (
    <div style={{
      padding: '20px 24px',
      background: 'linear-gradient(135deg, rgba(80,180,255,0.06) 0%, rgba(80,180,255,0.02) 100%)',
      border: '1px solid rgba(80,180,255,0.18)',
      borderRadius: 4,
      fontFamily: 'DM Sans, system-ui, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative corner brackets */}
      <CornerDot pos="tl" />
      <CornerDot pos="tr" />
      <CornerDot pos="bl" />
      <CornerDot pos="br" />

      <div style={{
        fontSize: 10, letterSpacing: 4, color: '#7ea6d5',
        fontFamily: 'Space Mono, monospace', marginBottom: 6,
      }}>
        ▸ TOTAL NETWORTH
      </div>

      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{
          fontSize: 46, fontWeight: 300, color: '#d8e9ff', letterSpacing: -0.5,
          fontFamily: 'DM Sans, system-ui, sans-serif',
        }}>
          {loading ? '—' : fmt(total)}
        </div>

        {prev !== undefined && prev > 0 && (
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 10,
            fontFamily: 'Space Mono, monospace',
          }}>
            <span style={{
              fontSize: 14, fontWeight: 700,
              color: up ? '#34d399' : '#f87171',
            }}>
              {up ? '↑' : '↓'} {up ? '+' : ''}{fmt(delta)}
            </span>
            <span style={{
              fontSize: 12, color: up ? '#34d399' : '#f87171',
              padding: '2px 8px', border: `1px solid ${up ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
              background: up ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
            }}>
              {up ? '+' : ''}{deltaPct.toFixed(2)}%
            </span>
            <span style={{ fontSize: 10, color: 'rgba(126,166,213,0.6)', letterSpacing: 2 }}>
              VS START OF PERIOD
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function CornerDot({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const style: any = {
    position: 'absolute', width: 10, height: 10,
    borderColor: 'rgba(80,180,255,0.35)',
    borderStyle: 'solid', borderWidth: 0,
  }
  if (pos.includes('t')) { style.top = 8; style.borderTopWidth = 1 }
  if (pos.includes('b')) { style.bottom = 8; style.borderBottomWidth = 1 }
  if (pos.includes('l')) { style.left = 8; style.borderLeftWidth = 1 }
  if (pos.includes('r')) { style.right = 8; style.borderRightWidth = 1 }
  return <div style={style} />
}
