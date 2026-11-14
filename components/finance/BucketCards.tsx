'use client'

type Item = { label: string; amount_eur: number }
type Bucket = { items: Item[]; total: number }

type Props = {
  buckets: {
    liquid: Bucket
    investments: Bucket
    physical: Bucket
    other: Bucket
  } | null
  total: number
}

const BUCKET_META = {
  liquid:      { label: 'LIQUID',      color: '#5db8ff', icon: '◇' },
  investments: { label: 'INVESTMENTS', color: '#34d399', icon: '◆' },
  physical:    { label: 'PHYSICAL',    color: '#c9a961', icon: '◊' },
  other:       { label: 'OTHER',       color: '#a78bfa', icon: '◈' },
}

export default function BucketCards({ buckets, total }: Props) {
  if (!buckets) return null
  const fmt = (n: number) => '€' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  const pct = (n: number) => total ? ((n / total) * 100).toFixed(1) : '0.0'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: 12,
    }}>
      {(Object.keys(BUCKET_META) as Array<keyof typeof BUCKET_META>).map(key => {
        const meta = BUCKET_META[key]
        const bucket = buckets[key]
        return (
          <div key={key} style={{
            background: 'rgba(0,10,25,0.5)',
            border: '1px solid rgba(80,180,255,0.12)',
            borderRadius: 4,
            fontFamily: 'Space Mono, monospace',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '8px 14px',
              borderBottom: '1px solid rgba(80,180,255,0.08)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(80,180,255,0.04)',
            }}>
              <span style={{ fontSize: 10, letterSpacing: 3, color: meta.color, fontWeight: 700 }}>
                {meta.icon} {meta.label}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(126,166,213,0.6)' }}>
                {pct(bucket.total)}%
              </span>
            </div>

            <div style={{ padding: '10px 14px', minHeight: 100 }}>
              {bucket.items.length === 0 && (
                <div style={{ fontSize: 10, color: 'rgba(126,166,213,0.4)', padding: '8px 0' }}>
                  — empty —
                </div>
              )}
              {bucket.items.map((item, i) => (
                <div key={item.label + i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '4px 0', fontSize: 11,
                  borderBottom: i < bucket.items.length - 1 ? '1px solid rgba(80,180,255,0.04)' : 'none',
                }}>
                  <span style={{ color: 'rgba(216,233,255,0.75)' }}>{item.label}</span>
                  <span style={{ color: '#d8e9ff', fontWeight: 700 }}>{fmt(item.amount_eur)}</span>
                </div>
              ))}
            </div>

            <div style={{
              padding: '8px 14px',
              borderTop: '1px solid rgba(80,180,255,0.12)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              background: 'rgba(80,180,255,0.03)',
            }}>
              <span style={{ fontSize: 9, letterSpacing: 2, color: 'rgba(126,166,213,0.6)' }}>
                SUBTOTAL
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: meta.color }}>
                {fmt(bucket.total)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
