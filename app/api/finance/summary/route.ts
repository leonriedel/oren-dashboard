import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// FINANCE SUMMARY
// Aggregates NAV across IBKR (via Flex), Edgar (paper + live), Real Estate,
// and user-entered Manual Entries. Returns totals per bucket + total NAV in EUR.
//
// All manual entries are stored in EUR already. IBKR comes in account currency
// (often EUR for Leon). Edgar paper NAV is in USD → convert via ECB rate.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!

// cached FX rate for a few hours
let _fx: { ts: number; usd_eur: number } = { ts: 0, usd_eur: 0.92 }
async function usdToEur(): Promise<number> {
  const now = Date.now()
  if (now - _fx.ts < 4 * 60 * 60 * 1000 && _fx.usd_eur) return _fx.usd_eur
  try {
    const r = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=EUR', { cache: 'no-store' })
    const j = await r.json()
    const rate = Number(j?.rates?.EUR)
    if (rate > 0) _fx = { ts: now, usd_eur: rate }
  } catch { /* use cached fallback */ }
  return _fx.usd_eur
}

async function fetchJSON(url: string) {
  try {
    const r = await fetch(url, { cache: 'no-store' })
    return await r.json()
  } catch { return null }
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url)
    const origin = u.origin
    const supa = createClient(SUPA_URL, KEY)
    const fx = await usdToEur()

    // 1. MANUAL ENTRIES (EUR)
    const { data: manual = [] } = await supa
      .from('finance_manual_entries')
      .select('*')
      .order('bucket')
    const manualByBucket: Record<string, { label: string; amount_eur: number }[]> = {
      liquid: [], investments: [], physical: [], other: [],
    }
    for (const m of manual || []) {
      (manualByBucket[m.bucket] ||= []).push({ label: m.label, amount_eur: Number(m.amount_eur) })
    }

    // 2. IBKR — call our own flex route
    let ibkr = { total_eur: 0, dailyPnl_eur: 0, positions: 0, currency: 'EUR', available: false }
    try {
      const j = await fetchJSON(`${origin}/api/ibkr/flex`)
      if (j && !j.error) {
        const total = Number(j?.account?.total) || 0
        const currency = j?.account?.currency || 'EUR'
        const total_eur = currency === 'EUR' ? total : total * fx
        ibkr = {
          total_eur,
          dailyPnl_eur: Number(j?.dailyPnlTotal || 0) * (currency === 'EUR' ? 1 : fx),
          positions: Array.isArray(j?.positions) ? j.positions.length : 0,
          currency,
          available: true,
        }
      }
    } catch { /* skip */ }

    // 3. EDGAR — latest equity snapshot
    let edgar = { nav_eur: 0, dry_run: true, available: false }
    try {
      const { data: eq } = await supa
        .from('edgar_equity')
        .select('nav,dry_run,ts')
        .order('ts', { ascending: false })
        .limit(1)
      if (eq && eq[0]) {
        edgar = {
          nav_eur: Number(eq[0].nav) * fx,   // edgar logs in USD
          dry_run: !!eq[0].dry_run,
          available: true,
        }
      }
    } catch { /* table may not exist */ }

    // 4. REAL ESTATE — sum current_value
    let realEstate = { total_eur: 0, projects: 0 }
    try {
      const { data: re } = await supa
        .from('real_estate_projects')
        .select('current_value,status')
      const sum = (re || []).reduce((s, p: any) => s + (Number(p.current_value) || 0), 0)
      realEstate = { total_eur: sum, projects: (re || []).length }
    } catch { /* table may not exist */ }

    // ── AGGREGATE ──
    const buckets = {
      liquid: {
        items: [
          ...manualByBucket.liquid,
        ],
        total: manualByBucket.liquid.reduce((s, i) => s + i.amount_eur, 0),
      },
      investments: {
        items: [
          ...(ibkr.available ? [{ label: 'IBKR', amount_eur: ibkr.total_eur }] : []),
          ...(edgar.available ? [{ label: edgar.dry_run ? 'Edgar (Paper)' : 'Edgar', amount_eur: edgar.nav_eur }] : []),
          ...manualByBucket.investments,
        ],
        total: 0,
      },
      physical: {
        items: [
          ...(realEstate.total_eur > 0 ? [{ label: `Real Estate (${realEstate.projects})`, amount_eur: realEstate.total_eur }] : []),
          ...manualByBucket.physical,
        ],
        total: 0,
      },
      other: {
        items: manualByBucket.other,
        total: manualByBucket.other.reduce((s, i) => s + i.amount_eur, 0),
      },
    }
    buckets.investments.total = buckets.investments.items.reduce((s, i) => s + i.amount_eur, 0)
    buckets.physical.total = buckets.physical.items.reduce((s, i) => s + i.amount_eur, 0)

    const total = buckets.liquid.total + buckets.investments.total + buckets.physical.total + buckets.other.total

    return NextResponse.json({
      total_eur: total,
      buckets,
      sources: {
        ibkr, edgar, realEstate,
        manualCount: (manual || []).length,
      },
      fx: { usd_eur: fx, ts: _fx.ts },
      updatedAt: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ total_eur: 0, buckets: null, error: String(e) }, { status: 200 })
  }
}

export async function POST(req: Request) {
  // Trigger a snapshot write
  try {
    const supa = createClient(SUPA_URL, KEY)
    const u = new URL(req.url)
    const originRes = await fetch(`${u.origin}/api/finance/summary`, { cache: 'no-store' })
    const j = await originRes.json()
    if (!j?.buckets) return NextResponse.json({ ok: false, error: 'no summary' }, { status: 200 })

    const row = {
      ts: new Date().toISOString(),
      total_eur: j.total_eur,
      liquid_eur: j.buckets.liquid.total,
      investments_eur: j.buckets.investments.total,
      physical_eur: j.buckets.physical.total,
      other_eur: j.buckets.other.total,
      breakdown: j.buckets,
    }
    const { error } = await supa.from('finance_snapshots').insert(row)
    return NextResponse.json({ ok: !error, error: error?.message, snapshot: row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 })
  }
}
