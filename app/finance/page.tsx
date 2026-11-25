'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useRole } from '@/lib/useRole'
import { createClient } from '@/lib/supabase'
import NetWorthHero from '@/components/finance/NetWorthHero'
import LiveSourcesPanel from '@/components/finance/LiveSourcesPanel'
import CategorySection from '@/components/finance/CategorySection'
import EquityTrend from '@/components/finance/EquityTrend'
import { authFetch } from '@/lib/authFetch'

type Summary = {
  total_eur: number
  user_tracked: { invested: number; current: number; monthly: number; yearly: number }
  live_sources: any
  categories: Array<{
    id: string; name: string; icon: string; sort_order: number
    items: any[]; invested: number; current: number; monthly: number; yearly: number
  }>
  fx: any
  updatedAt: string
}

export default function FinancePage() {
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [snapshotting, setSnapshotting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await authFetch('/api/finance/summary', { cache: 'no-store' }).then(r => r.json()).catch(() => null)
    setSummary(r)
    setLoading(false)
  }, [])

  // Get current user id for API calls
  useEffect(() => {
    const supa = createClient()
    supa.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id || null)
    })
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
    await authFetch('/api/finance/summary', { method: 'POST' })
    setSnapshotting(false)
    await load()
  }

  const addCategory = async () => {
    if (!newCatName.trim()) return
    await authFetch('/api/finance/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: newCatName.trim(),
        icon: '◆',
        sort_order: (summary?.categories?.length || 0) + 10,
        user_id: userId,
      }),
    })
    setNewCatName(''); setAddingCat(false); load()
  }

  if (roleLoading) return <div style={{ minHeight: '100vh', background: '#000' }} />
  if (role !== 'admin') return null

  const sourcesTotal = summary?.live_sources?.total || 0
  const grandTotal = summary?.total_eur || 0

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at center, #051022 0%, #020610 60%, #000 100%)',
      color: '#d8e9ff',
      fontFamily: 'DM Sans, system-ui, sans-serif',
      position: 'relative',
    }}>
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
              ▸ MODULE 04
            </div>
            <div style={{ fontSize: 28, fontWeight: 300, color: '#d8e9ff', letterSpacing: 2, marginTop: 4 }}>
              FINANCE
            </div>
            <div style={{
              fontSize: 10, color: 'rgba(126,166,213,0.6)', letterSpacing: 2, marginTop: 4,
              fontFamily: 'Space Mono, monospace',
            }}>
              NETWORTH · PORTFOLIO · RETURNS · {summary ? new Date(summary.updatedAt).toLocaleTimeString('en-US', { hour12: false }) : '—'}
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
            total={grandTotal}
            monthly={(summary?.user_tracked?.monthly || 0) + (summary?.live_sources?.ibkr?.dailyPnl_eur || 0) * 21 + (summary?.live_sources?.waldemar?.month_eur || 0)}
            yearly={summary?.user_tracked?.yearly || 0}
            loading={loading}
          />
        </div>

        {/* LIVE SOURCES */}
        <div style={{ marginBottom: 16 }}>
          <LiveSourcesPanel sources={summary?.live_sources} grandTotal={grandTotal} />
        </div>

        {/* CATEGORIES (user-tracked investments) */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          margin: '24px 0 12px', padding: '0 4px',
        }}>
          <div style={{
            fontSize: 10, letterSpacing: 4, color: 'rgba(126,166,213,0.6)',
            fontFamily: 'Space Mono, monospace',
          }}>
            ▸ USER-TRACKED PORTFOLIO
          </div>
          {!addingCat ? (
            <button onClick={() => setAddingCat(true)} style={{
              background: 'rgba(80,180,255,0.1)', border: '1px solid rgba(80,180,255,0.3)',
              color: '#7ea6d5', padding: '4px 12px', fontSize: 10, letterSpacing: 2,
              fontFamily: 'Space Mono, monospace', cursor: 'pointer',
            }}>+ CATEGORY</button>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                autoFocus
                placeholder="New category name"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCategory()}
                style={{
                  background: 'rgba(80,180,255,0.05)',
                  border: '1px solid rgba(80,180,255,0.3)',
                  color: '#d8e9ff', padding: '3px 10px',
                  fontFamily: 'Space Mono, monospace', fontSize: 11,
                }}
              />
              <button onClick={addCategory} style={{
                background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)',
                color: '#34d399', padding: '3px 10px', fontSize: 10, letterSpacing: 2,
                fontFamily: 'Space Mono, monospace', cursor: 'pointer',
              }}>SAVE</button>
              <button onClick={() => { setAddingCat(false); setNewCatName('') }} style={{
                background: 'transparent', border: '1px solid rgba(248,113,113,0.3)',
                color: 'rgba(248,113,113,0.7)', padding: '3px 10px', fontSize: 10,
                fontFamily: 'Space Mono, monospace', cursor: 'pointer',
              }}>×</button>
            </div>
          )}
        </div>

        {(summary?.categories || []).length === 0 && !loading && (
          <div style={{
            padding: 24, textAlign: 'center',
            background: 'rgba(0,10,25,0.5)',
            border: '1px dashed rgba(80,180,255,0.2)',
            color: 'rgba(126,166,213,0.6)', fontSize: 11,
            fontFamily: 'Space Mono, monospace',
          }}>
            Keine Kategorien · klick "+ CATEGORY" um deine erste anzulegen<br />
            Beispiele: "Crypto", "Cash", "Stocks Portfolio", "Bonds", "Collectibles"
          </div>
        )}

        {(summary?.categories || []).map(cat => (
          <CategorySection
            key={cat.id}
            category={cat}
            grandTotal={grandTotal}
            userId={userId || ''}
            onChange={load}
          />
        ))}

        {/* EQUITY TREND */}
        <div style={{ marginTop: 24 }}>
          <EquityTrend currentTotal={grandTotal} />
        </div>
      </div>
    </div>
  )
}
