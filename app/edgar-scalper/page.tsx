'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useRole } from '@/lib/useRole'
import MatrixRain from '@/components/radar/MatrixRain'
import BotStatus from '@/components/edgar-scalper/BotStatus'
import EquityStrip from '@/components/edgar-scalper/EquityStrip'
import OpenPositions from '@/components/edgar-scalper/OpenPositions'
import SignalFeed from '@/components/edgar-scalper/SignalFeed'
import EquityCurve from '@/components/edgar-scalper/EquityCurve'
import TradeJournal from '@/components/edgar-scalper/TradeJournal'

export default function EdgarScalperPage() {
  const router = useRouter()
  const { role, loading } = useRole()

  useEffect(() => {
    if (!loading && role !== 'admin') router.replace('/dashboard')
  }, [role, loading, router])

  if (loading) return <div style={{ minHeight: '100vh', background: '#000' }} />
  if (role !== 'admin') return null

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000503',
      color: '#00ff41',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <MatrixRain />

      <div style={{
        position: 'relative', zIndex: 2,
        maxWidth: 1400, margin: '0 auto',
        padding: '20px 24px 60px',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 20,
          fontFamily: '"Space Mono", monospace',
        }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 4, color: 'rgba(0,255,65,0.5)' }}>
              ▸ MODULE 09
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#80ff80', letterSpacing: 2, marginTop: 4 }}>
              EDGAR SCALPER
            </div>
            <div style={{ fontSize: 10, color: 'rgba(0,255,65,0.6)', letterSpacing: 2, marginTop: 4 }}>
              XAU + FX · TREND SCALPER · BOLLINGER + RSI + MACD
            </div>
          </div>
          <a href="/dashboard" style={{
            fontSize: 10, letterSpacing: 2, color: 'rgba(0,255,65,0.6)',
            textDecoration: 'none', border: '1px solid rgba(0,255,65,0.3)',
            padding: '6px 14px', fontFamily: '"Space Mono", monospace',
          }}>
            ← DASHBOARD
          </a>
        </div>

        {/* Status strip */}
        <div style={{ marginBottom: 16 }}>
          <BotStatus />
        </div>

        {/* Equity summary */}
        <div style={{ marginBottom: 16 }}>
          <EquityStrip />
        </div>

        {/* Two-column grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: 16,
          marginBottom: 16,
        }}>
          <SignalFeed />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <OpenPositions />
            <EquityCurve />
          </div>
        </div>

        {/* Journal full-width */}
        <TradeJournal />
      </div>
    </div>
  )
}
