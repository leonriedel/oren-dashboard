'use client'
import React from 'react'

interface Props {
  onBack: () => void
  icon: string
  title: string
  titleColor: string
  sub: string
  iconBg: string
  children: React.ReactNode
  rightAction?: React.ReactNode
}

export default function ModuleLayout({ onBack, icon, title, titleColor, sub, iconBg, children, rightAction }: Props) {
  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'20px 20px 16px', position:'sticky', top:0, zIndex:10, background:'linear-gradient(to bottom, var(--bg) 80%, transparent)', borderBottom:'1px solid var(--border)' }}>
        <button onClick={onBack} style={{ width:34, height:34, borderRadius:'50%', background:'var(--card)', border:'1px solid var(--border)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted2)', fontSize:18, flexShrink:0 }}>‹</button>
        <div style={{ width:40, height:40, borderRadius:11, background:iconBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{icon}</div>
        <div>
          <div style={{ fontFamily:'var(--mono)', fontSize:15, fontWeight:700, letterSpacing:2, color:titleColor }}>{title}</div>
          <div style={{ fontSize:10, letterSpacing:3, color:'var(--muted)', textTransform:'uppercase' }}>{sub}</div>
        </div>
        {rightAction && <div style={{ marginLeft:'auto' }}>{rightAction}</div>}
      </div>
      <div style={{ padding:'16px 16px 60px', maxWidth:560, margin:'0 auto' }}>
        {children}
      </div>
    </div>
  )
}
