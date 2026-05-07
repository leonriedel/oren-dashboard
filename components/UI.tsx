import React from 'react'

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:20, marginBottom:12, ...style }}>
      {children}
    </div>
  )
}

export function SectionTitle({ color = 'var(--muted2)', children, action }: { color?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:700, letterSpacing:2, color:'var(--muted2)', textTransform:'uppercase', display:'flex', alignItems:'center', gap:8, marginBottom:16, justifyContent:'space-between' }}>
      <span style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ width:6, height:6, borderRadius:'50%', background:color, display:'inline-block', flexShrink:0 }} />
        {children}
      </span>
      {action}
    </div>
  )
}

export function ItemRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 0', borderBottom:'1px solid var(--border)' }}>
      {children}
    </div>
  )
}

export function FullBtn({ children, onClick, color = 'var(--cyan)', borderColor }: { children: React.ReactNode; onClick: () => void; color?: string; borderColor?: string }) {
  return (
    <button onClick={onClick} style={{ width:'100%', padding:14, borderRadius:12, border:`1.5px dashed ${borderColor || 'var(--border2)'}`, background:'transparent', color, fontFamily:'var(--mono)', fontSize:12, letterSpacing:2, cursor:'pointer', transition:'all 0.2s', marginTop:4 }}>
      {children}
    </button>
  )
}

export function MetricGrid({ items }: { items: { label: string; value: string; color: string }[] }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${items.length},1fr)`, gap:10 }}>
      {items.map((m, i) => (
        <div key={i} style={{ background:'var(--card2)', borderRadius:12, padding:'14px 12px', textAlign:'center' }}>
          <div style={{ fontSize:10, letterSpacing:2, color:'var(--muted)', textTransform:'uppercase', marginBottom:8 }}>{m.label}</div>
          <div style={{ fontFamily:'var(--mono)', fontSize:17, fontWeight:700, color:m.color }}>{m.value}</div>
        </div>
      ))}
    </div>
  )
}
