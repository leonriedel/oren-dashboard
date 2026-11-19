import { NextResponse } from 'next/server'
import { db, requireAdmin, loadHistory } from '@/lib/radar/engine'

// RADAR · watchlist (admin only)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const supa = db()
  const [{ data }, h] = await Promise.all([supa.from('radar_watch').select('*').order('added_at', { ascending: false }), loadHistory(supa)])
  const n = h.days.length
  const items = (data || []).map(w => {
    const arr = h.bars.get(w.symbol) || []
    const last = [...arr].reverse().find(Boolean)
    const price = last ? last[3] : null
    return { ...w, price, change: price && w.added_price ? price / Number(w.added_price) - 1 : null, closes: arr.filter(Boolean).slice(-40).map(b => b![3]), day: h.days[n - 1] }
  })
  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { symbol, note, price } = await req.json().catch(() => ({}))
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  const { error } = await db().from('radar_watch').upsert({ symbol: String(symbol).toUpperCase(), note: note ?? null, added_price: price ?? null })
  return NextResponse.json({ ok: !error, error: error?.message })
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { symbol, note } = await req.json().catch(() => ({}))
  const { error } = await db().from('radar_watch').update({ note }).eq('symbol', symbol)
  return NextResponse.json({ ok: !error })
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const symbol = new URL(req.url).searchParams.get('symbol')
  await db().from('radar_watch').delete().eq('symbol', symbol)
  return NextResponse.json({ ok: true })
}
