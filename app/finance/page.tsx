'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useRole } from '@/lib/useRole'
import NetWorthHero from '@/components/finance/NetWorthHero'
import BucketCards from '@/components/finance/BucketCards'
import EquityTrend from '@/components/finance/EquityTrend'
import ManualEntriesEditor from '@/components/finance/ManualEntriesEditor'

type Summary = {
  total_eur: number
  buckets: any
  sources: any
  fx: { usd_eur: number; ts: number }
  updatedAt: string
}

export default function FinancePage() {
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [snapshotting, setSnapshotting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/finance/summary', { cache: 'no-store' }).then(r => r.json()).catch(() => null)
    setSummary(r)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!roleLoading && role !== 'admin') router.replace('/dashboard')
  }, [role, roleLoading, router])

  useEffect(() => {
    if (role === 'admin') load()
    const id = setInterval(() => role === 'admin' && load(), 60_000)
    return () => clearInterval(id)
  }, [role, load])

  const snapshot = async () => {
    setSnapshotting(true)
    await fetch('/api/finance/summary', { method: 'POST' })
    setSnapshotting(false)
    await load()
  }

  if (roleLoading) return <div style={{ minHeight: '100vh', background: '#000' }} />
  if (role !== 'admin') return null

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at center, #051022 0%, #020610 60%, #000 100%)',
      color: '#d8e9ff',
      fontFamily: 'DM Sans, system-ui, sans-serif',
      position: 'relative',
    }}>
      {/* Grid overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1, opacity: 0.4,
        backgroundImage: 'linear-gradient(rgba(80,180,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(80,180,255,0.035) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 1400, margin: '0 auto', padding: '24px 24px 60px' }}>
        {/* HEADER */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 20,
        }}>
          <div>
            <div style={{
              fontSize: 10, letterSpacing: 4, color: 'rgba(126,166,213,0.6)',
              fontFamily: 'Space Mono, monospace',
            }}>
              ▸ MODULE 10
            </div>
            <div style={{ fontSize: 28, fontWeight: 300, color: '#d8e9ff', letterSpacing: 2, marginTop: 4 }}>
              FINANCE
            </div>
            <div style={{
              fontSize: 10, color: 'rgba(126,166,213,0.6)', letterSpacing: 2, marginTop: 4,
              fontFamily: 'Space Mono, monospace',
            }}>
              NETWORTH · ACROSS ALL ASSETS · {summary ? new Date(summary.updatedAt).toLocaleTimeString('en-US', { hour12: false }) : '—'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={snapshot} disabled={snapshotting} style={{
              background: 'rgba(80,180,255,0.1)', border: '1px solid rgba(80,180,255,0.3)',
              color: '#7ea6d5', padding: '6px 14px', fontSize: 10, letterSpacing: 2,
              fontFamily: 'Space Mono, monospace', cursor: snapshotting ? 'default' : 'pointer',
              opacity: snapshotting ? 0.5 : 1,
            }}>{snapshotting ? '…' : '+ SNAPSHOT'}</button>
            <a href="/dashboard" style={{
              background: 'transparent', border: '1px solid rgba(126,166,213,0.3)',
              color: 'rgba(126,166,213,0.8)', padding: '6px 14px', fontSize: 10, letterSpacing: 2,
              fontFamily: 'Space Mono, monospace', textDecoration: 'none',
            }}>← DASHBOARD</a>
          </div>
        </div>

        {/* HERO */}
        <div style={{ marginBottom: 16 }}>
          <NetWorthHero
            total={summary?.total_eur || 0}
            loading={loading}
          />
        </div>

        {/* BUCKETS */}
        <div style={{ marginBottom: 16 }}>
          <BucketCards buckets={summary?.buckets || null} total={summary?.total_eur || 0} />
        </div>

        {/* TREND + MANUAL side-by-side */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: 16,
          marginBottom: 16,
        }}>
          <EquityTrend currentTotal={summary?.total_eur || 0} />
          <ManualEntriesEditor onChange={load} />
        </div>

        {/* SOURCES STATUS */}
        {summary?.sources && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(0,10,25,0.5)',
            border: '1px solid rgba(80,180,255,0.1)',
            fontFamily: 'Space Mono, monospace',
            fontSize: 10,
            color: 'rgba(126,166,213,0.7)',
            letterSpacing: 1.5,
            display: 'flex', gap: 24, flexWrap: 'wrap',
          }}>
            <span>▸ SOURCES</span>
            <Source label="IBKR" ok={summary.sources.ibkr?.available}
              detail={summary.sources.ibkr?.available ? `${summary.sources.ibkr.positions} pos · ${summary.sources.ibkr.currency}` : 'offline'}
            />
            <Source label="EDGAR" ok={summary.sources.edgar?.available}
              detail={summary.sources.edgar?.available ? (summary.sources.edgar.dry_run ? 'paper' : 'live') : 'no data'}
            />
            <Source label="REAL ESTATE" ok={summary.sources.realEstate?.projects > 0}
              detail={`${summary.sources.realEstate?.projects || 0} projects`}
            />
            <Source label="MANUAL" ok={summary.sources.manualCount > 0}
              detail={`${summary.sources.manualCount || 0} entries`}
            />
            <span style={{ marginLeft: 'auto' }}>FX USD→EUR: {summary.fx?.usd_eur?.toFixed(4) || '—'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Source({ label, ok, detail }: any) {
  const col = ok ? '#34d399' : 'rgba(126,166,213,0.4)'
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: col, boxShadow: `0 0 4px ${col}` }} />
      <span style={{ color: '#d8e9ff' }}>{label}</span>
      <span style={{ color: 'rgba(126,166,213,0.6)' }}>· {detail}</span>
    </span>
  )
}
