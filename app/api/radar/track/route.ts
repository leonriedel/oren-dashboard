import { NextResponse } from 'next/server'
import { db, requireAdmin, loadHistory } from '@/lib/radar/engine'

// RADAR · honest track record: every top-10 pick vs SPY after 1 / 5 / 20 trading days.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const supa = db()
  const [{ data: picks }, h] = await Promise.all([
    supa.from('radar_picks').select('*').order('day', { ascending: false }).limit(400),
    loadHistory(supa),
  ])
  const idx = new Map(h.days.map((d, i) => [d, i]))
  const close = (sym: string, i: number) => { const b = h.bars.get(sym)?.[i]; return b ? b[3] : null }
  const rows = (picks || []).map(p => {
    const i = idx.get(p.day)
    const out: any = { day: p.day, symbol: p.symbol, rank: p.rank, score: p.score, price: Number(p.price), verdict: p.verdict, last: null }
    if (i == null) return out
    const spy0 = close('SPY', i)
    for (const k of [1, 5, 20]) {
      const j = i + k
      if (j >= h.days.length) continue
      const c = close(p.symbol, j), s = close('SPY', j)
      if (c != null) out[`r${k}`] = c / Number(p.price) - 1
      if (c != null && s != null && spy0) out[`a${k}`] = (c / Number(p.price) - 1) - (s / spy0 - 1)
    }
    const lastC = close(p.symbol, h.days.length - 1)
    if (lastC != null) out.last = lastC / Number(p.price) - 1
    return out
  })
  const stat = (k: string) => {
    const xs = rows.map(r => r[k]).filter((x: any) => typeof x === 'number') as number[]
    if (!xs.length) return null
    return { n: xs.length, avg: xs.reduce((s, x) => s + x, 0) / xs.length, hit: xs.filter(x => x > 0).length / xs.length }
  }
  return NextResponse.json({ rows, stats: { a1: stat('a1'), a5: stat('a5'), a20: stat('a20'), r5: stat('r5'), r20: stat('r20') }, firstDay: rows[rows.length - 1]?.day || null })
}
