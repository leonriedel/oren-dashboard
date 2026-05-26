'use client'
import { useEffect, useState } from 'react'
import ModuleLayout from '@/components/ModuleLayout'
import { Card, SectionTitle, ItemRow, MetricGrid } from '@/components/UI'
import type { User } from '@supabase/supabase-js'

interface Props { user: User; onBack: () => void }

type Trade = {
  id: string; symbol: string; side: string; quantity: number;
  entry_price: number; status: string; strategy: string;
  alpaca_order_id: string; notes: string; created_at: string;
}
type Signal = {
  id: string; symbol: string; action: string; confidence: number;
  reasoning: string; executed: boolean; created_at: string;
}
type Snap = {
  portfolio_value: number; buying_power: number;
  daily_pnl: number; total_pnl: number; open_positions: number; created_at: string;
}
type EdgarData = {
  latest: Snap | null;
  openTrades: Trade[]; closedTrades: Trade[]; trades: Trade[];
  signals: Signal[]; snapshots: Snap[];
  pnl: {
    daily: { value: number; pct: number };
    weekly: { value: number; pct: number };
    monthly: { value: number; pct: number };
    total: number;
  };
}

export default function Edgar({ user, onBack }: Props) {
  const [data, setData] = useState<EdgarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'overview' | 'history' | 'signals'>('overview')

  useEffect(() => {
    const load = () => {
      fetch('/api/edgar')
        .then(r => r.json())
        .then(d => { setData(d); setLoading(false) })
        .catch(() => setLoading(false))
    }
    load()
    const i = setInterval(load, 30000)
    return () => clearInterval(i)
  }, [])

  function fmt(n: number) {
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(2) + 'K'
    return n.toFixed(2)
  }
  function fmtEur(n: number) {
    return n.toLocaleString('de-DE', { maximumFractionDigits: 0 })
  }
  function pnlColor(n: number) {
    if (n > 0) return '#34d399'
    if (n < 0) return '#f87171'
    return '#6ee7b7'
  }
  function pnlPrefix(n: number) {
    return n > 0 ? '+' : ''
  }
  function dt(s: string) {
    return new Date(s).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return (
      <ModuleLayout onBack={onBack} icon="🤖" title="EDGAR" titleColor="#10b981" sub="Autonomous Trading Engine" iconBg="linear-gradient(135deg, rgba(16,185,129,0.4), rgba(5,150,105,0.2))">
        <Card><div style={{ padding: 40, textAlign: 'center', color: 'rgba(110,231,183,0.55)' }}>◌ EDGAR DATA LOADING...</div></Card>
      </ModuleLayout>
    )
  }
  if (!data) {
    return (
      <ModuleLayout onBack={onBack} icon="🤖" title="EDGAR" titleColor="#10b981" sub="Autonomous Trading Engine" iconBg="linear-gradient(135deg, rgba(16,185,129,0.4), rgba(5,150,105,0.2))">
        <Card><div style={{ padding: 40, textAlign: 'center', color: '#f87171' }}>Edgar Datenverbindung fehlgeschlagen</div></Card>
      </ModuleLayout>
    )
  }

  const { latest, openTrades, closedTrades, signals, pnl } = data
  const pv = latest?.portfolio_value || 0
  const bp = latest?.buying_power || 0
  const totalReturn = latest ? ((pv - 100000) / 100000) * 100 : 0
  const isPaper = true

  const viewBtns = (
    <div style={{ display: 'flex', gap: 6 }}>
      {(['overview', 'history', 'signals'] as const).map(v => (
        <button key={v} onClick={() => setView(v)} style={{
          padding: '5px 12px',
          background: view === v ? 'rgba(16,185,129,0.25)' : 'rgba(8,40,28,0.55)',
          border: `1px solid ${view === v ? 'rgba(16,185,129,0.55)' : 'rgba(16,185,129,0.25)'}`,
          borderRadius: 3,
          color: view === v ? '#fff' : 'rgba(110,231,183,0.7)',
          fontFamily: 'Space Mono, monospace',
          fontSize: 9.5, letterSpacing: 1.5, cursor: 'pointer',
        }}>{v.toUpperCase()}</button>
      ))}
    </div>
  )

  return (
    <ModuleLayout
      onBack={onBack}
      icon="🤖"
      title="EDGAR"
      titleColor="#10b981"
      sub={isPaper ? 'Autonomous Trading · PAPER' : 'Autonomous Trading · LIVE'}
      iconBg="linear-gradient(135deg, rgba(16,185,129,0.4), rgba(5,150,105,0.2))"
      rightAction={viewBtns}
    >
      <div style={{
        background: 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(5,150,105,0.10))',
        border: '1px solid rgba(16,185,129,0.25)',
        borderLeft: '2px solid #10b981',
        borderRadius: 4, padding: 24, marginBottom: 18,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 32, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 3, color: '#6ee7b7', textTransform: 'uppercase', marginBottom: 10 }}>PORTFOLIO VALUE</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 38, fontWeight: 700, color: '#10b981', textShadow: '0 0 30px rgba(16,185,129,0.45)' }}>
              ${fmtEur(pv)}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: pnlColor(totalReturn), marginTop: 6 }}>
              {pnlPrefix(totalReturn)}{totalReturn.toFixed(2)}% all-time
            </div>
          </div>
          <MetricGrid items={[
            { label: 'DAILY P&L', value: `${pnlPrefix(pnl.daily.value)}${fmt(pnl.daily.value)} (${pnl.daily.pct.toFixed(2)}%)`, color: pnlColor(pnl.daily.value) },
            { label: 'WEEKLY P&L', value: `${pnlPrefix(pnl.weekly.value)}${fmt(pnl.weekly.value)} (${pnl.weekly.pct.toFixed(2)}%)`, color: pnlColor(pnl.weekly.value) },
            { label: 'MONTHLY P&L', value: `${pnlPrefix(pnl.monthly.value)}${fmt(pnl.monthly.value)} (${pnl.monthly.pct.toFixed(2)}%)`, color: pnlColor(pnl.monthly.value) },
          ]} />
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(16,185,129,0.14)', fontFamily: 'var(--mono)', fontSize: 11 }}>
          <span><span style={{ color: '#6ee7b7' }}>BUYING POWER: </span><span style={{ color: '#10b981' }}>${fmtEur(bp)}</span></span>
          <span><span style={{ color: '#6ee7b7' }}>OPEN POSITIONS: </span><span style={{ color: '#10b981' }}>{latest?.open_positions || 0}</span></span>
          <span><span style={{ color: '#6ee7b7' }}>TOTAL P&L: </span><span style={{ color: pnlColor(pnl.total) }}>{pnlPrefix(pnl.total)}{fmt(pnl.total)}</span></span>
        </div>
      </div>

      {view === 'overview' && (
        <>
          <Card>
            <SectionTitle color="#fbbf24" action={<span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#6ee7b7' }}>{openTrades.length} OPEN</span>}>
              ACTIVE TRADES
            </SectionTitle>
            {openTrades.length === 0 ? (
              <div style={{ color: 'rgba(110,231,183,0.55)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Keine aktiven Trades</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {openTrades.map(t => (
                  <div key={t.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 60px 100px 100px 1fr 120px',
                    gap: 14, padding: '12px 14px',
                    background: 'rgba(4,28,20,0.55)',
                    border: '1px solid rgba(16,185,129,0.18)',
                    borderLeft: '2px solid #fbbf24',
                    borderRadius: 3, alignItems: 'center',
                  }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#fff', fontWeight: 700 }}>{t.symbol}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: t.side === 'BUY' ? '#34d399' : '#f87171' }}>{t.side}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#6ee7b7' }}>QTY {t.quantity}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#10b981' }}>${Number(t.entry_price).toFixed(2)}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(110,231,183,0.55)' }}>{t.notes || t.strategy}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(110,231,183,0.55)', textAlign: 'right' }}>{dt(t.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle color="#10b981" action={<span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#6ee7b7' }}>LAST 10</span>}>
              RECENT TRADES
            </SectionTitle>
            {closedTrades.slice(0, 10).map(t => (
              <ItemRow key={t.id}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#fff', minWidth: 80 }}>{t.symbol}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: t.side === 'BUY' ? '#34d399' : '#f87171', minWidth: 50 }}>{t.side}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#6ee7b7', minWidth: 90 }}>QTY {t.quantity} · ${Number(t.entry_price).toFixed(2)}</span>
                <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(110,231,183,0.55)' }}>{t.strategy}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(110,231,183,0.55)' }}>{dt(t.created_at)}</span>
              </ItemRow>
            ))}
            {closedTrades.length === 0 && (
              <div style={{ color: 'rgba(110,231,183,0.55)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Keine geschlossenen Trades</div>
            )}
          </Card>
        </>
      )}

      {view === 'history' && (
        <Card>
          <SectionTitle color="#10b981" action={<span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#6ee7b7' }}>{data.trades.length} TRADES TOTAL</span>}>
            FULL TRADE HISTORY
          </SectionTitle>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 60px 80px 100px 1fr 120px 80px',
            gap: 12, padding: '8px 14px',
            fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.5,
            color: 'rgba(110,231,183,0.55)', borderBottom: '1px solid rgba(16,185,129,0.14)',
          }}>
            <span>SYMBOL</span><span>SIDE</span><span>QTY</span><span>PRICE</span><span>STRATEGY</span><span>DATE</span><span>STATUS</span>
          </div>
          {data.trades.map(t => (
            <div key={t.id} style={{
              display: 'grid',
              gridTemplateColumns: '80px 60px 80px 100px 1fr 120px 80px',
              gap: 12, padding: '10px 14px',
              fontFamily: 'var(--mono)', fontSize: 11,
              borderBottom: '1px solid rgba(80,180,255,0.06)', alignItems: 'center',
            }}>
              <span style={{ color: '#fff', fontWeight: 700 }}>{t.symbol}</span>
              <span style={{ color: t.side === 'BUY' ? '#34d399' : '#f87171', fontSize: 10 }}>{t.side}</span>
              <span style={{ color: '#6ee7b7' }}>{t.quantity}</span>
              <span style={{ color: '#10b981' }}>${Number(t.entry_price).toFixed(2)}</span>
              <span style={{ color: 'rgba(110,231,183,0.55)', fontSize: 10 }}>{t.strategy}</span>
              <span style={{ color: 'rgba(110,231,183,0.55)', fontSize: 10 }}>{dt(t.created_at)}</span>
              <span style={{ color: t.status === 'open' ? '#fbbf24' : 'rgba(110,231,183,0.55)', fontSize: 10 }}>{t.status?.toUpperCase()}</span>
            </div>
          ))}
        </Card>
      )}

      {view === 'signals' && (
        <Card>
          <SectionTitle color="#a78bfa" action={<span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#6ee7b7' }}>LAST {signals.length} SIGNALS</span>}>
            SIGNAL LOG · EDGAR REASONING
          </SectionTitle>
          {signals.map(s => (
            <div key={s.id} style={{
              padding: 14, marginBottom: 8,
              background: 'rgba(4,28,20,0.55)',
              border: '1px solid rgba(16,185,129,0.18)',
              borderLeft: `2px solid ${s.executed ? '#34d399' : 'rgba(110,231,183,0.55)'}`,
              borderRadius: 3,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                  <span style={{ color: '#fff', fontWeight: 700 }}>{s.symbol}</span>
                  <span style={{ color: s.action === 'BUY' ? '#34d399' : '#f87171', marginLeft: 10 }}>{s.action}</span>
                  <span style={{ color: '#6ee7b7', marginLeft: 10 }}>CONF {(s.confidence * 100).toFixed(0)}%</span>
                  <span style={{ color: s.executed ? '#34d399' : 'rgba(110,231,183,0.55)', marginLeft: 10, fontSize: 10 }}>
                    {s.executed ? '● EXECUTED' : '○ SKIPPED'}
                  </span>
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(110,231,183,0.55)' }}>{dt(s.created_at)}</span>
              </div>
              <div style={{ fontSize: 12, color: '#d1fae5', lineHeight: 1.5 }}>{s.reasoning}</div>
            </div>
          ))}
          {signals.length === 0 && (
            <div style={{ color: 'rgba(110,231,183,0.55)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Keine Signale</div>
          )}
        </Card>
      )}
    </ModuleLayout>
  )
}
