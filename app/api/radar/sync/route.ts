import { NextResponse } from 'next/server'
import { db, requireAdmin, neededDays, fetchGrouped, latestSession, POLYGON_KEY } from '@/lib/radar/engine'

// RADAR · market history sync. Each POST fetches ONE missing trading day (free plan: 5 calls/min).
// GET returns status only.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function status() {
  const supa = db()
  const { recent, lookbacks } = neededDays()
  const all = [...recent, ...lookbacks.flat()]
  const { data } = await supa.from('radar_snap').select('day,trading').in('day', all)
  const have = new Map<string, boolean>((data || []).map(r => [r.day, r.trading]))
  const latest = latestSession().toISOString().slice(0, 10)
  const fresh = (d: string) => (new Date(latest).getTime() - new Date(d).getTime()) / 86400000 <= 3
  const missingOld = recent.filter(d => !have.has(d) && !fresh(d))
  const missingFresh = recent.filter(d => !have.has(d) && fresh(d))
  const missingLook = lookbacks.flatMap(g => (g.some(d => have.get(d)) ? [] : [g.find(d => !have.has(d))].filter(Boolean) as string[]))
  const tradingDays = recent.filter(d => have.get(d)).length
  const queue = [...missingOld, ...missingLook, ...missingFresh]
  return { supa, recent, queue, missingFresh, tradingDays, total: recent.length + lookbacks.length, stored: recent.filter(d => have.has(d)).length, ready: tradingDays >= 55, latest, lastStored: recent.find(d => have.get(d)) || null }
}

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const s = await status()
  return NextResponse.json({ configured: !!POLYGON_KEY, remaining: s.queue.length, tradingDays: s.tradingDays, stored: s.stored, total: s.total, ready: s.ready, lastStored: s.lastStored, latest: s.latest })
}

export async function POST(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (!POLYGON_KEY) return NextResponse.json({ error: 'POLYGON_API_KEY not set' }, { status: 200 })
  const s = await status()
  const day = s.queue[0]
  if (!day) return NextResponse.json({ remaining: 0, tradingDays: s.tradingDays, ready: s.ready, lastStored: s.lastStored })
  try {
    const res = await fetchGrouped(day)
    if (!res) return NextResponse.json({ error: 'data source unreachable', remaining: s.queue.length })
    const isFresh = s.missingFresh.includes(day)
    if (!res.trading && isFresh) {
      // not published yet — don't store; if only fresh days remain we are done for now
      const onlyFresh = s.queue.every(d => s.missingFresh.includes(d))
      return NextResponse.json({ pending: day, pendingOnly: onlyFresh, remaining: onlyFresh ? 0 : s.queue.length, tradingDays: s.tradingDays, ready: s.ready, lastStored: s.lastStored })
    }
    const { error } = await s.supa.from('radar_snap').upsert({ day, trading: res.trading, data: res.trading ? res.data : null })
    if (error) return NextResponse.json({ error: /radar_snap/.test(error.message) ? 'Run lib/sql/radar_v2.sql in Supabase' : error.message })
    const tradingDays = s.tradingDays + (res.trading && s.recent.includes(day) ? 1 : 0)
    return NextResponse.json({ fetched: day, trading: res.trading, symbols: Object.keys(res.data).length, remaining: s.queue.length - 1, tradingDays, ready: tradingDays >= 55 })
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (msg.includes('rate-limit')) return NextResponse.json({ rateLimited: true, remaining: s.queue.length })
    return NextResponse.json({ error: msg, remaining: s.queue.length })
  }
}
