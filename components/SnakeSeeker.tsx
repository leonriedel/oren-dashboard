'use client'
import { useState } from 'react'

export default function SnakeSeeker() {
  const [progress, setProgress] = useState(80)

  return (
    <div style={{
      background: 'rgba(20,30,50,0.32)',
      backdropFilter: 'blur(40px) saturate(180%)',
      WebkitBackdropFilter: 'blur(40px) saturate(180%)',
      border: '0.5px solid rgba(180,210,255,0.20)',
      borderRadius: 22,
      padding: 18,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10)',
      position: 'relative',
      overflow: 'hidden',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 25, right: 25, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(180,210,255,0.45), transparent)',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div style={{ fontSize: 14, letterSpacing: 1.5, color: '#fff', fontWeight: 500 }}>SNAKE SEEKER</div>
        <span style={{ fontSize: 9, color: 'rgba(180,210,255,0.5)', letterSpacing: 1.5, fontFamily: 'SF Mono, monospace' }}>CUSTOM SCRAMBLER</span>
      </div>
      <div style={{ fontSize: 9, letterSpacing: 2, color: 'rgba(180,210,255,0.5)', marginBottom: 12, fontFamily: 'SF Mono, monospace' }}>
        MALAMADRE CUSTOM BIKE · BALI
      </div>

      <div style={{
        position: 'relative', flex: 1, minHeight: 180, marginBottom: 14, overflow: 'hidden',
        borderRadius: 14,
        background: 'radial-gradient(ellipse at center, rgba(140,200,255,0.05), transparent 65%)',
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.28,
          backgroundImage: 'linear-gradient(rgba(180,210,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(180,210,255,0.05) 1px, transparent 1px)',
          backgroundSize: '14px 14px',
        }} />

        <svg viewBox="-220 -110 440 220" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="tankG2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(220,235,255,0.22)" />
              <stop offset="55%" stopColor="rgba(180,210,255,0.10)" />
              <stop offset="100%" stopColor="rgba(140,180,230,0.04)" />
            </linearGradient>
            <linearGradient id="seatG2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(200,220,255,0.18)" />
              <stop offset="100%" stopColor="rgba(140,180,230,0.05)" />
            </linearGradient>
            <radialGradient id="tireG2" cx="0.3" cy="0.3" r="0.7">
              <stop offset="0%" stopColor="rgba(80,120,170,0.20)" />
              <stop offset="100%" stopColor="rgba(40,70,110,0.04)" />
            </radialGradient>
            <radialGradient id="headG2" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
              <stop offset="60%" stopColor="rgba(200,220,255,0.12)" />
              <stop offset="100%" stopColor="rgba(140,180,230,0.04)" />
            </radialGradient>
            <linearGradient id="exhG2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(220,235,255,0.20)" />
              <stop offset="100%" stopColor="rgba(80,120,170,0.06)" />
            </linearGradient>
          </defs>

          <line x1="-220" y1="85" x2="220" y2="85" stroke="rgba(180,210,255,0.18)" strokeWidth="0.5" strokeDasharray="3 3" />

          <g stroke="#c8e0ff" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="-125" cy="38" r="52" fill="url(#tireG2)" stroke="#c8e0ff" strokeWidth="2" />
            <circle cx="-125" cy="38" r="46" strokeWidth="0.5" opacity="0.4" />
            <g strokeWidth="0.5" opacity="0.6">
              <line x1="-125" y1="-14" x2="-125" y2="90" />
              <line x1="-177" y1="38" x2="-73" y2="38" />
              <line x1="-162" y1="0" x2="-88" y2="76" />
              <line x1="-88" y1="0" x2="-162" y2="76" />
              <line x1="-170" y1="20" x2="-80" y2="56" />
              <line x1="-170" y1="56" x2="-80" y2="20" />
              <line x1="-150" y1="-8" x2="-100" y2="84" />
              <line x1="-100" y1="-8" x2="-150" y2="84" />
            </g>
            <circle cx="-125" cy="38" r="20" strokeWidth="0.9" opacity="0.85" />
            <circle cx="-125" cy="38" r="14" strokeWidth="0.5" opacity="0.7" />
            <circle cx="-125" cy="38" r="8" strokeWidth="0.5" opacity="0.6" />
            <circle cx="-125" cy="38" r="4" fill="#c8e0ff" />

            <circle cx="125" cy="38" r="52" fill="url(#tireG2)" stroke="#c8e0ff" strokeWidth="2" />
            <circle cx="125" cy="38" r="46" strokeWidth="0.5" opacity="0.4" />
            <g strokeWidth="0.5" opacity="0.6">
              <line x1="125" y1="-14" x2="125" y2="90" />
              <line x1="73" y1="38" x2="177" y2="38" />
              <line x1="88" y1="0" x2="162" y2="76" />
              <line x1="162" y1="0" x2="88" y2="76" />
              <line x1="80" y1="20" x2="170" y2="56" />
              <line x1="80" y1="56" x2="170" y2="20" />
              <line x1="100" y1="-8" x2="150" y2="84" />
              <line x1="150" y1="-8" x2="100" y2="84" />
            </g>
            <circle cx="125" cy="38" r="22" strokeWidth="0.9" opacity="0.85" />
            <circle cx="125" cy="38" r="14" strokeWidth="0.5" opacity="0.7" />
            <circle cx="125" cy="38" r="8" strokeWidth="0.5" opacity="0.6" />
            <circle cx="125" cy="38" r="4" fill="#c8e0ff" />

            <path d="M -176 24 Q -125 8 -74 24 L -74 36 Q -125 18 -176 36 Z" strokeWidth="0.6" opacity="0.45" fill="rgba(200,220,255,0.06)" />
            <path d="M 74 24 Q 125 8 176 24 L 176 36 Q 125 18 74 36 Z" strokeWidth="0.6" opacity="0.45" fill="rgba(200,220,255,0.06)" />

            <path d="M -24 -26 Q -8 -46 38 -44 Q 76 -42 84 -26 Q 88 -10 66 -8 L 20 -8 Q -12 -8 -24 -26 Z" strokeWidth="1.4" fill="url(#tankG2)" />
            <path d="M 10 -42 Q 22 -34 22 -8" strokeWidth="0.5" opacity="0.55" />
            <path d="M 54 -40 Q 60 -24 60 -8" strokeWidth="0.4" opacity="0.4" />
            <ellipse cx="20" cy="-32" rx="6" ry="3" strokeWidth="0.6" opacity="0.7" fill="rgba(200,220,255,0.10)" />
            <circle cx="20" cy="-32" r="2.5" strokeWidth="0.4" opacity="0.6" />
            <g transform="translate(48,-26)">
              <path d="M -10 -8 L 10 -8 L 10 8 L -10 8 Z" strokeWidth="0.7" fill="rgba(200,220,255,0.12)" />
              <path d="M -10 0 L 10 0 M 0 -8 L 0 8" strokeWidth="0.4" opacity="0.6" />
              <text x="0" y="3" fontFamily="SF Mono, monospace" fontSize="6" fill="rgba(220,235,255,0.85)" textAnchor="middle" letterSpacing="0.3">MM</text>
            </g>

            <path d="M -84 -22 Q -68 -36 -24 -36 Q -16 -28 -22 -14 L -74 -14 Q -84 -14 -84 -22 Z" strokeWidth="1.3" fill="url(#seatG2)" />
            <path d="M -84 -14 L -84 -10 L -22 -10" strokeWidth="0.5" opacity="0.6" />
            <path d="M -84 -8 L -22 -8" strokeWidth="0.3" opacity="0.35" />
            <g strokeWidth="0.4" opacity="0.55">
              <line x1="-76" y1="-32" x2="-76" y2="-14" />
              <line x1="-66" y1="-33" x2="-66" y2="-14" />
              <line x1="-56" y1="-34" x2="-56" y2="-14" />
              <line x1="-46" y1="-34" x2="-46" y2="-14" />
              <line x1="-36" y1="-34" x2="-36" y2="-14" />
              <line x1="-26" y1="-34" x2="-26" y2="-14" />
            </g>
            <path d="M -84 -22 L -90 -16 L -88 -10 L -84 -10" strokeWidth="0.8" fill="rgba(200,220,255,0.10)" />
            <line x1="-90" y1="-14" x2="-95" y2="-12" strokeWidth="0.6" opacity="0.7" />

            <g strokeWidth="1.1">
              <path d="M -20 6 L 20 -8 L 48 0 L 50 18 L 30 28 L -8 30 Z" fill="rgba(200,220,255,0.10)" />
              <g strokeWidth="0.5" opacity="0.7">
                <circle cx="-5" cy="12" r="3" />
                <circle cx="-5" cy="12" r="1" fill="#c8e0ff" />
                <circle cx="8" cy="8" r="2.5" />
                <circle cx="22" cy="6" r="2" />
                <circle cx="36" cy="10" r="2" />
                <ellipse cx="20" cy="20" rx="8" ry="3" />
                <line x1="-12" y1="20" x2="32" y2="14" />
              </g>
            </g>

            <path d="M 24 -8 L 32 18 L 56 28 L 60 38 L 36 38 L 20 18 Z" strokeWidth="1" fill="rgba(200,220,255,0.08)" />
            <line x1="34" y1="16" x2="54" y2="22" strokeWidth="0.4" opacity="0.5" />
            <line x1="38" y1="6" x2="54" y2="14" strokeWidth="0.4" opacity="0.5" />
            <line x1="42" y1="-4" x2="54" y2="2" strokeWidth="0.4" opacity="0.5" />
            <circle cx="48" cy="34" r="2" strokeWidth="0.4" opacity="0.6" />

            <path d="M -22 -10 L -100 28" strokeWidth="1.4" />
            <path d="M -22 -8 L -100 30" strokeWidth="0.5" opacity="0.5" />
            <path d="M 72 -10 L 105 8 L 120 22" strokeWidth="1.4" />
            <path d="M 72 -8 L 105 10" strokeWidth="0.5" opacity="0.5" />

            <ellipse cx="-72" cy="14" rx="3" ry="6" strokeWidth="0.5" opacity="0.6" fill="rgba(200,220,255,0.08)" transform="rotate(-25 -72 14)" />
            <ellipse cx="72" cy="14" rx="3" ry="6" strokeWidth="0.5" opacity="0.6" fill="rgba(200,220,255,0.08)" transform="rotate(25 72 14)" />

            <path d="M 84 -22 L 106 -20" strokeWidth="1.1" />
            <circle cx="118" cy="-18" r="14" strokeWidth="1.5" fill="url(#headG2)" />
            <circle cx="118" cy="-18" r="10" strokeWidth="0.5" opacity="0.6" />
            <circle cx="118" cy="-18" r="6" strokeWidth="0.4" opacity="0.5" />
            <g strokeWidth="0.3" opacity="0.5">
              <line x1="108" y1="-18" x2="128" y2="-18" />
              <line x1="118" y1="-28" x2="118" y2="-8" />
            </g>
            <circle cx="118" cy="-18" r="3" fill="#c8e0ff" />

            <path d="M 118 -32 L 110 -56 L 84 -60 L 50 -60 L 22 -56 L 16 -46" strokeWidth="1.3" />
            <line x1="46" y1="-60" x2="42" y2="-76" strokeWidth="0.9" />
            <circle cx="42" cy="-76" r="3" fill="rgba(200,220,255,0.18)" stroke="#c8e0ff" strokeWidth="0.5" />
            <circle cx="42" cy="-76" r="1.5" fill="#c8e0ff" />
            <line x1="84" y1="-60" x2="88" y2="-76" strokeWidth="0.9" />
            <circle cx="88" cy="-76" r="3" fill="rgba(200,220,255,0.18)" stroke="#c8e0ff" strokeWidth="0.5" />
            <circle cx="88" cy="-76" r="1.5" fill="#c8e0ff" />

            <rect x="108" y="-30" width="14" height="14" strokeWidth="0.6" fill="rgba(200,220,255,0.12)" />
            <line x1="108" y1="-25" x2="122" y2="-25" strokeWidth="0.3" />
            <line x1="108" y1="-20" x2="122" y2="-20" strokeWidth="0.3" />

            <path d="M 105 -10 L 134 8" strokeWidth="0.9" />

            <path d="M 22 -2 L 78 28 L 102 38" strokeWidth="1.6" fill="url(#exhG2)" strokeLinecap="round" />
            <path d="M 22 2 L 78 32 L 102 42" strokeWidth="0.8" opacity="0.6" />
            <path d="M 102 38 L 118 38" strokeWidth="1.2" opacity="0.7" />
            <ellipse cx="80" cy="32" rx="9" ry="4" strokeWidth="0.6" fill="rgba(200,220,255,0.14)" />
            <line x1="74" y1="32" x2="86" y2="32" strokeWidth="0.3" opacity="0.5" />
            <line x1="50" y1="14" x2="98" y2="38" strokeWidth="0.4" opacity="0.5" />

            <path d="M -22 -8 L -32 8 L -62 22 L -82 32" strokeWidth="1.6" fill="url(#exhG2)" strokeLinecap="round" />
            <path d="M -22 -4 L -32 12 L -62 26 L -82 36" strokeWidth="0.8" opacity="0.6" />
            <path d="M -82 32 L -96 34" strokeWidth="1.2" opacity="0.7" />

            <path d="M -10 14 Q 22 18 24 -2" strokeWidth="0.9" opacity="0.7" />
            <line x1="-115" y1="38" x2="-30" y2="22" strokeWidth="0.5" opacity="0.5" />

            <circle cx="2" cy="22" r="6" strokeWidth="0.6" fill="rgba(200,220,255,0.12)" />
            <g strokeWidth="0.3" opacity="0.6">
              <line x1="-3" y1="22" x2="7" y2="22" />
              <line x1="2" y1="17" x2="2" y2="27" />
            </g>
            <circle cx="2" cy="22" r="2.5" fill="rgba(200,220,255,0.5)" />

            <path d="M -80 -20 L -120 26" strokeWidth="0.9" />
            <path d="M -80 -14 L -120 32" strokeWidth="0.5" opacity="0.5" />
          </g>

          <ellipse cx="-110" cy="92" rx="60" ry="3" fill="rgba(140,180,230,0.12)" />
          <ellipse cx="110" cy="92" rx="60" ry="3" fill="rgba(140,180,230,0.12)" />
        </svg>

        <div style={{ position: 'absolute', top: 8, left: 10, fontSize: 8, color: 'rgba(180,210,255,0.45)', letterSpacing: 1.5, fontFamily: 'SF Mono, monospace' }}>
          MALAMADRE · BC SCRAMBLER
        </div>
        <div style={{ position: 'absolute', bottom: 8, right: 10, fontSize: 8, color: 'rgba(180,210,255,0.45)', letterSpacing: 1.5, fontFamily: 'SF Mono, monospace' }}>
          SCALE 1:24
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 9.5, letterSpacing: 2, color: 'rgba(180,210,255,0.55)', fontFamily: 'SF Mono, monospace' }}>BUILD PROGRESS</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#fff', fontFamily: 'SF Mono, monospace' }}>{progress}%</span>
      </div>

      <div style={{ position: 'relative', padding: '4px 0' }}>
        <div style={{ height: 6, background: 'rgba(180,210,255,0.10)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: 'linear-gradient(90deg, #6ab0ff, #c8e0ff)',
            boxShadow: '0 0 12px rgba(180,210,255,0.6)',
            transition: 'width 0.1s',
          }} />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={e => setProgress(parseInt(e.target.value))}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(180,210,255,0.45)', marginTop: 8, fontFamily: 'SF Mono, monospace', letterSpacing: 1 }}>
        <span>FRAME · ENGINE · TANK · EXHAUST · ELECTRICS</span>
        <span style={{ color: '#ffd8a0' }}>ETA 4 WEEKS</span>
      </div>
    </div>
  )
}
