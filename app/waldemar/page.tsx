'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRole } from '@/lib/useRole'
import { useIsMobile } from '@/lib/useIsMobile'
import { authFetch } from '@/lib/authFetch'

/**
 * WALDEMAR · crypto trend bot — live status, signals, P&L (daily / monthly), equity vs hold, trades.
 * Data: /api/waldemar (admin only), written by the bot on the server every 15 minutes.
 */

const MONO = 'Space Mono, monospace'
const SANS = 'Inter, DM Sans, system-ui, sans-serif'
const DIM = 'rgba(140,185,230,0.55)'
const LINE = 'rgba(80,180,255,0.16)'
const ORANGE = '#f7931a'
const MINT = '#34d399'
const RED = '#f87171'

const eur = (x: number, d = 0) => (x < 0 ? '−' : '') + '€' + Math.abs(x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
const signed = (x: number, d = 0) => (x > 0 ? '+' : '') + eur(x, d)
const pct = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? '—' : (x > 0 ? '+' : '') + (x * 100).toFixed(d) + '%')
const col = (x: number) => (x > 0 ? MINT : x < 0 ? RED : '#cfe8ff')

export default function WaldemarPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { role, loading: roleLoading } = useRole()
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const r = await authFetch('/api/waldemar', { cache: 'no-store' }).then(r => r.json()).catch(() => null)
    setD(r); setLoading(false)
  }, [])
  useEffect(() => { if (!roleLoading && role !== 'admin') router.replace('/dashboard') }, [role, roleLoading, router])
  useEffect(() => {
    if (role !== 'admin') return
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [role, load])

  if (roleLoading || role !== 'admin') return <div style={{ minHeight: '100vh', background: '#000' }} />

  const st = d?.status
  const pairs: [string, any][] = st?.pairs ? Object.entries(st.pairs) : []
  const nextCheck = (() => {
    const now = new Date()
    const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 10))
    if (t <= now) t.setUTCDate(t.getUTCDate() + 1)
    return t.toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  })()

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#d0e5ff', fontFamily: SANS }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: isMobile ? '16px 14px 80px' : '22px 32px 80px' }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid rgba(80,180,255,0.15)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: ORANGE, marginBottom: 5 }}>◇ WALDEMAR</div>
            <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 300, letterSpacing: 0.5, color: '#f5f5f5' }}>Crypto Trend Bot · BTC & ETH</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
            {st && <StatusPill live={st.live} stale={d.stale} age={st.age_min} />}
            <a href="/finance" style={ghost}>← FINANCE</a>
          </div>
        </div>

        {loading ? <div style={{ fontFamily: MONO, fontSize: 11, color: DIM, textAlign: 'center', padding: 60 }}>Loading…</div>
          : !d?.available ? <Empty needsSql={d?.needsSql} />
          : (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))', gap: 12 }}>
              <Kpi label="EQUITY" value={eur(st.equity, 2)} sub={`${eur(st.eur, 2)} in cash`} />
              <Kpi label="TOTAL P&L" value={signed(d.totalPnl, 2)} sub={`${pct(d.totalPct)} on ${eur(d.invested)}`} color={col(d.totalPnl)} />
              <Kpi label="TODAY" value={signed(d.todayPnl, 2)} sub="since last daily close" color={col(d.todayPnl)} />
              <Kpi label="THIS MONTH" value={signed(d.monthPnl, 2)} sub={new Date().toLocaleDateString('en-US', { month: 'long' }).toUpperCase()} color={col(d.monthPnl)} />
              <Kpi label="VS HOLDING BTC/ETH" value={pct(d.benchmarkPct)} sub="50/50 held since start" color={DIM} />
            </div>

            {/* signals */}
            <Section title="SIGNALS" right={`MA${st.ma} · NEXT CHECK ${nextCheck.toUpperCase()}`} />
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))', gap: 12 }}>
              {pairs.map(([p, x]) => <CoinCard key={p} pair={p} x={x} ma={st.ma} />)}
            </div>

            {/* equity chart */}
            <Section title="EQUITY" right="WALDEMAR VS HOLDING BTC/ETH" />
            <div style={panel}>
              <EquityChart daily={d.daily} bench={d.bench} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1.4fr) minmax(0,1fr)', gap: 12 }}>
              <div>
                <Section title="DAILY P&L" right="LAST 30 DAYS" />
                <div style={panel}><DailyBars daily={d.daily.slice(-30)} /></div>
              </div>
              <div>
                <Section title="MONTHLY P&L" />
                <div style={{ ...panel, padding: 0 }}>
                  {d.months.length === 0 && <div style={emptyRow}>No full day recorded yet</div>}
                  {d.months.map((m: any) => (
                    <div key={m.month} style={row}>
                      <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, color: '#cfe8ff' }}>{new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()}</span>
                      <span style={{ color: col(m.pnl), fontWeight: 600 }}>{signed(m.pnl, 2)}</span>
                      <span style={{ color: DIM, fontSize: 12 }}>{m.start ? pct(m.pnl / m.start) : '—'}</span>
                      <span style={{ color: DIM, fontSize: 12, textAlign: 'right' }}>{eur(m.end)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* trades */}
            <Section title="TRADES" right={`${d.trades.length} RECORDED`} />
            <div style={{ ...panel, padding: 0, overflowX: 'auto' }}>
              {d.trades.length === 0 && <div style={emptyRow}>No trades yet — Waldemar buys when BTC or ETH close above their {st.ma}-day average</div>}
              {d.trades.map((t: any) => (
                <div key={t.id} style={{ ...row, gridTemplateColumns: '140px 70px 90px 1fr 1fr 1fr', minWidth: 620 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: DIM }}>{new Date(t.ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: t.side === 'buy' ? MINT : RED }}>{t.side.toUpperCase()}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: '#cfe8ff' }}>{t.pair}</span>
                  <span style={{ fontSize: 13 }}>{Number(t.amount).toFixed(6)}</span>
                  <span style={{ fontSize: 13, color: DIM }}>@ {eur(Number(t.price), 2)}</span>
                  <span style={{ fontSize: 13, textAlign: 'right' }}>{eur(Number(t.value_eur), 2)}{t.live ? '' : ' (dry)'}</span>
                </div>
              ))}
            </div>

            {/* rule */}
            <div style={{ marginTop: 26, padding: '16px 18px', border: `1px dashed ${LINE}`, borderRadius: 6, color: DIM, fontSize: 13, lineHeight: 1.7 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: ORANGE }}>◇ THE RULE</span><br />
              Every day at 00:10 UTC (08:10 Bali) Waldemar checks the daily close of BTC and ETH. Above the {st.ma}-day average → hold the coin,
              below → hold euros. Each coin gets half of the capital{st.budget ? ` (budget ${eur(Number(st.budget))})` : ''}. Exchange: {String(st.exchange || '').toUpperCase()}.
              Backtest 2017–2026 (BTC+ETH, real coins): ~+52 % per year, worst drawdown ~−57 %.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatusPill({ live, stale, age }: { live: boolean; stale: boolean; age: number }) {
  const c = stale ? RED : live ? MINT : '#fbbf24'
  const label = stale ? `NO UPDATE ${age > 120 ? Math.round(age / 60) + 'H' : age + 'M'}` : live ? 'LIVE' : 'DRY RUN'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, padding: '6px 11px', borderRadius: 4, color: c, border: `1px solid ${c}55`, background: `${c}12` }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: c, boxShadow: `0 0 6px ${c}` }} />{label}
    </span>
  )
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div style={{ ...panel, padding: '16px 16px 14px', minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 2, color: DIM }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: color || '#f5f5f5', marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: DIM, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
    </div>
  )
}

function Section({ title, right }: { title: string; right?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, margin: '30px 0 12px' }}>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: '#80c0ff' }}>◇ {title}</span>
      {right && <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, color: DIM, textAlign: 'right' }}>{right}</span>}
    </div>
  )
}

function CoinCard({ pair, x, ma }: { pair: string; x: any; ma: number }) {
  const up = !!x.up
  const live = Number(x.price) || 0
  const avg = Number(x.ma) || 0
  const dist = avg ? live / avg - 1 : 0
  const holding = Number(x.value) || 0
  const c = up ? MINT : '#9fb6d1'
  // bar: position of the live price relative to the MA (±30 % range)
  const posPct = Math.max(0, Math.min(100, 50 + (dist / 0.3) * 50))
  return (
    <div style={{ ...panel, borderLeft: `3px solid ${pair.startsWith('BTC') ? ORANGE : '#8c8cff'}`, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20, fontWeight: 600, color: '#f5f5f5' }}>{pair.split('/')[0]}</span>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, fontWeight: 700, padding: '4px 9px', borderRadius: 3, color: c, border: `1px solid ${c}66`, background: `${c}14` }}>{up ? 'HOLD COIN' : 'HOLD EUR'}</span>
      </div>
      <div style={{ display: 'flex', gap: 22, marginTop: 14, flexWrap: 'wrap' }}>
        <Stat label="PRICE" value={eur(live, live > 1000 ? 0 : 2)} />
        <Stat label={`MA${ma}`} value={eur(avg, avg > 1000 ? 0 : 2)} />
        <Stat label="DISTANCE" value={pct(dist)} color={dist >= 0 ? MINT : RED} />
        <Stat label="HOLDING" value={eur(holding, 2)} />
      </div>
      <div style={{ position: 'relative', height: 6, marginTop: 16, borderRadius: 3, background: `linear-gradient(90deg, ${RED}55, rgba(80,180,255,0.15) 50%, ${MINT}55)` }}>
        <span style={{ position: 'absolute', left: '50%', top: -4, bottom: -4, width: 1, background: 'rgba(220,235,255,0.5)' }} />
        <span style={{ position: 'absolute', left: `calc(${posPct}% - 6px)`, top: -3, width: 12, height: 12, borderRadius: 6, background: '#f5f5f5', boxShadow: '0 0 8px rgba(255,255,255,0.5)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: DIM, marginTop: 7 }}>
        <span>BELOW MA → EUR</span><span>ABOVE MA → COIN</span>
      </div>
      <div style={{ fontSize: 11.5, color: DIM, marginTop: 10 }}>Last daily close {eur(Number(x.close) || 0, 2)} · decided at the last check: {x.action && x.action !== 'none' ? x.action : 'no trade'}</div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, color: DIM }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: color || '#e8f1fb', marginTop: 3 }}>{value}</div>
    </div>
  )
}

function EquityChart({ daily, bench }: { daily: { day: string; equity: number }[]; bench: { day: string; value: number }[] }) {
  const W = 1000, H = 220, P = 30
  const pts = useMemo(() => {
    if (daily.length < 2) return null
    const vals = [...daily.map(d => d.equity), ...bench.map(b => b.value)]
    const lo = Math.min(...vals) * 0.98, hi = Math.max(...vals) * 1.02
    const x = (i: number) => P + (i / (daily.length - 1)) * (W - 2 * P)
    const y = (v: number) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P)
    const bmap = new Map(bench.map(b => [b.day, b.value]))
    return {
      eq: daily.map((d, i) => `${x(i)},${y(d.equity)}`).join(' '),
      bh: daily.filter(d => bmap.has(d.day)).map(d => `${x(daily.indexOf(d))},${y(bmap.get(d.day)!)}`).join(' '),
      lo, hi, first: daily[0].day, last: daily[daily.length - 1].day,
    }
  }, [daily, bench])
  if (!pts) return <div style={emptyRow}>The chart starts after the second daily close</div>
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1={P} x2={W - P} y1={P + f * (H - 2 * P)} y2={P + f * (H - 2 * P)} stroke="rgba(80,180,255,0.08)" />)}
        {pts.bh && <polyline points={pts.bh} fill="none" stroke="rgba(160,185,215,0.45)" strokeWidth={1.5} strokeDasharray="5 5" />}
        <polyline points={pts.eq} fill="none" stroke={ORANGE} strokeWidth={2.2} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 9.5, letterSpacing: 1, color: DIM, marginTop: 6 }}>
        <span>{pts.first}</span>
        <span><span style={{ color: ORANGE }}>━</span> WALDEMAR &nbsp; <span style={{ color: 'rgba(160,185,215,0.8)' }}>┅</span> HOLD BTC/ETH</span>
        <span>{pts.last}</span>
      </div>
    </div>
  )
}

function DailyBars({ daily }: { daily: { day: string; pnl: number }[] }) {
  if (!daily.length) return <div style={emptyRow}>No full day recorded yet</div>
  const max = Math.max(...daily.map(d => Math.abs(d.pnl)), 1)
  const W = 600, H = 150, mid = H / 2, bw = W / daily.length
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <line x1={0} x2={W} y1={mid} y2={mid} stroke="rgba(80,180,255,0.18)" />
        {daily.map((d, i) => {
          const h = (Math.abs(d.pnl) / max) * (mid - 6)
          return <rect key={d.day} x={i * bw + bw * 0.15} width={bw * 0.7} y={d.pnl >= 0 ? mid - h : mid} height={Math.max(h, 1)} fill={d.pnl >= 0 ? MINT : RED} opacity={0.8}><title>{`${d.day}: ${signed(d.pnl, 2)}`}</title></rect>
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 9.5, color: DIM, marginTop: 6 }}>
        <span>{daily[0].day}</span><span>BEST {signed(Math.max(...daily.map(d => d.pnl)), 2)} · WORST {signed(Math.min(...daily.map(d => d.pnl)), 2)}</span><span>{daily[daily.length - 1].day}</span>
      </div>
    </div>
  )
}

function Empty({ needsSql }: { needsSql?: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed rgba(80,180,255,0.2)', borderRadius: 8, color: DIM }}>
      <div style={{ fontSize: 15, color: '#f5f5f5', marginBottom: 8 }}>{needsSql ? 'One-time setup missing' : 'Waldemar has not reported yet'}</div>
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 1, lineHeight: 1.8 }}>
        {needsSql ? <>RUN lib/sql/waldemar.sql IN THE SUPABASE SQL EDITOR</> : <>UPDATE WALDEMAR ON THE SERVER (git pull + docker compose up -d --build waldemar)<br />HE REPORTS EVERY 15 MINUTES</>}
      </div>
    </div>
  )
}

const panel: React.CSSProperties = { background: 'rgba(8,20,48,0.55)', border: `1px solid ${LINE}`, borderRadius: 6, padding: 16 }
const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '110px 1fr 70px 90px', gap: 12, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid rgba(80,180,255,0.07)', fontSize: 13.5 }
const emptyRow: React.CSSProperties = { padding: '22px 16px', textAlign: 'center', fontFamily: MONO, fontSize: 10.5, letterSpacing: 1, color: DIM }
const ghost: React.CSSProperties = { background: 'transparent', border: '1px solid rgba(80,180,255,0.3)', color: 'rgba(128,192,255,0.85)', padding: '8px 14px', fontFamily: MONO, fontSize: 10, letterSpacing: 2, borderRadius: 4, textDecoration: 'none' }
