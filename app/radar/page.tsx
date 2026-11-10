'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import MatrixRain from '@/components/radar/MatrixRain'
import WorkStream from '@/components/radar/WorkStream'
import HeatList from '@/components/radar/HeatList'
import { HOT_TICKERS, NICHE_PICKS, CRYPTO_HEAT } from '@/lib/radar/mockData'
import { useIsMobile } from '@/lib/useIsMobile'
import { useRole } from '@/lib/useRole'

export default function Radar() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [time, setTime] = useState('')
  const [scanCount, setScanCount] = useState(0)
  const isMobile = useIsMobile()
  const { role, loading: roleLoading } = useRole()

  // Admin-only: bounce viewers back to dashboard
  useEffect(() => {
    if (!roleLoading && role && role !== 'admin') {
      router.replace('/dashboard')
    }
  }, [role, roleLoading, router])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login')
      else setUser(session.user)
    })
  }, [router])

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`)
      setScanCount(c => c + Math.floor(Math.random() * 180 + 40))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  if (!user) return null
  if (roleLoading || role !== 'admin') return null

  return (
    <>
      <style>{`
        @keyframes radar-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }
        @keyframes scanline {
          0% { transform: translateY(-100vh); }
          100% { transform: translateY(100vh); }
        }
        @keyframes flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
        body { background: #000; }
      `}</style>

      <MatrixRain opacity={0.09} />

      {/* Horizontal scanline overlay */}
      <div style={{
        position: 'fixed', left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, rgba(0,255,65,0.35), transparent)',
        pointerEvents: 'none', zIndex: 1,
        animation: 'scanline 8s linear infinite',
      }} />

      <div style={{
        position: 'relative', zIndex: 2,
        minHeight: '100vh',
        color: '#00ff41',
        fontFamily: '"Space Mono", monospace',
        padding: isMobile ? '12px 10px 20px' : '16px 20px 24px',
      }}>

        {/* ═══ HEADER ═══ */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 14, paddingBottom: 10,
          borderBottom: '1px solid rgba(0, 255, 65, 0.25)',
          flexWrap: 'wrap', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: '#00ff41',
              boxShadow: '0 0 15px #00ff41, 0 0 30px rgba(0,255,65,0.4)',
              animation: 'radar-pulse 1.4s infinite',
            }} />
            <div>
              <div style={{ fontSize: 17, letterSpacing: 6, fontWeight: 700, color: '#a0ffa0', textShadow: '0 0 10px rgba(0,255,65,0.6)' }}>
                OREN RADAR
              </div>
              <div style={{ fontSize: 9, letterSpacing: 2.5, color: 'rgba(0,255,65,0.55)', marginTop: 2 }}>
                MARKET INTELLIGENCE · MULTI-PLATFORM SCAN
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 10, letterSpacing: 2, color: 'rgba(0,255,65,0.7)' }}>
            <span>UTC+8 {time}</span>
            <span style={{ color: 'rgba(0,255,65,0.4)' }}>|</span>
            <span>{scanCount.toLocaleString('en-US')} SCANS/MIN</span>
            <span style={{ color: 'rgba(0,255,65,0.4)' }}>|</span>
            <button onClick={() => router.push('/dashboard')} style={{
              background: 'transparent', border: '1px solid rgba(0,255,65,0.4)',
              color: '#a0ffa0', padding: '5px 12px',
              fontFamily: '"Space Mono", monospace', fontSize: 9, letterSpacing: 2,
              cursor: 'pointer', borderRadius: 2,
            }}>← BACK TO DASHBOARD</button>
          </div>
        </div>

        {/* ═══ STATUS STRIP ═══ */}
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)',
          gap: 6, marginBottom: 14, fontSize: 9, letterSpacing: 1.5,
        }}>
          <Stat label="SOURCES" value="47" live />
          <Stat label="TICKERS TRACKED" value="4,284" />
          <Stat label="SIGNALS/HR" value="12.4K" live />
          <Stat label="ACTIVE MODELS" value="08" />
          <Stat label="ANOMALIES" value="23" color="#ffaa00" />
          <Stat label="DATA LAG" value="0.4s" color="#00ff41" />
        </div>

        {/* ═══ MAIN GRID ═══ */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 360px',
          gap: 12,
          height: isMobile ? 'auto' : 'calc(100vh - 170px)',
        }}>

          {/* Work Stream 1 */}
          <div style={{ minHeight: isMobile ? 240 : 0 }}>
            <WorkStream label="STREAM-01 · MARKET + NEWS + SOCIAL" speedMs={280} maxLines={60} />
          </div>

          {/* Work Stream 2 */}
          <div style={{ minHeight: isMobile ? 240 : 0 }}>
            <WorkStream label="STREAM-02 · FLOW + OPTIONS + MACRO" speedMs={360} maxLines={60} />
          </div>

          {/* Right: Top 10 + Niche + Crypto stacked */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 10,
            minHeight: isMobile ? 'auto' : 0,
          }}>
            <div style={{ flex: '1 1 0', minHeight: isMobile ? 360 : 0 }}>
              <HeatList title="TOP 10 HEATLIST" tickers={HOT_TICKERS} />
            </div>
            <div style={{ flex: '1 1 0', minHeight: isMobile ? 280 : 0 }}>
              <HeatList title="NICHE PICKS" tickers={NICHE_PICKS} variant="niche" />
            </div>
            <div style={{ flex: '0 1 auto' }}>
              <HeatList title="CRYPTO HEAT" tickers={CRYPTO_HEAT} variant="crypto" />
            </div>
          </div>

        </div>

        {/* ═══ FOOTER TAPE ═══ */}
        <div style={{
          marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(0,255,65,0.15)',
          display: 'flex', justifyContent: 'space-between',
          fontSize: 9, letterSpacing: 2, color: 'rgba(0,255,65,0.45)',
        }}>
          <span>▸ v0.1 · mock data · hook real feeds next</span>
          <span>USER: {user.email?.toUpperCase()}</span>
        </div>

      </div>
    </>
  )
}

function Stat({ label, value, color = '#00ff41', live = false }: any) {
  return (
    <div style={{
      background: 'rgba(0, 10, 5, 0.75)',
      border: '1px solid rgba(0, 255, 65, 0.2)',
      borderLeft: '2px solid ' + color,
      padding: '7px 10px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ fontSize: 8, letterSpacing: 2, color: 'rgba(0,255,65,0.55)', display: 'flex', alignItems: 'center', gap: 5 }}>
        {live && <span style={{ width: 4, height: 4, borderRadius: '50%', background: color, animation: 'radar-pulse 1s infinite' }} />}
        {label}
      </div>
      <div style={{ fontSize: 14, color, fontWeight: 700, letterSpacing: 1 }}>{value}</div>
    </div>
  )
}
