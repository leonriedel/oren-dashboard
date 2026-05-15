'use client'
import React from 'react'
import HUDBackground from '@/components/HUDBackground'

interface Props {
  onBack: () => void
  icon: string
  title: string
  titleColor: string
  sub: string
  iconBg: string
  children: React.ReactNode
  rightAction?: React.ReactNode
  maxWidth?: number
}

export default function ModuleLayout({ onBack, icon, title, titleColor, sub, iconBg, children, rightAction, maxWidth = 1400 }: Props) {
  return (
    <>
      <HUDBackground />
      <div style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at center, #051022 0%, #020610 60%, #000 100%)',
        color: '#bfdbfe',
        fontFamily: 'DM Sans, system-ui, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* tactical grid */}
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1, opacity: 0.4,
          backgroundImage: `linear-gradient(rgba(80,180,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(80,180,255,0.035) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }} />

        {/* corner brackets */}
        <CornerBracket pos="tl" />
        <CornerBracket pos="tr" />
        <CornerBracket pos="bl" />
        <CornerBracket pos="br" />

        {/* HEADER */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          backdropFilter: 'blur(14px)',
          background: 'linear-gradient(180deg, rgba(0,8,24,0.92) 0%, rgba(0,8,24,0.4) 100%)',
          borderBottom: '1px solid rgba(80,180,255,0.12)',
          padding: '16px 40px',
        }}>
          <div style={{
            maxWidth, margin: '0 auto',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <button onClick={onBack} style={{
              width: 36, height: 36, borderRadius: 3,
              background: 'rgba(20,40,80,0.55)',
              border: '1px solid rgba(80,180,255,0.28)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#a0d0ff', fontSize: 18, flexShrink: 0,
              fontFamily: 'Space Mono, monospace',
            }}>‹</button>

            <div style={{
              width: 42, height: 42, borderRadius: 3,
              background: iconBg,
              border: `1px solid ${titleColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
              boxShadow: `inset 0 0 12px ${titleColor}40, 0 0 14px ${titleColor}30`,
            }}>{icon}</div>

            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: 'Space Mono, monospace', fontSize: 15, fontWeight: 700,
                letterSpacing: 3, color: titleColor,
                textShadow: `0 0 20px ${titleColor}50`,
              }}>{title}</div>
              <div style={{
                fontFamily: 'Space Mono, monospace', fontSize: 9.5, letterSpacing: 3,
                color: 'rgba(120,180,230,0.55)', textTransform: 'uppercase', marginTop: 2,
              }}>{sub}</div>
            </div>

            {/* live status indicator */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 12px',
              background: 'rgba(52,211,153,0.08)',
              border: '1px solid rgba(52,211,153,0.25)',
              borderRadius: 3,
              fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: 2,
              color: '#34d399',
            }}>
              <div style={{ width: 5, height: 5, borderRadius: 50, background: '#34d399', boxShadow: '0 0 8px #34d399' }} />
              <span>LIVE</span>
            </div>

            {rightAction && <div>{rightAction}</div>}
          </div>
        </div>

        {/* CONTENT */}
        <div style={{
          padding: '28px 40px 60px',
          maxWidth, margin: '0 auto',
          position: 'relative', zIndex: 5,
        }}>
          {children}
        </div>
      </div>
    </>
  )
}

function CornerBracket({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s = 28, t = 16
  const styles: any = {
    tl: { top: t, left: t, borderLeft: '1px solid #80c0ff', borderTop: '1px solid #80c0ff' },
    tr: { top: t, right: t, borderRight: '1px solid #80c0ff', borderTop: '1px solid #80c0ff' },
    bl: { bottom: t, left: t, borderLeft: '1px solid #80c0ff', borderBottom: '1px solid #80c0ff' },
    br: { bottom: t, right: t, borderRight: '1px solid #80c0ff', borderBottom: '1px solid #80c0ff' },
  }
  return <div style={{ position: 'fixed', width: s, height: s, zIndex: 30, opacity: 0.35, pointerEvents: 'none', ...styles[pos] }} />
}
