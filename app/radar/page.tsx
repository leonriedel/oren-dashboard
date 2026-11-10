'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import MatrixRain from '@/components/radar/MatrixRain'
import WorkStream from '@/components/radar/WorkStream'
import HeatList from '@/components/radar/HeatList'
import MacroStrip from '@/components/radar/MacroStrip'
import SectorHeat from '@/components/radar/SectorHeat'
import IbkrPanel from '@/components/radar/IbkrPanel'
import { useIsMobile } from '@/lib/useIsMobile'
import { useRole } from '@/lib/useRole'

export default function Radar() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [time, setTime] = useState('')
  const [scanCount, setScanCount] = useState(0)
  const [status, setStatus] = useState<{ finnhubConfigured: boolean } | null>(null)
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
    fetch('/api/radar/status').then(r => r.json()).then(setStatus).catch(() => {})
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
                RADAR AI
              </div>
              <div style={{ fontSize: 9, letterSpacing: 2.5, color: 'rgba(0,255,65,0.55)', marginTop: 2 }}>
                MARKET INTELLIGENCE · MULTI-PLATFORM SCAN
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 10, letterSpacing: 2, color: 'rgba(0,255,65,0.7)' }}>
            <MarketStatus />
            <span style={{ color: 'rgba(0,255,65,0.4)' }}>|</span>
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

        {/* ═══ IBKR PORTFOLIO ═══ */}
        <div style={{ marginBottom: 12 }}>
          <IbkrPanel />
        </div>

        {/* ═══ MACRO STRIP ═══ */}
        <div style={{ marginBottom: 12 }}>
          <MacroStrip />
        </div>

        {/* ═══ MAIN GRID ═══ */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 360px',
          gridTemplateRows: isMobile ? 'auto' : 'minmax(0, 1fr) auto',
          gap: 12,
          minHeight: isMobile ? 'auto' : 'calc(100vh - 250px)',
        }}>

          {/* Row 1: Work Stream 1 */}
          <div style={{ minHeight: isMobile ? 240 : 0 }}>
            <WorkStream label="STREAM-01 · MARKET + NEWS + SOCIAL" speedMs={280} maxLines={60} />
          </div>

          {/* Row 1: Work Stream 2 */}
          <div style={{ minHeight: isMobile ? 240 : 0 }}>
            <WorkStream label="STREAM-02 · FLOW + OPTIONS + MACRO" speedMs={360} maxLines={60} />
          </div>

          {/* Row 1+2: Right stack spans both rows */}
          <div style={{
            gridRow: isMobile ? 'auto' : 'span 2',
            display: 'flex', flexDirection: 'column', gap: 10,
            minHeight: isMobile ? 'auto' : 0,
          }}>
            <div style={{ flex: '1 1 0', minHeight: isMobile ? 360 : 0 }}>
              <HeatList title="TOP 10 HEATLIST" source="stocks" />
            </div>
            <div style={{ flex: '1 1 0', minHeight: isMobile ? 280 : 0 }}>
              <HeatList title="NICHE PICKS" source="niche" variant="niche" />
            </div>
            <div style={{ flex: '0 1 auto' }}>
              <HeatList title="CRYPTO HEAT" source="crypto" variant="crypto" />
            </div>
          </div>

          {/* Row 2: Sector Heatmap spans 2 columns */}
          <div style={{ gridColumn: isMobile ? 'auto' : 'span 2' }}>
            <SectorHeat />
          </div>

        </div>

        {/* ═══ FOOTER TAPE ═══ */}
        <div style={{
          marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(0,255,65,0.15)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 9, letterSpacing: 2, color: 'rgba(0,255,65,0.55)',
          flexWrap: 'wrap', gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: '#80ff80' }}>▸ DATA SOURCES</span>
            <SourceBadge label="CRYPTO" provider="CoinGecko" live={true} />
            <SourceBadge label="STOCKS" provider="Finnhub"   live={!!status?.finnhubConfigured} />
            <SourceBadge label="MACRO"  provider="Finnhub+CG" live={!!status?.finnhubConfigured} />
            <SourceBadge label="SECTORS" provider="Finnhub (SPDR)" live={!!status?.finnhubConfigured} />
            <SourceBadge label="NEWS"   provider="Finnhub"   live={!!status?.finnhubConfigured} />
          </div>
          <span style={{ color: 'rgba(0,255,65,0.4)' }}>USER: {user.email?.toUpperCase()}</span>
        </div>

      </div>
    </>
  )
}

function SourceBadge({ label, provider, live }: { label: string; provider: string; live: boolean }) {
  const color = live ? '#00ff41' : '#ffaa00'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 7px', borderRadius: 2,
      background: live ? 'rgba(0,255,65,0.08)' : 'rgba(255,170,0,0.08)',
      border: `1px solid ${live ? 'rgba(0,255,65,0.3)' : 'rgba(255,170,0,0.3)'}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
      <span style={{ color: '#a0ffa0' }}>{label}</span>
      <span style={{ color: 'rgba(0,255,65,0.55)' }}>·</span>
      <span style={{ color }}>{live ? provider : 'mock'}</span>
    </span>
  )
}


function MarketStatus() {
  const [label, setLabel] = useState<{ text: string; color: string; note: string }>({ text: '', color: '#60ff80', note: '' })
  useEffect(() => {
    const compute = () => {
      // Compute NYSE session state from now in ET
      const nowUtc = new Date()
      // Convert to ET (America/New_York)
      const et = new Date(nowUtc.toLocaleString('en-US', { timeZone: 'America/New_York' }))
      const day = et.getDay()  // 0=Sun, 6=Sat
      const hh = et.getHours()
      const mm = et.getMinutes()
      const mins = hh * 60 + mm
      const openMin = 9 * 60 + 30
      const closeMin = 16 * 60
      const preOpenMin = 4 * 60
      const afterMax = 20 * 60
      const weekend = day === 0 || day === 6
      let out = { text: 'MARKET CLOSED', color: '#808080', note: 'weekend · last session shown' }
      if (!weekend) {
        if (mins >= openMin && mins < closeMin) out = { text: 'MARKET OPEN', color: '#00ff41', note: 'live intraday data' }
        else if (mins >= preOpenMin && mins < openMin) out = { text: 'PRE-MARKET', color: '#ffaa00', note: 'quotes = last close · opens in ' + Math.floor((openMin - mins) / 60) + 'h ' + ((openMin - mins) % 60) + 'm' }
        else if (mins >= closeMin && mins < afterMax) out = { text: 'AFTER-HOURS', color: '#ffaa00', note: 'quotes = regular session close' }
        else out = { text: 'MARKET CLOSED', color: '#808080', note: 'quotes = last session close' }
      }
      setLabel(out)
    }
    compute()
    const id = setInterval(compute, 60000)
    return () => clearInterval(id)
  }, [])

  return (
    <span title={label.note} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '2px 8px', borderRadius: 2,
      background: `${label.color}1a`, border: `1px solid ${label.color}66`, color: label.color,
      fontWeight: 700,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: label.color, boxShadow: `0 0 6px ${label.color}` }} />
      US {label.text}
    </span>
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
