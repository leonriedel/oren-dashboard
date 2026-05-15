import React from 'react'

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(8,20,48,0.6) 0%, rgba(8,20,48,0.4) 100%)',
      border: '1px solid rgba(80,180,255,0.16)',
      borderRadius: 4,
      padding: 18,
      marginBottom: 14,
      backdropFilter: 'blur(10px)',
      position: 'relative',
      boxShadow: 'inset 0 1px 0 rgba(120,200,255,0.06)',
      ...style,
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(120,200,255,0.55), transparent)',
      }} />
      <div style={{ position: 'absolute', top: 3, left: 3, width: 6, height: 6, borderTop: '1px solid rgba(120,200,255,0.45)', borderLeft: '1px solid rgba(120,200,255,0.45)' }} />
      <div style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderTop: '1px solid rgba(120,200,255,0.45)', borderRight: '1px solid rgba(120,200,255,0.45)' }} />
      {children}
    </div>
  )
}

export function SectionTitle({ color = '#80c0ff', children, action }: { color?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'Space Mono, monospace', fontSize: 11, fontWeight: 700, letterSpacing: 2.5,
      color: color, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 14, justifyContent: 'space-between',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, display: 'inline-block', flexShrink: 0 }} />
        {children}
      </span>
      {action}
    </div>
  )
}

export function ItemRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0', borderBottom: '1px solid rgba(80,180,255,0.06)',
    }}>
      {children}
    </div>
  )
}

export function FullBtn({ children, onClick, color = '#80c0ff', borderColor }: { children: React.ReactNode; onClick: () => void; color?: string; borderColor?: string }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: 12,
      borderRadius: 3,
      border: `1px dashed ${borderColor || 'rgba(80,180,255,0.30)'}`,
      background: 'rgba(20,40,80,0.25)',
      color,
      fontFamily: 'Space Mono, monospace', fontSize: 10.5, letterSpacing: 2.5,
      cursor: 'pointer', transition: 'all 0.2s', marginTop: 4,
    }}>
      {children}
    </button>
  )
}

export function MetricGrid({ items }: { items: { label: string; value: string; color: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length},1fr)`, gap: 10 }}>
      {items.map((m, i) => (
        <div key={i} style={{
          background: 'rgba(8,20,48,0.65)',
          border: '1px solid rgba(80,180,255,0.14)',
          borderLeft: `2px solid ${m.color}`,
          borderRadius: 3,
          padding: '14px 12px', textAlign: 'center',
        }}>
          <div style={{
            fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: 2,
            color: 'rgba(120,180,230,0.55)', textTransform: 'uppercase', marginBottom: 8,
          }}>{m.label}</div>
          <div style={{
            fontFamily: 'Space Mono, monospace', fontSize: 17, fontWeight: 700,
            color: m.color, letterSpacing: 0.5,
          }}>{m.value}</div>
        </div>
      ))}
    </div>
  )
}
