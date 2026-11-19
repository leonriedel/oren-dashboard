'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useIsMobile } from '@/lib/useIsMobile'
import { useRole } from '@/lib/useRole'
import IbkrPanel from '@/components/radar/IbkrPanel'

/**
 * RADAR AI v2 · honest research tool
 * Whole-market daily scan (US small/mid caps): relative strength, trend, proximity to highs, volume, tightness,
 * revenue growth, market cap — transparent score per criterion, AI brief, levels, position sizing, track record.
 */

type Pick = {
  rank: number; symbol: string; score: number; price: number; chg1: number; name: string | null; sector: string | null; industry: string | null
  mktCap: number | null; country: string | null; description: string | null; website: string | null; growth: number | null
  factors: { rs: number; r5: number; r21: number; r63: number; r126: number | null; r252: number | null; distHigh: number; volRatio: number; tight: number; atrPct: number; dollarVol: number; aboveMa20: boolean; ma20AboveMa50: boolean; extended: boolean }
  levels: { ma20: number; ma50: number; low10: number; atr14: number; high60: number }
  closes: number[]; brief: { thesis: string; catalyst: string; risks: string; verdict: string } | null
  news: { headline: string; source: string; url: string; datetime: number }[]; earnings: string | null
}
type Scan = { day: string; generatedAt: string; regime: { label: string; spyR21: number; breadth: number }; universe: number; picks: Pick[] }
type Tab = 'discover' | 'watch' | 'track' | 'portfolio'

const MONO = 'Space Mono, monospace'
const SANS = 'DM Sans, system-ui, sans-serif'
const G = '#34f5a4', BLUE = '#80c0ff', GOLD = '#fbbf24', RED = '#f87171'
const DIM = 'rgba(150,200,230,0.5)'
const VERDICT: Record<string, { c: string; label: string }> = {
  'BUY-ZONE': { c: G, label: 'BUY-ZONE' }, 'WAIT-PULLBACK': { c: GOLD, label: 'WAIT FOR PULLBACK' }, WATCH: { c: BLUE, label: 'WATCH' }, AVOID: { c: RED, label: 'AVOID' },
}
const REGIME: Record<string, { c: string; hint: string }> = {
  'RISK-ON': { c: G, hint: 'Market in uptrend — momentum setups work best now.' },
  CAUTION: { c: GOLD, hint: 'Mixed market — smaller positions, be picky.' },
  'RISK-OFF': { c: RED, hint: 'Market in downtrend — most breakouts fail. Mostly cash / watch only.' },
  UNKNOWN: { c: DIM, hint: '' },
}

const pct = (x: number | null | undefined, d = 1) => x == null || !isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`
const money = (x: number | null | undefined) => x == null ? '—' : x >= 1e9 ? `$${(x / 1e9).toFixed(1)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(0)}M` : `$${x.toFixed(0)}`
const usd = (x: number | null | undefined) => x == null || !isFinite(x) ? '—' : `$${x.toFixed(x < 10 ? 2 : 2)}`
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export default function Radar() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { role, loading: roleLoading } = useRole()
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<Tab>('discover')
  const [sync, setSync] = useState<any>(null)
  const [building, setBuilding] = useState(false)
  const [buildMsg, setBuildMsg] = useState('')
  const [scan, setScan] = useState<Scan | null>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const [scanErr, setScanErr] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [watch, setWatch] = useState<any[]>([])
  const [track, setTrack] = useState<any>(null)
  const stopRef = useRef(false)

  useEffect(() => { if (!roleLoading && role && role !== 'admin') router.replace('/dashboard') }, [role, roleLoading, router])
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { if (!data.session) router.replace('/login') }) }, [supabase, router])

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession()
    const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}`, ...(init?.headers || {}) } })
    return r.json()
  }, [supabase])

  const loadScan = useCallback(async (force = false) => {
    setScanBusy(true); setScanErr(null)
    try {
      const j = await api('/api/radar/scan', { method: force ? 'POST' : 'GET' })
      if (j.error) setScanErr(j.error)
      else if (j.notReady) setScanErr(null)
      else { setScan(j); setSel(s => s || j.picks?.[0]?.symbol || null) }
    } catch (e) { setScanErr(String(e)) } finally { setScanBusy(false) }
  }, [api])
  const loadWatch = useCallback(async () => { const j = await api('/api/radar/watch'); setWatch(j.items || []) }, [api])
  const loadTrack = useCallback(async () => { const j = await api('/api/radar/track'); setTrack(j) }, [api])

  const build = useCallback(async () => {
    setBuilding(true); stopRef.current = false
    while (!stopRef.current) {
      const j = await api('/api/radar/sync', { method: 'POST' })
      if (j.error) { setBuildMsg(j.error); break }
      if (j.rateLimited) { setBuildMsg('Data provider rate limit — waiting 60s…'); await sleep(61000); continue }
      setSync((s: any) => ({ ...(s || {}), remaining: j.remaining, tradingDays: j.tradingDays ?? s?.tradingDays, ready: j.ready ?? s?.ready }))
      setBuildMsg(j.fetched ? `Loaded ${j.fetched}${j.trading ? ` · ${j.symbols} stocks` : ' · market closed'}` : j.pending ? `${j.pending} not published yet` : '')
      if (!j.remaining || j.pendingOnly) break
      await sleep(12500)   // free plan: 5 calls / minute
    }
    setBuilding(false)
    const s = await api('/api/radar/sync'); setSync(s)
    if (s.ready) loadScan()
  }, [api, loadScan])

  useEffect(() => {
    if (role !== 'admin') return
    ;(async () => {
      const s = await api('/api/radar/sync'); setSync(s)
      if (s.ready) loadScan()
      if (s.configured && s.remaining > 0) build()
    })()
    loadWatch(); loadTrack()
    return () => { stopRef.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  async function addWatch(p: Pick) { await api('/api/radar/watch', { method: 'POST', body: JSON.stringify({ symbol: p.symbol, price: p.price, note: p.brief?.verdict || '' }) }); loadWatch() }
  async function removeWatch(sym: string) { await api(`/api/radar/watch?symbol=${sym}`, { method: 'DELETE' }); loadWatch() }

  if (roleLoading || role !== 'admin') return null
  const picks = scan?.picks || []
  const current = picks.find(p => p.symbol === sel) || null
  const reg = REGIME[scan?.regime.label || 'UNKNOWN'] || REGIME.UNKNOWN
  const watched = new Set(watch.map(w => w.symbol))

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 20% 0%, #06221f 0%, #03101a 45%, #000 100%)', color: '#d6ecf5', fontFamily: SANS }}>
      {/* header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: isMobile ? '12px 14px' : '14px 28px', background: 'linear-gradient(180deg, rgba(2,10,14,0.96), rgba(2,10,14,0.7))', borderBottom: '1px solid rgba(52,245,164,0.12)', backdropFilter: 'blur(12px)' }}>
        <button onClick={() => router.push('/dashboard')} style={btn()}>← DASHBOARD</button>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 15, letterSpacing: 5, fontWeight: 700, color: '#c8ffe6' }}>RADAR AI</div>
          <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 2, color: DIM }}>US SMALL/MID CAP MOMENTUM · DAILY SCAN</div>
        </div>
        <div style={{ flex: 1 }} />
        {scan && (
          <div title={reg.hint} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 10, border: `1px solid ${reg.c}55`, background: `${reg.c}12` }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: reg.c, boxShadow: `0 0 10px ${reg.c}` }} />
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: reg.c, fontWeight: 700 }}>MARKET {scan.regime.label}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: DIM }}>SPY 1M {pct(scan.regime.spyR21)} · {Math.round(scan.regime.breadth * 100)}% &gt; MA50</span>
          </div>
        )}
        {scan && <span style={{ fontFamily: MONO, fontSize: 9, color: DIM, letterSpacing: 1 }}>DATA {scan.day} · {scan.universe.toLocaleString()} STOCKS</span>}
        {sync?.ready && <button onClick={() => loadScan(true)} disabled={scanBusy} style={btn(G)}>{scanBusy ? 'SCANNING…' : '↻ RESCAN'}</button>}
      </div>

      <div style={{ maxWidth: 1500, margin: '0 auto', padding: isMobile ? '14px 12px 60px' : '20px 28px 80px' }}>
        {/* setup / build state */}
        {sync && !sync.configured && <Notice c={GOLD}>POLYGON_API_KEY is missing in Vercel. Add it and redeploy.</Notice>}
        {sync?.configured && (building || !sync.ready) && (
          <div style={{ padding: 18, borderRadius: 16, marginBottom: 18, background: 'rgba(8,28,30,0.6)', border: '1px solid rgba(52,245,164,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2.5, color: G }}>{building ? 'BUILDING MARKET HISTORY…' : 'MARKET HISTORY INCOMPLETE'}</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: DIM }}>{sync.tradingDays || 0} / 55 trading days needed · {sync.remaining ?? '?'} downloads left · ~{Math.ceil(((sync.remaining || 0) * 13) / 60)} min</div>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(52,245,164,0.1)', overflow: 'hidden', marginTop: 12 }}>
              <div style={{ width: `${Math.min(100, ((sync.tradingDays || 0) / 55) * 100)}%`, height: '100%', background: `linear-gradient(90deg, ${G}, #7ef0e0)`, boxShadow: `0 0 12px ${G}`, transition: 'width .5s' }} />
            </div>
            <div style={{ fontSize: 12.5, color: 'rgba(200,235,240,0.7)', marginTop: 10, lineHeight: 1.5 }}>
              First run only: Radar downloads ~3 months of daily data for every US stock (free plan allows 5 requests/min). Keep this tab open. {buildMsg && <span style={{ color: G }}>· {buildMsg}</span>}
            </div>
            {!building && <button onClick={build} style={{ ...btn(G), marginTop: 12 }}>▶ CONTINUE</button>}
          </div>
        )}
        {scanErr && <Notice c={RED}>{/radar_/.test(scanErr) ? 'Run lib/sql/radar_v2.sql in Supabase first.' : scanErr}</Notice>}

        {/* tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {([['discover', `◎ DISCOVER${picks.length ? ` · ${picks.length}` : ''}`], ['watch', `★ WATCHLIST · ${watch.length}`], ['track', '◷ TRACK RECORD'], ['portfolio', '▤ PORTFOLIO']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); if (k === 'track') loadTrack(); if (k === 'watch') loadWatch() }} style={{
              fontFamily: MONO, fontSize: 10.5, letterSpacing: 2, fontWeight: 700, padding: '8px 15px', borderRadius: 10, cursor: 'pointer',
              color: tab === k ? '#dffff1' : DIM, background: tab === k ? 'rgba(52,245,164,0.14)' : 'transparent', border: `1px solid ${tab === k ? 'rgba(52,245,164,0.4)' : 'rgba(52,245,164,0.1)'}`,
            }}>{l}</button>
          ))}
        </div>

        {tab === 'discover' && (
          scan ? (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 0.95fr) minmax(0, 1.25fr)', gap: 16, alignItems: 'start' }}>
              <div>
                {scan.regime.label === 'RISK-OFF' && <Notice c={RED}>Market is in a downtrend. Historically most momentum breakouts fail in this regime — treat everything as watch-only.</Notice>}
                {picks.map(p => <PickRow key={p.symbol} p={p} active={p.symbol === sel} watched={watched.has(p.symbol)} onClick={() => setSel(p.symbol)} />)}
                <div style={{ fontSize: 11, color: DIM, marginTop: 10, lineHeight: 1.5 }}>Score = relative strength, trend, distance to high, volume, tightness, market cap (small/mid preferred), revenue growth; minus penalty if already extended. Research tool — not financial advice.</div>
              </div>
              <div style={{ position: isMobile ? 'static' : 'sticky', top: 90 }}>
                {current ? <Research p={current} watched={watched.has(current.symbol)} onWatch={() => addWatch(current)} isMobile={isMobile} /> : <Empty>Select a stock.</Empty>}
              </div>
            </div>
          ) : !scanErr && sync?.ready ? <Empty>{scanBusy ? 'Scanning the whole US market… (first scan of the day takes ~30–60s)' : 'No scan yet.'}</Empty> : null
        )}

        {tab === 'watch' && (
          <div>
            {watch.length === 0 && <Empty>Your watchlist is empty. Add stocks from Discover with ★.</Empty>}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {watch.map(w => {
                const inScan = picks.find(p => p.symbol === w.symbol)
                return (
                  <div key={w.symbol} style={card}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: '#eafff6' }}>{w.symbol}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: '#cfe' }}>{usd(w.price)}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: (w.change || 0) >= 0 ? G : RED }}>{pct(w.change)} since added</span>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => removeWatch(w.symbol)} style={{ ...btn(RED), padding: '3px 8px' }}>✕</button>
                    </div>
                    {w.closes?.length > 2 && <Spark closes={w.closes} h={60} />}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {inScan && <button onClick={() => { setSel(w.symbol); setTab('discover') }} style={btn(G)}>IN TODAY&apos;S SCAN · #{inScan.rank}</button>}
                      <a href={`https://www.tradingview.com/chart/?symbol=${w.symbol}`} target="_blank" rel="noreferrer" style={btn()}>CHART ↗</a>
                      <span style={{ fontFamily: MONO, fontSize: 9, color: DIM, alignSelf: 'center' }}>added {new Date(w.added_at).toLocaleDateString('en-GB')} @ {usd(Number(w.added_price))}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'track' && <Track data={track} isMobile={isMobile} />}
        {tab === 'portfolio' && <IbkrPanel />}
      </div>
    </div>
  )
}

// ─── pick row ───
function PickRow({ p, active, watched, onClick }: { p: Pick; active: boolean; watched: boolean; onClick: () => void }) {
  const v = p.brief?.verdict ? VERDICT[p.brief.verdict] : null
  const f = p.factors
  return (
    <div onClick={onClick} style={{
      display: 'flex', gap: 12, alignItems: 'center', padding: '11px 13px', marginBottom: 8, borderRadius: 13, cursor: 'pointer', transition: 'all .15s',
      background: active ? 'linear-gradient(90deg, rgba(52,245,164,0.12), rgba(8,28,36,0.6))' : 'rgba(8,24,32,0.5)', border: `1px solid ${active ? 'rgba(52,245,164,0.45)' : 'rgba(52,245,164,0.08)'}`,
    }}>
      <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(150,200,230,0.35)', width: 18 }}>{String(p.rank).padStart(2, '0')}</span>
      <ScoreRing v={p.score} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: '#eafff6' }}>{p.symbol}</span>
          {watched && <span style={{ color: GOLD, fontSize: 11 }}>★</span>}
          <span style={{ fontSize: 12, color: 'rgba(210,235,245,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
          <Chip c={f.rs >= 90 ? G : f.rs >= 75 ? BLUE : DIM}>RS {f.rs}</Chip>
          {f.aboveMa20 && f.ma20AboveMa50 && <Chip c={G}>TREND</Chip>}
          {f.distHigh >= -0.05 && <Chip c={G}>NEAR HIGH</Chip>}
          {f.volRatio >= 1.4 && <Chip c={BLUE}>VOL ×{f.volRatio.toFixed(1)}</Chip>}
          {f.tight < 0.8 && <Chip c={BLUE}>TIGHT</Chip>}
          {p.growth != null && <Chip c={p.growth >= 0.2 ? G : p.growth < 0 ? RED : DIM}>REV {pct(p.growth, 0)}</Chip>}
          {f.extended && <Chip c={GOLD}>⚠ EXTENDED</Chip>}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, color: '#dff' }}>{usd(p.price)}</div>
        <div style={{ fontFamily: MONO, fontSize: 9.5, color: DIM }}>{money(p.mktCap)}</div>
        {v && <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 1, color: v.c, marginTop: 3 }}>{v.label}</div>}
      </div>
    </div>
  )
}

// ─── research panel ───
function Research({ p, watched, onWatch, isMobile }: { p: Pick; watched: boolean; onWatch: () => void; isMobile: boolean }) {
  const f = p.factors, L = p.levels
  const v = p.brief?.verdict ? VERDICT[p.brief.verdict] : null
  const daysToEarn = p.earnings ? Math.round((new Date(p.earnings).getTime() - Date.now()) / 86400000) : null
  const [capital, setCapital] = useState(10000)
  const [risk, setRisk] = useState(1)
  const [stopMode, setStopMode] = useState<'low10' | 'atr' | 'ma50'>('low10')
  useEffect(() => { try { const c = Number(localStorage.getItem('radar-capital')); if (c > 0) setCapital(c); const r = Number(localStorage.getItem('radar-risk')); if (r > 0) setRisk(r) } catch { /* noop */ } }, [])
  useEffect(() => { try { localStorage.setItem('radar-capital', String(capital)); localStorage.setItem('radar-risk', String(risk)) } catch { /* noop */ } }, [capital, risk])
  const stops = { low10: L.low10, atr: p.price - 2 * L.atr14, ma50: L.ma50 }
  const stop = stops[stopMode]
  const perShare = p.price - stop
  const riskAmt = capital * risk / 100
  const shares = perShare > 0 ? Math.floor(riskAmt / perShare) : 0
  const posValue = shares * p.price
  const posPct = capital ? posValue / capital : 0
  const criteria: [string, boolean, string][] = [
    ['Relative strength top 25%', f.rs >= 75, `RS ${f.rs}`],
    ['Price above 20-day MA', f.aboveMa20, usd(L.ma20)],
    ['20-day MA above 50-day MA', f.ma20AboveMa50, usd(L.ma50)],
    ['Within 5% of 60-day high', f.distHigh >= -0.05, pct(f.distHigh)],
    ['Volume above normal', f.volRatio >= 1.4, `×${f.volRatio.toFixed(2)}`],
    ['Volatility contracting', f.tight < 0.9, f.tight.toFixed(2)],
    ['Small/mid cap ($300M–$10B)', !!p.mktCap && p.mktCap >= 3e8 && p.mktCap <= 1e10, money(p.mktCap)],
    ['Revenue growing 20%+', (p.growth ?? -1) >= 0.2, pct(p.growth, 0)],
    ['Not extended', !f.extended, f.extended ? 'chasing risk' : 'ok'],
  ]
  return (
    <div style={{ ...card, padding: isMobile ? 14 : 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: '#f0fff8' }}>{p.symbol}</span>
            <span style={{ fontFamily: MONO, fontSize: 16, color: '#dff' }}>{usd(p.price)}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: p.chg1 >= 0 ? G : RED }}>{pct(p.chg1)} today</span>
          </div>
          <div style={{ fontSize: 14, color: '#e6f6fb', marginTop: 2 }}>{p.name || '—'}</div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: DIM, marginTop: 4, letterSpacing: 0.5 }}>{[money(p.mktCap), p.sector, p.industry, p.country].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {v && <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.5, fontWeight: 700, color: v.c, padding: '5px 11px', borderRadius: 8, background: `${v.c}15`, border: `1px solid ${v.c}55` }}>{v.label}</span>}
          {daysToEarn != null && <span style={{ fontFamily: MONO, fontSize: 9.5, color: daysToEarn <= 7 ? GOLD : DIM }}>{daysToEarn <= 7 ? '⚠ ' : ''}EARNINGS {p.earnings} ({daysToEarn}d)</span>}
        </div>
      </div>

      <div style={{ marginTop: 14 }}><Spark closes={p.closes} h={130} levels={{ ma20: L.ma20, ma50: L.ma50 }} /></div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
        {[['1M', f.r21], ['3M', f.r63], ['6M', f.r126], ['12M', f.r252]].map(([k, x]) => (
          <div key={k as string} style={tile}><div style={tileL}>{k}</div><div style={{ ...tileV, color: (x as number ?? 0) >= 0 ? G : RED }}>{pct(x as number | null, 0)}</div></div>
        ))}
      </div>

      {p.brief && (
        <div style={{ marginTop: 16, padding: '13px 15px', borderRadius: 12, background: 'rgba(52,245,164,0.05)', border: '1px solid rgba(52,245,164,0.15)' }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: G, marginBottom: 6 }}>AI RESEARCH BRIEF</div>
          <div style={{ fontSize: 13.5, color: '#e8f8fc', lineHeight: 1.6 }}>{p.brief.thesis}</div>
          <div style={{ fontSize: 12.5, color: 'rgba(220,240,245,0.75)', marginTop: 8, lineHeight: 1.5 }}><b style={{ color: BLUE }}>Catalyst:</b> {p.brief.catalyst}</div>
          <div style={{ fontSize: 12.5, color: 'rgba(220,240,245,0.75)', marginTop: 4, lineHeight: 1.5 }}><b style={{ color: RED }}>Risks:</b> {p.brief.risks}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginTop: 16 }}>
        <div>
          <div style={secT}>WHY IT SCORES {p.score}</div>
          {criteria.map(([label, ok, val]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: '1px solid rgba(52,245,164,0.06)' }}>
              <span style={{ width: 16, textAlign: 'center', color: ok ? G : 'rgba(248,113,113,0.6)', fontSize: 12 }}>{ok ? '✓' : '✗'}</span>
              <span style={{ flex: 1, fontSize: 12, color: ok ? '#dff3f7' : 'rgba(200,220,230,0.5)' }}>{label}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: DIM }}>{val}</span>
            </div>
          ))}
        </div>
        <div>
          <div style={secT}>POSITION SIZE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={lab}>Capital $<input type="number" value={capital} onChange={e => setCapital(Number(e.target.value) || 0)} style={inp} /></label>
            <label style={lab}>Risk per trade %<input type="number" step="0.25" value={risk} onChange={e => setRisk(Number(e.target.value) || 0)} style={inp} /></label>
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
            {([['low10', `10-day low ${usd(L.low10)}`], ['atr', `2×ATR ${usd(stops.atr)}`], ['ma50', `MA50 ${usd(L.ma50)}`]] as [typeof stopMode, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setStopMode(k)} style={{ ...btn(stopMode === k ? G : undefined), padding: '4px 8px', fontSize: 9 }}>{l}</button>
            ))}
          </div>
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(52,245,164,0.1)', fontSize: 12.5, lineHeight: 1.7 }}>
            {perShare <= 0 ? <span style={{ color: GOLD }}>Stop is above price — pick another stop.</span> : <>
              Stop <b>{usd(stop)}</b> ({pct(-perShare / p.price)}) → max <b style={{ color: G }}>{shares} shares</b><br />
              Position {usd(posValue)} = <b style={{ color: posPct > 0.2 ? GOLD : '#dff' }}>{(posPct * 100).toFixed(0)}% of capital</b><br />
              If stopped out you lose <b style={{ color: RED }}>{usd(shares * perShare)}</b>
              {posPct > 0.2 && <div style={{ color: GOLD, fontSize: 11.5, marginTop: 4 }}>⚠ Over 20% of capital in one small cap — consider a wider stop or smaller size.</div>}
            </>}
          </div>
        </div>
      </div>

      {p.news.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={secT}>RECENT NEWS</div>
          {p.news.slice(0, 5).map((n, i) => (
            <a key={i} href={n.url} target="_blank" rel="noreferrer" style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: '1px solid rgba(52,245,164,0.06)', textDecoration: 'none' }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: DIM, width: 46, flexShrink: 0 }}>{new Date(n.datetime * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
              <span style={{ fontSize: 12.5, color: '#d8eef5', lineHeight: 1.4 }}>{n.headline} <span style={{ color: DIM }}>· {n.source}</span></span>
            </a>
          ))}
        </div>
      )}

      {p.description && <div style={{ fontSize: 12, color: 'rgba(200,225,235,0.6)', marginTop: 14, lineHeight: 1.55 }}>{p.description}</div>}

      <div style={{ display: 'flex', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
        <button onClick={onWatch} disabled={watched} style={btn(GOLD)}>{watched ? '★ ON WATCHLIST' : '☆ ADD TO WATCHLIST'}</button>
        <a href={`https://www.tradingview.com/chart/?symbol=${p.symbol}`} target="_blank" rel="noreferrer" style={btn()}>TRADINGVIEW ↗</a>
        <a href={`https://finviz.com/quote.ashx?t=${p.symbol}`} target="_blank" rel="noreferrer" style={btn()}>FINVIZ ↗</a>
        {p.website && <a href={p.website} target="_blank" rel="noreferrer" style={btn()}>WEBSITE ↗</a>}
      </div>
    </div>
  )
}

// ─── track record ───
function Track({ data, isMobile }: { data: any; isMobile: boolean }) {
  if (!data) return <Empty>Loading…</Empty>
  const s = data.stats || {}
  const rows: any[] = data.rows || []
  const T = ({ label, v, sub, good }: { label: string; v: string; sub?: string; good?: boolean | null }) => (
    <div style={tile}><div style={tileL}>{label}</div><div style={{ ...tileV, fontSize: 20, color: good == null ? '#e8fff6' : good ? G : RED }}>{v}</div>{sub && <div style={{ fontFamily: MONO, fontSize: 9, color: DIM, marginTop: 2 }}>{sub}</div>}</div>
  )
  return (
    <div>
      <div style={{ fontSize: 13, color: 'rgba(210,235,245,0.75)', marginBottom: 14, lineHeight: 1.55 }}>
        Every day the top 10 picks are recorded at that day&apos;s close and compared with SPY afterwards. <b style={{ color: '#fff' }}>Only trust Radar with real money once these numbers are positive over several weeks.</b>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
        <T label="PICKS TRACKED" v={String(rows.length)} sub={data.firstDay ? `since ${data.firstDay}` : 'starts with first scan'} />
        <T label="AVG vs SPY · 5 DAYS" v={s.a5 ? pct(s.a5.avg) : '—'} sub={s.a5 ? `${s.a5.n} picks` : 'needs 5 days'} good={s.a5 ? s.a5.avg > 0 : null} />
        <T label="BEAT SPY · 5 DAYS" v={s.a5 ? `${Math.round(s.a5.hit * 100)}%` : '—'} sub="hit rate" good={s.a5 ? s.a5.hit > 0.5 : null} />
        <T label="AVG vs SPY · 20 DAYS" v={s.a20 ? pct(s.a20.avg) : '—'} sub={s.a20 ? `${s.a20.n} picks` : 'needs 20 days'} good={s.a20 ? s.a20.avg > 0 : null} />
      </div>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
          <thead><tr style={{ color: DIM, textAlign: 'left' }}>{['DAY', '#', 'SYMBOL', 'VERDICT', 'ENTRY', '1D', '5D', '20D', 'SINCE', 'vs SPY 5D'].map(h => <th key={h} style={{ padding: '10px 12px', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(52,245,164,0.1)' }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} style={{ padding: 20, color: DIM }}>No picks recorded yet.</td></tr>}
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(52,245,164,0.05)' }}>
                <td style={td}>{r.day}</td><td style={td}>{r.rank}</td><td style={{ ...td, color: '#eafff6', fontWeight: 700 }}>{r.symbol}</td>
                <td style={{ ...td, color: VERDICT[r.verdict]?.c || DIM }}>{r.verdict || '—'}</td><td style={td}>{usd(r.price)}</td>
                {['r1', 'r5', 'r20', 'last', 'a5'].map(k => <td key={k} style={{ ...td, color: r[k] == null ? DIM : r[k] >= 0 ? G : RED }}>{pct(r[k])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── pieces ───
function Spark({ closes, h, levels }: { closes: number[]; h: number; levels?: { ma20: number; ma50: number } }) {
  if (!closes?.length) return null
  const w = 600
  const ma = (n: number) => closes.map((_, i) => i >= n - 1 ? closes.slice(i - n + 1, i + 1).reduce((s, x) => s + x, 0) / n : null)
  const vals = [...closes, ...(levels ? [levels.ma50] : [])]
  const min = Math.min(...vals) * 0.98, max = Math.max(...vals) * 1.02
  const x = (i: number) => (i / (closes.length - 1)) * w
  const y = (v: number) => h - ((v - min) / (max - min)) * h
  const line = closes.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join('')
  const ma20 = ma(20).map((v, i) => v == null ? '' : `${ma(20)[i - 1] == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const up = closes[closes.length - 1] >= closes[0]
  const col = up ? G : RED
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }}>
      <defs><linearGradient id={`g${h}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={col} stopOpacity="0.25" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line}L${w},${h}L0,${h}Z`} fill={`url(#g${h})`} />
      {levels && <line x1="0" x2={w} y1={y(levels.ma50)} y2={y(levels.ma50)} stroke="rgba(251,191,36,0.45)" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      {levels && <path d={ma20} fill="none" stroke="rgba(128,192,255,0.7)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />}
      <path d={line} fill="none" stroke={col} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
function ScoreRing({ v }: { v: number }) {
  const r = 16, c = 2 * Math.PI * r, col = v >= 75 ? G : v >= 55 ? BLUE : DIM
  return (
    <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
      <svg width={40} height={40} style={{ transform: 'rotate(-90deg)' }}><circle cx={20} cy={20} r={r} fill="none" stroke="rgba(52,245,164,0.1)" strokeWidth={3} /><circle cx={20} cy={20} r={r} fill="none" stroke={col} strokeWidth={3} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} /></svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 11, fontWeight: 700, color: col }}>{v}</span>
    </div>
  )
}
function Chip({ children, c }: { children: React.ReactNode; c: string }) {
  return <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 0.8, padding: '2px 6px', borderRadius: 6, color: c, border: `1px solid ${c}44`, background: `${c}10`, whiteSpace: 'nowrap' }}>{children}</span>
}
function Notice({ children, c }: { children: React.ReactNode; c: string }) {
  return <div style={{ padding: '11px 14px', borderRadius: 12, marginBottom: 14, fontSize: 13, color: '#f0f6ff', background: `${c}12`, border: `1px solid ${c}44` }}>{children}</div>
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 30, textAlign: 'center', color: DIM, fontSize: 13 }}>{children}</div>
}
const btn = (c?: string): React.CSSProperties => ({ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap', color: c || '#cfeef5', background: c ? `${c}14` : 'rgba(80,180,200,0.07)', border: `1px solid ${c ? c + '55' : 'rgba(120,200,220,0.22)'}` })
const card: React.CSSProperties = { padding: 16, borderRadius: 16, background: 'linear-gradient(180deg, rgba(8,28,36,0.65), rgba(4,14,22,0.55))', border: '1px solid rgba(52,245,164,0.12)', backdropFilter: 'blur(12px)' }
const tile: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(52,245,164,0.08)' }
const tileL: React.CSSProperties = { fontFamily: MONO, fontSize: 8.5, letterSpacing: 1.5, color: DIM }
const tileV: React.CSSProperties = { fontFamily: MONO, fontSize: 15, fontWeight: 700, marginTop: 3 }
const secT: React.CSSProperties = { fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: G, marginBottom: 8 }
const lab: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontFamily: MONO, fontSize: 9, color: DIM, letterSpacing: 1 }
const inp: React.CSSProperties = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(52,245,164,0.2)', borderRadius: 8, padding: '7px 9px', color: '#e8fff6', fontFamily: MONO, fontSize: 12, outline: 'none' }
const td: React.CSSProperties = { padding: '8px 12px', color: '#cfe5ee', whiteSpace: 'nowrap' }
