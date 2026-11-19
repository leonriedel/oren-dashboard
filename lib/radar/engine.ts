import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// RADAR AI v2 · engine: market history (Massive grouped daily), factors, scoring, fundamentals.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
export const POLYGON_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || ''
export const FMP_KEY = process.env.FMP_API_KEY || ''
export const FINNHUB_KEY = process.env.FINNHUB_API_KEY || ''
export const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

export const RECENT_DAYS = 72          // weekdays of recent history (≈ 69 trading days)
export const SYMBOL_RE = /^[A-Z]{1,5}$/

export function db(): SupabaseClient { return createClient(SUPA_URL, SUPA_KEY) }

export async function requireAdmin(req: Request): Promise<boolean> {
  const h = req.headers.get('authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) return false
  const { data } = await db().auth.getUser(token)
  const u = data?.user
  return !!u && (u.app_metadata?.role || u.user_metadata?.role) === 'admin'
}

// ─── dates ───
const iso = (d: Date) => d.toISOString().slice(0, 10)
const isWeekday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6
const prevWeekday = (d: Date) => { const x = new Date(d); do { x.setUTCDate(x.getUTCDate() - 1) } while (!isWeekday(x)); return x }

/** Latest US session whose daily bars should be published (after ~18:30 New York time). */
export function latestSession(now = new Date()): Date {
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  let d = new Date(Date.UTC(ny.getFullYear(), ny.getMonth(), ny.getDate()))
  const afterClose = ny.getHours() * 60 + ny.getMinutes() >= 18 * 60 + 30
  if (!afterClose || !isWeekday(d)) d = prevWeekday(d)
  return d
}

/** Days we need: recent weekdays + lookback groups (~6 and ~12 months, 4 candidate weekdays each). */
export function neededDays(now = new Date()): { recent: string[]; lookbacks: string[][] } {
  const last = latestSession(now)
  const recent: string[] = []
  let d = new Date(last)
  for (let i = 0; i < RECENT_DAYS; i++) { recent.push(iso(d)); d = prevWeekday(d) }
  const group = (daysBack: number) => {
    let x = new Date(last); x.setUTCDate(x.getUTCDate() - daysBack)
    if (!isWeekday(x)) x = prevWeekday(x)
    const out = [iso(x)]; for (let i = 0; i < 3; i++) { x = prevWeekday(x); out.push(iso(x)) }
    return out
  }
  return { recent, lookbacks: [group(182), group(365)] }
}

// ─── Massive / Polygon grouped daily ───
export async function fetchGrouped(day: string): Promise<{ trading: boolean; data: Record<string, number[]> } | null> {
  const paths = [`https://api.polygon.io`, `https://api.massive.com`]
  for (const base of paths) {
    try {
      const r = await fetch(`${base}/v2/aggs/grouped/locale/us/market/stocks/${day}?adjusted=true&apiKey=${POLYGON_KEY}`, { cache: 'no-store' })
      if (r.status === 429) throw new Error('rate-limit')
      if (r.status === 401 || r.status === 403) throw new Error(`auth ${r.status}: ${(await r.text()).slice(0, 160)}`)
      if (!r.ok) continue
      const j = await r.json()
      const rows: any[] = j.results || []
      const data: Record<string, number[]> = {}
      for (const x of rows) {
        if (!SYMBOL_RE.test(x.T) || !x.c || x.c < 1 || x.c * x.v < 300_000) continue
        data[x.T] = [round(x.o), round(x.h), round(x.l), round(x.c), Math.round(x.v)]
      }
      return { trading: rows.length > 0, data }
    } catch (e: any) {
      if (/rate-limit|auth/.test(String(e?.message))) throw e
    }
  }
  return null
}
const round = (n: number) => Math.round(n * 10000) / 10000

// ─── history loading ───
export type Bar = [number, number, number, number, number] // o h l c v
export type History = { days: string[]; bars: Map<string, (Bar | null)[]>; lookback: Map<string, number>[] }

export async function loadHistory(supa: SupabaseClient): Promise<History> {
  const { recent, lookbacks } = neededDays()
  const all = [...recent, ...lookbacks.flat()]
  const { data } = await supa.from('radar_snap').select('day,trading,data').in('day', all)
  const byDay = new Map<string, any>((data || []).map(r => [r.day, r]))
  const tradingRecent = recent.filter(d => byDay.get(d)?.trading).reverse() // chronological
  const bars = new Map<string, (Bar | null)[]>()
  tradingRecent.forEach((d, i) => {
    const snap = byDay.get(d).data || {}
    for (const sym in snap) {
      let arr = bars.get(sym)
      if (!arr) { arr = new Array(tradingRecent.length).fill(null); bars.set(sym, arr) }
      arr[i] = snap[sym]
    }
  })
  const lookback = lookbacks.map(group => {
    const day = group.find(d => byDay.get(d)?.trading)
    const m = new Map<string, number>()
    if (day) { const snap = byDay.get(day).data || {}; for (const s in snap) m.set(s, snap[s][3]) }
    return m
  })
  return { days: tradingRecent, bars, lookback }
}

// ─── indicators ───
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(a.length, 1)
const sma = (c: number[], n: number) => c.length >= n ? avg(c.slice(-n)) : NaN
function atr(b: Bar[], n: number) {
  if (b.length < n + 1) return NaN
  const tr: number[] = []
  for (let i = b.length - n; i < b.length; i++) { const [, h, l] = b[i]; const pc = b[i - 1][3]; tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))) }
  return avg(tr)
}

export type Factors = {
  symbol: string; price: number; chg1: number; r5: number; r21: number; r63: number; r126: number | null; r252: number | null
  ma20: number; ma50: number; high60: number; distHigh: number; volRatio: number; dollarVol: number; atr14: number; atrPct: number; tight: number
  low10: number; extended: boolean; rs: number; tech: number; closes: number[]
}

export function computeFactors(h: History): Factors[] {
  const out: Factors[] = []
  const n = h.days.length
  if (n < 55) return out
  h.bars.forEach((arr, sym) => {
    const present = arr.filter(Boolean) as Bar[]
    if (present.length < Math.min(55, n - 5) || !arr[n - 1]) return
    const b = present
    const c = b.map(x => x[3]), v = b.map(x => x[4])
    const price = c[c.length - 1]
    if (price < 3) return
    const dollarVol = avg(b.slice(-20).map(x => x[3] * x[4]))
    if (dollarVol < 5_000_000) return
    const ret = (k: number) => c.length > k ? price / c[c.length - 1 - k] - 1 : NaN
    const r63 = c.length > 63 ? ret(63) : ret(c.length - 1)
    const l126 = h.lookback[0].get(sym), l252 = h.lookback[1].get(sym)
    const high60 = Math.max(...b.slice(-60).map(x => x[1]))
    const a14 = atr(b, 14), a10 = atr(b, 10), a50 = atr(b, Math.min(50, b.length - 1))
    const ma20 = sma(c, 20), ma50 = sma(c, 50)
    const r5 = ret(5), chg1 = ret(1)
    out.push({
      symbol: sym, price, chg1, r5, r21: ret(21), r63, r126: l126 ? price / l126 - 1 : null, r252: l252 ? price / l252 - 1 : null,
      ma20, ma50, high60, distHigh: price / high60 - 1, volRatio: avg(v.slice(-5)) / Math.max(avg(v.slice(-50)), 1), dollarVol,
      atr14: a14, atrPct: a14 / price, tight: a10 / a50, low10: Math.min(...b.slice(-10).map(x => x[2])),
      extended: price > ma20 * 1.2 || r5 > 0.25 || chg1 > 0.12, rs: 0, tech: 0, closes: c.slice(-60),
    })
  })
  // relative strength percentile
  const raw = out.map(f => 0.2 * (f.r21 || 0) + 0.4 * (f.r63 || 0) + 0.4 * (f.r126 ?? f.r63 ?? 0))
  const sorted = [...raw].sort((a, b) => a - b)
  out.forEach((f, i) => {
    f.rs = Math.round((lowerBound(sorted, raw[i]) / Math.max(sorted.length - 1, 1)) * 99)
    f.tech = techScore(f)
  })
  return out
}
function lowerBound(a: number[], x: number) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m } return lo }

export function techScore(f: Factors) {
  let s = f.rs * 0.35
  s += (f.price > f.ma20 ? 8 : 0) + (f.ma20 > f.ma50 ? 8 : 0) + (f.price > f.ma50 ? 4 : 0)
  s += f.distHigh >= -0.05 ? 15 : f.distHigh >= -0.12 ? 8 : 0
  s += f.volRatio >= 2 ? 12 : f.volRatio >= 1.4 ? 7 : 0
  s += f.tight < 0.75 ? 8 : f.tight < 0.9 ? 4 : 0
  if (f.extended) s -= 15
  return s
}

export function finalScore(f: Factors, mktCap: number | null, growth: number | null) {
  let s = f.tech
  if (mktCap != null) s += mktCap < 300e6 ? -5 : mktCap <= 3e9 ? 10 : mktCap <= 10e9 ? 5 : -15
  if (growth != null) s += growth >= 0.4 ? 10 : growth >= 0.2 ? 5 : growth < 0 ? -5 : 0
  return Math.max(0, Math.min(100, Math.round(s)))
}

// ─── fundamentals (FMP, cached) ───
export async function getFundamentals(supa: SupabaseClient, symbols: string[], wantGrowth: Set<string>) {
  const { data: cached } = await supa.from('radar_profiles').select('*').in('symbol', symbols)
  const map = new Map<string, any>((cached || []).map(r => [r.symbol, r]))
  const now = Date.now()
  const stale = (t: string | null, days: number) => !t || now - new Date(t).getTime() > days * 86400000
  const jobs = symbols.map(sym => async () => {
    const row = map.get(sym) || { symbol: sym, profile: null, growth: null, profile_at: null, growth_at: null }
    let changed = false
    if (FMP_KEY && stale(row.profile_at, 7)) {
      try {
        const r = await fetch(`https://financialmodelingprep.com/stable/profile?symbol=${sym}&apikey=${FMP_KEY}`, { cache: 'no-store' })
        const j = await r.json()
        const p = Array.isArray(j) ? j[0] : null
        if (p) { row.profile = { name: p.companyName, mktCap: p.marketCap ?? p.mktCap, sector: p.sector, industry: p.industry, country: p.country, exchange: p.exchange || p.exchangeShortName, isEtf: !!p.isEtf, isFund: !!p.isFund, description: String(p.description || '').slice(0, 600), website: p.website, ipoDate: p.ipoDate, image: p.image }; row.profile_at = new Date().toISOString(); changed = true }
      } catch { /* noop */ }
    }
    if (FMP_KEY && wantGrowth.has(sym) && stale(row.growth_at, 30)) {
      try {
        const r = await fetch(`https://financialmodelingprep.com/stable/income-statement?symbol=${sym}&limit=2&apikey=${FMP_KEY}`, { cache: 'no-store' })
        const j = await r.json()
        if (Array.isArray(j) && j.length >= 2 && j[1].revenue > 0) row.growth = j[0].revenue / j[1].revenue - 1
        row.growth_at = new Date().toISOString(); changed = true
      } catch { /* noop */ }
    }
    if (changed) await supa.from('radar_profiles').upsert(row)
    map.set(sym, row)
  })
  await pool(jobs, 6)
  return map
}

export async function pool(jobs: (() => Promise<void>)[], n: number) {
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const j = jobs[i++]; await j() } }))
}

export async function companyNews(symbol: string, days = 10) {
  if (!FINNHUB_KEY) return []
  const to = new Date(), from = new Date(Date.now() - days * 86400000)
  try {
    const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${iso(from)}&to=${iso(to)}&token=${FINNHUB_KEY}`, { cache: 'no-store' })
    const j = await r.json()
    return (Array.isArray(j) ? j : []).slice(0, 6).map((n: any) => ({ headline: n.headline, source: n.source, url: n.url, datetime: n.datetime }))
  } catch { return [] }
}

export async function nextEarnings(symbol: string) {
  if (!FINNHUB_KEY) return null
  const from = new Date(), to = new Date(Date.now() + 75 * 86400000)
  try {
    const r = await fetch(`https://finnhub.io/api/v1/calendar/earnings?symbol=${symbol}&from=${iso(from)}&to=${iso(to)}&token=${FINNHUB_KEY}`, { cache: 'no-store' })
    const j = await r.json()
    return j?.earningsCalendar?.[0]?.date || null
  } catch { return null }
}

export function regime(h: History, factors: Factors[]) {
  const spy = h.bars.get('SPY')?.filter(Boolean) as Bar[] | undefined
  let label = 'UNKNOWN', spyAbove50 = false, spyR21 = 0
  if (spy && spy.length >= 50) {
    const c = spy.map(x => x[3]); const p = c[c.length - 1]
    const m20 = sma(c, 20), m50 = sma(c, 50)
    spyAbove50 = p > m50; spyR21 = p / c[c.length - 22] - 1
    label = p > m50 && m20 > m50 ? 'RISK-ON' : p < m50 && m20 < m50 ? 'RISK-OFF' : 'CAUTION'
  }
  const breadth = factors.length ? factors.filter(f => f.price > f.ma50).length / factors.length : 0
  return { label, spyAbove50, spyR21, breadth }
}
